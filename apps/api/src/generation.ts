import { randomUUID, createHash } from "node:crypto";
import type { Database } from "./db.js";
import { logEvent } from "./service.js";
import { ProviderError, type MusicProvider } from "../../../packages/providers/src/stability.js";
import type { MediaStore } from "../../../packages/providers/src/storage.js";
import { validateAudio } from "./media.js";
import { reconciliationBlock } from "./generation-reconciliation.js";

export type GenerationConfig = {
  provider: MusicProvider;
  providers?: Partial<Record<"stability" | "mureka", MusicProvider>>;
  providerPrices?: Partial<Record<"stability" | "mureka", { maxJobCents: number; verifiedUntil?: string }>>;
  store?: MediaStore;
  maxJobCents: number;
  eventBudgetCents: number;
  totalBudgetCents: number;
  durationSeconds: number;
  priceVerifiedUntil?: string;
  validate?: typeof validateAudio;
};
type DispatchJob = { id: string; event_id: string; round_id: string; prompt: string; prompt_hash: string; attempt_id: string; selectedProvider: MusicProvider; resumeRef?: string; leaseFence: string };

export async function generationTick(db: Database, config: GenerationConfig) {
  // Never automatically resubmit an ambiguous acceptance.
  await db.query("UPDATE generation_jobs SET state='unknown',reason='worker_interrupted',updated_at=now() WHERE state='submitting' AND lease_until<clock_timestamp()");
  const job = await db.transaction<DispatchJob | null>(async (tx) => {
    await tx.query("SELECT id FROM artists WHERE id='our-jam' FOR UPDATE");
    const candidate = (await tx.query("SELECT j.id,j.event_id FROM generation_jobs j JOIN events e ON e.id=j.event_id WHERE (j.state='queued' OR (j.state='unknown' AND j.reason='reconciliation_requested')) AND e.artist_id='our-jam' ORDER BY j.created_at LIMIT 1")).rows[0];
    if (!candidate) return null;
    await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [candidate.event_id]);
    const row = (await tx.query("SELECT j.*,COALESCE(r.settings->>'generationProvider','stability') requested_provider FROM generation_jobs j JOIN rounds r ON r.id=j.round_id WHERE j.id=$1 AND (j.state='queued' OR (j.state='unknown' AND j.reason='reconciliation_requested')) FOR UPDATE OF j", [candidate.id])).rows[0];
    if (!row) return null;
    const resuming = row.state === "unknown";
    const choice = row.requested_provider as "stability" | "mureka";
    const provider = config.providers ? config.providers[choice] : config.provider;
    const price = config.providerPrices?.[choice];
    const cost = price ? price.maxJobCents : config.maxJobCents;
    const expiry = price ? price.verifiedUntil : config.priceVerifiedUntil;
    let reason: string | undefined;
    if (config.eventBudgetCents === 0 || config.totalBudgetCents === 0) reason = "approved_budget_zero";
    else if (![config.eventBudgetCents, config.totalBudgetCents].every((n) => Number.isSafeInteger(n) && n > 0)) reason = "invalid_generation_budget";
    else if (!provider) reason = "selected_provider_not_configured";
    else if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 10000 || (config.providerPrices && !expiry) || (expiry && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()))) reason = "provider_price_not_verified";
    else if (!config.store) reason = "media_storage_not_configured";
    if (!reason && resuming) reason = reconciliationBlock(config, row) ?? undefined;
    if (!reason && !resuming) {
      const costs = (await tx.query("SELECT COALESCE(sum(j.reserved_cents),0)::integer total,COALESCE(sum(j.reserved_cents) FILTER(WHERE j.event_id=$1),0)::integer event FROM generation_jobs j JOIN events e ON e.id=j.event_id WHERE e.artist_id='our-jam'", [row.event_id])).rows[0];
      if (costs.total + cost > config.totalBudgetCents || costs.event + cost > config.eventBudgetCents) reason = "approved_budget_exhausted";
    }
    if (reason) {
      await tx.query("UPDATE generation_jobs SET state=$1,reason=$2,updated_at=now() WHERE id=$3", [resuming ? "unknown" : "blocked", reason, row.id]);
      await logEvent(tx, row.event_id, "generation.blocked");
      return null;
    }
    if (!resuming && provider!.name === "mureka" && row.prompt.length > 1024) {
      await tx.query("UPDATE generation_jobs SET state='blocked',reason='provider_prompt_too_long',updated_at=now() WHERE id=$1", [row.id]);
      await logEvent(tx, row.event_id, "generation.blocked");
      return null;
    }
    const attempt = resuming ? row.attempt_id : randomUUID();
    if (resuming) await tx.query("UPDATE generation_jobs SET state='submitting',reason=NULL,lease_until=now()+interval '8 minutes',updated_at=now() WHERE id=$1", [row.id]);
    else await tx.query("UPDATE generation_jobs SET state='submitting',attempt_id=$1,attempts=attempts+1,lease_until=now()+interval '8 minutes',reserved_cents=$2,provider=$3,model=$4,duration_seconds=$5,updated_at=now() WHERE id=$6", [attempt, cost, provider!.name, provider!.model, provider!.variableDuration ? null : config.durationSeconds, row.id]);
    const claim = (await tx.query("SELECT lease_until::text AS fence FROM generation_jobs WHERE id=$1", [row.id])).rows[0];
    await logEvent(tx, row.event_id, resuming ? "generation.reconciling" : "generation.started");
    return { id: row.id, event_id: row.event_id, round_id: row.round_id, prompt: row.prompt, prompt_hash: row.prompt_hash, attempt_id: attempt, selectedProvider: provider!, resumeRef: resuming ? row.provider_ref : undefined, leaseFence: claim.fence };
  });
  if (!job) return false;
  const provider = job.selectedProvider;
  try {
    const context = {
      onAccepted: async (reference: string) => {
        if (job.resumeRef && reference !== job.resumeRef) throw new ProviderError("provider_task_mismatch", true);
        const saved = await db.query("UPDATE generation_jobs SET provider_ref=$1,updated_at=now() WHERE id=$2 AND attempt_id=$3 AND state='submitting' AND lease_until=$4::timestamptz RETURNING id", [reference, job.id, job.attempt_id, job.leaseFence]);
        if (!saved.rows.length) throw new ProviderError("worker_lease_lost", true);
      },
    };
    const audio = job.resumeRef
      ? await provider.resume!(job.resumeRef, job.prompt, config.durationSeconds, context)
      : await provider.generate(job.prompt, config.durationSeconds, context);
    if (job.resumeRef && audio.providerRef !== job.resumeRef) throw new ProviderError("provider_task_mismatch", true);
    const media = await (config.validate ?? validateAudio)(audio.bytes, provider.variableDuration ? undefined : config.durationSeconds);
    const sha = createHash("sha256").update(audio.bytes).digest("hex");
    const key = `generated/${job.event_id}/${job.id}/${job.attempt_id}/${sha}.mp3`;
    await config.store!.put(key, audio.bytes, sha);
    await db.transaction(async (tx) => {
      const event = (await tx.query("SELECT * FROM events WHERE id=$1 FOR UPDATE", [job.event_id])).rows[0];
      const live = (await tx.query("SELECT * FROM generation_jobs WHERE id=$1 AND lease_until=$2::timestamptz FOR UPDATE", [job.id, job.leaseFence])).rows[0];
      if (!live || live.state !== "submitting" || live.attempt_id !== job.attempt_id) return;
      const id = randomUUID();
      const source = (await tx.query("SELECT s.title FROM source_tracks s JOIN rounds r ON r.source_id=s.id WHERE r.id=$1", [job.round_id])).rows[0];
      const published = !live.release_held && (event.state === "ended" || live.release_mode === "immediate");
      await tx.query("INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds,published_at,asset_key,asset_sha256,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [id, job.event_id, job.id, `${source.title} \u00b7 Our Jam`, `/api/releases/${id}/audio`, `/api/releases/${id}/download`, media.durationSeconds, published ? new Date() : null, key, sha, JSON.stringify({ provider: provider.name, model: provider.model, promptHash: job.prompt_hash, attemptId: job.attempt_id, providerRef: audio.providerRef, validation: media })]);
      // This column is an integer summary. The release retains measured precision.
      await tx.query("UPDATE generation_jobs SET state=$1,reason=NULL,asset_key=$2,asset_sha256=$3,provider_ref=COALESCE($4,provider_ref),duration_seconds=ceil($5::numeric)::integer,lease_until=NULL,updated_at=now() WHERE id=$6", [published ? "published" : "ready", key, sha, audio.providerRef ?? null, media.durationSeconds, job.id]);
      await logEvent(tx, job.event_id, published ? "releases.published" : "release.ready", { ids: [id] });
    });
  } catch (error) {
    const uncertain = !(error instanceof ProviderError) || error.uncertain;
    const reason = error instanceof ProviderError ? error.reason : "generation_processing_interrupted";
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [job.event_id]);
      const changed = await tx.query("UPDATE generation_jobs SET state=$1,reason=$2,updated_at=now() WHERE id=$3 AND state='submitting' AND attempt_id=$4 AND lease_until=$5::timestamptz RETURNING id", [uncertain ? "unknown" : "failed", reason, job.id, job.attempt_id, job.leaseFence]);
      if (changed.rows.length) await logEvent(tx, job.event_id, "generation.needs_attention");
    });
  }
  return true;
}
