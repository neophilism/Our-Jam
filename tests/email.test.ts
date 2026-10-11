import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Webhook } from "svix";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";
import {
  emailHash,
  unseal,
  seal,
  configuredEmail,
  resendSender,
  type Mail,
  type EmailConfig,
} from "../apps/api/src/email-config.js";
import {
  subscribe,
  verifyEmail,
  unsubscribeEmail,
  fanoutEmail,
  emailTick,
  emailWebhook,
  subscriptionStatus,
} from "../apps/api/src/email.js";

async function fixture(t: any) {
  const db = await testDatabase(),
    sent: { mail: Mail; key: string }[] = [];
  const config: EmailConfig = {
    origin: "https://our-jam.test",
    from: "show@our-jam.test",
    key: Buffer.alloc(32, 7),
    webhookSecret: "whsec_" + Buffer.alloc(32, 9).toString("base64"),
    maxPerDay: 100000,
    send: async (mail, key) => {
      sent.push({ mail, key });
      return randomUUID();
    },
  };
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Email rehearsal",
      artistName: "Artist",
      slug: "email-" + randomUUID(),
      minimumRoundSeconds: 0,
      sources: [
        {
          title: "Source",
          corePrompt: "Private signature",
          durationSeconds: 60,
        },
      ],
    }),
  );
  const participant = randomUUID();
  await db.query(
    "INSERT INTO participants(id,avatar_seed) VALUES($1,'fixture')",
    [participant],
  );
  await db.query(
    "INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",
    [event.id, participant],
  );
  await db.query(
    "INSERT INTO email_release_fanout(release_id) SELECT id FROM releases WHERE published_at IS NOT NULL ON CONFLICT DO NOTHING",
  );
  const reset = async () => {
    await db.query(
      "UPDATE email_dispatch_control SET next_send_at=now()-interval '1 second'",
    );
    await db.query(
      "UPDATE email_jobs SET next_attempt_at=now()-interval '1 second' WHERE event_id=$1",
      [event.id],
    );
  };
  t.after(async () => {
    await db.query(
      "UPDATE email_jobs SET state='cancelled',payload_ciphertext=NULL WHERE event_id=$1 AND state IN ('pending','sending')",
      [event.id],
    );
    await db.close();
  });
  const jobs = async () =>
    (
      await db.query(
        "SELECT * FROM email_jobs WHERE event_id=$1 ORDER BY created_at,id",
        [event.id],
      )
    ).rows;
  return { db, event, participant, config, sent, reset, jobs };
}
const token = (mail: Mail, kind: string) =>
  new RegExp(`/email/${kind}#([a-f0-9]{64})`).exec(mail.text)![1];

test("verified event emails encrypt contacts, fan out once after publication and honor unsubscribe", async (t) => {
  const f = await fixture(t),
    { db, event, participant, config, sent } = f;
  const input = { email: "listener@example.test", consent: true as const };
  await subscribe(db, config, event.id, participant, input);
  const rows = await f.jobs();
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes(input.email));
  const stored = (
    await db.query("SELECT * FROM email_subscriptions WHERE event_id=$1", [
      event.id,
    ])
  ).rows[0];
  assert.ok(!JSON.stringify(stored).includes(input.email));
  assert.throws(() =>
    unseal(config, stored.contact_ciphertext, "contact:wrong"),
  );
  await subscribe(db, config, event.id, participant, input);
  assert.equal(
    (await f.jobs()).length,
    1,
    "verification requests are address-throttled",
  );
  await f.reset();
  await emailTick(db, config);
  assert.equal(sent.length, 1);
  const confirmation = token(sent[0].mail, "verify"),
    unsubscribe = token(sent[0].mail, "unsubscribe");
  assert.ok(!JSON.stringify(stored).includes(confirmation));
  await verifyEmail(db, confirmation);
  await assert.rejects(verifyEmail(db, confirmation), {
    code: "invalid_confirmation",
  });
  assert.equal(
    (await subscriptionStatus(db, event.id, participant)).state,
    "verified",
  );
  await subscribe(db, config, event.id, participant, input);
  assert.equal((await f.jobs()).length, 1);
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
    "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds) VALUES($1,$2,$3,'A crowd track','https://media.test/track','https://media.test/track',60)",
    [release, event.id, job.id],
  );
  await fanoutEmail(db, config);
  assert.equal(
    (await f.jobs()).length,
    1,
    "unpublished releases cannot notify",
  );
  await db.query(
    "UPDATE releases SET published_at=clock_timestamp() WHERE id=$1",
    [release],
  );
  await Promise.all([fanoutEmail(db, config), fanoutEmail(db, config)]);
  assert.equal((await f.jobs()).length, 2);
  const releaseJob = (await f.jobs()).find((j) => j.kind === "release")!;
  assert.ok(
    unseal<Mail>(
      config,
      releaseJob.payload_ciphertext,
      "job:" + releaseJob.id,
    ).text.includes(`?track=${release}`),
  );
  await unsubscribeEmail(db, { token: unsubscribe });
  await f.reset();
  await emailTick(db, config);
  assert.equal(sent.length, 1, "queued release suppressed after unsubscribe");
  assert.equal(
    (await subscriptionStatus(db, event.id, participant)).state,
    "unsubscribed",
  );
  const cleared = (
    await db.query(
      "SELECT contact_ciphertext FROM email_subscriptions WHERE id=$1",
      [stored.id],
    )
  ).rows[0];
  assert.equal(cleared.contact_ciphertext, null);
  assert.ok((await f.jobs()).every((j) => j.payload_ciphertext === null));
  await unsubscribeEmail(db, { token: unsubscribe });
});

