import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
const origin = "http://our-jam.test";
const credential = "only-a-test-operator-credential-123456789";
test("production API: persistent multiuser voting, isolation, conflicts, closing snapshots and releases", async (t) => {
  const db = await testDatabase();
  const app = await createApp(db, {
    origin,
    operatorToken: credential,
    secureCookies: false,
  });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  async function request(
    method: any,
    url: string,
    payload?: any,
    cookie?: string,
  ) {
    return app.inject({
      method,
      url,
      payload,
      headers: { origin, ...(cookie ? { cookie } : {}) },
    });
  }
  const signIn = await request("POST", "/api/operator/login", {
    token: credential,
  });
  assert.equal(signIn.statusCode, 200, signIn.body);
  const op = signIn.cookies[0].name + "=" + signIn.cookies[0].value;
  const slug = "test-" + randomUUID();
  const create = await request(
    "POST",
    "/api/operator/events",
    {
      title: "Album launch",
      slug,
      artistName: "Test Artist",
      minimumRoundSeconds: 0,
      sources: [
        {
          title: "First track",
          corePrompt: "PRIVATE_SIGNATURE_PROMPT",
          durationSeconds: 180,
        },
        {
          title: "Second track",
          corePrompt: "PRIVATE_SECOND",
          durationSeconds: 120,
        },
      ],
    },
    op,
  );
  assert.equal(create.statusCode, 200, create.body);
  const event = create.json();
  async function guest() {
    const r = await request("POST", "/api/session");
    const cookie = r.cookies[0].name + "=" + r.cookies[0].value;
    assert.equal(
      (await request("POST", `/api/events/${slug}/join`, {}, cookie))
        .statusCode,
      200,
    );
    return cookie;
  }
  const leaseResponse = await request(
    "POST",
    `/api/operator/events/${event.id}/playback/claim`,
    {},
    op,
  );
  assert.equal(leaseResponse.statusCode, 200, leaseResponse.body);
  const lease = leaseResponse.json();
  const a = await guest(),
    b = await guest();
  await t.test("unauthorized control and cross-site writes fail", async () => {
    assert.equal(
      (
        await request(
          "POST",
          `/api/operator/events/${event.id}/advance`,
          { commandId: randomUUID(), expectedRevision: 0 },
          a,
        )
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/session",
          headers: { origin: "https://evil.invalid" },
        })
      ).statusCode,
      403,
    );
  });
  const start = await request(
    "POST",
    `/api/operator/events/${event.id}/advance`,
    {
      commandId: randomUUID(),
      expectedRevision: 0,
      playback: { ...lease, sequence: 1 },
    },
    op,
  );
  assert.equal(start.statusCode, 200, start.body);
  const round = start.json().roundId;
  const commandId = randomUUID();
  const submission = { commandId, text: "Warm brass", expectedRevision: 0 };
  const first = await request(
    "POST",
    `/api/rounds/${round}/waves`,
    submission,
    a,
  );
  assert.equal(first.statusCode, 200, first.body);
  const wave = first.json().waveId;
  await t.test(
    "idempotent retry returns original result; changing payload under same key fails",
    async () => {
      assert.deepEqual(
        (
          await request("POST", `/api/rounds/${round}/waves`, submission, a)
        ).json(),
        first.json(),
      );
      assert.equal(
        (
          await request(
            "POST",
            `/api/rounds/${round}/waves`,
            { ...submission, text: "Other" },
            a,
          )
        ).statusCode,
        409,
      );
    },
  );
  const duplicate = await request(
    "POST",
    `/api/rounds/${round}/waves`,
    { commandId: randomUUID(), text: "WARM   brass", expectedRevision: 0 },
    b,
  );
  assert.equal(duplicate.json().waveId, wave);
  await t.test(
    "overspend is rejected atomically; concurrent tabs cannot each allocate",
    async () => {
      assert.equal(
        (
          await request(
            "PUT",
            `/api/rounds/${round}/allocations`,
            {
              commandId: randomUUID(),
              expectedRevision: 1,
              allocations: { [wave]: 6 },
            },
            a,
          )
        ).statusCode,
        400,
      );
      const attempts = await Promise.all(
        [2, 5].map((points) =>
          request(
            "PUT",
            `/api/rounds/${round}/allocations`,
            {
              commandId: randomUUID(),
              expectedRevision: 1,
              allocations: { [wave]: points },
            },
            a,
          ),
        ),
      );
      assert.deepEqual(attempts.map((r) => r.statusCode).sort(), [200, 409]);
    },
  );
  await t.test(
    "public projection omits core prompt, seed and operator-only fields",
    async () => {
      const r = await request("GET", `/api/events/${slug}`, undefined, a);
      assert.equal(r.statusCode, 200, r.body);
      assert.ok(!r.body.includes("PRIVATE_"));
      assert.equal(r.json().round.seed, undefined);
      assert.equal(r.json().queue, undefined);
      assert.equal(r.json().round.revision, 2);
      assert.equal(r.json().round.waves[0].supporters, 2);
    },
  );
  await t.test(
    "withdrawing own points does not erase another supporter",
    async () => {
      const r = await request(
        "PUT",
        `/api/rounds/${round}/allocations`,
        { commandId: randomUUID(), expectedRevision: 2, allocations: {} },
        a,
      );
      assert.equal(r.statusCode, 200, r.body);
      const snap = (
        await request("GET", `/api/events/${slug}`, undefined, a)
      ).json();
      assert.equal(snap.round.waves[0].votes, 1);
      const another = await request(
        "POST",
        `/api/rounds/${round}/waves`,
        {
          commandId: randomUUID(),
          expectedRevision: 3,
          text: "Shimmering keys",
        },
        a,
      );
      assert.equal(another.statusCode, 400);
    },
  );
  const closeCommand = {
    commandId: randomUUID(),
    expectedRevision: 1,
    playback: { ...lease, sequence: 2 },
  };
  const end = await request(
    "POST",
    `/api/operator/events/${event.id}/advance`,
    closeCommand,
    op,
  );
  assert.equal(end.statusCode, 200, end.body);
  await t.test(
    "one immutable job per boundary and late votes rejected",
    async () => {
      assert.deepEqual(
        (
          await request(
            "POST",
            `/api/operator/events/${event.id}/advance`,
            closeCommand,
            op,
          )
        ).json(),
        end.json(),
      );
      assert.equal(
        (
          await request(
            "PUT",
            `/api/rounds/${round}/allocations`,
            {
              commandId: randomUUID(),
              expectedRevision: 3,
              allocations: { [wave]: 5 },
            },
            a,
          )
        ).statusCode,
        409,
      );
      const jobs = (
        await db.query("SELECT * FROM generation_jobs WHERE round_id=$1", [
          round,
        ])
      ).rows;
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].state, "blocked");
      assert.equal(jobs[0].reason, "provider_not_configured");
      assert.ok(jobs[0].prompt.startsWith("PRIVATE_SIGNATURE_PROMPT"));
      assert.equal(jobs[0].snapshot.selected[0].votes, 1);
    },
  );
  await t.test(
    "cross-round allocation cannot spend on an old wave",
    async () => {
      const r = await request(
        "PUT",
        `/api/rounds/${end.json().roundId}/allocations`,
        {
          commandId: randomUUID(),
          expectedRevision: 0,
          allocations: { [wave]: 5 },
        },
        b,
      );
      assert.equal(r.statusCode, 400);
    },
  );
  await t.test(
    "artist supplied asset is distinct from provider generation and publishes at boundary",
    async () => {
      const job = (
        await db.query("SELECT id FROM generation_jobs WHERE round_id=$1", [
          round,
        ])
      ).rows[0];
      const r = await request(
        "POST",
        `/api/operator/jobs/${job.id}/asset`,
        {
          title: "Crowd Brass",
          audioUrl: "https://example.com/track.mp3",
          downloadUrl: "https://example.com/download.mp3",
          durationSeconds: 120,
          rightsConfirmed: true,
        },
        op,
      );
      assert.equal(r.statusCode, 200, r.body);
      const releaseId = r.json().id;
      assert.equal(
        (await request("GET", `/api/events/${slug}`)).json().releases.length,
        0,
      );
      const boundary = await request(
        "POST",
        `/api/operator/events/${event.id}/advance`,
        {
          commandId: randomUUID(),
          expectedRevision: 2,
          playback: { ...lease, sequence: 3 },
        },
        op,
      );
      assert.equal(boundary.statusCode, 200, boundary.body);
      assert.equal(
        (await request("GET", `/api/events/${slug}`)).json().releases.length,
        1,
      );
      for (const value of [1, -1, 1])
        assert.equal(
          (
            await request(
              "PUT",
              `/api/releases/${releaseId}/reaction`,
              { value },
              b,
            )
          ).statusCode,
          200,
        );
      const play = await request(
        "POST",
        `/api/releases/${releaseId}/listen`,
        {
          intervals: [
            [0, 40],
            [10, 70],
          ],
        },
        b,
      );
      assert.equal(play.json().seconds, 70);
      assert.equal(play.json().feedbackEligible, true);
      const publicR = (await request("GET", `/api/events/${slug}`)).json()
        .releases[0];
      assert.equal(publicR.likes, 1);
      assert.equal(publicR.plays, 1);
      assert.equal(publicR.dislikes, undefined);
      const c = await request(
        "POST",
        `/api/releases/${releaseId}/comments`,
        { body: "Bring this one into the show!" },
        b,
      );
      assert.equal(c.statusCode, 200, c.body);
      await request("DELETE", `/api/comments/${c.json().id}`, {}, a);
      assert.equal(
        (await request("GET", `/api/releases/${releaseId}/comments`)).json()
          .comments.length,
        1,
      );
      await request("DELETE", `/api/comments/${c.json().id}`, {}, b);
      assert.equal(
        (await request("GET", `/api/releases/${releaseId}/comments`)).json()
          .comments.length,
        0,
      );
    },
  );
});
