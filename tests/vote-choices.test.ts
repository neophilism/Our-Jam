import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createEvent, allocate, snapshot, advance } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";

test("an artist-selected ten-Sound-Wave allowance is enforced and visible to the fan", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const event = await createEvent(db, "our-jam", eventInput.parse({
    title: "Ten musical ideas",
    artistName: "Independent artist",
    slug: "ten-choices-" + randomUUID(),
    minimumRoundSeconds: 0,
    voteMode: "single",
    votesPerListener: 10,
    sources: [{ title: "Original song", corePrompt: "Warm jazz guitar", durationSeconds: 180 }],
  }));
  const lease = await claimPlayback(db, "our-jam", event.id);
  const opened = await advance(db, "our-jam", event.id, randomUUID(), 0, { ...lease, sequence: 1 });
  assert.ok(opened.roundId);
  const roundId = opened.roundId!;
  const voter = randomUUID();
  const participants = [voter, ...Array.from({ length: 11 }, () => randomUUID())];
  for (const participant of participants) {
    await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,$2)", [participant, randomUUID()]);
    await db.query("INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)", [event.id, participant]);
  }
  const waves = Array.from({ length: 11 }, () => randomUUID());
  for (const [index, waveId] of waves.entries()) {
    await db.query(
      "INSERT INTO sound_waves(id,round_id,author_id,text,normalized) VALUES($1,$2,$3,$4,$5)",
      [waveId, roundId, participants[index + 1], "idea-" + index, "idea-" + index],
    );
  }
  const ten = Object.fromEntries(waves.slice(0, 10).map(id => [id, 1]));
  await allocate(db, { participantId: voter }, roundId, {
    commandId: randomUUID(), expectedRevision: 0, allocations: ten,
  });
  const view = await snapshot(db, event.slug, voter);
  assert.equal(view.round?.voteLimit, 10);
  assert.equal(view.round?.voteMode, "single");
  assert.equal(view.round?.waves.filter(w => w.mine === 1).length, 10);
  await assert.rejects(
    allocate(db, {participantId: voter}, roundId, {commandId:randomUUID(),expectedRevision:1, allocations:{...ten,[waves[10]]:1}}),
    { code: "vote_budget_exceeded" },
  );
  await assert.rejects(
    allocate(db, {participantId: voter}, roundId, {commandId:randomUUID(),expectedRevision:1, allocations:{[waves[0]]:2}}),
    { code: "invalid_allocation" },
  );
  const move = { ...ten };
  delete move[waves[0]];
  move[waves[10]] = 1;
  await allocate(db, {participantId: voter}, roundId, {commandId:randomUUID(),expectedRevision:1,allocations:move});
  const updated = await snapshot(db, event.slug, voter);
  assert.equal(updated.round?.waves.some(w => w.id === waves[0]), false, "a wave without votes is not ranked");
  assert.equal(updated.round?.waves.find(w => w.id === waves[10])?.mine, 1);
});

test("legacy event API calls preserve weighted voting and five available votes", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const event = await createEvent(db, "our-jam", eventInput.parse({
    title: "Legacy show", artistName: "Independent artist", slug: "legacy-votes-" + randomUUID(),
    minimumRoundSeconds: 0,
    sources: [{ title: "Original song", corePrompt: "Indie rock", durationSeconds: 180 }],
  }));
  const lease = await claimPlayback(db, "our-jam", event.id);
  const opened = await advance(db, "our-jam", event.id, randomUUID(), 0, {...lease,sequence:1});
  const view = await snapshot(db, event.slug);
  assert.equal(view.round?.voteMode, "weighted");
  assert.equal(view.round?.voteLimit, 5);
});
