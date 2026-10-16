import { publicPurchaseLinks } from "../../../packages/contracts/src/purchase-providers.js";
import { z } from "zod";
import type { Database } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { id, httpsUrl } from "../../../packages/contracts/src/index.js";
import { replay, remember } from "./service.js";
const plain = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (s) => !/[<>\p{C}]/u.test(s),
      "Use plain text without markup or control characters.",
    );
export const artistProfileInput = z.object({
  commandId: id,
  expectedRevision: z.number().int().nonnegative(),
  name: plain(100).min(1),
  bio: z
    .string()
    .trim()
    .max(1200)
    .refine(
      (s) => !/[<>\p{C}]/u.test(s.replace(/\r?\n/g, "")),
      "Use plain text without markup or control characters.",
    ),
  links: z.array(z.object({ label: plain(40).min(1), url: httpsUrl })).max(6),
});
export const catalogInput = z.object({
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  limit: z.coerce.number().int().min(1).max(40).default(20),
  state: z.enum(["all", "live", "ended", "waiting"]).default("all"),
});
export async function publicArtist(
  db: Database,
  artistId: string,
  input: z.infer<typeof catalogInput>,
) {
  const artist = (
    await db.query(
      "SELECT id,name,bio,links,profile_revision FROM artists WHERE id=$1",
      [artistId],
    )
  ).rows[0];
  requireThat(artist, "not_found", "Artist not found.", 404);
  const rows = (
    await db.query(
      `SELECT e.id,e.slug,e.title,e.artist_name,e.state,e.purchase_url,e.settings,e.created_at,
    (SELECT count(*)::int FROM releases r WHERE r.event_id=e.id AND r.published_at IS NOT NULL AND NOT r.hidden) releases
    FROM events e WHERE e.artist_id=$1 AND ($2='all' OR e.state=$2) ORDER BY e.created_at DESC,e.id LIMIT $3 OFFSET $4`,
      [artistId, input.state, input.limit + 1, input.offset],
    )
  ).rows;
  return {
    artist,
    events: rows.slice(0, input.limit).map((row: Record<string, any>) => ({ ...row, purchase_links: publicPurchaseLinks(row.settings?.purchaseLinks, row.purchase_url), settings: undefined })),
    nextOffset: rows.length > input.limit ? input.offset + input.limit : null,
    participation:
      "Each show explains whether voting is open remotely or needs the artist’s room code.",
  };
}
export async function editArtist(
  db: Database,
  artistId: string,
  input: z.infer<typeof artistProfileInput>,
) {
  return db.transaction(async (tx) => {
    const row = (
      await tx.query(
        "SELECT profile_revision FROM artists WHERE id=$1 FOR UPDATE",
        [artistId],
      )
    ).rows[0];
    requireThat(row, "not_found", "Artist not found.", 404);
    const saved = await replay(tx, "operator:" + artistId, input.commandId, {
      type: "artist.profile",
      ...input,
    });
    if (saved.response) return saved.response;
    requireThat(
      row.profile_revision === input.expectedRevision,
      "revision_conflict",
      "The artist page changed. Reload before saving.",
      409,
    );
    await tx.query(
      "UPDATE artists SET name=$1,bio=$2,links=$3,profile_revision=profile_revision+1 WHERE id=$4",
      [input.name, input.bio, JSON.stringify(input.links), artistId],
    );
    await tx.query(
      "INSERT INTO audit_log(artist_id,action,subject_id) VALUES($1,'artist.profile',$1)",
      [artistId],
    );
    const result = { revision: input.expectedRevision + 1 };
    await remember(
      tx,
      "operator:" + artistId,
      input.commandId,
      saved.hash,
      result,
    );
    return result;
  });
}
export async function likedTracks(
  db: Database,
  participantId: string,
  input: z.infer<typeof catalogInput>,
) {
  const rows = (
    await db.query(
      `SELECT r.id,r.title,r.duration_seconds,r.published_at,x.updated_at liked_at,e.slug,e.title event_title,e.artist_name,e.artist_id,
    CASE WHEN r.asset_key IS NULL THEN r.download_url ELSE '/api/releases/'||r.id||'/download' END download_url
    FROM reactions x JOIN releases r ON r.id=x.release_id JOIN events e ON e.id=r.event_id
    WHERE x.participant_id=$1 AND x.value=1 AND r.published_at IS NOT NULL AND NOT r.hidden
    ORDER BY x.updated_at DESC,r.id LIMIT $2 OFFSET $3`,
      [participantId, input.limit + 1, input.offset],
    )
  ).rows;
  return {
    tracks: rows.slice(0, input.limit),
    nextOffset: rows.length > input.limit ? input.offset + input.limit : null,
  };
}
