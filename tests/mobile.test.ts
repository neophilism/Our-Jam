import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";
import { digest } from "../packages/domain/src/index.js";
import { randomUUID } from "node:crypto";
import { createEvent, advance } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";

test("mobile credentials persist as hashes, preserve Origin and cannot authorize artist actions", async (t) => {
  const db = await testDatabase();
  const origin = "https://our-jam.test";
  const app = await createApp(db, { origin, secureCookies: true });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const request = (method: any, url: string, token?: string, payload?: any) =>
    app.inject({
      method,
      url,
      payload,
      headers: {
        origin,
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
    });
  const created = await request("POST", "/api/mobile/session");
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.cookies.length, 0);
  assert.equal(created.headers["cache-control"], "no-store");
  const { token, participantId } = created.json();
  assert.match(token, /^ojm_[a-f0-9]{64}$/);
  const stored = (
    await db.query("SELECT * FROM sessions WHERE participant_id=$1", [
      participantId,
    ])
  ).rows[0];
  assert.equal(stored.token_hash, digest(token));
  assert.equal(stored.kind, "guest");
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.deepEqual(
    (await request("POST", "/api/mobile/session", token)).json(),
    created.json(),
  );
  const profile = await request("PATCH", "/api/profile", token, {
    name: "Native listener",
    anonymous: false,
  });
  assert.equal(profile.statusCode, 200, profile.body);
  const session = (await request("GET", "/api/session", token)).json();
  assert.equal(session.profile.name, "Native listener");
  assert.equal(session.operator, false);
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Native rehearsal",
      artistName: "Artist",
      slug: "native-" + randomUUID(),
      minimumRoundSeconds: 0,
      sources: [
        {
          title: "Source",
          corePrompt: "PRIVATE_NATIVE_CORE",
          durationSeconds: 120,
        },
      ],
    }),
  );
  const lease = await claimPlayback(db, "our-jam", event.id);
  const round = await advance(db, "our-jam", event.id, randomUUID(), 0, {
    ...lease,
    sequence: 1,
  });
  assert.equal(
    (await request("POST", `/api/events/${event.slug}/join`, token, {}))
      .statusCode,
    200,
  );
  const contribution = await request(
    "POST",
    `/api/rounds/${round.roundId}/waves`,
    token,
    { commandId: randomUUID(), expectedRevision: 0, text: "Warm cello" },
  );
  assert.equal(contribution.statusCode, 200, contribution.body);
  const waveId = contribution.json().waveId;
  const snapshot = await request("GET", `/api/events/${event.slug}`, token);
  assert.equal(snapshot.json().round.waves[0].mine, 1);
  assert.ok(!snapshot.body.includes("PRIVATE_NATIVE_CORE"));
  const browser = await request("POST", "/api/session");
  const cookie = browser.cookies[0].name + "=" + browser.cookies[0].value;
  const webRequest = (url: string, method: any, payload: any) =>
    app.inject({ method, url, payload, headers: { origin, cookie } });
  assert.equal(
    (await webRequest(`/api/events/${event.slug}/join`, "POST", {})).statusCode,
    200,
  );
  assert.equal(
    (
      await webRequest(`/api/rounds/${round.roundId}/allocations`, "PUT", {
        commandId: randomUUID(),
        expectedRevision: 0,
        allocations: { [waveId]: 5 },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await request("GET", `/api/events/${event.slug}`, token)).json().round
      .waves[0].votes,
    6,
  );
  assert.equal(
    (
      await request("PUT", `/api/rounds/${round.roundId}/allocations`, token, {
        commandId: randomUUID(),
        expectedRevision: 1,
        allocations: { [waveId]: 6 },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await request("POST", "/api/operator/events", token, {})).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: "/api/profile",
        headers: {
          origin: "https://evil.test",
          authorization: "Bearer " + token,
        },
        payload: { name: "Wrong origin" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await request("PATCH", "/api/profile", "unrecognized", {
        name: "Invalid",
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await request("POST", "/api/mobile/session", "unrecognized")).statusCode,
    401,
  );
  assert.equal(
    (await request("DELETE", "/api/mobile/session", token)).statusCode,
    200,
  );
  assert.equal(
    (await request("PATCH", "/api/profile", token, { name: "Revoked" }))
      .statusCode,
    401,
  );
  assert.equal(
    (await request("POST", "/api/mobile/session", token)).statusCode,
    401,
  );
});
