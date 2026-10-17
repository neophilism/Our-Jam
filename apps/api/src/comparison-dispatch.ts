import { z } from "zod";
import type { Database, Sql } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { replay, remember } from "./service.js";
import { currentComparisonRates } from "./comparison-rates.js";
import { COMPARISON_ENGINES, type ComparisonEngineId } from "../../../packages/providers/src/comparison-catalog.js";

const engineId = z.enum(["mureka","stability","ace_step","heartmula","stable_audio_open","musicgen"]);
export const startComparisonInput = z.object({
  commandId:z.uuid(),
  approvedCeilingMicroUsd:z.number().int().positive().max(1_000_000_000_000),
}).strict();
export type ComparisonQuote = {
  provider:ComparisonEngineId; label:string; ready:boolean; reason:string|null;
  estimatedCostMicroUsd:number|null; costBasis:string|null;
  rateCardId:string|null; rateSnapshot:Record<string,unknown>|null;
};
const isSet = (value:string|undefined) => typeof value==="string" && value.trim().length>0;
const secureRoot=(value:string|undefined)=>{
  if(!value)return false;
  try{const url=new URL(value);
    return url.protocol==="https:" && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname==="/" && (!url.port || url.port==="443");
  }catch{return false;}
};
/** Presence of an endpoint or a model checkpoint is NOT proof that inference actually works. */
export function comparisonConfiguration(provider:ComparisonEngineId,purpose:string,env:NodeJS.ProcessEnv=process.env):string|null {
  if(env.COMPARISON_GENERATION_ENABLED!=="1")return "Comparison generation is disabled on this server.";
  if(purpose!=="private_research" && purpose!=="commercial_evaluation")return "Unknown comparison purpose.";
  if(purpose==="commercial_evaluation" && env.COMPARISON_COMMERCIAL_RIGHTS_APPROVED!=="1")
    return "Commercial comparison rights have not been confirmed for this deployment.";
  if(provider==="mureka")return isSet(env.MUREKA_API_KEY)?null:"Mureka API key is missing.";
  if(provider==="stability")return isSet(env.STABLE_AUDIO_KEY||env.STABILITY_API_KEY)?null:"Stable Audio API key is missing.";
  if(provider==="ace_step"){
    if(!secureRoot(env.ACE_STEP_BASE_URL)||!isSet(env.ACE_STEP_TOKEN))
      return "ACE-Step private HTTPS endpoint/token are missing or invalid.";
    if(env.ACE_STEP_CHECKPOINT_APPROVED!=="1")return "ACE-Step checkpoint/license not approved.";
  }else{
    if(!secureRoot(env.OURJAM_GPU_GATEWAY_URL)||!isSet(env.OURJAM_GPU_GATEWAY_TOKEN))
      return "Own GPU gateway private HTTPS endpoint/token are missing or invalid.";
    if(provider==="musicgen"){
      if(purpose!=="private_research" || env.MUSICGEN_NONCOMMERCIAL_RESEARCH_APPROVED!=="1")
        return "MusicGen weights are noncommercial and require genuine approved research.";
    }else if(provider==="heartmula" && env.HEARTMULA_CHECKPOINT_APPROVED!=="1")
      return "HeartMuLa checkpoint/license not approved.";
    else if(provider==="stable_audio_open" && env.STABLE_AUDIO_OPEN_LICENSE_APPROVED!=="1")
      return "Stable Audio gated model license/eligibility not approved.";
  }
  if(!Number.isSafeInteger(Number(env.COMPARISON_GPU_ENFORCED_BILLING_SECONDS))||
     Number(env.COMPARISON_GPU_ENFORCED_BILLING_SECONDS)<30 ||
     Number(env.COMPARISON_GPU_ENFORCED_BILLING_SECONDS)>3600 ||
     env.COMPARISON_GPU_HOST_BILLING_LIMIT_ACK!=="1")
    return "GPU host timeout/billing limit has not been verified.";
  return null;
}
function gpuEstimateSeconds(env:NodeJS.ProcessEnv):number|null {
  const n=Number(env.COMPARISON_GPU_ENFORCED_BILLING_SECONDS);
  return Number.isSafeInteger(n)&&n>=30&&n<=3600?n:null;
}
export async function comparisonPreflight(sql:Sql,batchId:string,env:NodeJS.ProcessEnv=process.env) {
  const batch=(await sql.query(
    "SELECT id,purpose,state,selected_providers,duration_seconds,approved_ceiling_micro_usd FROM comparison_batches WHERE id=$1",
    [batchId],
  )).rows[0];
  requireThat(batch,"comparison_not_found","Comparison batch not found.",404);
  const runs=(await sql.query("SELECT provider,checkpoint,state FROM comparison_runs WHERE batch_id=$1 ORDER BY created_at,id",[batchId])).rows;
  const rates=await currentComparisonRates(sql);
  const quotes:ComparisonQuote[]=[];
  const reservedGpuSeconds=gpuEstimateSeconds(env);
  for(const run of runs) {
    const provider=engineId.parse(run.provider), engine=COMPARISON_ENGINES.find(e=>e.id===provider)!;
    const unit=engine.execution==="paid_api"?"api_generation":"gpu_hour";
    const requestedSku=engine.execution==="paid_api"?"":env[provider.toUpperCase()+"_GPU_SKU"]||env.COMPARISON_GPU_SKU;
    const eligible=rates.filter(rate=>rate.provider===provider&&rate.unit===unit&&(!requestedSku||rate.sku===requestedSku));
    const rate=eligible.length===1?eligible[0]:null;
    let reason=comparisonConfiguration(provider,batch.purpose,env);
    if(!reason && !rate)reason=eligible.length>1?"Multiple GPU rates match; configure a single GPU SKU.":"Verified operator rate is missing for this provider.";
    if(!reason && run.state!=="prepared")reason="Provider run is already "+run.state+".";
    const budgetSeconds=engine.execution==="self_hosted"?reservedGpuSeconds:null;
    const cost=rate?(engine.execution==="paid_api"?rate.rateMicroUsd:
      budgetSeconds?Math.ceil(rate.rateMicroUsd*budgetSeconds/3600):null):null;
    if(!reason && cost===null)reason="GPU maximum billed time is missing.";
    const safeCost=cost!==null&&Number.isSafeInteger(cost)&&cost>0?cost:null;
    if(!reason && safeCost===null)reason="Invalid cost estimate.";
    quotes.push({
      provider,label:engine.label,ready:!reason,reason,estimatedCostMicroUsd:safeCost,
      costBasis:rate?(engine.execution==="paid_api"?"quoted API rate per request":
        "operator GPU rate x configured host billable-time limit; NOT an observed charge"):null,
      rateCardId:rate?.id??null,
      rateSnapshot:rate?{id:rate.id,sku:rate.sku,supplier:rate.supplier,unit:rate.unit,
        rateMicroUsd:rate.rateMicroUsd,sourceDescription:rate.sourceDescription,
        maxGpuBilledSeconds:budgetSeconds,provenance:"operator_estimate"}:null,
    });
  }
  const complete=runs.length===batch.selected_providers.length &&
    batch.selected_providers.every((value:string)=>quotes.some(q=>q.provider===value));
  const allReady=Boolean(complete && batch.state==="prepared" && quotes.every(q=>q.ready));
  const estimatedTotalMicroUsd=quotes.every(q=>q.estimatedCostMicroUsd!==null)
    ?quotes.reduce((acc,q)=>acc+q.estimatedCostMicroUsd!,0):null;
  return {batchId:batch.id,state:batch.state,quotes,allReady,
    estimatedTotalMicroUsd:Number.isSafeInteger(estimatedTotalMicroUsd)?estimatedTotalMicroUsd:null,
    approvedCeilingMicroUsd:batch.approved_ceiling_micro_usd===null?null:Number(batch.approved_ceiling_micro_usd),
    warning:"Rate-card estimates are not cloud invoices. GPU billed idle time, startup and actual supplier charges must be reconciled separately. The configured GPU time limit must actually be enforced at the host."};
}
export async function startComparisonBatch(
  db:Database,batchId:string,input:z.infer<typeof startComparisonInput>,env:NodeJS.ProcessEnv=process.env,
) {
  return db.transaction(async tx=>{
    await tx.query("SELECT id FROM comparison_batches WHERE id=$1 FOR UPDATE",[batchId]);
    const cached=await replay(tx,"comparison-start:"+batchId,input.commandId,{type:"comparison.start",batchId,...input});
    if(cached.response)return cached.response;
    const quote=await comparisonPreflight(tx,batchId,env);
    requireThat(quote.allReady && quote.estimatedTotalMicroUsd!==null,
      "comparison_not_ready","One or more selected models, model licenses, rates or GPU limits are not ready; no generation request was sent.",409);
    requireThat(input.approvedCeilingMicroUsd>=quote.estimatedTotalMicroUsd,
      "comparison_ceiling_too_low","The approved cost ceiling is lower than the quoted estimate. Nothing was dispatched.",409);
    const updated=await tx.query(
      "UPDATE comparison_batches SET state='queued',approved_ceiling_micro_usd=$2,updated_at=now() WHERE id=$1 AND state='prepared' RETURNING id",
      [batchId,input.approvedCeilingMicroUsd],
    );
    requireThat(updated.rows.length===1,"comparison_not_prepared","Only a prepared comparison can start.",409);
    for(const row of quote.quotes) {
      await tx.query(
        "UPDATE comparison_runs SET state='queued',estimated_cost_micro_usd=$2,cost_certainty='estimated',settings_snapshot=settings_snapshot || $3::jsonb,updated_at=now() WHERE batch_id=$1 AND provider=$4 AND state='prepared'",
        [batchId,row.estimatedCostMicroUsd,JSON.stringify({rateSnapshot:row.rateSnapshot,estimatedCostBasis:row.costBasis}),row.provider],
      );
    }
    const result={batchId,state:"queued" as const,queuedRuns:quote.quotes.length,
      estimatedTotalMicroUsd:quote.estimatedTotalMicroUsd,approvedCeilingMicroUsd:input.approvedCeilingMicroUsd};
    await tx.query("INSERT INTO platform_policy_audit(action,updated_policy) VALUES('comparison.start',$1::jsonb)",
      [JSON.stringify({batchId,queuedRuns:result.queuedRuns,estimatedTotalMicroUsd:result.estimatedTotalMicroUsd,approvedCeilingMicroUsd:input.approvedCeilingMicroUsd})]);
    await remember(tx,"comparison-start:"+batchId,input.commandId,cached.hash,result);
    return result;
  });
}
