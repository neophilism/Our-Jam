import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import {
  createEvent,
  advance,
  snapshot,
  submitWave,
  allocate,
} from "../apps/api/src/service.js";
import {
  configureAdmission,
  joinEvent,
  joinInput,
} from "../apps/api/src/admission.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";

test("room admission separates listeners from contributors, fences capacity and preserves votes through code rotation", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Room access",
      artistName: "Artist",
      slug: "admission-" + randomUUID(),
      admissionMode: "room_code",
      participantLimit: 1,
      sources: [
        { title: "Original", corePrompt: "Private", durationSeconds: 300 },
      ],
    }),
  );
  const people = [randomUUID(), randomUUID(), randomUUID()];
  for (const person of people)
    await db.query(
      "INSERT INTO participants(id,avatar_seed) VALUES($1,'test')",
      [person],
    );
  const observer = await joinEvent(db, event.slug, people[0], {});
  assert.equal(observer.canContribute, false);
  const command = {
    commandId: randomUUID(),
    expectedRevision: 0,
    mode: "room_code" as const,
    limit: 1,
    roomCode: "ROOM2026",
  };
  await configureAdmission(db, "our-jam", event.id, command);
  await configureAdmission(db, "our-jam", event.id, command);
  const stored = (
    await db.query("SELECT * FROM events WHERE id=$1", [event.id])
  ).rows[0];
  assert.equal(stored.revision, 1);
  assert.match(stored.room_code_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(stored).includes("ROOM2026"));
  await assert.rejects(
    joinEvent(db, event.slug, people[0], { roomCode: "BADCODE1" }),
    { code: "room_code_invalid" },
  );
  const lease = await claimPlayback(db, "our-jam", event.id);
  const started = await advance(db, "our-jam", event.id, randomUUID(), 1, {
    ...lease,
    sequence: 1,
  });
  await assert.rejects(
    submitWave(db, { participantId: people[0] }, started.roundId, {
      commandId: randomUUID(),
      expectedRevision: 0,
      text: "Warm brass",
    }),
    { code: "admission_required" },
  );
  const attempts = await Promise.allSettled(
    people
      .slice(0, 2)
      .map((person) =>
        joinEvent(
          db,
          event.slug,
          person,
          joinInput.parse({ roomCode: "room-2026" }),
        ),
      ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  const winnerIndex = attempts.findIndex((r) => r.status === "fulfilled"),
    winner = people[winnerIndex];
  const failed = attempts.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.equal(failed.reason.code, "event_full");
  await joinEvent(db, event.slug, people[2], {});
  const listener = await snapshot(db, event.slug, people[2]);
  assert.equal(listener.joined, true);
  assert.equal(listener.canContribute, false);
  assert.equal(listener.admission.contributors, 1);
  assert.ok(!JSON.stringify(listener).includes(stored.room_code_hash));
  assert.ok(!JSON.stringify(listener).includes(stored.room_code_salt));
  await submitWave(db, { participantId: winner }, started.roundId, {
    commandId: randomUUID(),
    expectedRevision: 0,
    text: "Warm brass",
  });
  await configureAdmission(db, "our-jam", event.id, {
    ...command,
    commandId: randomUUID(),
    expectedRevision: 2,
    roomCode: "NEWCODE8",
  });
  await joinEvent(db, event.slug, winner, {});
  const voter = await snapshot(db, event.slug, winner);
  assert.equal(voter.canContribute, true);
  assert.equal(voter.round!.waves[0].mine, 1);
  await allocate(db, { participantId: winner }, started.roundId, {
    commandId: randomUUID(),
    expectedRevision: 1,
    allocations: { [voter.round!.waves[0].id]: 5 },
  });
  await assert.rejects(
    configureAdmission(db, "our-jam", event.id, {
      ...command,
      commandId: randomUUID(),
      expectedRevision: 3,
      mode: "open",
    }),
    { code: "admission_locked" },
  );
  await assert.rejects(
    joinEvent(db, event.slug, people[2], { roomCode: "ROOM2026" }),
    { code: "room_code_invalid" },
  );
  await assert.rejects(
    configureAdmission(db, "other-artist", event.id, command),
    { code: "not_found" },
  );
  const app = await createApp(db, {
    origin: "https://ourjam.test",
    secureCookies: true,
  });
  t.after(() => app.close());
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/operator/events/${event.id}/admission`,
        headers: { origin: "https://ourjam.test" },
        payload: command,
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/operator/events/${event.id}/admission`,
        payload: command,
      })
    ).statusCode,
    403,
  );
});

test("one hundred contributor slots remain bounded under concurrent joins with repeat admission allowed", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Capacity rehearsal",
      artistName: "Artist",
      slug: "capacity-" + randomUUID(),
      participantLimit: 100,
      sources: [
        { title: "Original", corePrompt: "Private", durationSeconds: 300 },
      ],
    }),
  );
  const people = Array.from({ length: 105 }, () => randomUUID());
  await db.query(
    "INSERT INTO participants(id,avatar_seed) SELECT id,'capacity' FROM unnest($1::uuid[]) AS id",
    [people],
  );
  const results = await Promise.allSettled(
    people.map((person) => joinEvent(db, event.slug, person, {})),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 100);
  assert.ok(
    results
      .filter((r) => r.status === "rejected")
      .every((r: any) => r.reason.code === "event_full"),
  );
  const i = results.findIndex((r) => r.status === "fulfilled");
  assert.equal(
    (await joinEvent(db, event.slug, people[i], {})).canContribute,
    true,
  );
  assert.equal((await snapshot(db, event.slug)).admission.contributors, 100);
  await assert.rejects(
    configureAdmission(db, "our-jam", event.id, {
      commandId: randomUUID(),
      expectedRevision: 0,
      mode: "open",
      limit: 99,
    }),
    { code: "capacity_below_members" },
  );
});
