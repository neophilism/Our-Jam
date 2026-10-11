import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { digest } from "../packages/domain/src/index.js";
import {
  createRecoveryKey,
  followArtist,
  followingFeed,
} from "../apps/api/src/accounts.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { claimPlayback } from "../apps/api/src/playback.js";

test("private recovery preserves a profile, revokes earlier sessions and crosses web/native without performer access", async (t) => {
  const db = await testDatabase(),
    origin = "https://our-jam.test";
  const app = await createApp(db, { origin, secureCookies: true });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const request = (
    method: any,
    url: string,
    payload?: any,
    cookie?: string,
    bearer?: string,
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(bearer ? { authorization: "Bearer " + bearer } : {}),
      },
    });
  const guest = await request("POST", "/api/session", {}),
    participant = guest.json().participantId;
  const original = "oj_guest=" + guest.cookies[0].value;
  await request(
    "PATCH",
    "/api/profile",
    { name: "Returning fan", anonymous: false },
    original,
  );
  const created = await request(
    "POST",
    "/api/account/recovery-key",
    {},
    original,
  );
  assert.equal(created.statusCode, 200);
  assert.equal(created.headers["cache-control"], "no-store");
  const key = created.json().key;
  assert.match(key, /^ojr_[a-f0-9]{64}$/);
  const stored = (
    await db.query(
      "SELECT * FROM participant_recovery WHERE participant_id=$1",
      [participant],
    )
  ).rows[0];
  assert.equal(stored.key_hash, digest(key));
  assert.ok(!JSON.stringify(stored).includes(key));
  const status = await request("GET", "/api/account", undefined, original);
  assert.equal(status.json().recoveryEnabled, true);
  assert.ok(!status.body.includes(stored.key_hash));
  assert.equal(
    (await request("POST", "/api/account/recovery-key", {})).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/account/recover",
        payload: { key },
        headers: { origin: "https://other.test" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await request("POST", "/api/account/recover", {
        key: "ojr_" + "0".repeat(64),
      })
    ).statusCode,
    401,
  );
  const recovered = await request("POST", "/api/account/recover", { key });
  assert.equal(recovered.statusCode, 200, recovered.body);
  assert.deepEqual(recovered.json(), { participantId: participant });
  assert.equal(recovered.cookies[0].httpOnly, true);
  assert.equal(recovered.cookies[0].secure, true);
  const web = "oj_guest=" + recovered.cookies[0].value;
  assert.equal(
    (await request("GET", "/api/session", undefined, web)).json().profile.name,
    "Returning fan",
  );
  assert.equal(
    (
      await request(
        "PATCH",
        "/api/profile",
        { name: "Stale", anonymous: true },
        original,
      )
    ).statusCode,
    401,
  );
  await assert.rejects(
    createRecoveryKey(db, participant, digest(guest.cookies[0].value)),
    { code: "sign_in_required" },
  );
  const native = await request("POST", "/api/account/recover", {
    key,
    channel: "mobile",
  });
  assert.equal(native.statusCode, 200);
  assert.equal(native.cookies.length, 0);
  assert.match(native.json().token, /^ojm_[a-f0-9]{64}$/);
  assert.equal(
    (
      await request(
        "GET",
        "/api/session",
        undefined,
        undefined,
        native.json().token,
      )
    ).json().profile.id,
    participant,
  );
  assert.equal(
    (
      await request(
        "GET",
        "/api/operator/events",
        undefined,
        undefined,
        native.json().token,
      )
    ).statusCode,
    401,
  );
  // Retry after a lost response uses the same saved key, rather than consuming it.
  const retry = await request("POST", "/api/account/recover", {
    key,
    channel: "mobile",
  });
  assert.equal(retry.statusCode, 200);
  assert.equal(
    (
      await request(
        "GET",
        "/api/following",
        undefined,
        undefined,
        native.json().token,
      )
    ).statusCode,
    401,
  );
  const rotated = await request(
    "POST",
    "/api/account/recovery-key",
    {},
    undefined,
    retry.json().token,
  );
  assert.notEqual(rotated.json().key, key);
  assert.equal(
    (await request("POST", "/api/account/recover", { key })).statusCode,
    401,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/account/recovery-key",
        undefined,
        undefined,
        retry.json().token,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await request("POST", "/api/account/recover", { key: rotated.json().key }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/account/session",
        undefined,
        undefined,
        retry.json().token,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await request(
        "GET",
        "/api/following",
        undefined,
        undefined,
        retry.json().token,
      )
    ).statusCode,
    401,
  );
});

