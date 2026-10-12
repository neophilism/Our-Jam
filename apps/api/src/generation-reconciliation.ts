import { z } from "zod";
import type { Database } from "./db.js";
import type { GenerationConfig } from "./generation.js";
import { ownedEvent, replay, remember, logEvent } from "./service.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { id } from "../../../packages/contracts/src/index.js";

export const reconciliationInput = z.object({
  commandId: id,
  expectedRevision: z.number().int().nonnegative(),
}).strict();

type Receipt = {
  provider?: string | null;
  model?: string | null;
  requested_provider?: string;
  provider_ref?: string | null;
  attempt_id?: string | null;
  attempts?: number;
  reserved_cents?: number;
};

/** Only a persisted Mureka receipt is resumable. Never infer a provider task. */
export function reconciliationBlock(config: GenerationConfig | undefined, job: Receipt): string | null {
  if (!config) return "provider_not_configured";
  if (config.eventBudgetCents === 0 || config.totalBudgetCents === 0) return "approved_budget_zero";
  if (![config.eventBudgetCents, config.totalBudgetCents].every((n) => Number.isSafeInteger(n) && n > 0)) return "invalid_generation_budget";
  if (job.provider !== "mureka" || job.requested_provider !== "mureka") return "provider_task_not_resumable";
  if (!job.provider_ref || !/^[A-Za-z0-9_-]{1,200}$/.test(job.provider_ref) ||
      !job.attempt_id || !Number.isSafeInteger(job.attempts) || job.attempts! < 1 ||
      !Number.isSafeInteger(job.reserved_cents) || job.reserved_cents! < 1) return "provider_receipt_missing";
  const provider = config.providers ? config.providers.mureka : config.provider;
  if (!provider?.resume || provider.name !== "mureka") return "provider_task_not_resumable";
  if (provider.model !== job.model) return "provider_model_changed";
  if (!config.store) return "media_storage_not_configured";
  return null;
}

export async function requestReconciliation(
  db: Database, artistId: string, jobId: string,
  input: z.infer<typeof reconciliationInput>, config?: GenerationConfig,
) {
  return db.transaction(async (tx) => {
    const found = (await tx.query("SELECT event_id FROM generation_jobs WHERE id=$1", [jobId])).rows[0];
    requireThat(found, "not_found", "Generation not found.", 404);
    const event = await ownedEvent(tx, found.event_id, artistId, true);
    const cached = await replay(tx, "operator:" + artistId, input.commandId, { type: "generation.reconcile", jobId, ...input });
    if (cached.response) return cached.response;
    requireThat(event.revision === input.expectedRevision, "revision_conflict", "The show changed. Refresh before checking the saved task.", 409);
    const job = (await tx.query("SELECT j.*,COALESCE(r.settings->>'generationProvider','stability') requested_provider FROM generation_jobs j JOIN rounds r ON r.id=j.round_id WHERE j.id=$1 FOR UPDATE OF j", [jobId])).rows[0];
    requireThat(job?.state === "unknown" && job.reason !== "reconciliation_requested", "invalid_job_state", "Only an unresolved task can be checked. Refresh its current status.", 409);
    const blocked = reconciliationBlock(config, job);
    requireThat(!blocked, blocked ?? "reconciliation_blocked", "The saved task cannot be checked with this server configuration. No provider request was sent.", 409);
    await tx.query("UPDATE generation_jobs SET reason='reconciliation_requested',updated_at=now() WHERE id=$1", [jobId]);
    await tx.query("INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2,'generation.reconcile_requested',$3)", [artistId, found.event_id, jobId]);
    await logEvent(tx, found.event_id, "generation.reconcile_requested");
    const result = { ok: true, state: "unknown", reconciliation: "requested", createsNewTask: false };
    await remember(tx, "operator:" + artistId, input.commandId, cached.hash, result);
    return result;
  });
}
