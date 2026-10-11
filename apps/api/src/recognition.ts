import type { Sql } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";
export async function leaderboard(
  db: Sql,
  artistId: string,
  period: "all" | "week" | "month",
  metric: "included" | "support",
  slug?: string,
) {
  const artist = (
    await db.query("SELECT id FROM artists WHERE id=$1", [artistId])
  ).rows[0];
  requireThat(artist, "not_found", "Artist not found.", 404);
  const rows = (
    await db.query(
      `SELECT p.id,p.name,p.anonymous,p.avatar_seed,count(*)::integer included,
 COALESCE(sum((w.value->>'votes')::integer),0)::integer points,
 COALESCE(sum((w.value->>'otherPoints')::integer),0)::integer support
 FROM releases r JOIN generation_jobs j ON j.id=r.job_id JOIN events e ON e.id=r.event_id
 CROSS JOIN LATERAL jsonb_array_elements(j.snapshot->'selected') w
 JOIN participants p ON p.id=(w.value->>'authorId')::uuid
 WHERE e.artist_id=$1 AND r.published_at IS NOT NULL AND NOT r.hidden
 AND ($3::text IS NULL OR e.slug=$3)
 AND r.published_at >= CASE WHEN $2='week' THEN date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN $2='month' THEN date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ELSE '-infinity'::timestamptz END
 GROUP BY p.id ORDER BY ${metric === "support" ? "support DESC,included DESC" : "included DESC,support DESC"},p.id LIMIT 50`,
      [artistId, period, slug ?? null],
    )
  ).rows;
  return {
    period,
    metric,
    timezone: "UTC",
    entries: rows.map((p) => ({
      id: digest(artistId + ":" + p.id),
      name: p.anonymous ? "Anonymous" : p.name,
      avatarSeed: p.avatar_seed,
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
        `SELECT w.value->>'text' text,(w.value->>'votes')::integer points,CASE WHEN p.anonymous THEN 'Anonymous' ELSE p.name END name,p.avatar_seed
 FROM releases r JOIN generation_jobs j ON j.id=r.job_id CROSS JOIN LATERAL jsonb_array_elements(j.snapshot->'selected') WITH ORDINALITY w(value,rank)
 JOIN participants p ON p.id=(w.value->>'authorId')::uuid WHERE r.id=$1 ORDER BY w.rank`,
        [releaseId],
      )
    ).rows,
  };
}
