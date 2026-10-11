import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { createApp } from "../apps/api/src/app.js";
import { ingestAlbumAudio, uploadedAlbumUrl } from "../apps/api/src/album-uploads.js";
import { prepareAlbumAudio } from "../apps/api/src/album-media.js";
import type { MediaStore } from "../packages/providers/src/storage.js";
const origin = "http://localhost:5173";
function wav(seconds = 16) {
  const bytes = Buffer.alloc(44 + 8000 * seconds * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 0; i < seconds * 8000; i++) bytes.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 220 / 8000) * 4000), 44 + i * 2);
  return bytes;
}
async function fixture() {
  const db = await testDatabase();
  const event = await createEvent(db, "our-jam", eventInput.parse({ title: "Album upload test", artistName: "Test", slug: "upload-" + randomUUID(), minimumRoundSeconds: 0, sources: [{ title: "My original", corePrompt: "PRIVATE original core", durationSeconds: 90 }] }));
  const sourceId = (await db.query("SELECT id FROM source_tracks WHERE event_id=$1", [event.id])).rows[0].id as string;
  const stored = new Map<string, Uint8Array>();
  const store: MediaStore = { put: async (key, bytes) => { stored.set(key, bytes); }, url: async (key) => "https://private.example.test/" + key + "?signed=test-only" };
  return { db, event, sourceId, store, stored };
}

test("album file is fully decoded, privately attached with stable delivery and replay, and frozen once played", async (t) => {
  const { db, event, sourceId, store, stored } = await fixture(); t.after(() => db.close());
  const command = { commandId: randomUUID(), expectedRevision: 0 };
  const bytes = wav();
  const result = await ingestAlbumAudio(db, "our-jam", sourceId, command, bytes, origin, store);
  assert.equal(result.ok, true); assert.ok(result.durationSeconds >= 16 && result.durationSeconds < 17);
  assert.match(result.audioUrl, /\/api\/operator\/sources\/.+\/audio\/[a-f0-9]{64}$/);
  assert.equal(stored.size, 1);
  assert.deepEqual(await ingestAlbumAudio(db, "our-jam", sourceId, command, bytes, origin, store), result);
  assert.equal(stored.size, 1);
  await assert.rejects(ingestAlbumAudio(db, "our-jam", sourceId, command, wav(17), origin, store));
  const row = (await db.query("SELECT * FROM source_tracks WHERE id=$1", [sourceId])).rows[0];
  assert.equal(row.core_prompt, "PRIVATE original core"); assert.equal(row.title, "My original"); assert.equal(row.duration_seconds, Math.ceil(result.durationSeconds));
  assert.match(await uploadedAlbumUrl(db, "our-jam", sourceId, result.sha256, origin, store), /^https:\/\/private\.example\.test\/albums\//);
  await assert.rejects(uploadedAlbumUrl(db, "another-artist", sourceId, result.sha256, origin, store));
  await assert.rejects(uploadedAlbumUrl(db, "our-jam", sourceId, "0".repeat(64), origin, store));
  const lease = await claimPlayback(db, "our-jam", event.id);
  await advance(db, "our-jam", event.id, randomUUID(), 1, { ...lease, sequence: 1 });
  await assert.rejects(ingestAlbumAudio(db, "our-jam", sourceId, { commandId: randomUUID(), expectedRevision: 2 }, bytes, origin, store), (e: any) => e.code === "source_locked");
  assert.equal(stored.size, 1);
});

test("invalid uploads, stale revisions and storage failure preserve the previous album source", async (t) => {
  const { db, event, sourceId, store, stored } = await fixture(); t.after(() => db.close());
  await assert.rejects(prepareAlbumAudio(Buffer.from("#EXTM3U\nhttps://private.invalid/playlist")));
  await assert.rejects(prepareAlbumAudio(wav(6)), (e: any) => e.code === "invalid_album_audio");
  await assert.rejects(ingestAlbumAudio(db, "our-jam", sourceId, { commandId: randomUUID(), expectedRevision: 0 }, new Uint8Array(2048), origin, store));
  assert.equal(stored.size, 0);
  await assert.rejects(ingestAlbumAudio(db, "another-artist", sourceId, { commandId: randomUUID(), expectedRevision: 0 }, wav(), origin, store));
  const fail: MediaStore = { ...store, put: async () => { throw new Error("unavailable"); } };
  await assert.rejects(ingestAlbumAudio(db, "our-jam", sourceId, { commandId: randomUUID(), expectedRevision: 0 }, wav(), origin, fail));
  assert.equal((await db.query("SELECT audio_url FROM source_tracks WHERE id=$1", [sourceId])).rows[0].audio_url, null);
  assert.equal((await db.query("SELECT revision FROM events WHERE id=$1", [event.id])).rows[0].revision, 0);
  const prepare = async () => {
    await db.query("UPDATE events SET revision=revision+1 WHERE id=$1", [event.id]);
    return { bytes: new Uint8Array([1, 2, 3]), durationSeconds: 16 };
  };
  await assert.rejects(ingestAlbumAudio(db, "our-jam", sourceId, { commandId: randomUUID(), expectedRevision: 0 }, wav(), origin, store, prepare), (e: any) => e.code === "revision_conflict");
  assert.equal(stored.size, 0);
});

test("album upload and delivery routes enforce authentication, Origin and configured storage", async (t) => {
  const { db, sourceId, store, stored } = await fixture(); t.after(() => db.close());
  const token = "test-only-album-operator-token-123456";
  const app = await createApp(db, { origin, operatorToken: token, secureCookies: false, mediaStore: store });
  t.after(() => app.close());
  const login = await app.inject({ method: "POST", url: "/api/operator/login", headers: { origin }, payload: { token } });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers["set-cookie"]!.toString().split(";")[0];
  const url = `/api/operator/sources/${sourceId}/upload`;
  const headers = { origin, cookie, "content-type": "application/octet-stream", "x-command-id": randomUUID(), "x-event-revision": "0" };
  assert.equal((await app.inject({ method: "POST", url, headers: { ...headers, cookie: "" }, payload: wav() })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url, headers: { ...headers, origin: "https://evil.example.test" }, payload: wav() })).statusCode, 403);
  const result = await app.inject({ method: "POST", url, headers, payload: wav() });
  assert.equal(result.statusCode, 200, result.body); assert.equal(stored.size, 1);
  const path = new URL(result.json().audioUrl).pathname;
  assert.equal((await app.inject({ method: "GET", url: path })).statusCode, 401);
  const delivered = await app.inject({ method: "GET", url: path, headers: { cookie } });
  assert.equal(delivered.statusCode, 302); assert.match(String(delivered.headers.location), /^https:\/\/private\.example\.test\//);
  const unavailable = await createApp(db, { origin, operatorToken: token, secureCookies: false });
  t.after(() => unavailable.close());
  assert.equal((await unavailable.inject({ method: "POST", url, headers, payload: wav() })).statusCode, 503);
});
