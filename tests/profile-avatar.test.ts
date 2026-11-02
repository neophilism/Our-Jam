import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalAvatar } from "../apps/api/src/profile-avatar.js";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
const fixtures = JSON.parse(
  readFileSync(new URL("./avatar-fixtures.json", import.meta.url), "utf8"),
);
test("profile images strip metadata, reject malformed or oversized pixels and bound inflation", () => {
  const plain = canonicalAvatar(fixtures.plain),
    metadata = canonicalAvatar(fixtures.metadata);
  assert.deepEqual(plain, metadata);
  assert.equal(metadata.includes(Buffer.from("secret-fixture")), false);
  for (const value of [
    fixtures.oversize,
    fixtures.badFilter,
    fixtures.bomb,
    "<svg></svg>",
    "invalid",
    fixtures.plain.slice(0, -8),
  ])
    assert.throws(() => canonicalAvatar(value));
  const corrupt = Buffer.from(fixtures.plain, "base64");
  corrupt[20] ^= 1;
  assert.throws(() => canonicalAvatar(corrupt.toString("base64")));
});
test("avatar changes are own-session, consented, revision-fenced and disappear publicly under anonymity", async (t) => {
  const db = await testDatabase(),
    origin = "http://avatars.our-jam.test";
  const app = await createApp(db, { origin, secureCookies: false });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const request = (method: any, url: string, payload?: any, cookie?: string) =>
    app.inject({
      method,
      url,
      payload,
      headers: { origin, ...(cookie ? { cookie } : {}) },
    });
  assert.equal(
    (
      await request("PUT", "/api/profile/avatar", {
        png: fixtures.plain,
        publicUseConsent: true,
        expectedRevision: 0,
      })
    ).statusCode,
    401,
  );
  const session = await request("POST", "/api/session", {}),
    cookie = "oj_guest=" + session.cookies[0].value;
  assert.equal(
    (
      await request(
        "PATCH",
        "/api/profile",
        { name: "Hidden\u202ename", anonymous: false },
        cookie,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request(
        "PATCH",
        "/api/profile",
        { name: "Fullwidth Ｍusic", anonymous: false },
        cookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await request("GET", "/api/session", undefined, cookie)).json().profile
      .name,
    "Fullwidth Music",
  );
  const body = {
    png: fixtures.metadata,
    publicUseConsent: true,
    expectedRevision: 0,
  };
  assert.equal(
    (
      await request(
        "PUT",
        "/api/profile/avatar",
        { ...body, publicUseConsent: false },
        cookie,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request(
        "PUT",
        "/api/profile/avatar",
        { ...body, participantId: "another-user" },
        cookie,
      )
    ).statusCode,
    400,
  );
  const saved = await request("PUT", "/api/profile/avatar", body, cookie);
  assert.equal(saved.statusCode, 200, saved.body);
  const profile = (
    await request("GET", "/api/session", undefined, cookie)
  ).json().profile;
  const url = "/api/avatars/" + profile.avatar_sha;
  await request(
    "PATCH",
    "/api/profile",
    { name: "Public musician", anonymous: false },
    cookie,
  );
  const publicImage = await request("GET", url);
  assert.equal(publicImage.statusCode, 200);
  assert.match(publicImage.headers["content-type"]!, /image\/png/);
  assert.equal(publicImage.headers["cache-control"], "no-store");
  assert.deepEqual(publicImage.rawPayload, canonicalAvatar(fixtures.plain));
  assert.equal(
    (await request("PUT", "/api/profile/avatar", body, cookie)).statusCode,
    409,
  );
  await request(
    "PATCH",
    "/api/profile",
    { name: "Public musician", anonymous: true },
    cookie,
  );
  assert.equal((await request("GET", url)).statusCode, 404);
  assert.equal(
    (
      await request(
        "DELETE",
        "/api/profile/avatar",
        { expectedRevision: 1 },
        cookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await request("GET", "/api/session", undefined, cookie)).json().profile
      .avatar_sha,
    null,
  );
});
