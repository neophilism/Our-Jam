import type { Sql } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";

export type PlaybackCommand = {
  leaseToken: string;
  epoch: number;
  sequence: number;
};

// Call only after taking the event lock. Epochs fence an expired controller.
export async function verifyLease(
  tx: Sql,
  eventId: string,
  command: PlaybackCommand,
  consume = true,
) {
  const lease = (
    await tx.query(
      "SELECT *,clock_timestamp() server_time FROM playback_leases WHERE event_id=$1 FOR UPDATE",
      [eventId],
    )
  ).rows[0];
  requireThat(
    lease &&
      lease.holder_hash === digest(command.leaseToken) &&
      lease.epoch === command.epoch &&
      new Date(lease.expires_at) > new Date(lease.server_time),
    "playback_lease_lost",
    "This device no longer owns show playback. Claim it again before controlling the show.",
    409,
  );
  if (consume) {
    requireThat(
      command.sequence === lease.last_sequence + 1,
      "playback_sequence",
      "A playback command arrived out of order. Claim playback again to resynchronize.",
      409,
    );
    await tx.query(
      "UPDATE playback_leases SET last_sequence=$1,updated_at=now() WHERE event_id=$2",
      [command.sequence, eventId],
    );
  }
  return lease;
}
