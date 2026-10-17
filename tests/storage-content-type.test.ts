import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3Store } from "../packages/providers/src/storage.js";

test("private S3 delivery preserves MP3 defaults and signs sponsor MP4s as video", async (t) => {
  const bytes = Buffer.from("storage contract fixture");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const uploads: PutObjectCommand["input"][] = [];
  t.mock.method(S3Client.prototype, "send", async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      uploads.push(command.input);
      return {};
    }
    assert.ok(command instanceof HeadObjectCommand);
    return { ContentLength: bytes.length, Metadata: { sha256: sha } };
  });
  const store = s3Store({
    endpoint: "https://storage.example.invalid",
    region: "us-east-2", bucket: "private-fixture",
    accessKeyId: "fixture-not-a-real-key", secretAccessKey: "fixture-not-a-real-secret",
  });
  await store.put("track.mp3", bytes, sha);
  await store.put("sponsor.mp4", bytes, sha, "video/mp4");
  assert.deepEqual(uploads.map((upload) => upload.ContentType), ["audio/mpeg", "video/mp4"]);
  for (const download of [false, true]) {
    const audio = new URL(await store.url("track.mp3", download));
    const video = new URL(await store.url("sponsor.mp4", download, "video/mp4"));
    assert.equal(audio.searchParams.get("response-content-type"), "audio/mpeg");
    assert.equal(video.searchParams.get("response-content-type"), "video/mp4");
    assert.equal(video.searchParams.get("X-Amz-Expires"), "300");
    assert.ok(video.searchParams.has("X-Amz-Signature"));
    assert.equal(audio.searchParams.get("response-content-disposition"), download ? 'attachment; filename="our-jam-track.mp3"' : "inline");
    assert.equal(video.searchParams.get("response-content-disposition"), download ? 'attachment; filename="our-jam-sponsor.mp4"' : "inline");
  }
});
