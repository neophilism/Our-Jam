import {
  readPlatformVotePolicy,
  resolveVoteLimit,
  effectiveVoteLimit,
} from "./vote-policy.js";
import { z } from "zod";
import { VOTE_BUDGET } from "../../../packages/domain/src/index.js";
import {
  purchaseLinksInput,
  publicPurchaseLinks,
  preferredPurchaseUrl,
  purchaseModeInput,
} from "../../../packages/contracts/src/purchase-providers.js";
import type { Database } from "./db.js";
import { ownedEvent, replay, remember, logEvent } from "./service.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import {
  eventInput,
  sourceInput,
  httpsUrl,
  id,
} from "../../../packages/contracts/src/index.js";

const revision = z.number().int().nonnegative();
export const reorderInput = z.object({
  commandId: id,
  expectedRevision: revision,
  queueIds: z.array(id).max(500),
});
export const settingsInput = eventInput
  .omit({
    slug: true,
    sources: true,
    admissionMode: true,
    participantLimit: true,
  })
  .extend({
    commandId: id,
    expectedRevision: revision,
    purchaseUrl: httpsUrl.nullable().optional(),
    purchaseLinks: purchaseLinksInput.optional(),
    purchaseMode: purchaseModeInput.optional(),
    preferredPurchaseProvider: z.string().max(40).nullable().optional(),
  });
export const sourceEditInput = sourceInput.extend({
  // Omission preserves uploaded/private audio; explicit null clears the link.
  audioUrl: httpsUrl.nullable().optional(),
  commandId: id,
  expectedRevision: revision,
});

