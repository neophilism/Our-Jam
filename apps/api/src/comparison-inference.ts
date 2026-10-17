import { createHash, randomUUID } from "node:crypto";
import type { Database } from "./db.js";
import { comparisonConfiguration } from "./comparison-dispatch.js";
import { validateAudio } from "./media.js";
import { ProviderError, stabilityProvider, type MusicProvider } from "../../../packages/providers/src/stability.js";
import { murekaProvider } from "../../../packages/providers/src/mureka.js";
import { aceStepProvider } from "../../../packages/providers/src/ace-step.js";
import { gpuGatewayProvider } from "../../../packages/providers/src/gpu-gateway.js";
import type { MediaStore } from "../../../packages/providers/src/storage.js";
import type { ComparisonEngineId } from "../../../packages/providers/src/comparison-catalog.js";

/** Private, dedicated comparison worker. Never imported by the live show job processor. */
export function comparisonMusicProvider(engine: ComparisonEngineId, purpose: "private_research" | "commercial_evaluation", env:NodeJS.ProcessEnv=process.env): MusicProvider {
  const block=comparisonConfiguration(engine,purpose,env);
  if(block)throw new ProviderError("comparison_engine_not_authorized",false);
  if(engine==="mureka")return murekaProvider(env.MUREKA_API_KEY!,{model:env.MUREKA_MODEL || "mureka-9.5",
    mediaHosts:env.MUREKA_MEDIA_HOSTS?.split(",").map(s=>s.trim()).filter(Boolean)});
  if(engine==="stability")return stabilityProvider(env.STABLE_AUDIO_KEY||env.STABILITY_API_KEY!);
  if(engine==="ace_step")return aceStepProvider({
    baseUrl:env.ACE_STEP_BASE_URL!,token:env.ACE_STEP_TOKEN!,
    model:env.ACE_STEP_MODEL==="acestep-v15-base"?"acestep-v15-base":"acestep-v15-turbo",
  });
  const model=engine==="heartmula"?(env.HEARTMULA_MODEL||"HeartMuLa-oss-3B"):
    engine==="stable_audio_open"?(env.STABLE_AUDIO_OPEN_MODEL||"stable-audio-3-medium"):
    (env.MUSICGEN_MODEL||"facebook/musicgen-small");
  return gpuGatewayProvider({
    engine,purpose,model,baseUrl:env.OURJAM_GPU_GATEWAY_URL!,token:env.OURJAM_GPU_GATEWAY_TOKEN!,
    checkpointApproved:true,
  });
}
export type ComparisonWorkerConfig = {
  store:MediaStore;
  env?:NodeJS.ProcessEnv;
  validate?:typeof validateAudio;
  makeProvider?:(id:ComparisonEngineId,purpose:"private_research"|"commercial_evaluation")=>MusicProvider;
  clock?:()=>number;
};
type Claim = {
  id:string;batchId:string;provider:ComparisonEngineId;purpose:"private_research"|"commercial_evaluation";
  prompt:string;durationSeconds:number;attemptId:string;leaseFence:string;
  snapshot:Record<string,any>;
};
function estimateCost(snapshot:Record<string,any>,seconds:number,estimatedFallback:number):number {
  const rate=snapshot.rateSnapshot;
  const price=Number(rate?.rateMicroUsd);
  if(!Number.isSafeInteger(price)||price<=0 || !Number.isFinite(seconds)||seconds<0)
    return estimatedFallback;
  if(rate?.unit==="api_generation")return price;
  // Wall time is a *proxy* for GPU billing. It is NOT an invoice or certified GPU occupancy.
  if(rate?.unit==="gpu_hour")return Math.ceil(price*seconds/3600);
  return estimatedFallback;
}
async function updateBatchStatus(tx:Database|{query:Database["query"]},batchId:string) {
  const rows=(await tx.query("SELECT state FROM comparison_runs WHERE batch_id=$1",[batchId])).rows;
  const states=rows.map(r=>String(r.state));
  const pending=states.some(s=>["prepared","queued","running"].includes(s));
  const success=states.filter(s=>s==="succeeded").length;
  const allGood=states.length>0 && success===states.length;
  const state=pending?"running":allGood?"complete":success?"partial":"failed";
  await tx.query("UPDATE comparison_batches SET state=$2,updated_at=now() WHERE id=$1 AND state IN ('queued','running','complete','partial','failed')",[batchId,state]);
}
/**
 * Claims at most one already-approved comparison job. No retry of UNKNOWN jobs:
 * remote acceptance can have occurred even without a saved receipt.
 */
