import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
const origin = "http://127.0.0.1:4173",
  proof = "a".repeat(64),
  challenge = createHash("sha256").update(proof).digest("base64url");
async function fixture(t: any) {
  const db = await testDatabase();
  t.after(() => db.close());
  const app = await createApp(db, {
    origin,
    secureCookies: false,
    identity: {
      authUrl: "https://auth.example.test/neondb/auth",
      providers: ["google"],
      verify: async () => ({
        iss: "https://auth.example.test",
        sub: "native-account",
        emailVerified: true,
        name: "Returning fan",
        exp: Math.floor(Date.now() / 1000) + 600,
        iat: Math.floor(Date.now() / 1000),
      }),
    },
  });
  t.after(() => app.close());
  const post = (url: string, payload: any, headers: any = {}) =>
    app.inject({
      method: "POST",
      url,
      payload,
      headers: { origin, ...headers },
    });
  const mobile = (await post("/api/mobile/session", {})).json().token;
  const identity = await post(
    "/api/identity/session",
    { role: "audience" },
    { authorization: "Bearer verified-fixture" },
  );
  const cookie = identity.headers["set-cookie"]!.toString().split(";")[0];
  const started = (
    await post(
      "/api/identity/native/start",
      { challenge },
      { authorization: "Bearer " + mobile },
    )
  ).json();
  return { db, app, post, mobile, cookie, started };
}
test("native account handoff requires the original device and PKCE, consumes once and grants only audience access", async (t) => {
  const f = await fixture(t);
  assert.equal(new URL(f.started.signInUrl).origin, origin);
  assert.equal(
    new URL(f.started.signInUrl).searchParams.get("role"),
    "audience",
  );
  assert.equal(f.started.signInUrl.includes(f.mobile), false);
  const approval = await f.post(
    "/api/identity/native/approve",
    { requestId: f.started.requestId },
    { cookie: f.cookie },
  );
  assert.equal(approval.statusCode, 200);
  const callback = new URL(approval.json().callback),
    code = callback.searchParams.get("code")!;
  assert.equal(callback.protocol, "com.neophilism.ourjam:");
  assert.equal(callback.hostname, "signin");
  assert.equal(callback.searchParams.has("token"), false);
  const input = { requestId: f.started.requestId, code, verifier: proof };
  const other = (await f.post("/api/mobile/session", {})).json().token;
  for (const [payload, token] of [
    [{ ...input, verifier: "b".repeat(64) }, f.mobile],
    [{ ...input, code: "0".repeat(64) }, f.mobile],
    [input, other],
  ] as const) {
    assert.equal(
      (
        await f.post("/api/identity/native/redeem", payload, {
          authorization: "Bearer " + token,
        })
      ).statusCode,
      409,
    );
  }
  const results = await Promise.all([
    f.post("/api/identity/native/redeem", input, {
      authorization: "Bearer " + f.mobile,
    }),
    f.post("/api/identity/native/redeem", input, {
      authorization: "Bearer " + f.mobile,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  const token = results.find((r) => r.statusCode === 200)!.json().token;
  assert.match(token, /^ojm_[a-f0-9]{64}$/);
  const session = await f.app.inject({
    url: "/api/session",
    headers: { authorization: "Bearer " + token },
  });
  assert.equal(session.statusCode, 200);
  const own = (
    await f.db.query(
      "SELECT participant_id FROM app_identities WHERE subject='native-account'",
    )
  ).rows[0];
  const row = (
    await f.db.query("SELECT * FROM sessions WHERE token_hash=$1", [
      createHash("sha256").update(token).digest("hex"),
    ])
  ).rows[0];
  assert.equal(row.participant_id, own.participant_id);
  assert.equal(row.kind, "guest");
  assert.equal(row.artist_id, null);
  assert.equal(
    (
      await f.app.inject({
        url: "/api/operator/events",
        headers: { authorization: "Bearer " + token },
      })
    ).statusCode,
    401,
  );
  // Keychain must save the replacement before the app revokes its old guest access.
  assert.equal(
    (
      await f.app.inject({
        url: "/api/session",
        headers: { authorization: "Bearer " + f.mobile },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await f.post(
        "/api/identity/native/approve",
        { requestId: f.started.requestId },
        { cookie: f.cookie },
      )
    ).statusCode,
    409,
  );
  const revoke = await f.app.inject({
    method: "DELETE",
    url: "/api/mobile/session",
    headers: { origin, authorization: "Bearer " + token },
  });
  assert.equal(revoke.statusCode, 200);
  const signedOut = await f.app.inject({
    url: "/api/session",
    headers: { authorization: "Bearer " + token },
  });
  assert.equal(signedOut.json().profile, null);
});
test("native handoff rejects unverified browser sessions, changed origins, redirect injection and expired requests", async (t) => {
  const f = await fixture(t),
    requestId = f.started.requestId;
  assert.equal(
    (
      await f.post(
        "/api/identity/native/start",
        { challenge, redirectUri: "https://evil.test" },
        { authorization: "Bearer " + f.mobile },
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (await f.post("/api/identity/native/start", { challenge })).statusCode,
    401,
  );
  assert.equal(
    (
      await f.post(
        "/api/identity/native/approve",
        { requestId },
        { authorization: "Bearer " + f.mobile },
      )
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await f.post(
        "/api/identity/native/approve",
        { requestId },
        { cookie: f.cookie, origin: "https://evil.test" },
      )
    ).statusCode,
    403,
  );
  await f.db.query(
    "UPDATE native_identity_handoffs SET expires_at=now()-interval '1 second' WHERE id=$1",
    [requestId],
  );
  assert.equal(
    (
      await f.post(
        "/api/identity/native/approve",
        { requestId },
        { cookie: f.cookie },
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await f.post(
        "/api/identity/native/redeem",
        { requestId, code: "0".repeat(64), verifier: proof },
        { authorization: "Bearer " + f.mobile },
      )
    ).statusCode,
    409,
  );
});
