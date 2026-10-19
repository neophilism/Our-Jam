import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import {
  reorderQueue,
  updateSettings,
  updateSource,
  sources,
  settingsInput,
  sourceEditInput,
} from "../apps/api/src/show-setup.js";
import { eventInput } from "../packages/contracts/src/index.js";

test("show edits fence stale commands, preserve current rounds, and reorder only queued tracks", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const input = eventInput.parse({
    title: "Setup rehearsal",
    artistName: "Artist",
    slug: "setup-" + randomUUID(),
    minimumRoundSeconds: 0,
    waveExclusions: ["Muted trumpet"],
    sources: [1, 2, 3].map((n) => ({
      title: `Track ${n}`,
      corePrompt: `Signature ${n}`,
      durationSeconds: 180,
    })),
  });
  const event = await createEvent(db, "our-jam", input);
  const revision = async () =>
    (await db.query("SELECT revision FROM events WHERE id=$1", [event.id]))
      .rows[0].revision as number;
  const queue = async () =>
    (
      await db.query(
        "SELECT * FROM queue_items WHERE event_id=$1 AND state='queued' ORDER BY position,id",
        [event.id],
      )
    ).rows;
  const before = await queue();
  const ids = [before[2].id, before[0].id, before[1].id];
  const command = {
    commandId: randomUUID(),
    expectedRevision: 0,
    queueIds: ids,
  };
  await reorderQueue(db, "our-jam", event.id, command);
  await reorderQueue(db, "our-jam", event.id, command);
  assert.equal(await revision(), 1, "a retry must not mutate again");
  assert.deepEqual(
    (await queue()).map((q) => q.id),
    ids,
  );
  await assert.rejects(
    reorderQueue(db, "our-jam", event.id, {
      ...command,
      commandId: randomUUID(),
    }),
    { code: "revision_conflict" },
  );
  await assert.rejects(
    reorderQueue(db, "our-jam", event.id, {
      ...command,
      queueIds: before.map((q) => q.id),
    }),
    { code: "command_reused" },
  );
  for (const bad of [
    [ids[0], ids[0], ids[2]],
    ids.slice(1),
    [ids[0], ids[1], randomUUID()],
  ]) {
    await assert.rejects(
      reorderQueue(db, "our-jam", event.id, {
        commandId: randomUUID(),
        expectedRevision: 1,
        queueIds: bad,
      }),
      { code: "invalid_queue" },
    );
  }
  await assert.rejects(sources(db, "another-artist", event.id), {
    code: "not_found",
  });
  await assert.rejects(reorderQueue(db, "another-artist", event.id, command), {
    code: "not_found",
  });
  const album = await sources(db, "our-jam", event.id);
  assert.equal(album.revision, 1);
  assert.equal(album.sources[0].core_prompt, "Signature 1");
  const edit = sourceEditInput.parse({
    commandId: randomUUID(),
    expectedRevision: 1,
    title: "Opening choice",
    corePrompt: "New signature",
    durationSeconds: 90,
  });
  await updateSource(db, "our-jam", before[2].source_id, edit);
  const lease = await claimPlayback(db, "our-jam", event.id);
  const start = await advance(
    db,
    "our-jam",
    event.id,
    randomUUID(),
    await revision(),
    { ...lease, sequence: 1 },
  );
  assert.equal(start.queueItemId, ids[0]);
  const round = async () =>
    (await db.query("SELECT * FROM rounds WHERE id=$1", [start.roundId]))
      .rows[0];
  assert.equal((await round()).core_prompt, "New signature");
  const settings = settingsInput.parse({
    ...input,
    title: "Updated show",
    screenLimit: 30,
    maxWaves: 2,
    minimumRoundSeconds: 15,
    maxGenerations: 3,
    waveExclusions: ["Bright violin"],
    commandId: randomUUID(),
    expectedRevision: await revision(),
  });
  await updateSettings(db, "our-jam", event.id, settings);
  await updateSettings(db, "our-jam", event.id, settings);
  assert.equal(
    (await round()).settings.maxWaves,
    8,
    "open rounds keep their original rules",
  );
  assert.equal((await round()).settings.minimumRoundSeconds, 0);
  assert.deepEqual((await round()).settings.waveExclusions, ["muted trumpet"]);
  assert.equal(
    (await sources(db, "our-jam", event.id)).sources.find(
      (s) => s.id === before[2].source_id,
    )!.played,
    true,
  );
  await assert.rejects(
    updateSource(db, "our-jam", before[2].source_id, {
      ...edit,
      commandId: randomUUID(),
      expectedRevision: await revision(),
    }),
    { code: "source_locked" },
  );
  await assert.rejects(
    updateSource(db, "another-artist", before[0].source_id, {
      ...edit,
      commandId: randomUUID(),
      expectedRevision: await revision(),
    }),
    { code: "not_found" },
  );
  await assert.rejects(
    updateSettings(db, "our-jam", event.id, {
      ...settings,
      commandId: randomUUID(),
    }),
    { code: "revision_conflict" },
  );
  await assert.rejects(
    reorderQueue(db, "our-jam", event.id, {
      commandId: randomUUID(),
      expectedRevision: await revision(),
      queueIds: ids,
    }),
    { code: "invalid_queue" },
  );
  await reorderQueue(db, "our-jam", event.id, {
    commandId: randomUUID(),
    expectedRevision: await revision(),
    queueIds: [ids[2], ids[1]],
  });
  const next = await advance(
    db,
    "our-jam",
    event.id,
    randomUUID(),
    await revision(),
    { ...lease, sequence: 2 },
  );
  assert.equal(next.queueItemId, ids[2]);
  assert.equal(
    (await db.query("SELECT settings FROM rounds WHERE id=$1", [next.roundId]))
      .rows[0].settings.maxWaves,
    2,
  );
  assert.equal((await round()).state, "closed");
  assert.equal((await round()).core_prompt, "New signature");
});