test("email retries use identical payload and idempotency key, stop before key expiry and reserve daily capacity", async (t) => {
  const f = await fixture(t),
    { db, event, participant, config } = f;
  await subscribe(db, config, event.id, participant, {
    email: "retry@example.test",
    consent: true,
  });
  const calls: { mail: Mail; key: string }[] = [];
  config.send = async (mail, key) => {
    calls.push({ mail, key });
    if (calls.length === 1) throw new Error("ambiguous network result");
    return randomUUID();
  };
  await f.reset();
  await emailTick(db, config);
  assert.equal((await f.jobs())[0].state, "pending");
  await db.query(
    "UPDATE events SET title='Changed title after dispatch' WHERE id=$1",
    [event.id],
  );
  await f.reset();
  await emailTick(db, config);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal((await f.jobs())[0].state, "accepted");
  // Rehearse a process crash whose provider acceptance never reached our DB.
  const job = (await f.jobs())[0];
  await db.query(
    "UPDATE email_jobs SET state='sending',lease_until=now()-interval '1 minute',first_attempt_at=now()-interval '25 hours',payload_ciphertext=$1 WHERE id=$2",
    [seal(config, calls[0].mail, "job:" + job.id), job.id],
  );
  await f.reset();
  await emailTick(db, config);
  assert.equal((await f.jobs())[0].state, "unknown");
  assert.equal(calls.length, 2, "expired provider key must never be replayed");
  // A newly reserved message cannot exceed the configured rolling-day cap.
  const other = randomUUID();
  await db.query(
    "INSERT INTO participants(id,avatar_seed) VALUES($1,'fixture')",
    [other],
  );
  await db.query(
    "INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",
    [event.id, other],
  );
  await subscribe(db, config, event.id, other, {
    email: "budget@example.test",
    consent: true,
  });
  await db.query("UPDATE email_jobs SET first_attempt_at=now() WHERE id=$1", [
    job.id,
  ]);
  config.maxPerDay = 1;
  await f.reset();
  await emailTick(db, config);
  assert.equal(calls.length, 2);
  assert.equal(
    (await f.jobs()).find(
      (j) => j.email_hash === emailHash(config, "budget@example.test"),
    )!.first_attempt_at,
    null,
  );
});

