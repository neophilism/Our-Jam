import { createEvent, advance, submitWave } from "../apps/api/src/service.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { claimPlayback } from "../apps/api/src/playback.js";
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
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Identity preservation",
      artistName: "Fixture",
      slug: "identity-" + randomUUID(),
      minimumRoundSeconds: 0,
      sources: [{ title: "Song", corePrompt: "Private", durationSeconds: 180 }],
    }),
  );
  await db.query(
    "INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",
    [event.id, participant],
  );
  const lease = await claimPlayback(db, "our-jam", event.id);
  const opened = await advance(db, "our-jam", event.id, randomUUID(), 0, {
    ...lease,
    sequence: 1,
  });
  const wave = await submitWave(
    db,
    { participantId: participant },
    opened.roundId!,
    { commandId: randomUUID(), expectedRevision: 0, text: "Warm piano" },
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
  const allocation = (
    await db.query(
      "SELECT * FROM allocations WHERE participant_id=$1 AND wave_id=$2",
      [participant, wave.waveId],
    )
  ).rows[0];
  assert.equal(allocation.points, 1);
  assert.equal(
    (
      await db.query(
        "SELECT * FROM event_members WHERE event_id=$1 AND participant_id=$2",
        [event.id, participant],
      )
    ).rows.length,
    1,
  );
  assert.equal((await db.query("SELECT * FROM participants")).rows.length, 1);
  const previous = (
    await db.query("SELECT * FROM sessions WHERE token_hash=$1", [
      digest(token),
    ])
  ).rows[0];
  assert.equal(previous.identity_family, s.identity_family);
  assert.ok(new Date(previous.expires_at).getTime() <= Date.now() + 31000);
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

test("managed identity verifier checks signature, exact branch issuer/audience, algorithm and expiry", async (t) => {
  const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "fixture-key",
    alg: "EdDSA",
    use: "sig",
  };
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  const config = configuredIdentity({
    IDENTITY_ENABLED: "1",
    NEON_AUTH_BASE_URL: "https://auth.example.test/neondb/auth",
  })!;
  const signed = async (
    issuer = "https://auth.example.test",
    audience = "https://auth.example.test",
    exp = "15m",
    key = privateKey,
  ) =>
    new SignJWT({ emailVerified: true, banned: false })
      .setProtectedHeader({ alg: "EdDSA", kid: "fixture-key" })
      .setSubject("verified-subject")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(key);
  assert.equal((await config.verify(await signed())).sub, "verified-subject");
  await assert.rejects(
    config.verify(await signed("https://another-branch.example.test")),
  );
  await assert.rejects(
    config.verify(await signed(undefined, "wrong-audience")),
  );
  await assert.rejects(
    config.verify(await signed(undefined, undefined, "-1m")),
  );
  const other = await generateKeyPair("EdDSA");
  await assert.rejects(
    config.verify(
      await signed(undefined, undefined, undefined, other.privateKey),
    ),
  );
  await assert.rejects(config.verify("not-a-jwt"));
});

test("renewal permits in-flight cookies briefly and sign-out revokes that browser family without revoking another device", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  const c = claims(),
    origin = "http://localhost:5173";
  const app = await createApp(db, {
    origin,
    secureCookies: false,
    identity: { authUrl: c.iss, providers: ["google"], verify: async () => c },
  });
  t.after(() => app.close());
  const exchange = async (cookie?: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/api/identity/session",
      headers: {
        origin,
        authorization: "Bearer fixture",
        ...(cookie ? { cookie } : {}),
      },
      payload: { role: "performer" },
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.headers["set-cookie"]!.toString().split(";")[0];
  };
  const first = await exchange(),
    renewed = await exchange(first),
    anotherDevice = await exchange();
  for (const cookie of [first, renewed, anotherDevice])
    assert.equal(
      (await app.inject({ url: "/api/operator/events", headers: { cookie } }))
        .statusCode,
      200,
    );
  await app.inject({
    method: "POST",
    url: "/api/identity/logout",
    headers: { origin, cookie: renewed },
    payload: {},
  });
  for (const cookie of [first, renewed])
    assert.equal(
      (await app.inject({ url: "/api/operator/events", headers: { cookie } }))
        .statusCode,
      401,
    );
  assert.equal(
    (
      await app.inject({
        url: "/api/operator/events",
        headers: { cookie: anotherDevice },
      })
    ).statusCode,
    200,
  );
});
