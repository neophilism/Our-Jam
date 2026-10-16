import type { Sql } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
export type Tier = "platform" | "ad_free" | "own_sponsors";
export const tiers: Tier[] = ["platform", "ad_free", "own_sponsors"];
export async function setlist(db: Sql, eventId: string) {
  const tracks = (
    await db.query(
      "SELECT id,duration_seconds,duration_verified FROM source_tracks WHERE event_id=$1 ORDER BY ordinal",
      [eventId],
    )
  ).rows;
  return {
    seconds: tracks.reduce((n, t) => n + Number(t.duration_seconds), 0),
    verified: tracks.length > 0 && tracks.every((t) => t.duration_verified),
  };
}
export async function eventAccess(db: Sql, eventId: string, tier?: Tier) {
  const catalog = await setlist(db, eventId);
  const policy = (
    await db.query("SELECT * FROM event_commerce WHERE event_id=$1", [eventId])
  ).rows[0];
  const selected: Tier = tier ?? policy?.tier ?? "platform";
  const purchases = (
    await db.query(
      "SELECT tier,setlist_seconds,amount_cents,required_paid_cents,currency FROM event_purchases WHERE event_id=$1 AND state='paid'",
      [eventId],
    )
  ).rows;
  return {
    ...catalog,
    tier: selected,
    policy,
    paid:
      catalog.verified &&
      purchases.some(
        (p) =>
          tiers.indexOf(p.tier) >= tiers.indexOf(selected) &&
          p.setlist_seconds >= catalog.seconds &&
          purchases
            .filter((x) => x.currency === p.currency)
            .reduce((n, x) => n + Number(x.amount_cents), 0) >=
            Number(p.required_paid_cents),
      ),
    purchases,
  };
}
export async function requireEventAccess(db: Sql, eventId: string) {
  const access = await eventAccess(db, eventId);
  requireThat(
    access.verified,
    "setlist_unverified",
    "Upload every setlist track so its duration can be verified before purchasing or starting this event.",
    409,
  );
  requireThat(
    access.paid,
    "event_payment_required",
    "Pay for this event's setlist length and selected plan before starting the show.",
    402,
  );
  return access;
}
export async function freezeSponsorPlan(
  db: Sql,
  eventId: string,
  trackSeconds: number,
) {
  const access = await requireEventAccess(db, eventId);
  if (access.tier === "ad_free") return { durationSeconds: 0, clips: [] };
  const config = (
    await db.query("SELECT * FROM commerce_settings WHERE singleton=true")
  ).rows[0];
  const ids: string[] =
    access.tier === "own_sponsors"
      ? (access.policy?.own_video_ids ?? [])
      : config.platform_video_ids;
  const candidates = (
    await db.query(
      "SELECT id,sponsor_name,owner_artist_id FROM sponsor_videos WHERE id=ANY($1::uuid[]) AND active=true",
      [ids],
    )
  ).rows;
  const artist = (
    await db.query("SELECT artist_id FROM events WHERE id=$1", [eventId])
  ).rows[0].artist_id;
  const clips = ids.flatMap((id) => {
    const video = candidates.find(
      (v) =>
        v.id === id &&
        (access.tier === "own_sponsors"
          ? v.owner_artist_id === artist
          : v.owner_artist_id === null),
    );
    return video
      ? [
          {
            id: video.id,
            sponsorName: video.sponsor_name,
            slotSeconds: Number(config.slot_seconds),
          },
        ]
      : [];
  });
  // Leave at least one second of the actual song for participation.
  return {
    durationSeconds: Math.min(
      Number(config.break_seconds),
      Math.max(0, trackSeconds - 1),
    ),
    clips,
  };
}
export function sponsorElapsed(round: any, now = Date.now()) {
  const effective =
    round.state === "paused" ? new Date(round.paused_at).getTime() : now;
  return Math.max(
    0,
    effective -
      new Date(round.opened_at).getTime() -
      Number(round.paused_ms ?? 0),
  );
}
export function requireParticipationStarted(round: any) {
  requireThat(
    sponsorElapsed(
      round,
      new Date(round.server_time ?? Date.now()).getTime(),
    ) >=
      Number(round.settings?.sponsorBreak?.durationSeconds ?? 0) * 1000,
    "sponsor_break",
    "Our Jam participation opens when the sponsor countdown finishes.",
    409,
  );
}
