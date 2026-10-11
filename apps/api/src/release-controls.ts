import { z } from "zod";
import type { Database } from "./db.js";
import { ownedEvent, replay, remember, logEvent } from "./service.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { id } from "../../../packages/contracts/src/index.js";

export const releaseControlInput = z.object({
  commandId: id,
  action: z.enum(["hold", "allow", "publish", "cancel"]),
});

export async function controlRelease(
  db: Database,
  artistId: string,
  jobId: string,
  input: z.infer<typeof releaseControlInput>,
) {
  return db.transaction(async (tx) => {
    const parent = (
      await tx.query("SELECT event_id FROM generation_jobs WHERE id=$1", [
        jobId,
      ])
    ).rows[0];
    requireThat(parent, "not_found", "Generation not found.", 404);
    const event = await ownedEvent(tx, parent.event_id, artistId, true);
    const cache = await replay(tx, "operator:" + artistId, input.commandId, {
      type: "release.control",
      jobId,
      ...input,
    });
    if (cache.response) return cache.response;
    const job = (
      await tx.query("SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE", [
        jobId,
      ])
    ).rows[0];
    const release = (
      await tx.query("SELECT * FROM releases WHERE job_id=$1 FOR UPDATE", [
        jobId,
      ])
    ).rows[0];
    requireThat(
      !release?.published_at && job.state !== "published",
      "already_published",
      "This track is already public. Use moderation to hide it.",
      409,
    );
    requireThat(
      job.state !== "cancelled",
      "job_cancelled",
      "This generation was cancelled.",
      409,
    );
    if (input.action === "cancel") {
      requireThat(
        ["queued", "blocked"].includes(job.state) &&
          job.attempts === 0 &&
          job.reserved_cents === 0 &&
          !release,
        "dispatch_started",
        "Only work that has never been dispatched can be cancelled. An in-flight or uncertain request cannot be recalled.",
        409,
      );
      await tx.query(
        "UPDATE generation_jobs SET state='cancelled',reason='artist_cancelled',updated_at=now() WHERE id=$1",
        [jobId],
      );
    } else {
      if (input.action === "publish")
        requireThat(
          release && job.state === "ready" && !release.hidden,
          "release_not_ready",
          "Only a ready, visible track can be published. Restore hidden music separately before approving it.",
          409,
        );
      await tx.query(
        "UPDATE generation_jobs SET release_held=$1,updated_at=now() WHERE id=$2",
        [input.action === "hold", jobId],
      );
      // Removing a hold restores automatic boundary behavior. An explicit approval
      // publishes now, even if the original round selected artist review.
      const publish =
        release &&
        !release.hidden &&
        job.state === "ready" &&
        input.action !== "hold" &&
        (input.action === "publish" ||
          event.state === "ended" ||
          job.release_mode === "immediate");
      if (publish) {
        await tx.query("UPDATE releases SET published_at=now() WHERE id=$1", [
          release.id,
        ]);
        await tx.query(
          "UPDATE generation_jobs SET state='published',updated_at=now() WHERE id=$1",
          [jobId],
        );
        await logEvent(tx, event.id, "releases.published", {
          ids: [release.id],
        });
      }
    }
    await tx.query(
      "INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2,$3,$4)",
      [artistId, event.id, "generation." + input.action, jobId],
    );
    await logEvent(tx, event.id, "generation.controlled");
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
