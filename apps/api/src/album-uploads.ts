import { createHash } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database, Sql } from "./db.js";
import type { MediaStore } from "../../../packages/providers/src/storage.js";
import { digest, DomainError, requireThat } from "../../../packages/domain/src/index.js";
import { id } from "../../../packages/contracts/src/index.js";
import { ownedEvent, replay, remember, logEvent } from "./service.js";
import { prepareAlbumAudio, MAX_ALBUM_UPLOAD_BYTES } from "./album-media.js";
const requestInput = z.object({ commandId: id, expectedRevision: z.number().int().nonnegative() });
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const audioRoute = (origin: string, sourceId: string, sha: string) => `${origin}/api/operator/sources/${sourceId}/audio/${sha}`;
async function sourceFor(db: Sql, artistId: string, sourceId: string, lock = false) {
  const source = (await db.query("SELECT * FROM source_tracks WHERE id=$1", [sourceId])).rows[0];
  requireThat(source, "not_found", "Album track not found.", 404);
  const event = await ownedEvent(db, source.event_id, artistId, lock);
  return { source, event };
}
async function unlocked(db: Sql, sourceId: string) {
  requireThat(!(await db.query("SELECT id FROM rounds WHERE source_id=$1 LIMIT 1", [sourceId])).rows.length, "source_locked", "This song has already opened a round. Create a new session to replace its audio.", 409);
}
export async function ingestAlbumAudio(db: Database, artistId: string, sourceId: string, input: z.infer<typeof requestInput>, bytes: Uint8Array, origin: string, store: MediaStore, prepare = prepareAlbumAudio) {
  requireThat(bytes.length >= 128 && bytes.length <= MAX_ALBUM_UPLOAD_BYTES, "invalid_album_audio", "Choose a supported file no larger than 128 MiB.");
  const requestSha = createHash("sha256").update(bytes).digest("hex");
  const payload = { type: "album.upload", sourceId, ...input, requestSha };
  const preliminary = await db.transaction(async (tx) => {
    const { event } = await sourceFor(tx, artistId, sourceId, true);
    const cache = await replay(tx, "operator:" + artistId, input.commandId, payload);
    if (cache.response) return cache.response;
    requireThat(event.revision === input.expectedRevision, "revision_conflict", "The show changed. Refresh before uploading this song.", 409);
    await unlocked(tx, sourceId);
    return null;
  });
  if (preliminary) return preliminary;
  let media;
  try { media = await prepare(bytes); }
  catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("invalid_album_audio", "The file could not be completely decoded and validated. Choose another MP3 or WAV.", 400);
  }
  const sha = createHash("sha256").update(media.bytes).digest("hex");
  // Playback uses a stable authenticated route, never an expiring URL in the catalog.
  return db.transaction(async (tx) => {
    const { event } = await sourceFor(tx, artistId, sourceId, true);
    const cache = await replay(tx, "operator:" + artistId, input.commandId, payload);
    if (cache.response) return cache.response;
    requireThat(event.revision === input.expectedRevision, "revision_conflict", "The show changed while decoding. Refresh and upload again; the active song was not replaced.", 409);
    await unlocked(tx, sourceId);
    const key = `albums/${event.id}/${sourceId}/${sha}.mp3`;
    await store.put(key, media.bytes, sha);
    const audioUrl = audioRoute(origin, sourceId, sha);
    await tx.query("UPDATE source_tracks SET audio_url=$1,duration_seconds=$2 WHERE id=$3", [audioUrl, Math.ceil(media.durationSeconds), sourceId]);
    await tx.query("INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2,'album.upload',$3)", [artistId, event.id, sourceId]);
    await logEvent(tx, event.id, "setup.changed");
    const response = { ok: true, audioUrl, durationSeconds: media.durationSeconds, sha256: sha, bytes: media.bytes.length, format: "audio/mpeg" };
    await remember(tx, "operator:" + artistId, input.commandId, cache.hash, response);
    return response;
  });
}
export async function uploadedAlbumUrl(db: Database, artistId: string, sourceId: string, sha: string, origin: string, store: MediaStore) {
  const { source, event } = await sourceFor(db, artistId, sourceId);
  requireThat(source.audio_url === audioRoute(origin, sourceId, sha), "not_found", "This is not the active audio file for this track.", 404);
  return store.url(`albums/${event.id}/${sourceId}/${sha}.mp3`, false);
}
export async function registerAlbumUploads(app: FastifyInstance, db: Database, origin: string, store?: MediaStore) {
  const uploadOwners = new WeakMap<object, string>();
  const active = new Set<object>();
  async function artist(req: FastifyRequest): Promise<string> {
    const token = req.cookies.oj_operator;
    requireThat(typeof token === "string" && /^[a-f0-9]{64}$/.test(token), "sign_in_required", "Sign in to upload or play private album audio.", 401);
    const session = (await db.query("SELECT artist_id FROM sessions WHERE token_hash=$1 AND kind='operator' AND expires_at>now()", [digest(token)])).rows[0];
    requireThat(session?.artist_id, "sign_in_required", "Sign in to upload or play private album audio.", 401);
    return session.artist_id;
  }
  app.get("/api/operator/album-upload-capabilities", async (req) => {
    await artist(req);
    return { available: Boolean(store), maxBytes: MAX_ALBUM_UPLOAD_BYTES, formats: ["mp3", "wav"], maxDurationSeconds: 600, outputFormat: "mp3", originalPreserved: false };
  });
  app.get("/api/operator/sources/:id/audio/:sha", async (req, reply) => {
    const owner = await artist(req);
    requireThat(store, "storage_not_configured", "Private album storage is not configured.", 503);
    const params = z.object({ id, sha: checksum }).parse(req.params);
    const url = await uploadedAlbumUrl(db, owner, params.id, params.sha, origin, store!);
    return reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer").redirect(url);
  });
  await app.register(async (scope) => {
    scope.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    scope.post("/api/operator/sources/:id/upload", {
      bodyLimit: MAX_ALBUM_UPLOAD_BYTES,
      onRequest: async (req) => {
        const owner = await artist(req);
        requireThat(store, "storage_not_configured", "Private album storage is not configured. Your song has not been uploaded.", 503);
        const sourceId = id.parse((req.params as any).id);
        await sourceFor(db, owner, sourceId);
        await unlocked(db, sourceId);
        requireThat(req.headers["content-type"]?.split(";")[0] === "application/octet-stream", "invalid_album_audio", "Upload the audio file as binary data.", 415);
        requireThat(active.size === 0, "upload_busy", "Another audio upload is being processed. Try again when it completes.", 429);
        active.add(req); uploadOwners.set(req, owner);
        req.raw.once("aborted", () => active.delete(req));
      },
      onResponse: async (req) => { active.delete(req); },
      onError: async (req) => { active.delete(req); },
    }, async (req) => {
      const input = requestInput.parse({ commandId: req.headers["x-command-id"], expectedRevision: Number(req.headers["x-event-revision"]) });
      requireThat(Buffer.isBuffer(req.body), "invalid_album_audio", "Choose an MP3 or WAV file.");
      return ingestAlbumAudio(db, uploadOwners.get(req)!, id.parse((req.params as any).id), input, req.body as Buffer, origin, store!);
    });
  });
}
