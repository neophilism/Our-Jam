import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { digest } from "../packages/domain/src/index.js";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";
import {
  catalogInput,
  artistProfileInput,
  publicArtist,
  editArtist,
  likedTracks,
} from "../apps/api/src/catalog.js";

test("artist pages safely edit owned profiles and paginate only that artist's public archive", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const artist = "catalog-" + randomUUID();
  await db.query("INSERT INTO artists(id,name) VALUES($1,'Initial artist')", [
    artist,
  ]);
  const profile = artistProfileInput.parse({
    commandId: randomUUID(),
    expectedRevision: 0,
    name: "The Artist",
    bio: "A signature sound, made together.",
    links: [{ label: "Original album", url: "https://example.test/album" }],
  });
  await editArtist(db, artist, profile);
  await editArtist(db, artist, profile);
  await assert.rejects(
    editArtist(db, artist, { ...profile, commandId: randomUUID() }),
    { code: "revision_conflict" },
  );
  assert.throws(() =>
    artistProfileInput.parse({
      ...profile,
      links: [{ label: "Bad link", url: "javascript:alert(1)" }],
    }),
  );
  assert.throws(() =>
    artistProfileInput.parse({ ...profile, name: "<script>" }),
  );
  const events = [];
  for (const n of [1, 2])
    events.push(
      await createEvent(
        db,
        artist,
        eventInput.parse({
          title: "Session " + n,
          artistName: "The Artist",
          slug: "catalog-" + randomUUID(),
          sources: [
            {
              title: "Source",
              corePrompt: "Private core not public",
              durationSeconds: 60,
            },
          ],
        }),
      ),
    );
  await db.query("UPDATE events SET state='ended' WHERE id=$1", [events[0].id]);
  const first = await publicArtist(
    db,
    artist,
    catalogInput.parse({ limit: 1 }),
  );
  assert.equal(first.artist.name, "The Artist");
  assert.equal(first.artist.profile_revision, 1);
  assert.equal(first.events.length, 1);
  assert.equal(first.nextOffset, 1);
  const second = await publicArtist(
    db,
    artist,
    catalogInput.parse({ limit: 1, offset: first.nextOffset }),
  );
  assert.equal(second.nextOffset, null);
  assert.notEqual(first.events[0].id, second.events[0].id);
  const archive = await publicArtist(
    db,
    artist,
    catalogInput.parse({ state: "ended" }),
  );
  assert.equal(archive.events.length, 1);
  assert.equal(archive.events[0].id, events[0].id);
  assert.ok(!JSON.stringify(first).includes("Private core not public"));
  const app = await createApp(db, {
    origin: "http://our-jam.test",
    secureCookies: false,
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "PATCH",
    url: "/api/operator/artist",
    headers: { origin: "http://our-jam.test" },
    payload: profile,
  });
  assert.equal(response.statusCode, 401);
  const operatorToken = randomUUID().replaceAll("-", "").repeat(2);
  await db.query(
    "INSERT INTO sessions(token_hash,artist_id,kind,expires_at) VALUES($1,$2,'operator',now()+interval '1 hour')",
    [digest(operatorToken), artist],
  );
  const owned = await app.inject({
    method: "GET",
    url: "/api/operator/events",
    headers: { cookie: "oj_operator=" + operatorToken },
  });
  assert.equal(owned.statusCode, 200);
  assert.deepEqual(
    new Set(owned.json().events.map((e: any) => e.id)),
    new Set(events.map((e) => e.id)),
  );
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/operator/events" }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/artists/" + artist + "?limit=1000",
      })
    ).statusCode,
    400,
  );
});

test("liked-track collections isolate participants and omit hidden or unpublished releases", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const origin = "http://our-jam.test",
    app = await createApp(db, { origin, secureCookies: false });
  t.after(() => app.close());
  const a = (
    await app.inject({
      method: "POST",
      url: "/api/mobile/session",
      headers: { origin },
    })
  ).json();
  const b = (
    await app.inject({
      method: "POST",
      url: "/api/mobile/session",
      headers: { origin },
    })
  ).json();
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Collection rehearsal",
      artistName: "Artist",
      slug: "library-" + randomUUID(),
      sources: [
        { title: "Source", corePrompt: "Private core", durationSeconds: 60 },
      ],
    }),
  );
  const lease = await claimPlayback(db, "our-jam", event.id);
  await advance(db, "our-jam", event.id, randomUUID(), 0, {
    ...lease,
    sequence: 1,
  });
  await advance(db, "our-jam", event.id, randomUUID(), 1, {
    ...lease,
    sequence: 2,
  });
  const job = (
      await db.query("SELECT id FROM generation_jobs WHERE event_id=$1", [
        event.id,
      ])
    ).rows[0],
    release = randomUUID();
  await db.query(
    "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds) VALUES($1,$2,$3,'Crowd favorite','https://media.test/track','https://media.test/track',60)",
    [release, event.id, job.id],
  );
  await db.query(
    "INSERT INTO reactions(release_id,participant_id,value) VALUES($1,$2,1)",
    [release, a.participantId],
  );
  assert.equal(
    (await likedTracks(db, a.participantId, catalogInput.parse({}))).tracks
      .length,
    0,
  );
  await db.query(
    "UPDATE releases SET published_at=now(),asset_key='private-fixture-key' WHERE id=$1",
    [release],
  );
  const request = (token?: string) =>
    app.inject({
      method: "GET",
      url: "/api/library",
      headers: token ? { authorization: "Bearer " + token } : {},
    });
  assert.equal((await request()).statusCode, 401);
  const mine = await request(a.token);
  assert.equal(mine.statusCode, 200);
  assert.equal(
    mine.json().tracks[0].download_url,
    `/api/releases/${release}/download`,
  );
  assert.ok(!mine.body.includes("private-fixture-key"));
  assert.ok(!mine.body.includes("Private core"));
  assert.equal(mine.headers["cache-control"], "no-store");
  assert.equal((await request(b.token)).json().tracks.length, 0);
  await db.query("UPDATE releases SET hidden=true WHERE id=$1", [release]);
  assert.equal((await request(a.token)).json().tracks.length, 0);
  await db.query("UPDATE releases SET hidden=false WHERE id=$1", [release]);
  await app.inject({
    method: "PUT",
    url: `/api/releases/${release}/reaction`,
    headers: { origin, authorization: "Bearer " + a.token },
    payload: { value: 0 },
  });
  assert.equal((await request(a.token)).json().tracks.length, 0);
});
