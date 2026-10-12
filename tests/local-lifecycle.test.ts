import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { createEvent, advance, submitWave } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { startLocalLifecycle } from "../apps/api/src/local-lifecycle.js";
import type { GenerationConfig } from "../apps/api/src/generation.js";
import type { Database } from "../apps/api/src/db.js";

function zeroConfig(onCall = () => {}) : GenerationConfig {
  return { eventBudgetCents: 0, totalBudgetCents: 0, maxJobCents: 1, durationSeconds: 90,
    provider: { name: "stability", model: "test", generate: async () => { onCall(); throw new Error("No chargeable local request is allowed"); } } };
}
async function prepare(db: Database) {
  const event = await createEvent(db, "our-jam", eventInput.parse({
    title: "Local timer test", artistName: "Isolated test", slug: "lifecycle-" + randomUUID(), minimumRoundSeconds: 0,
    sources: [{ title: "Source", corePrompt: "PRIVATE_TEST_CORE", durationSeconds: 180 }],
  }));
  const lease = await claimPlayback(db, "our-jam", event.id);
  const round = await advance(db, "our-jam", event.id, randomUUID(), 0, { ...lease, sequence: 1 }, true);
  const participant = randomUUID();
  await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,'test')", [participant]);
  await db.query("INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)", [event.id, participant]);
  await submitWave(db, { participantId: participant }, round.roundId!, {
    commandId: randomUUID(), expectedRevision: 0, text: "Timer brass section",
  });
  return { event, round };
}

test("local lifecycle closes a live-controller deadline once and preserves tags under the $0 block", async (t) => {
  const db = await testDatabase();
  let calls = 0;
  const lifecycle = startLocalLifecycle(db, zeroConfig(() => calls++), 60000);
  t.after(async () => { await lifecycle.stop(); await db.close(); });
  const { event, round } = await prepare(db);
  await db.query("UPDATE rounds SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1", [round.roundId]);
  const first = lifecycle.tick(), concurrent = lifecycle.tick();
  assert.equal(first, concurrent, "concurrent ticks reuse the same in-flight work");
  await Promise.all([first, concurrent]);
  await lifecycle.tick();
  const jobs = (await db.query("SELECT state,reason,attempts,reserved_cents,prompt FROM generation_jobs WHERE event_id=$1", [event.id])).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].state, "blocked");
  assert.equal(jobs[0].reason, "approved_budget_zero");
  assert.equal(jobs[0].attempts, 0);
  assert.equal(jobs[0].reserved_cents, 0);
  assert.match(jobs[0].prompt, /Timer brass section/);
  assert.equal(calls, 0);
});

test("local lifecycle pauses an expired controller without creating a generation", async (t) => {
  const db = await testDatabase();
  const lifecycle = startLocalLifecycle(db, zeroConfig(), 60000);
  t.after(async () => { await lifecycle.stop(); await db.close(); });
  const { event, round } = await prepare(db);
  await db.query("UPDATE playback_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE event_id=$1", [event.id]);
  await lifecycle.tick();
  const state = (await db.query("SELECT state,pause_reason,remaining_ms FROM rounds WHERE id=$1", [round.roundId])).rows[0];
  assert.equal(state.state, "paused");
  assert.equal(state.pause_reason, "playback_disconnected");
  assert.ok(state.remaining_ms > 0);
  assert.equal((await db.query("SELECT id FROM generation_jobs WHERE event_id=$1", [event.id])).rows.length, 0);
});

test("local lifecycle stop drains in-flight work and never starts another transaction", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let queries = 0;
  const db: Database = {
    query: async () => { queries++; await pending; return { rows: [] }; },
    transaction: async (fn) => fn(db), close: async () => {},
  };
  const lifecycle = startLocalLifecycle(db, zeroConfig(), 60000);
  const work = lifecycle.tick();
  let stopped = false;
  const closing = lifecycle.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  release();
  await Promise.all([work, closing]);
  const completed = queries;
  await lifecycle.tick();
  assert.equal(queries, completed);
  assert.equal(stopped, true);
});

test("local lifecycle rejects every nonzero funding configuration", () => {
  const db = {} as Database;
  for (const [event, total] of [[1,0], [0,1], [1,1], [-1,0], [NaN,0]]) {
    assert.throws(() => startLocalLifecycle(db, { ...zeroConfig(), eventBudgetCents: event, totalBudgetCents: total }), /hard \$0/);
  }
});