test("email confirmation and signed bounce hooks enforce origin, single-use expiry, ownership and suppression", async (t) => {
  const f = await fixture(t),
    { db, event, participant, config } = f;
  await subscribe(db, config, event.id, participant, {
    email: "bounce@example.test",
    consent: true,
  });
  const job = (await f.jobs())[0],
    mail = unseal<Mail>(config, job.payload_ciphertext, "job:" + job.id);
  await db.query(
    "UPDATE email_subscriptions SET verify_expires_at=now()-interval '1 second' WHERE event_id=$1",
    [event.id],
  );
  await assert.rejects(verifyEmail(db, token(mail, "verify")), {
    code: "invalid_confirmation",
  });
  const app = await createApp(db, {
    origin: config.origin,
    secureCookies: false,
    email: config,
  });
  t.after(() => app.close());
  const denied = await app.inject({
    method: "POST",
    url: "/api/email/verify",
    headers: { origin: "https://evil.test" },
    payload: { token: token(mail, "verify") },
  });
  assert.equal(denied.statusCode, 403);
  const body = JSON.stringify({
    type: "email.bounced",
    data: { email_id: randomUUID(), to: ["bounce@example.test"] },
  });
  const messageId = "msg_" + randomUUID(),
    now = new Date();
  const headers = {
    "svix-id": messageId,
    "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
    "svix-signature": new Webhook(config.webhookSecret).sign(
      messageId,
      now,
      body,
    ),
    "content-type": "application/json",
  };
  const spoofed = await app.inject({
    method: "POST",
    url: "/api/webhooks/email",
    headers: { ...headers, "svix-signature": "v1,forged" },
    payload: body,
  });
  assert.equal(spoofed.statusCode, 400);
  const valid = await app.inject({
    method: "POST",
    url: "/api/webhooks/email",
    headers,
    payload: body,
  });
  assert.equal(valid.statusCode, 200, valid.body);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/webhooks/email",
        headers,
        payload: body,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await subscriptionStatus(db, event.id, participant)).state,
    "suppressed",
  );
  assert.equal((await f.jobs())[0].payload_ciphertext, null);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM email_webhook_receipts WHERE id=$1",
        [messageId],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/api/operator/events/${event.id}/email`,
      })
    ).statusCode,
    401,
  );
  const state = await app.inject({
    method: "GET",
    url: `/api/events/${event.id}/subscription`,
  });
  assert.equal(
    state.json().state,
    "none",
    "another visitor cannot see the subscription",
  );
  await subscribe(db, config, event.id, participant, {
    email: "bounce@example.test",
    consent: true,
  });
  assert.equal((await f.jobs()).length, 1);
  const lateHeaders = { ...headers, "svix-timestamp": "1" };
  await assert.rejects(emailWebhook(db, config, body, lateHeaders), {
    code: "invalid_webhook",
  });
});

test("email provider is explicitly disabled by default and uses bounded HTTPS idempotent sends", async () => {
  assert.equal(configuredEmail("https://our-jam.test", {}), undefined);
  assert.throws(() =>
    configuredEmail("https://our-jam.test", { EMAIL_ENABLED: "1" }),
  );
  const calls: any[] = [];
  const sender = resendSender("test-only-key", async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: "provider-fixture" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const mail = {
    from: "show@example.test",
    to: ["listener@example.test"],
    subject: "Fixture",
    text: "Synthetic test",
  };
  assert.equal(await sender(mail, "ourjam-email/fixture"), "provider-fixture");
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(
    calls[0].options.headers["Idempotency-Key"],
    "ourjam-email/fixture",
  );
  assert.equal(calls[0].options.redirect, "error");
  assert.deepEqual(JSON.parse(calls[0].options.body), mail);
});

test("release fanout excludes pending and late confirmations, deduplicates addresses and cancels hidden music", async (t) => {
  const f = await fixture(t),
    { db, event, config } = f;
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
  const release = randomUUID(),
    published = new Date();
  await db.query(
    "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds,published_at) VALUES($1,$2,$3,'Visibility test','https://media.test/track','https://media.test/track',60,$4)",
    [release, event.id, job.id, published],
  );
  const candidates = [
    {
      email: "same@example.test",
      state: "verified",
      at: new Date(published.getTime() - 1000),
    },
    {
      email: "same@example.test",
      state: "verified",
      at: new Date(published.getTime() - 1000),
    },
    { email: "pending@example.test", state: "pending", at: null },
    {
      email: "late@example.test",
      state: "verified",
      at: new Date(published.getTime() + 1000),
    },
  ];
  for (const c of candidates) {
    const participant = randomUUID(),
      sub = randomUUID();
    await db.query(
      "INSERT INTO participants(id,avatar_seed) VALUES($1,'fixture')",
      [participant],
    );
    await db.query(
      "INSERT INTO email_subscriptions(id,event_id,participant_id,email_hash,contact_ciphertext,state,unsubscribe_hash,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        sub,
        event.id,
        participant,
        emailHash(config, c.email),
        seal(
          config,
          { email: c.email, unsubscribeToken: "f".repeat(64) },
          "contact:" + sub,
        ),
        c.state,
        randomUUID(),
        c.at,
      ],
    );
  }
  await fanoutEmail(db, config);
  const jobs = await f.jobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].email_hash, emailHash(config, "same@example.test"));
  await db.query("UPDATE releases SET hidden=true WHERE id=$1", [release]);
  await f.reset();
  await emailTick(db, config);
  assert.equal(f.sent.length, 0);
  assert.equal((await f.jobs())[0].state, "cancelled");
});
