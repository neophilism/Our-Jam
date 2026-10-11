import { randomBytes } from "node:crypto";
import type { Database, Sql } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";
import { closeRound, logEvent, ownedEvent } from "./service.js";
import { verifyLease, type PlaybackCommand } from "./lease.js";
import { replay, remember } from "./service.js";
export async function claimPlayback(
  db: Database,
  artistId: string,
  eventId: string,
  existingToken?: string,
) {
  return db.transaction(async (tx) => {
    await ownedEvent(tx, eventId, artistId, true);
    const lease = (
      await tx.query(
        "SELECT *,clock_timestamp() server_time FROM playback_leases WHERE event_id=$1 FOR UPDATE",
        [eventId],
      )
    ).rows[0];
    const same =
      lease &&
      existingToken &&
      lease.holder_hash === digest(existingToken) &&
      new Date(lease.expires_at) > new Date(lease.server_time);
    requireThat(
      !lease ||
        new Date(lease.expires_at) <= new Date(lease.server_time) ||
        same,
      "playback_in_use",
      "Another device is controlling this show. Release it there or wait for its lease to expire.",
      409,
    );
    const token = same ? existingToken! : randomBytes(32).toString("hex");
    const epoch = same ? lease.epoch : (lease?.epoch ?? 0) + 1;
    const sequence = same ? lease.last_sequence : 0;
    await tx.query(
      "INSERT INTO playback_leases(event_id,holder_hash,epoch,last_sequence,expires_at) VALUES($1,$2,$3,$4,now()+interval '25 seconds') ON CONFLICT(event_id) DO UPDATE SET holder_hash=EXCLUDED.holder_hash,epoch=EXCLUDED.epoch,last_sequence=EXCLUDED.last_sequence,expires_at=EXCLUDED.expires_at,updated_at=now()",
      [eventId, digest(token), epoch, sequence],
    );
    return { leaseToken: token, epoch, sequence };
  });
}
export async function heartbeat(
  db: Database,
  artistId: string,
  eventId: string,
  command: PlaybackCommand,
) {
  return db.transaction(async (tx) => {
    await ownedEvent(tx, eventId, artistId, true);
    await verifyLease(tx, eventId, command, false);
    await tx.query(
      "UPDATE playback_leases SET expires_at=now()+interval '25 seconds',updated_at=now() WHERE event_id=$1",
      [eventId],
    );
    return { ok: true };
  });
}
export async function pausePlayback(
  db: Database,
  artistId: string,
  eventId: string,
  command: PlaybackCommand,
  pause: boolean,
  commandId: string,
) {
  return db.transaction(async (tx) => {
    await ownedEvent(tx, eventId, artistId, true);
    const cache = await replay(tx, "operator:" + artistId, commandId, {
      type: "pause",
      eventId,
      command,
      pause,
    });
    if (cache.response) return cache.response;
    await verifyLease(tx, eventId, command);
    const round = (
      await tx.query(
        "SELECT *,clock_timestamp() server_time FROM rounds WHERE event_id=$1 AND state IN ('open','paused') FOR UPDATE",
        [eventId],
      )
    ).rows[0];
    if (round) {
      if (pause && round.state === "open") {
        const remaining = Math.max(
          0,
          new Date(round.deadline_at).getTime() -
            new Date(round.server_time).getTime(),
        );
        await tx.query(
          "UPDATE rounds SET state='paused',paused_at=now(),remaining_ms=$1,pause_reason='performer' WHERE id=$2",
          [remaining, round.id],
        );
      } else if (!pause && round.state === "paused") {
        const delta = Math.max(
          0,
          new Date(round.server_time).getTime() -
            new Date(round.paused_at).getTime(),
        );
        await tx.query(
          "UPDATE rounds SET state='open',deadline_at=$1,paused_ms=paused_ms+$2,paused_at=NULL,remaining_ms=NULL,pause_reason=NULL WHERE id=$3",
          [
            new Date(
              new Date(round.server_time).getTime() + round.remaining_ms,
            ),
            delta,
            round.id,
          ],
        );
      }
      await logEvent(
        tx,
        eventId,
        pause ? "playback.paused" : "playback.resumed",
      );
    }
    const result = { ok: true, sequence: command.sequence };
    await remember(tx, "operator:" + artistId, commandId, cache.hash, result);
    return result;
  });
}
export async function tickRounds(db: Database, providerReady = false) {
  const candidates = (
    await db.query(
      "SELECT DISTINCT event_id FROM rounds WHERE state='open' LIMIT 100",
    )
  ).rows;
  for (const candidate of candidates)
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [
        candidate.event_id,
      ]);
      const r = (
        await tx.query(
          "SELECT *,clock_timestamp() server_time FROM rounds WHERE event_id=$1 AND state='open' FOR UPDATE",
          [candidate.event_id],
        )
      ).rows[0];
      if (!r) return;
      const lease = (
        await tx.query("SELECT * FROM playback_leases WHERE event_id=$1", [
          candidate.event_id,
        ])
      ).rows[0];
      const now = new Date(r.server_time).getTime(),
        deadline = new Date(r.deadline_at).getTime();
      if (
        !lease ||
        new Date(lease.expires_at).getTime() < Math.min(now, deadline)
      ) {
        const cutoff = lease ? new Date(lease.expires_at).getTime() : now;
        await tx.query(
          "UPDATE rounds SET state='paused',paused_at=$1,remaining_ms=$2,pause_reason='playback_disconnected' WHERE id=$3",
          [new Date(cutoff), Math.max(0, deadline - cutoff), r.id],
        );
        await logEvent(tx, r.event_id, "playback.disconnected");
      } else if (deadline <= now) await closeRound(tx, r, providerReady);
    });
}