export async function comparisonGenerationTick(db:Database,config:ComparisonWorkerConfig):Promise<boolean> {
  const env=config.env??process.env;
  await db.query("UPDATE comparison_runs SET state='unknown',reason='worker_interrupted',updated_at=now() WHERE state='running' AND lease_until<clock_timestamp()");
  const claim=await db.transaction<Claim|null>(async tx=>{
    const r=(await tx.query(
      "SELECT r.*,b.prompt,b.purpose,b.duration_seconds,b.approved_ceiling_micro_usd FROM comparison_runs r JOIN comparison_batches b ON b.id=r.batch_id WHERE r.state='queued' AND b.state IN ('queued','running') ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED",
    )).rows[0];
    if(!r)return null;
    const issue=comparisonConfiguration(r.provider as ComparisonEngineId,r.purpose,env);
    const snapshot=(r.settings_snapshot??{}) as Record<string,any>;
    const ceiling=Number(r.approved_ceiling_micro_usd);
    const estimated=Number(r.estimated_cost_micro_usd);
    const sum=(await tx.query("SELECT sum(estimated_cost_micro_usd)::text total FROM comparison_runs WHERE batch_id=$1",[r.batch_id])).rows[0];
    const total=Number(sum?.total);
    const blocked=issue?"comparison_engine_not_authorized":!config.store?"comparison_storage_unavailable":
      !Number.isSafeInteger(estimated)||estimated<=0 || !Number.isSafeInteger(ceiling)||ceiling<=0 ||
      !Number.isSafeInteger(total)||total>ceiling?"comparison_budget_invalid":
      !snapshot.rateSnapshot?"comparison_rate_snapshot_missing":null;
    if(blocked){
      await tx.query("UPDATE comparison_runs SET state='blocked',reason=$2,finished_at=now(),updated_at=now() WHERE id=$1",[r.id,blocked]);
      await updateBatchStatus(tx,r.batch_id);
      return null;
    }
    const attemptId=randomUUID();
    await tx.query(
      "UPDATE comparison_runs SET state='running',attempt_id=$2,attempts=attempts+1,lease_until=now()+interval '20 minutes',started_at=now(),updated_at=now() WHERE id=$1",
      [r.id,attemptId],
    );
    await tx.query("UPDATE comparison_batches SET state='running',updated_at=now() WHERE id=$1",[r.batch_id]);
    const fence=(await tx.query("SELECT lease_until::text fence FROM comparison_runs WHERE id=$1",[r.id])).rows[0].fence;
    return {id:r.id,batchId:r.batch_id,provider:r.provider,purpose:r.purpose,
      prompt:r.prompt,durationSeconds:r.duration_seconds,attemptId,leaseFence:fence,snapshot};
  });
  if(!claim)return false;
  const startedAt=(config.clock??Date.now)();
  let provider:MusicProvider;
  try {
    provider=config.makeProvider?config.makeProvider(claim.provider,claim.purpose):
      comparisonMusicProvider(claim.provider,claim.purpose,env);
    const audio=await provider.generate(claim.prompt,claim.durationSeconds,{
      onAccepted:async ref=>{
        const saved=await db.query(
          "UPDATE comparison_runs SET provider_ref=$2,updated_at=now() WHERE id=$1 AND attempt_id=$3 AND state='running' AND lease_until=$4::timestamptz RETURNING id",
          [claim.id,ref,claim.attemptId,claim.leaseFence],
        );
        if(!saved.rows.length)throw new ProviderError("comparison_worker_lease_lost",true);
      },
    });
    const metadata=await (config.validate??validateAudio)(audio.bytes,provider.variableDuration?undefined:claim.durationSeconds);
    const sha=createHash("sha256").update(audio.bytes).digest("hex");
    const key=`comparison/${claim.batchId}/${claim.id}/${claim.attemptId}/${sha}.mp3`;
    await config.store.put(key,audio.bytes,sha);
    const seconds=Math.max(0,((config.clock??Date.now)()-startedAt)/1000);
    await db.transaction(async tx=>{
      const row=(await tx.query(
        "SELECT id,estimated_cost_micro_usd FROM comparison_runs WHERE id=$1 AND attempt_id=$2 AND state='running' AND lease_until=$3::timestamptz FOR UPDATE",
        [claim.id,claim.attemptId,claim.leaseFence],
      )).rows[0];
      if(!row)return;
      const estimate=estimateCost(claim.snapshot,seconds,Number(row.estimated_cost_micro_usd));
      await tx.query(
        "UPDATE comparison_runs SET state='succeeded',reason=NULL,asset_key=$2,asset_sha256=$3,provider_ref=COALESCE($4,provider_ref),generated_duration_seconds=$5,lease_until=NULL,finished_at=now(),settings_snapshot=settings_snapshot || $6::jsonb,updated_at=now() WHERE id=$1",
        [claim.id,key,sha,audio.providerRef??null,metadata.durationSeconds,JSON.stringify({workerElapsedSeconds:seconds,workerElapsedCostEstimateMicroUsd:estimate,
          validation:metadata,receipt:audio.providerRef??null})],
      );
      // An estimate is not an actual invoice. Existing upfront rate snapshot remains unmodified.
      await tx.query(
        "INSERT INTO comparison_usage_events(id,run_id,external_event_id,category,quantity,unit,unit_rate_micro_usd,amount_micro_usd,certainty,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'estimated',$9) ON CONFLICT DO NOTHING",
        [randomUUID(),claim.id,"run:"+claim.attemptId,claim.snapshot?.rateSnapshot?.unit==="api_generation"?"api":"gpu",
          claim.snapshot?.rateSnapshot?.unit==="api_generation"?1:seconds,
          claim.snapshot?.rateSnapshot?.unit==="api_generation"?"generation":"worker_elapsed_second",
          Number(claim.snapshot?.rateSnapshot?.rateMicroUsd)||null,estimate,
          "comparison_worker_estimate"],
      );
      await updateBatchStatus(tx,claim.batchId);
    });
  } catch(error) {
    const reason=error instanceof ProviderError?error.reason:"comparison_processing_interrupted";
    const uncertain=!(error instanceof ProviderError)||error.uncertain;
    await db.transaction(async tx=>{
      const changed=(await tx.query(
        "UPDATE comparison_runs SET state=$2,reason=$3,lease_until=NULL,finished_at=now(),updated_at=now() WHERE id=$1 AND attempt_id=$4 AND state='running' AND lease_until=$5::timestamptz RETURNING id",
        [claim.id,uncertain?"unknown":"failed",reason,claim.attemptId,claim.leaseFence],
      )).rows;
      if(changed.length)await updateBatchStatus(tx,claim.batchId);
    });
  }
  return true;
}
