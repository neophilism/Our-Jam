import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import {
  exchangeIdentity,
  configuredIdentity,
} from "../apps/api/src/identity.js";
import { digest } from "../packages/domain/src/index.js";
import { createApp } from "../apps/api/src/app.js";
const claims = (sub = randomUUID()) => ({
  iss: "https://auth.example.test",
  sub,
  emailVerified: true,
  banned: false,
  name: "Signed-in fan",
  exp: Math.floor(Date.now() / 1000) + 900,
});
test("verified audience sign-in links the existing profile without changing votes or accepting email-only identity", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const participant = randomUUID(),
    token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO participants(id,name,avatar_seed) VALUES($1,'Original fan','x')",
    [participant],
  );
  await db.query(
    "INSERT INTO sessions(token_hash,participant_id,kind,expires_at) VALUES($1,$2,'guest',now()+interval '1 day')",
    [digest(token), participant],
  );
  const c = claims();
  const result = await exchangeIdentity(
    db,
    c,
    { role: "audience", linkCurrent: true },
    { guest: token },
  );
  const s = (
    await db.query("SELECT * FROM sessions WHERE token_hash=$1", [
      digest(result.token),
    ])
  ).rows[0];
  assert.equal(s.participant_id, participant);
  assert.equal(result.profileChanged, false);
  assert.equal((await db.query("SELECT * FROM participants")).rows.length, 1);
  assert.equal(
    (
      await db.query("SELECT token_hash FROM sessions WHERE token_hash=$1", [
        digest(token),
      ])
    ).rows.length,
    0,
  );
  assert.ok(new Date(s.expires_at).getTime() <= c.exp * 1000);
  await assert.rejects(
    exchangeIdentity(
      db,
      { ...claims(), emailVerified: false },
      { role: "performer", linkCurrent: true },
      {},
    ),
    (e: any) => e.code === "identity_unverified",
  );
  await assert.rejects(
    exchangeIdentity(
      db,
      { ...claims(), banned: true },
      { role: "audience", linkCurrent: true },
      {},
    ),
  );
  await assert.rejects(
    exchangeIdentity(
      db,
      { ...claims(), exp: 1 },
      { role: "audience", linkCurrent: true },
      {},
    ),
  );
});
test("role selection creates scoped performer access and cannot take another artist or linked fan identity", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const c = claims();
  const fan = await exchangeIdentity(
    db,
    c,
    { role: "audience", linkCurrent: true },
    {},
  );
  const performer = await exchangeIdentity(
    db,
    c,
    { role: "performer", linkCurrent: true },
    { guest: fan.token },
  );
  const identity = (
    await db.query("SELECT * FROM app_identities WHERE subject=$1", [c.sub])
  ).rows[0];
  assert.notEqual(identity.artist_id, "our-jam");
  assert.equal(
    (
      await db.query("SELECT artist_id FROM sessions WHERE token_hash=$1", [
        digest(performer.token),
      ])
    ).rows[0].artist_id,
    identity.artist_id,
  );
  await assert.rejects(
    exchangeIdentity(
      db,
      claims(),
      { role: "audience", linkCurrent: true },
      { guest: fan.token },
    ),
    (e: any) => e.code === "identity_link_conflict",
  );
  const again = await exchangeIdentity(
    db,
    c,
    { role: "audience", linkCurrent: true },
    {},
  );
  assert.equal(
    (
      await db.query(
        "SELECT participant_id FROM sessions WHERE token_hash=$1",
        [digest(again.token)],
      )
    ).rows[0].participant_id,
    identity.participant_id,
  );
});
test("identity exchange denies invalid tokens, admin escalation, missing Origin and fully signs out local sessions", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const c = claims(),
    origin = "http://localhost:5173";
  const app = await createApp(db, {
    origin,
    secureCookies: false,
    identity: {
      authUrl: c.iss,
      providers: ["google"],
      verify: async (token) => {
        if (token !== "fixture-valid") throw Error("invalid JWT");
        return c;
      },
    },
  });
  t.after(() => app.close());
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/identity/session",
        headers: { origin, authorization: "Bearer invalid" },
        payload: { role: "performer" },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/identity/session",
        headers: { origin, authorization: "Bearer fixture-valid" },
        payload: { role: "admin" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/identity/session",
        headers: { authorization: "Bearer fixture-valid" },
        payload: { role: "performer" },
      })
    ).statusCode,
    403,
  );
  const r = await app.inject({
    method: "POST",
    url: "/api/identity/session",
    headers: { origin, authorization: "Bearer fixture-valid" },
    payload: { role: "performer" },
  });
  assert.equal(r.statusCode, 200, r.body);
  const cookie = r.headers["set-cookie"]!.toString().split(";")[0];
  assert.equal(
    (await app.inject({ url: "/api/operator/events", headers: { cookie } }))
      .statusCode,
    200,
  );
  await app.inject({
    method: "POST",
    url: "/api/identity/logout",
    headers: { origin, cookie },
    payload: {},
  });
  assert.equal(
    (await app.inject({ url: "/api/operator/events", headers: { cookie } }))
      .statusCode,
    401,
  );
  assert.throws(() =>
    configuredIdentity({
      IDENTITY_ENABLED: "1",
      NEON_AUTH_BASE_URL: "http://unsafe.test",
    }),
  );
  assert.throws(() =>
    configuredIdentity({
      IDENTITY_ENABLED: "1",
      NEON_AUTH_BASE_URL: "https://auth.example.test",
      NEON_AUTH_JWKS_URL: "https://other.test/keys",
    }),
  );
});
