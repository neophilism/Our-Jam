import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migrate } from "../apps/api/src/db.js";
import { testDatabase } from "./database.js";

test("P003 migrations are repeatable and reject cross-event references", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());

  await migrate(db);
  const migrations = await db.query(
    "SELECT name FROM schema_migrations ORDER BY name",
  );
  assert.deepEqual(
    migrations.rows.slice(0, 3).map((row) => row.name),
    ["001_core.sql", "002_playback.sql", "003_generation.sql"],
  );

  const eventA = randomUUID();
  const eventB = randomUUID();
  const sourceA = randomUUID();
  const sourceB = randomUUID();
  const roundA = randomUUID();
  const roundB = randomUUID();
  const jobA = randomUUID();
  const jobB = randomUUID();

  for (const [id, slug] of [
    [eventA, "schema-a-" + randomUUID()],
    [eventB, "schema-b-" + randomUUID()],
  ])
    await db.query(
      "INSERT INTO events(id,artist_id,slug,title,artist_name,settings) VALUES($1,'our-jam',$2,'Schema test','Test Artist','{}'::jsonb)",
      [id, slug],
    );

  await db.query(
    "INSERT INTO source_tracks(id,event_id,title,core_prompt,duration_seconds,ordinal) VALUES($1,$2,'A','private-a',120,1),($3,$4,'B','private-b',120,1)",
    [sourceA, eventA, sourceB, eventB],
  );

  await assert.rejects(() =>
    db.query(
      "INSERT INTO rounds(id,event_id,source_id,deadline_at,seed,seed_commitment,core_prompt,settings) VALUES($1,$2,$3,now()+interval '1 minute','s','c','p','{}'::jsonb)",
      [randomUUID(), eventB, sourceA],
    ),
  );

  for (const [id, eventId, sourceId] of [
    [roundA, eventA, sourceA],
    [roundB, eventB, sourceB],
  ])
    await db.query(
      "INSERT INTO rounds(id,event_id,source_id,state,deadline_at,seed,seed_commitment,core_prompt,settings) VALUES($1,$2,$3,'closed',now(),'s','c','p','{}'::jsonb)",
      [id, eventId, sourceId],
    );

  await assert.rejects(() =>
    db.query(
      "INSERT INTO generation_jobs(id,event_id,round_id,state,snapshot,prompt,prompt_hash) VALUES($1,$2,$3,'blocked','{}'::jsonb,'p','h')",
      [randomUUID(), eventB, roundA],
    ),
  );

  for (const [id, eventId, roundId] of [
    [jobA, eventA, roundA],
    [jobB, eventB, roundB],
  ])
    await db.query(
      "INSERT INTO generation_jobs(id,event_id,round_id,state,snapshot,prompt,prompt_hash) VALUES($1,$2,$3,'blocked','{}'::jsonb,'p','h')",
      [id, eventId, roundId],
    );

  await assert.rejects(() =>
    db.query(
      "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds) VALUES($1,$2,$3,'x','https://example.test/a','https://example.test/d',1)",
      [randomUUID(), eventB, jobA],
    ),
  );
  await assert.rejects(() =>
    db.query(
      "INSERT INTO queue_items(id,event_id,source_id,position) VALUES($1,$2,$3,1)",
      [randomUUID(), eventB, sourceA],
    ),
  );
});
