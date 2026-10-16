import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStartupMedia } from "../apps/api/src/media-readiness.js";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";
import type { MediaStore } from "../packages/providers/src/storage.js";

test("private storage probe is opt-in, mandatory when requested and propagates failure", async () => {
  let calls = 0;
  const store: MediaStore = {
    put: async () => { throw new Error("unexpected upload"); },
    url: async () => { throw new Error("unexpected URL request"); },
    verifyRoundTrip: async () => { calls++; },
  };
  assert.equal(await verifyStartupMedia(undefined, undefined), "not_requested");
  assert.equal(await verifyStartupMedia(store, "0"), "not_requested");
  assert.equal(calls, 0, "no storage operation without explicit opt-in");
  await assert.rejects(verifyStartupMedia(undefined, "1"), /requires private storage/);
  await assert.rejects(verifyStartupMedia({ ...store, verifyRoundTrip: undefined }, "1"), /requires private storage/);
  assert.equal(await verifyStartupMedia(store, "1"), "verified");
  assert.equal(calls, 1);
  await assert.rejects(
    verifyStartupMedia({ ...store, verifyRoundTrip: async () => { throw new Error("storage offline"); } }, "1"),
    /storage offline/,
  );
});

test("readiness never represents configured media as verified without a successful probe", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const store: MediaStore = { put: async () => {}, url: async () => "https://example.invalid/file" };
  for (const [mediaStore, mediaVerified, expected] of [
    [undefined, false, "not_configured"],
    [store, false, "configured"],
    [store, true, "verified"],
  ] as const) {
    const app = await createApp(db, {
      origin: "http://localhost:5173",
      secureCookies: false,
      mediaStore,
      mediaVerified,
    });
    const ready = await app.inject({ method: "GET", url: "/api/ready" });
    assert.equal(ready.statusCode, 200, ready.body);
    assert.equal(ready.json().media, expected);
    await app.close();
  }
});
