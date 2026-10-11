import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createEvent, advance, submitWave } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { leaderboard, releaseCredits } from "../apps/api/src/recognition.js";
import { eventInput } from "../packages/contracts/src/index.js";
test("released-only credit preserves anonymity, date windows and excludes self support", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const e = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Credit test",
      artistName: "Test Artist",
      slug: "credit-" + randomUUID(),
      minimumRoundSeconds: 0,
      sources: [
        {
          title: "Credits source",
          corePrompt: "SECRET_SIGNATURE",
          durationSeconds: 120,
        },
      ],
    }),
  );
  const lease = await claimPlayback(db, "our-jam", e.id);
  const round = await advance(db, "our-jam", e.id, randomUUID(), 0, {
    ...lease,
    sequence: 1,
  });
  const p = randomUUID();
  await db.query(
    "INSERT INTO participants(id,name,avatar_seed,anonymous) VALUES($1,$2,$3,false)",
    [p, "Chosen Name", "test-seed"],
  );
  await db.query(
    "INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",
    [e.id, p],
  );
  await submitWave(db, { participantId: p }, round.roundId, {
    commandId: randomUUID(),
    expectedRevision: 0,
    text: "Warm horns",
  });
  await advance(db, "our-jam", e.id, randomUUID(), 1, {
    ...lease,
    sequence: 2,
  });
  const job = (
    await db.query("SELECT id FROM generation_jobs WHERE event_id=$1", [e.id])
  ).rows[0];
  const release = randomUUID();
  await db.query(
    "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds) VALUES($1,$2,$3,$4,$5,$6,60)",
    [
      release,
      e.id,
      job.id,
      "Credit track",
      "https://example.com/audio.mp3",
      "https://example.com/audio.mp3",
    ],
  );
  assert.equal(
    (await leaderboard(db, "our-jam", "all", "included", e.slug)).entries
      .length,
    0,
  );
  await assert.rejects(releaseCredits(db, release), { code: "not_found" });
  await db.query("UPDATE releases SET published_at=now() WHERE id=$1", [
    release,
  ]);
  let board = await leaderboard(db, "our-jam", "week", "included", e.slug);
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].included, 1);
  assert.equal(board.entries[0].points, 1);
  assert.equal(board.entries[0].support, 0);
  assert.equal(board.entries[0].name, "Chosen Name");
  assert.notEqual(board.entries[0].id, p);
  const credits = await releaseCredits(db, release);
  assert.equal(credits.credits[0].text, "Warm horns");
  assert.ok(!JSON.stringify(credits).includes("SECRET_SIGNATURE"));
  await db.query("UPDATE participants SET anonymous=true WHERE id=$1", [p]);
  assert.equal(
    (await releaseCredits(db, release)).credits[0].name,
    "Anonymous",
  );
  await db.query(
    "UPDATE releases SET published_at=now()-interval '2 months' WHERE id=$1",
    [release],
  );
  assert.equal(
    (await leaderboard(db, "our-jam", "month", "support", e.slug)).entries
      .length,
    0,
  );
  assert.equal(
    (await leaderboard(db, "our-jam", "all", "support", e.slug)).entries.length,
    1,
  );
  await db.query("UPDATE releases SET hidden=true WHERE id=$1", [release]);
  assert.equal(
    (await leaderboard(db, "our-jam", "all", "support", e.slug)).entries.length,
    0,
  );
  await assert.rejects(releaseCredits(db, release), { code: "not_found" });
});
