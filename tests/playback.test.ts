import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createEvent, advance, submitWave } from "../apps/api/src/service.js";
import {
  claimPlayback,
  heartbeat,
  pausePlayback,
  tickRounds,
} from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";
test("playback fencing, pause recovery and durable cutoff", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Playback test",
      artistName: "Test Artist",
      slug: "playback-" + randomUUID(),
      minimumRoundSeconds: 0,
      sources: [
        { title: "Source one", corePrompt: "Core", durationSeconds: 180 },
        { title: "Source two", corePrompt: "Core", durationSeconds: 180 },
      ],
    }),
  );
  const lease = await claimPlayback(db, "our-jam", event.id);
  await assert.rejects(claimPlayback(db, "our-jam", event.id), {
    code: "playback_in_use",
  });
  const start = await advance(db, "our-jam", event.id, randomUUID(), 0, {
    ...lease,
    sequence: 1,
  });
  await assert.rejects(
    advance(db, "our-jam", event.id, randomUUID(), 1, {
      ...lease,
      sequence: 1,
    }),
    { code: "playback_sequence" },
  );
  const cmd = randomUUID();
  const pause = { ...lease, sequence: 2 };
  await pausePlayback(db, "our-jam", event.id, pause, true, cmd);
  await pausePlayback(db, "our-jam", event.id, pause, true, cmd);
  const before = (
    await db.query("SELECT * FROM rounds WHERE id=$1", [start.roundId])
  ).rows[0];
  assert.equal(before.state, "paused");
  assert.ok(before.remaining_ms > 170000);
  const actor = randomUUID();
  await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,$2)", [
    actor,
    "test",
  ]);
  await db.query(
    "INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",
    [event.id, actor],
  );
  await assert.rejects(
    submitWave(db, { participantId: actor }, start.roundId, {
      commandId: randomUUID(),
      text: "Bright horns",
      expectedRevision: 0,
    }),
    { code: "round_closed" },
  );
  await db.query(
    "UPDATE rounds SET paused_at=paused_at-interval '10 seconds' WHERE id=$1",
    [start.roundId],
  );
  await pausePlayback(
    db,
    "our-jam",
    event.id,
    { ...lease, sequence: 3 },
    false,
    randomUUID(),
  );
  const after = (
    await db.query("SELECT * FROM rounds WHERE id=$1", [start.roundId])
  ).rows[0];
  assert.equal(after.state, "open");
  assert.ok(Number(after.paused_ms) >= 10000);
  await db.query(
    "UPDATE playback_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE event_id=$1",
    [event.id],
  );
  await assert.rejects(
    submitWave(db, { participantId: actor }, start.roundId, {
      commandId: randomUUID(),
      text: "Bright horns",
      expectedRevision: 0,
    }),
    { code: "round_closed" },
  );
  await tickRounds(db);
  assert.equal(
    (await db.query("SELECT state FROM rounds WHERE id=$1", [start.roundId]))
      .rows[0].state,
    "paused",
  );
  const replacement = await claimPlayback(
    db,
    "our-jam",
    event.id,
    lease.leaseToken,
  );
  assert.equal(replacement.epoch, lease.epoch + 1);
  await assert.rejects(heartbeat(db, "our-jam", event.id, lease), {
    code: "playback_lease_lost",
  });
  await pausePlayback(
    db,
    "our-jam",
    event.id,
    { ...replacement, sequence: 1 },
    false,
    randomUUID(),
  );
  await submitWave(db, { participantId: actor }, start.roundId, {
    commandId: randomUUID(),
    text: "Bright horns",
    expectedRevision: 0,
  });
  await db.query(
    "UPDATE rounds SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [start.roundId],
  );
  await Promise.all([tickRounds(db), tickRounds(db)]);
  const jobs = (
    await db.query("SELECT * FROM generation_jobs WHERE round_id=$1", [
      start.roundId,
    ])
  ).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].state, "blocked");
  assert.ok(jobs[0].prompt.includes("Bright horns"));
});