test("private setup endpoints require operator identity and same-origin mutations", async (t) => {
  const db = await testDatabase();
  const origin = "http://our-jam.test",
    token = "test-setup-operator-credential-123456789";
  const app = await createApp(db, {
    origin,
    operatorToken: token,
    secureCookies: false,
  });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Private setup",
      artistName: "Artist",
      slug: "private-" + randomUUID(),
      sources: [
        {
          title: "Track",
          corePrompt: "Unpublished private signature",
          durationSeconds: 180,
        },
      ],
    }),
  );
  const guest = await app.inject({
    method: "POST",
    url: "/api/session",
    headers: { origin },
  });
  const cookie = guest.cookies[0].name + "=" + guest.cookies[0].value;
  const path = `/api/operator/events/${event.id}`;
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: path + "/sources",
        headers: { cookie },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: path + "/queue",
        headers: { origin, cookie },
        payload: { commandId: randomUUID(), expectedRevision: 0, queueIds: [] },
      })
    ).statusCode,
    401,
  );
  const login = await app.inject({
    method: "POST",
    url: "/api/operator/login",
    headers: { origin },
    payload: { token },
  });
  const op = login.cookies[0].name + "=" + login.cookies[0].value;
  const album = await app.inject({
    method: "GET",
    url: path + "/sources",
    headers: { cookie: op },
  });
  assert.equal(album.statusCode, 200);
  assert.equal(
    album.json().sources[0].core_prompt,
    "Unpublished private signature",
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: path + "/queue",
        headers: { origin: "https://elsewhere.test", cookie: op },
        payload: { commandId: randomUUID(), expectedRevision: 0, queueIds: [] },
      })
    ).statusCode,
    403,
  );
  const publicState = await app.inject({
    method: "GET",
    url: `/api/events/${event.slug}`,
  });
  assert.ok(!publicState.body.includes("Unpublished private signature"));
});


test("editing a song description never deletes its uploaded or linked audio", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const event = await createEvent(db, "our-jam", eventInput.parse({
    slug: "preserve-audio-" + randomUUID(),
    title: "Keep the recording",
    artistName: "Independent artist",
    sources: [{
      title: "Original song", corePrompt: "Soulful piano and bass",
      audioUrl: "https://example.test/original.mp3", durationSeconds: 180,
    }],
  }));
  const id = (await sources(db, "our-jam", event.id)).sources[0].id;
  await updateSource(db, "our-jam", id, sourceEditInput.parse({
    commandId: randomUUID(), expectedRevision: 0,
    title: "Renamed song", corePrompt: "Soulful piano and warm bass",
    durationSeconds: 180,
  }));
  let stored = (await db.query("SELECT audio_url FROM source_tracks WHERE id=$1", [id])).rows[0];
  assert.equal(stored.audio_url, "https://example.test/original.mp3", "omitting audioUrl must not delete a recording");
  await updateSource(db, "our-jam", id, sourceEditInput.parse({
    commandId: randomUUID(), expectedRevision: 1,
    title: "Renamed song", corePrompt: "Soulful piano and warm bass",
    durationSeconds: 180, audioUrl: null,
  }));
  stored = (await db.query("SELECT audio_url FROM source_tracks WHERE id=$1", [id])).rows[0];
  assert.equal(stored.audio_url, null, "explicit null can still clear a legacy link");
});
