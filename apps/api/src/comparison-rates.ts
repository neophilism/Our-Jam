import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database, Sql } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { replay, remember } from "./service.js";
import { COMPARISON_ENGINES } from "../../../packages/providers/src/comparison-catalog.js";

const providerIds = ["mureka","stability","ace_step","heartmula","stable_audio_open","musicgen"] as const;
const billingUnits = ["api_generation","gpu_hour","storage_gib_month","egress_gib"] as const;
export const comparisonRateInput = z.object({
  commandId: z.uuid(),
  provider: z.enum(providerIds),
  sku: z.string().trim().max(100),
  unit: z.enum(billingUnits),
  rateMicroUsd: z.number().int().positive().max(1_000_000_000_000),
  supplier: z.string().trim().min(2).max(100),
  sourceDescription: z.string().trim().min(3).max(500),
}).strict();

export async function currentComparisonRates(db: Sql) {
  const rows=(await db.query("SELECT id,provider,sku,unit,rate_micro_usd,supplier,source_description,provenance,effective_at,created_at FROM comparison_rate_cards WHERE superseded_at IS NULL ORDER BY provider,unit,sku")).rows;
  return rows.map(row=>({
    id:row.id,provider:row.provider,sku:row.sku,unit:row.unit,
    rateMicroUsd:Number(row.rate_micro_usd),supplier:row.supplier,
    sourceDescription:row.source_description,provenance:row.provenance,
    effectiveAt:row.effective_at,createdAt:row.created_at,
  }));
}

/** Stores a dated operator estimate; actual cloud invoices must be captured separately. */
export async function setComparisonRate(db:Database,input:z.infer<typeof comparisonRateInput>) {
  const engine=COMPARISON_ENGINES.find(e=>e.id===input.provider)!;
  const allowed=engine.execution==="paid_api" ? input.unit==="api_generation" :
    input.unit==="gpu_hour" || input.unit==="storage_gib_month" || input.unit==="egress_gib";
  requireThat(allowed,"invalid_billing_unit","Use a per-generation rate for APIs and metered compute/storage for rented GPUs.",400);
  return db.transaction(async tx=>{
    await tx.query("SELECT id FROM artists WHERE id='our-jam' FOR UPDATE");
    const actor="comparison-rate-admin";
    const cached=await replay(tx,actor,input.commandId,{type:"comparison.rate",...input});
    if(cached.response)return cached.response;
    await tx.query("UPDATE comparison_rate_cards SET superseded_at=now() WHERE provider=$1 AND sku=$2 AND unit=$3 AND superseded_at IS NULL",[input.provider,input.sku,input.unit]);
    const id=randomUUID();
    await tx.query("INSERT INTO comparison_rate_cards(id,provider,sku,unit,rate_micro_usd,supplier,source_description) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [id,input.provider,input.sku,input.unit,input.rateMicroUsd,input.supplier,input.sourceDescription]);
    const result={id,provider:input.provider,sku:input.sku,unit:input.unit,
      rateMicroUsd:input.rateMicroUsd,supplier:input.supplier,
      sourceDescription:input.sourceDescription,provenance:"operator_estimate" as const};
    await tx.query("INSERT INTO platform_policy_audit(action,updated_policy) VALUES('comparison.rate.create',$1::jsonb)",[JSON.stringify(result)]);
    await remember(tx,actor,input.commandId,cached.hash,result);
    return result;
  });
}
