import { randomUUID, createHash } from "node:crypto";
import type { Database } from "./db.js";
import { logEvent } from "./service.js";
import { ProviderError, type MusicProvider } from "../../../packages/providers/src/stability.js";
import type { MediaStore } from "../../../packages/providers/src/storage.js";
import { validateAudio } from "./media.js";
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
export async function generationTick(db: Database, config: GenerationConfig) {
  // An ambiguous acceptance never returns to queued automatically. Persisted Mureka
  // task IDs remain available for a subsequent explicit reconciliation; no second POST.
  await db.query("UPDATE generation_jobs SET state='unknown',reason='worker_interrupted',updated_at=now() WHERE state='submitting' AND lease_until<clock_timestamp()");
  const job = await db.transaction(async (tx) => {
    await tx.query("SELECT id FROM artists WHERE id='our-jam' FOR UPDATE");
    const candidate = (await tx.query("SELECT j.id,j.event_id FROM generation_jobs j JOIN events e ON e.id=j.event_id WHERE j.state='queued' AND e.artist_id='our-jam' ORDER BY j.created_at LIMIT 1")).rows[0];
    if (!candidate) return null;
    await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [candidate.event_id]);
    const row = (await tx.query("SELECT j.*,COALESCE(r.settings->>'generationProvider','stability') requested_provider FROM generation_jobs j JOIN rounds r ON r.id=j.round_id WHERE j.id=$1 AND j.state='queued' FOR UPDATE OF j", [candidate.id])).rows[0];
    if (!row) return null;
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
    if (!reason) {
      const costs = (await tx.query("SELECT COALESCE(sum(j.reserved_cents),0)::integer total,COALESCE(sum(j.reserved_cents) FILTER(WHERE j.event_id=$1),0)::integer event FROM generation_jobs j JOIN events e ON e.id=j.event_id WHERE e.artist_id='our-jam'", [row.event_id])).rows[0];
      if (costs.total + cost > config.totalBudgetCents || costs.event + cost > config.eventBudgetCents) reason = "approved_budget_exhausted";
    }
    if (reason) {
      await tx.query("UPDATE generation_jobs SET state='blocked',reason=$1,updated_at=now() WHERE id=$2", [reason, row.id]);
      await logEvent(tx, row.event_id, "generation.blocked");
      return null;
    }
    // Parameter failures must not reserve budget or contact a provider.
    if (provider!.name === "mureka" && row.prompt.length > 1024) {
      await tx.query("UPDATE generation_jobs SET state='blocked',reason='provider_prompt_too_long',updated_at=now() WHERE id=$1", [row.id]);
      await logEvent(tx, row.event_id, "generation.blocked");
      return null;
    }
    const attempt = randomUUID();
    await tx.query("UPDATE generation_jobs SET state='submitting',attempt_id=$1,attempts=attempts+1,lease_until=now()+interval '8 minutes',reserved_cents=$2,provider=$3,model=$4,duration_seconds=$5,updated_at=now() WHERE id=$6", [attempt, cost, provider!.name, provider!.model, provider!.variableDuration ? null : config.durationSeconds, row.id]);
    await logEvent(tx, row.event_id, "generation.started");
    return { ...row, attempt_id: attempt, selectedProvider: provider! };
  });
  if (!job) return false;
  const provider = job.selectedProvider as MusicProvider;
  try {
    const audio = await provider.generate(job.prompt, config.durationSeconds, {
      onAccepted: async (reference) => {
        await db.query("UPDATE generation_jobs SET provider_ref=$1,updated_at=now() WHERE id=$2 AND attempt_id=$3 AND state='submitting'", [reference, job.id, job.attempt_id]);
      },
    });
    const media = await (config.validate ?? validateAudio)(audio.bytes, provider.variableDuration ? undefined : config.durationSeconds);
    const sha = createHash("sha256").update(audio.bytes).digest("hex");
    const key = `generated/${job.event_id}/${job.id}/${job.attempt_id}.mp3`;
    await config.store!.put(key, audio.bytes, sha);
    await db.transaction(async (tx) => {
      const event = (await tx.query("SELECT * FROM events WHERE id=$1 FOR UPDATE", [job.event_id])).rows[0];
      const live = (await tx.query("SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE", [job.id])).rows[0];
      if (live.state !== "submitting" || live.attempt_id !== job.attempt_id) return;
      const id = randomUUID();
      const source = (await tx.query("SELECT s.title FROM source_tracks s JOIN rounds r ON r.source_id=s.id WHERE r.id=$1", [job.round_id])).rows[0];
      const published = !live.release_held && (event.state === "ended" || live.release_mode === "immediate");
      await tx.query("INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds,published_at,asset_key,asset_sha256,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [id, job.event_id, job.id, `${source.title} \u00b7 Our Jam`, `/api/releases/${id}/audio`, `/api/releases/${id}/download`, media.durationSeconds, published ? new Date() : null, key, sha, JSON.stringify({ provider: provider.name, model: provider.model, promptHash: job.prompt_hash, attemptId: job.attempt_id, providerRef: audio.providerRef, validation: media })]);
      await tx.query("UPDATE generation_jobs SET state=$1,reason=NULL,asset_key=$2,asset_sha256=$3,provider_ref=COALESCE($4,provider_ref),duration_seconds=$5,lease_until=NULL,updated_at=now() WHERE id=$6", [published ? "published" : "ready", key, sha, audio.providerRef ?? null, media.durationSeconds, job.id]);
      await logEvent(tx, job.event_id, published ? "releases.published" : "release.ready", { ids: [id] });
    });
  } catch (error) {
    const uncertain = !(error instanceof ProviderError) || error.uncertain;
    const reason = error instanceof ProviderError ? error.reason : "generation_processing_interrupted";
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [job.event_id]);
      await tx.query("UPDATE generation_jobs SET state=$1,reason=$2,updated_at=now() WHERE id=$3 AND state='submitting' AND attempt_id=$4", [uncertain ? "unknown" : "failed", reason, job.id, job.attempt_id]);
      await logEvent(tx, job.event_id, "generation.needs_attention");
    });
  }
  return true;
}