export async function reorderQueue(
  db: Database,
  artistId: string,
  eventId: string,
  input: z.infer<typeof reorderInput>,
) {
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, artistId, true);
    const cache = await replay(tx, "operator:" + artistId, input.commandId, {
      type: "queue.reorder",
      eventId,
      ...input,
    });
    if (cache.response) return cache.response;
    requireThat(
      event.revision === input.expectedRevision,
      "revision_conflict",
      "The queue changed. Refresh before moving tracks.",
      409,
    );
    const queued = (
      await tx.query(
        "SELECT id FROM queue_items WHERE event_id=$1 AND state='queued'",
        [eventId],
      )
    ).rows;
    const ids = new Set(input.queueIds);
    requireThat(
      ids.size === input.queueIds.length &&
        queued.length === ids.size &&
        queued.every((q) => ids.has(q.id)),
      "invalid_queue",
      "Move the current queued tracks without adding, removing or duplicating entries.",
      409,
    );
    await tx.query(
      "UPDATE queue_items q SET position=ordered.position::integer FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id,position) WHERE q.id=ordered.id AND q.event_id=$2 AND q.state='queued'",
      [input.queueIds, eventId],
    );
    await logEvent(tx, eventId, "queue.changed");
    const result = { ok: true };
    await remember(
      tx,
      "operator:" + artistId,
      input.commandId,
      cache.hash,
      result,
    );
    return result;
  });
}
export async function updateSettings(
  db: Database,
  artistId: string,
  eventId: string,
  input: z.infer<typeof settingsInput>,
) {
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, artistId, true);
    const cache = await replay(tx, "operator:" + artistId, input.commandId, {
      type: "setup.settings",
      eventId,
      ...input,
    });
    if (cache.response) return cache.response;
    requireThat(
      event.revision === input.expectedRevision,
      "revision_conflict",
      "The show changed. Refresh before saving settings.",
      409,
    );
    const platform = await readPlatformVotePolicy(tx, true);
    const requestedVoteMode =
      input.voteMode ?? event.settings.voteMode ?? "weighted";
    requireThat(
      !(
        event.settings.voteMode === "single" && requestedVoteMode === "weighted"
      ),
      "legacy_vote_mode_locked",
      "This show uses one vote per Sound Wave and cannot switch back to the older voting mode.",
    );
    const voteLimit =
      requestedVoteMode === "single"
        ? platform.mode === "fixed"
          ? platform.fixedVotes
          : input.votesPerListener === undefined
            ? effectiveVoteLimit(platform, event.settings.votesPerListener)
            : resolveVoteLimit(platform, input.votesPerListener)
        : VOTE_BUDGET;
    const settings = {
      ...event.settings,
      screenLimit: input.screenLimit,
      minimumRoundSeconds: input.minimumRoundSeconds,
      maxWaves: input.maxWaves,
      maxGenerations: input.maxGenerations,
      voteMode: requestedVoteMode,
      votesPerListener: voteLimit,

      releaseMode: input.releaseMode,
      purchaseLinks:
        input.purchaseLinks ??
        publicPurchaseLinks(event.settings.purchaseLinks, event.purchase_url),
      purchaseMode: input.purchaseMode ?? event.settings.purchaseMode ?? "menu",
      preferredPurchaseProvider:
        input.preferredPurchaseProvider === undefined
          ? (event.settings.preferredPurchaseProvider ?? null)
          : input.preferredPurchaseProvider,
    };
    requireThat(
      settings.voteMode !== "weighted" ||
        settings.votesPerListener === VOTE_BUDGET,
      "invalid_vote_policy",
      "Legacy weighted voting keeps its original limit. Select one vote per Sound Wave to allow more choices.",
    );
    requireThat(
      settings.purchaseMode !== "direct" ||
        Boolean(
          preferredPurchaseUrl(
            settings.purchaseLinks,
            settings.purchaseMode,
            settings.preferredPurchaseProvider,
          ),
        ),
      "invalid_purchase_destination",
      "Choose a listed provider for direct purchase.",
      400,
    );
    await tx.query(
      "UPDATE events SET title=$1,artist_name=$2,purchase_url=$3,settings=$4 WHERE id=$5",
      [
        input.title,
        input.artistName,
        input.purchaseUrl ?? null,
        JSON.stringify(settings),
        eventId,
      ],
    );
    await tx.query(
      "INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2::uuid,'setup.settings',$2::text)",
      [artistId, eventId],
    );
    await logEvent(tx, eventId, "setup.changed");
    const result = { ok: true };
    await remember(
      tx,
      "operator:" + artistId,
      input.commandId,
      cache.hash,
      result,
    );
    return result;
  });
}
export async function sources(db: Database, artistId: string, eventId: string) {
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, artistId, true);
    return {
      revision: event.revision,
      sources: (
        await tx.query(
          "SELECT s.*,EXISTS(SELECT 1 FROM rounds r WHERE r.source_id=s.id) played FROM source_tracks s WHERE s.event_id=$1 ORDER BY ordinal",
          [eventId],
        )
      ).rows,
    };
  });
}
export async function updateSource(
  db: Database,
  artistId: string,
  sourceId: string,
  input: z.infer<typeof sourceEditInput>,
) {
  return db.transaction(async (tx) => {
    const source = (
      await tx.query(
        "SELECT event_id,audio_url FROM source_tracks WHERE id=$1",
        [sourceId],
      )
    ).rows[0];
    requireThat(source, "not_found", "Album track not found.", 404);
    const event = await ownedEvent(tx, source.event_id, artistId, true);
    const cache = await replay(tx, "operator:" + artistId, input.commandId, {
      type: "setup.source",
      sourceId,
      ...input,
    });
    if (cache.response) return cache.response;
    requireThat(
      event.revision === input.expectedRevision,
      "revision_conflict",
      "The show changed. Refresh before saving this track.",
      409,
    );
    requireThat(
      !(
        await tx.query("SELECT id FROM rounds WHERE source_id=$1 LIMIT 1", [
          sourceId,
        ])
      ).rows.length,
      "source_locked",
      "This track has already opened a round. Its source and signature prompt are fixed.",
      409,
    );
    await tx.query(
      "UPDATE source_tracks SET duration_verified=CASE WHEN audio_url IS NOT DISTINCT FROM $3::text AND duration_seconds=$4 THEN duration_verified ELSE false END,title=$1,core_prompt=$2,audio_url=$3,duration_seconds=$4 WHERE id=$5",
      [
        input.title,
        input.corePrompt,
        input.audioUrl === undefined ? source.audio_url : input.audioUrl,
        input.durationSeconds,
        sourceId,
      ],
    );
    await tx.query(
      "INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2,'setup.source',$3)",
      [artistId, event.id, sourceId],
    );
    await logEvent(tx, event.id, "setup.changed");
    const result = { ok: true };
    await remember(
      tx,
      "operator:" + artistId,
      input.commandId,
      cache.hash,
      result,
    );
    return result;
  });
}
