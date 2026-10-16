import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareSponsorVideo } from "../apps/api/src/sponsor-media.js";
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
