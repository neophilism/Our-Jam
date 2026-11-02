import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { leaderboard } from "../apps/api/src/recognition.js";

test("recognition controls require the owning operator and reject stale or unrecognized settings", async (t) => {
  const db = await testDatabase(),
    origin = "http://recognition.our-jam.test";
  const app = await createApp(db, {
    origin,
    operatorToken: "recognition-settings-fixture-token",
    secureCookies: false,
  });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const request = (method: any, body?: any, cookie?: string) =>
    app.inject({
      method,
      url: "/api/operator/recognition-settings",
      payload: body,
      headers: { origin, ...(cookie ? { cookie } : {}) },
    });
  assert.equal((await request("GET")).statusCode, 401);
  const login = await app.inject({
    method: "POST",
    url: "/api/operator/login",
    payload: { token: "recognition-settings-fixture-token" },
    headers: { origin },
  });
  const op = "oj_operator=" + login.cookies[0].value;
  assert.deepEqual((await request("GET", undefined, op)).json(), {
    timezone: "UTC",
    visible: true,
    revision: 0,
  });
  const body = {
    timezone: "America/Los_Angeles",
    visible: false,
    expectedRevision: 0,
  };
  assert.equal(
    (await request("PUT", { ...body, artistId: "foreign" }, op)).statusCode,
    400,
  );
  assert.equal(
    (await request("PUT", { ...body, timezone: "not-a-timezone" }, op))
      .statusCode,
    400,
  );
  assert.equal((await request("PUT", body, op)).statusCode, 200);
  assert.equal((await request("PUT", body, op)).statusCode, 409);
  assert.deepEqual(await leaderboard(db, "our-jam", "all", "included"), {
    period: "all",
    metric: "included",
    timezone: "America/Los_Angeles",
    visible: false,
    entries: [],
  });
  assert.equal(
    (await request("PUT", { ...body, visible: true, expectedRevision: 1 }, op))
      .statusCode,
    200,
  );
  assert.equal(
    (await leaderboard(db, "our-jam", "all", "included")).visible,
    true,
  );
});

test("calendar windows use artist-local week/month boundaries across DST and exclude future releases", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  await db.query(
    "UPDATE artists SET leaderboard_timezone='America/Los_Angeles' WHERE id='our-jam'",
  );
  const participant = randomUUID(),
    event = randomUUID(),
    source = randomUUID(),
    round = randomUUID(),
    job = randomUUID(),
    release = randomUUID();
  await db.query(
    "INSERT INTO participants(id,name,avatar_seed) VALUES($1,'Boundary musician','boundary-seed')",
    [participant],
  );
  await db.query(
    "INSERT INTO events(id,artist_id,slug,title,artist_name,settings) VALUES($1,'our-jam',$2,'Boundary fixture','Artist','{}')",
    [event, "boundary-" + randomUUID()],
  );
  await db.query(
    "INSERT INTO source_tracks(id,event_id,title,core_prompt,duration_seconds,ordinal) VALUES($1,$2,'Track','private',120,0)",
    [source, event],
  );
  await db.query(
    "INSERT INTO rounds(id,event_id,source_id,state,deadline_at,seed,seed_commitment,core_prompt,settings) VALUES($1,$2,$3,'closed',now(),'s','c','private','{}')",
    [round, event, source],
  );
  const snapshot = {
    selected: [
      {
        authorId: participant,
        text: "Clock fixture",
        votes: 3,
        otherPoints: 2,
      },
    ],
  };
  await db.query(
    "INSERT INTO generation_jobs(id,event_id,round_id,state,snapshot,prompt,prompt_hash) VALUES($1,$2,$3,'ready',$4,'private','h')",
    [job, event, round, JSON.stringify(snapshot)],
  );
  await db.query(
    "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds,published_at) VALUES($1,$2,$3,'Boundary track','https://example.test/a','https://example.test/a',60,'2026-11-01T07:00:00Z')",
    [release, event, job],
  );
  // November midnight PDT, then the DST fall-back: UTC boundaries differ.
  assert.equal(
    (
      await leaderboard(
        db,
        "our-jam",
        "month",
        "included",
        undefined,
        new Date("2026-11-01T06:59:59Z"),
      )
    ).entries.length,
    0,
  );
  assert.equal(
    (
      await leaderboard(
        db,
        "our-jam",
        "month",
        "included",
        undefined,
        new Date("2026-11-01T07:00:00Z"),
      )
    ).entries.length,
    1,
  );
  await db.query(
    "UPDATE releases SET published_at='2026-11-02T07:59:59Z' WHERE id=$1",
    [release],
  );
  assert.equal(
    (
      await leaderboard(
        db,
        "our-jam",
        "week",
        "support",
        undefined,
        new Date("2026-11-02T07:59:59Z"),
      )
    ).entries.length,
    1,
  );
  assert.equal(
    (
      await leaderboard(
        db,
        "our-jam",
        "week",
        "support",
        undefined,
        new Date("2026-11-02T08:00:00Z"),
      )
    ).entries.length,
    0,
  );
  await db.query(
    "UPDATE releases SET published_at='2026-11-02T08:00:00Z' WHERE id=$1",
    [release],
  );
  const board = await leaderboard(
    db,
    "our-jam",
    "week",
    "support",
    undefined,
    new Date("2026-11-02T08:00:00Z"),
  );
  assert.equal(board.entries[0].support, 2);
  const liveWave = randomUUID();
  await db.query(
    "INSERT INTO sound_waves(id,round_id,author_id,text,normalized) VALUES($1,$2,$3,'Mutable wave','mutable wave')",
    [liveWave, round, participant],
  );
  await db.query("INSERT INTO ballots(round_id,participant_id) VALUES($1,$2)", [
    round,
    participant,
  ]);
  await db.query(
    "INSERT INTO allocations(round_id,participant_id,wave_id,points) VALUES($1,$2,$3,5)",
    [round, participant, liveWave],
  );
  // Live votes are unrelated to the frozen selected-wave release receipt.
  await db.query(
    "UPDATE participants SET name='New public name',anonymous=true WHERE id=$1",
    [participant],
  );
  const anonymous = await leaderboard(
    db,
    "our-jam",
    "week",
    "support",
    undefined,
    new Date("2026-11-02T08:00:00Z"),
  );
  assert.equal(anonymous.entries[0].included, 1);
  assert.equal(anonymous.entries[0].support, 2);
  assert.equal(anonymous.entries[0].name, "Anonymous");
  await db.query("UPDATE releases SET hidden=true WHERE id=$1", [release]);
  assert.equal(
    (await leaderboard(db, "our-jam", "all", "included")).entries.length,
    0,
  );
});
