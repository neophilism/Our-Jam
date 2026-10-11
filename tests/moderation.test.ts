import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { moderate, moderationQueue } from "../apps/api/src/moderation.js";
import { eventInput } from "../packages/contracts/src/index.js";

test("artist moderation hides public content, rejects other artists and never restores author deletion", async (t) => {
  const db = await testDatabase();
  const origin = "http://our-jam.test";
  const token = "test-review-operator-credential-123456789";
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
      title: "Review rehearsal",
      artistName: "Test artist",
      slug: "review-" + randomUUID(),
      minimumRoundSeconds: 0,
      sources: [
        {
          title: "Source",
          corePrompt: "Private source prompt",
          durationSeconds: 120,
        },
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
  ).rows[0];
  const release = randomUUID();
  await db.query(
    "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds,published_at) VALUES($1,$2,$3,'Review track','https://example.test/track.mp3','https://example.test/track.mp3',60,now())",
    [release, event.id, job.id],
  );
  const request = (method: any, url: string, cookie?: string, payload?: any) =>
    app.inject({
      method,
      url,
      payload,
      headers: { origin, ...(cookie ? { cookie } : {}) },
    });
  const login = await request("POST", "/api/operator/login", undefined, {
    token,
  });
  const op = login.cookies[0].name + "=" + login.cookies[0].value;
  const guest = await request("POST", "/api/session");
  const cookie = guest.cookies[0].name + "=" + guest.cookies[0].value;
  const c = await request("POST", `/api/releases/${release}/comments`, cookie, {
    body: "Please review this comment",
  });
  assert.equal(c.statusCode, 200, c.body);
  const comment = c.json().id;
  assert.equal(
    (
      await request("POST", `/api/comments/${comment}/report`, cookie, {
        reason: "Rehearsal report",
      })
    ).statusCode,
    200,
  );
  const queue = await request(
    "GET",
    `/api/operator/events/${event.id}/moderation`,
    op,
  );
  assert.equal(queue.json().comments[0].reports[0], "Rehearsal report");
  assert.equal(
    (
      await request(
        "POST",
        `/api/operator/comments/${comment}/moderate`,
        cookie,
        { hidden: true },
      )
    ).statusCode,
    401,
  );
  await db.query(
    "INSERT INTO artists(id,name) VALUES('other-artist','Other artist')",
  );
  await assert.rejects(moderate(db, "other-artist", "comment", comment, true), {
    code: "not_found",
  });
  await assert.rejects(moderationQueue(db, "other-artist", event.id), {
    code: "not_found",
  });
  const change = (kind: string, id: string, hidden: boolean) =>
    request("POST", `/api/operator/${kind}/${id}/moderate`, op, { hidden });
  assert.equal((await change("comments", comment, true)).statusCode, 200);
  assert.equal(
    (await request("GET", `/api/releases/${release}/comments`)).json().comments
      .length,
    0,
  );
  assert.equal((await change("comments", comment, false)).statusCode, 200);
  assert.equal(
    (await request("GET", `/api/releases/${release}/comments`)).json().comments
      .length,
    1,
  );
  assert.equal((await change("releases", release, true)).statusCode, 200);
  assert.equal(
    (await request("GET", `/api/releases/${release}/comments`)).statusCode,
    404,
  );
  assert.equal(
    (await request("GET", `/api/events/${event.slug}`)).json().releases.length,
    0,
  );
  assert.equal((await change("releases", release, false)).statusCode, 200);
  assert.equal(
    (await request("GET", `/api/events/${event.slug}`)).json().releases.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM audit_log WHERE action IN ('comment.hidden','comment.restored','release.hidden','release.restored')",
      )
    ).rows[0].n,
    4,
  );
  assert.equal(
    (await request("DELETE", `/api/comments/${comment}`, cookie)).statusCode,
    200,
  );
  assert.equal((await change("comments", comment, false)).statusCode, 404);
  assert.equal(
    (await moderationQueue(db, "our-jam", event.id)).comments.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM reports WHERE comment_id=$1",
        [comment],
      )
    ).rows[0].n,
    0,
  );
});
