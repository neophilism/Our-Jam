import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareSponsorVideo } from "../apps/api/src/sponsor-media.js";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";
import type { MediaStore } from "../packages/providers/src/storage.js";
const exec = promisify(execFile);
test("sponsor MP4 is fully decoded into silent video, with no retained audio track", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "ourjam-video-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "with-audio.mp4"),
    out = path.join(dir, "silent.mp4");
  await exec("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    input,
  ]);
  const result = await prepareSponsorVideo(await readFile(input));
  assert.ok(result.durationSeconds >= 2);
  await writeFile(out, result.bytes);
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type",
    "-of",
    "json",
    out,
  ]);
  const streams = JSON.parse(stdout).streams;
  assert.equal(streams.length, 1);
  assert.equal(streams[0].codec_type, "video");

  // Exercise the real upload, private preview and published redirect. The
  // browser fixture's video endpoint cannot catch incorrect S3 MIME requests.
  const db = await testDatabase();
  t.after(() => db.close());
  const writes: Parameters<MediaStore["put"]>[] = [];
  const reads: Parameters<MediaStore["url"]>[] = [];
  const store: MediaStore = {
    put: async (...args) => { writes.push(args); },
    url: async (...args) => { reads.push(args); return "https://storage.example.invalid/signed-video"; },
  };
  const origin = "http://localhost:5173", adminToken = "test-only-platform-key-1234567890123";
  const app = await createApp(db, { origin, secureCookies: false, mediaStore: store,
    commerce: { enabled: true, adminToken } });
  t.after(() => app.close());
  const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin }, payload: { token: adminToken } });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = login.headers["set-cookie"]!.toString().split(";")[0];
  const upload = await app.inject({ method: "POST", url: "/api/admin/sponsor-videos?name=Fixture", headers: { origin, cookie, "content-type": "application/octet-stream" }, payload: result.bytes });
  assert.equal(upload.statusCode, 200, upload.body);
  const videoId = upload.json().id;
  assert.equal(writes.length, 1);
  assert.equal(writes[0][3], "video/mp4");
  assert.ok(writes[0][0].endsWith(".mp4"));
  assert.equal((await app.inject(`/api/sponsor-videos/${videoId}`)).statusCode, 404);
  assert.equal(reads.length, 0);
  assert.equal((await app.inject({ url: `/api/admin/sponsor-videos/${videoId}/preview`, headers: { cookie } })).statusCode, 302);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/admin/sponsor-videos/${videoId}`, headers: { origin, cookie }, payload: { active: true } })).statusCode, 200);
  assert.equal((await app.inject(`/api/sponsor-videos/${videoId}`)).statusCode, 302);
  assert.deepEqual(reads, [[writes[0][0], false, "video/mp4"], [writes[0][0], false, "video/mp4"]]);
});
test("unsupported and malformed sponsor inputs cannot publish a video", async () => {
  await assert.rejects(
    prepareSponsorVideo(Buffer.from("#EXTM3U\nhttp://127.0.0.1/private")),
    (e: any) => e.code === "invalid_video",
  );
  await assert.rejects(
    prepareSponsorVideo(Buffer.alloc(65 * 1024 * 1024)),
    (e: any) => e.code === "invalid_video",
  );
});
