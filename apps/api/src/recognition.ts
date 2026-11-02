import type { Sql } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";
export async function leaderboard(
  db: Sql,
  artistId: string,
  period: "all" | "week" | "month",
  metric: "included" | "support",
  slug?: string,
  at?: Date,
) {
  requireThat(
    at === undefined || Number.isFinite(at.getTime()),
    "invalid_clock",
    "Invalid recognition clock.",
  );
  const artist = (
    await db.query(
      "SELECT id,leaderboard_timezone,leaderboard_visible FROM artists WHERE id=$1",
      [artistId],
    )
  ).rows[0];
  requireThat(artist, "not_found", "Artist not found.", 404);
  if (!artist.leaderboard_visible)
    return {
      period,
      metric,
      timezone: artist.leaderboard_timezone,
      visible: false,
      entries: [],
    };
  const rows = (
    await db.query(
      `SELECT p.id,p.name,p.anonymous,p.avatar_seed,p.avatar_sha,count(*)::integer included,
 COALESCE(sum((w.value->>'votes')::integer),0)::integer points,
 COALESCE(sum((w.value->>'otherPoints')::integer),0)::integer support
 FROM releases r JOIN generation_jobs j ON j.id=r.job_id JOIN events e ON e.id=r.event_id
 CROSS JOIN LATERAL jsonb_array_elements(j.snapshot->'selected') w
 JOIN participants p ON p.id=(w.value->>'authorId')::uuid
 WHERE e.artist_id=$1 AND r.published_at IS NOT NULL AND NOT r.hidden
 AND ($3::text IS NULL OR e.slug=$3)
 AND r.published_at >= CASE WHEN $2='week' THEN date_trunc('week',COALESCE($5::timestamptz,now()) AT TIME ZONE $4) AT TIME ZONE $4 WHEN $2='month' THEN date_trunc('month',COALESCE($5::timestamptz,now()) AT TIME ZONE $4) AT TIME ZONE $4 ELSE '-infinity'::timestamptz END
 AND r.published_at <= COALESCE($5::timestamptz,now())
 GROUP BY p.id ORDER BY ${metric === "support" ? "support DESC,included DESC" : "included DESC,support DESC"},p.id LIMIT 50`,
      [
        artistId,
        period,
        slug ?? null,
        artist.leaderboard_timezone,
        at?.toISOString() ?? null,
      ],
    )
  ).rows;
  return {
    period,
    metric,
    timezone: artist.leaderboard_timezone,
    visible: true,
    entries: rows.map((p) => ({
      id: digest(artistId + ":" + p.id),
      name: p.anonymous ? "Anonymous" : p.name,
      avatarSeed: p.anonymous ? "anonymous" : p.avatar_seed,
      avatarUrl:
        !p.anonymous && p.avatar_sha ? "/api/avatars/" + p.avatar_sha : null,
      included: p.included,
      points: p.points,
      support: p.support,
    })),
  };
}
export async function releaseCredits(db: Sql, releaseId: string) {
  const release = (
    await db.query(
      "SELECT id FROM releases WHERE id=$1 AND published_at IS NOT NULL AND NOT hidden",
      [releaseId],
    )
  ).rows[0];
  requireThat(release, "not_found", "Track not found.", 404);
  return {
    credits: (
      await db.query(
        `SELECT w.value->>'text' text,(w.value->>'votes')::integer points,CASE WHEN p.anonymous THEN 'Anonymous' ELSE p.name END name,CASE WHEN p.anonymous THEN 'anonymous' ELSE p.avatar_seed END avatar_seed,CASE WHEN NOT p.anonymous AND p.avatar_sha IS NOT NULL THEN '/api/avatars/' || p.avatar_sha ELSE NULL END avatar_url
 FROM releases r JOIN generation_jobs j ON j.id=r.job_id CROSS JOIN LATERAL jsonb_array_elements(j.snapshot->'selected') WITH ORDINALITY w(value,rank)
 JOIN participants p ON p.id=(w.value->>'authorId')::uuid WHERE r.id=$1 ORDER BY w.rank`,
        [releaseId],
      )
    ).rows,
  };
}
