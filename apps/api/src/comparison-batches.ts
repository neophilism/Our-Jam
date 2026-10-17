import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { replay, remember } from "./service.js";
import { readComparisonSelection } from "./comparison-settings.js";
import { COMPARISON_ENGINES } from "../../../packages/providers/src/comparison-catalog.js";

export const prepareComparisonInput = z.object({
  commandId: z.uuid(),
  expectedSelectionRevision: z.number().int().nonnegative(),
  prompt: z.string().trim().min(8).max(3500),
  durationSeconds: z.number().int().min(10).max(180),
  purpose: z.enum(["private_research","commercial_evaluation"]),
}).strict();

/** Creates an immutable evaluation plan; deliberately makes zero provider requests. */
export async function prepareComparisonBatch(db: Database, input: z.infer<typeof prepareComparisonInput>) {
  return db.transaction(async tx => {
    const selection = await readComparisonSelection(tx,true);
    const cached = await replay(tx,"comparison-admin",input.commandId,{type:"comparison.prepare",...input});
    if (cached.response) return cached.response;
    requireThat(selection.revision === input.expectedSelectionRevision,
      "revision_conflict", "The comparison provider choices changed. Refresh before creating the test.",409);
    requireThat(input.purpose === "private_research" || !selection.selectedProviders.includes("musicgen"),
      "research_only_model", "MusicGen weights allow noncommercial use only. A private commercial product evaluation is not noncommercial research; exclude MusicGen unless this is genuine noncommercial research.",400);
    const id = randomUUID();
    const hash = createHash("sha256").update(input.prompt,"utf8").digest("hex");
    await tx.query(
      "INSERT INTO comparison_batches(id,command_id,prompt,prompt_sha256,duration_seconds,instrumental,purpose,selected_providers,selection_revision) VALUES($1,$2,$3,$4,$5,true,$6,$7::text[],$8)",
      [id,input.commandId,input.prompt,hash,input.durationSeconds,input.purpose,selection.selectedProviders,selection.revision],
    );
    for(const engineId of selection.selectedProviders) {
      const engine=COMPARISON_ENGINES.find(p=>p.id===engineId)!;
      await tx.query(
        "INSERT INTO comparison_runs(id,batch_id,provider,checkpoint,settings_snapshot) VALUES($1,$2,$3,$4,$5::jsonb)",
        [randomUUID(),id,engine.id,engine.checkpoint,JSON.stringify({instrumentals:true,requestedDurationSeconds:input.durationSeconds,execution:engine.execution,rights:engine.rights,gpuHost:engine.execution==="self_hosted"?selection.gpuHost:null,modelCheckpoint:engine.checkpoint})],
      );
    }
    const response={ id,state:"prepared" as const,selectedProviders:selection.selectedProviders,gpuHost:selection.gpuHost,purpose:input.purpose,durationSeconds:input.durationSeconds,hasDispatched:false };
    await remember(tx,"comparison-admin",input.commandId,cached.hash,response);
    return response;
  });
}

export async function listComparisonBatches(db: Database) {
  return (await db.query(
    "SELECT id,purpose,state,selected_providers,duration_seconds,created_at,updated_at FROM comparison_batches ORDER BY created_at DESC LIMIT 50"
  )).rows.map(row=>({
    id:row.id,purpose:row.purpose,state:row.state,selectedProviders:row.selected_providers,
    durationSeconds:row.duration_seconds,createdAt:row.created_at,updatedAt:row.updated_at,
  }));
}

export async function readComparisonBatch(db: Database, batchId: string) {
  const batch=(await db.query(
    "SELECT id,prompt,prompt_sha256,duration_seconds,purpose,selected_providers,selection_revision,state,approved_ceiling_micro_usd,created_at FROM comparison_batches WHERE id=$1",[batchId]
  )).rows[0];
  requireThat(batch,"comparison_not_found","Comparison batch not found.",404);
  const runs=(await db.query(
    "SELECT id,provider,checkpoint,state,reason,attempts,generated_duration_seconds,estimated_cost_micro_usd,actual_cost_micro_usd,cost_certainty,settings_snapshot,created_at,started_at,finished_at FROM comparison_runs WHERE batch_id=$1 ORDER BY created_at,id",[batchId]
  )).rows;
  return {
    id:batch.id,prompt:batch.prompt,promptHash:batch.prompt_sha256,
    durationSeconds:batch.duration_seconds,purpose:batch.purpose,
    selectedProviders:batch.selected_providers,selectionRevision:batch.selection_revision,
    state:batch.state,approvedCeilingMicroUsd:batch.approved_ceiling_micro_usd,
    createdAt:batch.created_at,runs:runs.map(run=>({
      id:run.id,provider:run.provider,checkpoint:run.checkpoint,state:run.state,reason:run.reason,
      attempts:run.attempts,generatedDurationSeconds:run.generated_duration_seconds,
      estimatedCostMicroUsd:run.estimated_cost_micro_usd,actualCostMicroUsd:run.actual_cost_micro_usd,
      costCertainty:run.cost_certainty,gpuHost:run.settings_snapshot?.gpuHost??null,modelCheckpoint:run.settings_snapshot?.modelCheckpoint??run.checkpoint,startedAt:run.started_at,finishedAt:run.finished_at,
    })),
  };
}
