import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import type { Database } from "../apps/api/src/db.js";
import { createApp } from "../apps/api/src/app.js";
import {
  createEvent,
  advance,
  submitWave,
  snapshot,
} from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { controlRelease } from "../apps/api/src/release-controls.js";
import {
  generationTick,
  type GenerationConfig,
} from "../apps/api/src/generation.js";
import { eventInput } from "../packages/contracts/src/index.js";

async function fixture(db: Database, mode = "boundary", provider = true) {
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Release review",
      artistName: "Artist",
      slug: "review-" + randomUUID(),
      minimumRoundSeconds: 0,
      releaseMode: mode,
      sources: [
        { title: "Original", corePrompt: "Private core", durationSeconds: 60 },
      ],
    }),
  );
  const lease = await claimPlayback(db, "our-jam", event.id);
  const opened = await advance(
    db,
    "our-jam",
    event.id,
    randomUUID(),
    0,
    { ...lease, sequence: 1 },
    provider,
  );
  const person = randomUUID();
  await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,'test')", [
    person,
  ]);
  await db.query(
    "INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",
    [event.id, person],
  );
  await submitWave(db, { participantId: person }, opened.roundId, {
    commandId: randomUUID(),
    expectedRevision: 0,
    text: "Warm piano",
  });
  await advance(
    db,
    "our-jam",
    event.id,
    randomUUID(),
    1,
    { ...lease, sequence: 2 },
    provider,
  );
  const job = (
    await db.query("SELECT * FROM generation_jobs WHERE event_id=$1", [
      event.id,
    ])
  ).rows[0];
  return { event, job, lease };
}
function fakeConfig(): GenerationConfig {
  return {
    maxJobCents: 1,
    eventBudgetCents: 10,
    totalBudgetCents: 10000,
    durationSeconds: 20,
    provider: {
      name: "fixture",
      model: "fixture",
      generate: async () => ({ bytes: new Uint8Array([1, 2, 3]) }),
    },
    store: {
      put: async () => {},
      url: async () => "https://storage.example.test/private-signed",
    },
    validate: async () => ({ durationSeconds: 20, meanDb: -12 }),
  };
}

test("artist review survives set end, hides preview from guests and publishes exactly once after approval", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const { event, job, lease } = await fixture(db, "review");
  const cfg = fakeConfig();
  await generationTick(db, cfg);
  const release = (
    await db.query("SELECT * FROM releases WHERE job_id=$1", [job.id])
  ).rows[0];
  assert.equal(release.published_at, null);
  await advance(
    db,
    "our-jam",
    event.id,
    randomUUID(),
    2,
    { ...lease, sequence: 3 },
    true,
  );
  assert.equal(
    (await snapshot(db, event.slug)).releases.length,
    0,
    "an extra boundary must respect review hold",
  );
  const publicState = await snapshot(db, event.slug);
  assert.equal(publicState.jobs[0].release_id, undefined);
  assert.equal(publicState.jobs[0].release_held, undefined);
  const owned = await snapshot(db, event.slug, undefined, "our-jam");
  assert.equal(owned.jobs[0].release_id, release.id);
  const origin = "https://our-jam.test",
    token = "test-operator-credential-0123456789";
  const app = await createApp(db, {
    origin,
    secureCookies: true,
    operatorToken: token,
    mediaStore: cfg.store,
  });
  t.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/operator/login",
    headers: { origin },
    payload: { token },
  });
  const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  assert.equal(
    (await app.inject({ url: `/api/releases/${release.id}/audio` })).statusCode,
    404,
  );
  assert.equal(
    (await app.inject({ url: `/api/operator/releases/${release.id}/audio` }))
      .statusCode,
    401,
  );
  const preview = await app.inject({
    url: `/api/operator/releases/${release.id}/audio`,
    headers: { cookie },
  });
  assert.equal(preview.statusCode, 302);
  assert.equal(
    preview.headers.location,
    "https://storage.example.test/private-signed",
  );
  await assert.rejects(
    controlRelease(db, "different-artist", job.id, {
      action: "publish",
      commandId: randomUUID(),
    }),
    { code: "not_found" },
  );
  const command = { action: "publish" as const, commandId: randomUUID() };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/operator/jobs/${job.id}/control`,
        headers: { cookie },
        payload: command,
      })
    ).statusCode,
    403,
  );
  await db.query("UPDATE releases SET hidden=true WHERE id=$1", [release.id]);
  await assert.rejects(controlRelease(db, "our-jam", job.id, command), {
    code: "release_not_ready",
  });
  assert.equal(
    (
      await app.inject({
        url: `/api/operator/releases/${release.id}/audio`,
        headers: { cookie },
      })
    ).statusCode,
    404,
  );
  await db.query("UPDATE releases SET hidden=false WHERE id=$1", [release.id]);
  for (let i = 0; i < 2; i++) {
    const response = await app.inject({
      method: "POST",
      url: `/api/operator/jobs/${job.id}/control`,
      headers: { origin, cookie },
      payload: command,
    });
    assert.equal(response.statusCode, 200, response.body);
  }
  assert.equal((await snapshot(db, event.slug)).releases.length, 1);
  const published = (
    await db.query(
      "SELECT * FROM event_log WHERE event_id=$1 AND type='releases.published'",
      [event.id],
    )
  ).rows;
  assert.equal(published.length, 1);
  await assert.rejects(
    controlRelease(db, "our-jam", job.id, {
      action: "hold",
      commandId: randomUUID(),
    }),
    { code: "already_published" },
  );
});

test("cancellation wins before dispatch, while an in-flight hold preserves budget and suppresses publication", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const first = await fixture(db);
  const cancel = { action: "cancel" as const, commandId: randomUUID() };
  await controlRelease(db, "our-jam", first.job.id, cancel);
  await controlRelease(db, "our-jam", first.job.id, cancel);
  const cfg = fakeConfig();
  let calls = 0;
  cfg.provider.generate = async () => {
    calls++;
    return { bytes: new Uint8Array([1]) };
  };
  await generationTick(db, cfg);
  assert.equal(calls, 0);
  assert.equal(
    (
      await db.query("SELECT reserved_cents FROM generation_jobs WHERE id=$1", [
        first.job.id,
      ])
    ).rows[0].reserved_cents,
    0,
  );
  const second = await fixture(db, "immediate");
  let started!: () => void, finish!: () => void;
  const accepted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const response = new Promise<void>((resolve) => {
    finish = resolve;
  });
  cfg.provider.generate = async () => {
    calls++;
    started();
    await response;
    return { bytes: new Uint8Array([2]) };
  };
  const worker = generationTick(db, cfg);
  await accepted;
  await assert.rejects(
    controlRelease(db, "our-jam", second.job.id, {
      action: "cancel",
      commandId: randomUUID(),
    }),
    { code: "dispatch_started" },
  );
  await controlRelease(db, "our-jam", second.job.id, {
    action: "hold",
    commandId: randomUUID(),
  });
  finish();
  await worker;
  const job = (
    await db.query("SELECT * FROM generation_jobs WHERE id=$1", [second.job.id])
  ).rows[0];
  assert.equal(job.state, "ready");
  assert.equal(job.release_held, true);
  assert.equal(job.reserved_cents, 1);
  assert.equal((await snapshot(db, second.event.slug)).releases.length, 0);
  await controlRelease(db, "our-jam", second.job.id, {
    action: "allow",
    commandId: randomUUID(),
  });
  assert.equal((await snapshot(db, second.event.slug)).releases.length, 1);
  assert.equal(calls, 1);
});