test("recovery is address-throttled even with invented session credentials", async (t) => {
  const db = await testDatabase(),
    origin = "https://our-jam.test";
  const app = await createApp(db, { origin, secureCookies: true });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  for (let i = 0; i < 7; i++) {
    const r = await app.inject({
      method: "POST",
      url: "/api/account/recover",
      headers: {
        origin,
        cookie: "oj_guest=" + i.toString(16).padStart(64, "0"),
      },
      payload: { key: "ojr_" + "0".repeat(64) },
    });
    assert.equal(r.statusCode, i === 6 ? 429 : 401);
  }
});

test("following is idempotent and private; only published, visible music enters the recoverable feed", async (t) => {
  const db = await testDatabase(),
    origin = "https://our-jam.test";
  const app = await createApp(db, { origin, secureCookies: true });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const request = (method: any, url: string, payload?: any, token?: string) =>
    app.inject({
      method,
      url,
      payload,
      headers: {
        origin,
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
    });
  const a = (await request("POST", "/api/mobile/session", {})).json(),
    b = (await request("POST", "/api/mobile/session", {})).json();
  const artist = "follow-" + randomUUID();
  await db.query("INSERT INTO artists(id,name) VALUES($1,'Follow Artist')", [
    artist,
  ]);
  const url = `/api/artists/${artist}/follow`;
  assert.equal(
    (await request("PUT", url, { following: true })).statusCode,
    401,
  );
  const changes = await Promise.all(
    Array.from({ length: 4 }, () =>
      request("PUT", url, { following: true }, a.token),
    ),
  );
  changes.forEach((r) => assert.equal(r.statusCode, 200, r.body));
  assert.deepEqual((await request("GET", url, undefined, a.token)).json(), {
    followers: 1,
    following: true,
  });
  assert.deepEqual((await request("GET", url, undefined, b.token)).json(), {
    followers: 1,
    following: false,
  });
  assert.equal(
    (await request("GET", "/api/following", undefined, a.token)).json().artists
      .length,
    1,
  );
  assert.equal(
    (await request("GET", "/api/following", undefined, b.token)).json().artists
      .length,
    0,
  );
  const event = await createEvent(
    db,
    artist,
    eventInput.parse({
      slug: "feed-" + randomUUID(),
      title: "Public show",
      artistName: "Follow Artist",
      sources: [
        {
          title: "Source",
          corePrompt: "PRIVATE_FEED_CORE",
          durationSeconds: 60,
        },
      ],
    }),
  );
  const lease = await claimPlayback(db, artist, event.id);
  await advance(db, artist, event.id, randomUUID(), 0, {
    ...lease,
    sequence: 1,
  });
  await advance(db, artist, event.id, randomUUID(), 1, {
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
    "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds,asset_key) VALUES($1,$2,$3,'New crowd release','https://media.test/a','https://media.test/a',60,'PRIVATE_FEED_ASSET')",
    [release, event.id, job.id],
  );
  assert.equal((await followingFeed(db, a.participantId)).tracks.length, 0);
  await db.query("UPDATE releases SET published_at=now() WHERE id=$1", [
    release,
  ]);
  const feed = await request("GET", "/api/following", undefined, a.token);
  assert.equal(feed.json().tracks[0].id, release);
  assert.ok(!feed.body.includes("PRIVATE_FEED"));
  assert.ok(!feed.body.includes(a.participantId));
  await db.query(
    "INSERT INTO reactions(release_id,participant_id,value) VALUES($1,$2,1)",
    [release, a.participantId],
  );
  const key = (
    await request("POST", "/api/account/recovery-key", {}, a.token)
  ).json().key;
  const recovered = (
    await request("POST", "/api/account/recover", { key, channel: "mobile" })
  ).json();
  assert.equal(recovered.participantId, a.participantId);
  assert.equal(
    (await request("GET", "/api/following", undefined, recovered.token)).json()
      .artists[0].id,
    artist,
  );
  assert.equal(
    (await request("GET", "/api/library", undefined, recovered.token)).json()
      .tracks[0].id,
    release,
  );
  await db.query("UPDATE releases SET hidden=true WHERE id=$1", [release]);
  assert.equal((await followingFeed(db, a.participantId)).tracks.length, 0);
  await followArtist(db, a.participantId, artist, false);
  assert.equal((await followingFeed(db, a.participantId)).artists.length, 0);
  assert.equal((await request("GET", url)).json().followers, 0);
});
