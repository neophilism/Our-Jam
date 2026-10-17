import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { replay, remember } from "./service.js";
export const comparisonInvoiceInput=z.object({
  commandId:z.uuid(),
  expectedRevision:z.number().int().nonnegative(),
  amountMicroUsd:z.number().int().nonnegative().max(1_000_000_000_000),
  evidenceReference:z.string().trim().min(5).max(500),
  allocationMethod:z.string().trim().min(5).max(1000),
  certainty:z.enum(["invoiced","reconciled"]),
  includesFullAllocatedCost:z.boolean(),
  reason:z.string().trim().min(5).max(1000),
}).strict();
export async function comparisonInvoiceHistory(db:Database,batchId:string){
  const exists=(await db.query("SELECT id FROM comparison_batches WHERE id=$1",[batchId])).rows[0];
  requireThat(exists,"comparison_not_found","Comparison batch not found.",404);
  const entries=(await db.query(
    "SELECT h.id,h.run_id,h.revision,h.amount_micro_usd,h.evidence_reference,h.allocation_method,h.certainty,h.includes_full_allocated_cost,h.reason,h.created_at FROM comparison_invoice_revisions h JOIN comparison_runs r ON r.id=h.run_id WHERE r.batch_id=$1 ORDER BY h.created_at DESC,h.revision DESC",
    [batchId],
  )).rows.map(row=>({
    id:row.id,runId:row.run_id,revision:row.revision,
    amountMicroUsd:Number(row.amount_micro_usd),evidenceReference:row.evidence_reference,
    allocationMethod:row.allocation_method,certainty:row.certainty,
    includesFullAllocatedCost:row.includes_full_allocated_cost,reason:row.reason,createdAt:row.created_at,
  }));
  return {entries};
}
/** Enter real invoice evidence separately from estimated GPU/process runtime. */
export async function reconcileComparisonInvoice(
  db:Database,batchId:string,runId:string,input:z.infer<typeof comparisonInvoiceInput>,
){
  if(input.certainty==="reconciled")
    requireThat(input.includesFullAllocatedCost,"incomplete_cost_attribution",
      "Mark reconciled only after attributing all billable GPU idle/startup, retries, network, storage and provider fees. Keep invoiced status if any charge is unknown.",400);
  return db.transaction(async tx=>{
    const batch=(await tx.query("SELECT id FROM comparison_batches WHERE id=$1 FOR UPDATE",[batchId])).rows[0];
    requireThat(batch,"comparison_not_found","Comparison batch not found.",404);
    const cached=await replay(tx,"comparison-invoice:"+runId,input.commandId,{type:"comparison.invoice",batchId,runId,...input});
    if(cached.response)return cached.response;
    const run=(await tx.query(
      "SELECT id,provider,state FROM comparison_runs WHERE id=$1 AND batch_id=$2 FOR UPDATE",
      [runId,batchId],
    )).rows[0];
    requireThat(run,"comparison_run_not_found","Comparison provider run not found.",404);
    requireThat(["succeeded","failed","unknown","blocked","cancelled"].includes(run.state),
      "comparison_invoice_too_early","Wait until a run is terminal before reconciling its charges.",409);
    const recent=(await tx.query(
      "SELECT revision,amount_micro_usd FROM comparison_invoice_revisions WHERE run_id=$1 ORDER BY revision DESC LIMIT 1",
      [runId],
    )).rows[0];
    const revision=Number(recent?.revision??0);
    requireThat(revision===input.expectedRevision,"revision_conflict",
      "A newer charge reconciliation exists. Refresh before replacing this entry.",409);
    const id=randomUUID(),nextRevision=revision+1;
    await tx.query(
      "INSERT INTO comparison_invoice_revisions(id,run_id,revision,amount_micro_usd,evidence_reference,allocation_method,certainty,includes_full_allocated_cost,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id,runId,nextRevision,input.amountMicroUsd,input.evidenceReference,input.allocationMethod,input.certainty,input.includesFullAllocatedCost,input.reason],
    );
    await tx.query(
      "UPDATE comparison_runs SET actual_cost_micro_usd=$2,cost_certainty=$3,updated_at=now() WHERE id=$1",
      [runId,input.amountMicroUsd,input.certainty],
    );
    await tx.query("INSERT INTO platform_policy_audit(action,updated_policy) VALUES('comparison.invoice.revision',$1::jsonb)",
      [JSON.stringify({runId,batchId,nextRevision,amountMicroUsd:input.amountMicroUsd,certainty:input.certainty,
        reference:input.evidenceReference,allocationMethod:input.allocationMethod,reason:input.reason})]);
    const response={id,runId,batchId,revision:nextRevision,amountMicroUsd:input.amountMicroUsd,
      certainty:input.certainty,includesFullAllocatedCost:input.includesFullAllocatedCost};
    await remember(tx,"comparison-invoice:"+runId,input.commandId,cached.hash,response);
    return response;
  });
}
