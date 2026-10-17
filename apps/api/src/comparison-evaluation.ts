import { z } from "zod";
import type { Database } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { replay, remember } from "./service.js";
const rating = z.number().int().min(1).max(5);
export const comparisonReviewInput = z.object({
  commandId:z.uuid(), soundQuality:rating,promptAdherence:rating,
  approvedUsable:z.boolean(),favorite:z.boolean(),notes:z.string().max(2000).default(""),
}).strict();
export async function saveComparisonReview(db:Database,batchId:string,runId:string,input:z.infer<typeof comparisonReviewInput>) {
  return db.transaction(async tx=>{
    const batch=(await tx.query("SELECT id FROM comparison_batches WHERE id=$1 FOR UPDATE",[batchId])).rows[0];
    requireThat(batch,"comparison_not_found","Comparison batch not found.",404);
    const cache=await replay(tx,"comparison-review:"+runId,input.commandId,{type:"comparison.review",batchId,runId,...input});
    if(cache.response)return cache.response;
    const row=(await tx.query("SELECT id,state FROM comparison_runs WHERE id=$1 AND batch_id=$2 FOR UPDATE",[runId,batchId])).rows[0];
    requireThat(row?.state==="succeeded","comparison_audio_not_ready","Only successful generated tracks can be rated.",409);
    if(input.favorite){
      await tx.query("UPDATE comparison_reviews SET favorite=false,updated_at=now() WHERE run_id IN (SELECT id FROM comparison_runs WHERE batch_id=$1)",[batchId]);
    }
    await tx.query(
      "INSERT INTO comparison_reviews(run_id,sound_quality,prompt_adherence,approved_usable,favorite,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(run_id) DO UPDATE SET sound_quality=EXCLUDED.sound_quality,prompt_adherence=EXCLUDED.prompt_adherence,approved_usable=EXCLUDED.approved_usable,favorite=EXCLUDED.favorite,notes=EXCLUDED.notes,updated_at=now()",
      [runId,input.soundQuality,input.promptAdherence,input.approvedUsable,input.favorite,input.notes],
    );
    const response={runId,batchId,soundQuality:input.soundQuality,promptAdherence:input.promptAdherence,
      approvedUsable:input.approvedUsable,favorite:input.favorite,notes:input.notes};
    await tx.query("INSERT INTO platform_policy_audit(action,updated_policy) VALUES('comparison.review',$1::jsonb)",
      [JSON.stringify({batchId,runId,soundQuality:input.soundQuality,promptAdherence:input.promptAdherence,
        approvedUsable:input.approvedUsable,favorite:input.favorite})]);
    await remember(tx,"comparison-review:"+runId,input.commandId,cache.hash,response);
    return response;
  });
}
export async function readComparisonReviews(db:Database,batchId:string) {
  const exists=(await db.query("SELECT id FROM comparison_batches WHERE id=$1",[batchId])).rows[0];
  requireThat(exists,"comparison_not_found","Comparison batch not found.",404);
  const result=(await db.query(
    "SELECT r.id run_id,r.provider,r.state,r.estimated_cost_micro_usd,r.actual_cost_micro_usd,r.cost_certainty,v.sound_quality,v.prompt_adherence,v.approved_usable,v.favorite,v.notes FROM comparison_runs r LEFT JOIN comparison_reviews v ON v.run_id=r.id WHERE r.batch_id=$1 ORDER BY r.created_at,r.id",
    [batchId],
  )).rows;
  return result.map(r=>({
    runId:r.run_id,provider:r.provider,state:r.state,
    soundQuality:r.sound_quality??null,promptAdherence:r.prompt_adherence??null,
    approvedUsable:r.approved_usable??null,favorite:r.favorite??false,notes:r.notes??"",
    quotedCostMicroUsd:r.estimated_cost_micro_usd===null?null:Number(r.estimated_cost_micro_usd),
    actualCostMicroUsd:r.actual_cost_micro_usd===null?null:Number(r.actual_cost_micro_usd),
    costCertainty:r.cost_certainty,
  }));
}
/** Per-provider report across all prepared/started comparison runs. Quotes remain estimates. */
export async function comparisonCostReport(db:Database) {
  const rows=(await db.query(
    "SELECT r.provider,r.state,r.estimated_cost_micro_usd,r.actual_cost_micro_usd,r.cost_certainty,v.approved_usable,v.sound_quality,v.prompt_adherence FROM comparison_runs r LEFT JOIN comparison_reviews v ON v.run_id=r.id",
  )).rows;
  const groups=new Map<string,typeof rows>();
  for(const row of rows)groups.set(row.provider,[...(groups.get(row.provider)??[]),row]);
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([provider,group])=>{
    const counts={runs:group.length,successful:group.filter(r=>r.state==="succeeded").length,
      usable:group.filter(r=>r.approved_usable===true).length,failedOrUnknown:group.filter(r=>["unknown","failed","blocked"].includes(r.state)).length};
    const hasAllQuotes=group.every(r=>r.estimated_cost_micro_usd!==null);
    const hasAllActuals=group.every(r=>r.actual_cost_micro_usd!==null && r.cost_certainty==="reconciled");
    const quotedTotalMicroUsd=hasAllQuotes?group.reduce((n,r)=>n+Number(r.estimated_cost_micro_usd),0):null;
    const actualTotalMicroUsd=hasAllActuals?group.reduce((n,r)=>n+Number(r.actual_cost_micro_usd),0):null;
    const averageQuality=group.filter(r=>r.sound_quality!==null).reduce((n,r)=>n+Number(r.sound_quality),0)/(group.filter(r=>r.sound_quality!==null).length||1);
    return {provider,...counts,quotedTotalMicroUsd,actualTotalMicroUsd,
      quoteCostPerUsableMicroUsd:counts.usable && quotedTotalMicroUsd!==null?Math.ceil(quotedTotalMicroUsd/counts.usable):null,
      actualCostPerUsableMicroUsd:counts.usable && actualTotalMicroUsd!==null?Math.ceil(actualTotalMicroUsd/counts.usable):null,
      ratedCount:group.filter(r=>r.sound_quality!==null).length,
      averageQuality:group.some(r=>r.sound_quality!==null)?Number(averageQuality.toFixed(2)):null,
      note:"Quoted rates are not actual incurred charges; actual per-usable-song cost is unknown until invoiced and reconciled."};
  });
}
export function costReportCsv(rows:Awaited<ReturnType<typeof comparisonCostReport>>) {
  const header=["provider","runs","successful","usable","failed_or_unknown","estimated_total_micro_usd","actual_total_micro_usd","estimated_cost_per_usable_micro_usd","actual_cost_per_usable_micro_usd","rated_count","average_quality"];
  const fields=(v:unknown)=>{
    const s=v===null||v===undefined?"":String(v);
    const safe=/^[=+@\-\t\r]/.test(s)?"'"+s:s;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  return [header.join(","),...rows.map(r=>[
    r.provider,r.runs,r.successful,r.usable,r.failedOrUnknown,r.quotedTotalMicroUsd,r.actualTotalMicroUsd,
    r.quoteCostPerUsableMicroUsd,r.actualCostPerUsableMicroUsd,r.ratedCount,r.averageQuality,
  ].map(fields).join(","))].join("\n")+"\n";
}
