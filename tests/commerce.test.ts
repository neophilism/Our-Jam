import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import {
  createEvent,
  advance,
  submitWave,
  snapshot,
} from "../apps/api/src/service.js";
import { eventInput } from "../packages/contracts/src/index.js";
import {
  quoteEvent,
  beginCheckout,
  applyPaymentEvent,
  configuredCommerce,
  type PaymentGateway,
} from "../apps/api/src/commerce.js";
import {
  eventAccess,
  freezeSponsorPlan,
  requireEventAccess,
  sponsorElapsed,
} from "../apps/api/src/commerce-policy.js";
import { claimPlayback, pausePlayback } from "../apps/api/src/playback.js";
import { createApp } from "../apps/api/src/app.js";
const origin = "http://localhost:5173";
async function fixture() {
  const db = await testDatabase();
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Paid event",
      artistName: "Artist",
      slug: "commerce-" + randomUUID(),
      minimumRoundSeconds: 0,
      sources: [{ title: "Song", corePrompt: "Private", durationSeconds: 121 }],
    }),
  );
  await db.query(
    "UPDATE source_tracks SET duration_verified=true WHERE event_id=$1",
    [event.id],
  );
  await db.query("UPDATE commerce_settings SET prices=$1", [
    JSON.stringify({ platform: 100, ad_free: 200, own_sponsors: 300 }),
  ]);
  let calls = 0;
  const gateway: PaymentGateway = {
    checkout: async (p) => {
      calls++;
      return {
        id: "cs_" + p.id,
        url: "https://checkout.stripe.com/test/" + p.id,
        expiresAt: Math.floor(Date.now() / 1000) + 1800,
      };
    },
    verify: () => {
      throw Error("not a verified signature");
    },
  };
  return { db, event, gateway, calls: () => calls };
}
async function purchase(
  f: Awaited<ReturnType<typeof fixture>>,
  tier: "platform" | "ad_free" | "own_sponsors" = "platform",
) {
  const q = await quoteEvent(f.db, f.event.id, tier);
  const r = await beginCheckout(
    f.db,
    "our-jam",
    f.event.id,
    { commandId: randomUUID(), tier, quoteHash: q.hash },
    f.gateway,
    origin,
  );
  const p = (
    await f.db.query("SELECT * FROM event_purchases WHERE id=$1", [
      r.purchaseId,
    ])
  ).rows[0];
  return {
    p,
    event: {
      id: "evt_" + randomUUID(),
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: p.session_id,
          client_reference_id: p.id,
          metadata: { purchaseId: p.id },
          mode: "payment",
          payment_status: "paid",
          amount_total: p.amount_cents,
          currency: p.currency,
          payment_intent: "pi_" + p.id,
        },
      },
    },
  };
}
test("event pricing uses verified measured minutes, stale quotes cannot charge and checkout replay is stable", async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const q = await quoteEvent(f.db, f.event.id, "platform");
  assert.equal(q.billableMinutes, 3);
  assert.equal(q.amountCents, 300);
  const input = {
    commandId: randomUUID(),
    tier: "platform" as const,
    quoteHash: q.hash,
  };
  await assert.rejects(
    beginCheckout(f.db, "wrong-artist", f.event.id, input, f.gateway, origin),
  );
  await f.db.query(
    "UPDATE source_tracks SET duration_verified=false WHERE event_id=$1",
    [f.event.id],
  );
  await assert.rejects(
    beginCheckout(f.db, "our-jam", f.event.id, input, f.gateway, origin),
    (e: any) => e.code === "setlist_unverified",
  );
  assert.equal(f.calls(), 0);
  await f.db.query(
    "UPDATE source_tracks SET duration_verified=true,duration_seconds=181 WHERE event_id=$1",
    [f.event.id],
  );
  await assert.rejects(
    beginCheckout(f.db, "our-jam", f.event.id, input, f.gateway, origin),
    (e: any) => e.code === "quote_changed",
  );
  assert.equal(f.calls(), 0);
  const updated = await quoteEvent(f.db, f.event.id, "platform");
  input.quoteHash = updated.hash;
  const result = await beginCheckout(
    f.db,
    "our-jam",
    f.event.id,
    input,
    f.gateway,
    origin,
  );
  assert.deepEqual(
    await beginCheckout(f.db, "our-jam", f.event.id, input, f.gateway, origin),
    result,
  );
  assert.equal(f.calls(), 1);
  await assert.rejects(
    beginCheckout(
      f.db,
      "our-jam",
      f.event.id,
      { ...input, commandId: randomUUID() },
      f.gateway,
      origin,
    ),
    (e: any) => e.code === "checkout_pending",
  );
});
test("only exact verified paid sessions grant event access, webhook replays are harmless and refunds revoke", async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const p = await purchase(f);
  assert.equal((await eventAccess(f.db, f.event.id)).paid, false);
  const bad = structuredClone(p.event);
  bad.data.object.amount_total++;
  await assert.rejects(
    applyPaymentEvent(f.db, bad),
    (e: any) => e.code === "payment_amount_mismatch",
  );
  assert.equal((await eventAccess(f.db, f.event.id)).paid, false);
  await applyPaymentEvent(f.db, p.event);
  await applyPaymentEvent(f.db, p.event);
  assert.equal((await eventAccess(f.db, f.event.id)).paid, true);
  assert.equal(
    (await f.db.query("SELECT * FROM payment_receipts")).rows.length,
    1,
  );
  await f.db.query(
    "UPDATE source_tracks SET duration_seconds=241 WHERE event_id=$1",
    [f.event.id],
  );
  assert.equal((await eventAccess(f.db, f.event.id)).paid, false);
  await f.db.query(
    "UPDATE source_tracks SET duration_seconds=121 WHERE event_id=$1",
    [f.event.id],
  );
  await applyPaymentEvent(f.db, {
    id: "refund-" + randomUUID(),
    type: "charge.refunded",
    livemode: false,
    data: { object: { payment_intent: p.event.data.object.payment_intent } },
  });
  assert.equal((await eventAccess(f.db, f.event.id)).paid, false);
  await applyPaymentEvent(f.db, {
    ...p.event,
    id: "late-paid-" + randomUUID(),
  });
  assert.equal((await eventAccess(f.db, f.event.id)).paid, false);
});
test("refund before fulfillment cannot be undone by a late paid event", async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const p = await purchase(f);
  await applyPaymentEvent(f.db, {
    id: "early-refund-" + randomUUID(),
    type: "charge.refunded",
    livemode: false,
    data: { object: { payment_intent: p.event.data.object.payment_intent } },
  });
  await applyPaymentEvent(f.db, p.event);
  assert.equal((await eventAccess(f.db, f.event.id)).paid, false);
});
test("paid upgrades credit prior payment and sponsor policies freeze by plan and ownership", async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const first = await purchase(f);
  await applyPaymentEvent(f.db, first.event);
  const upgrade = await quoteEvent(f.db, f.event.id, "own_sponsors");
  assert.equal(upgrade.totalCents, 900);
  assert.equal(upgrade.creditCents, 300);
  assert.equal(upgrade.amountCents, 600);
  const top = await purchase(f, "own_sponsors");
  await applyPaymentEvent(f.db, top.event);
  const own = randomUUID(),
    other = randomUUID(),
    platform = randomUUID();
  await f.db.query("INSERT INTO artists(id,name) VALUES('other','Other')");
  for (const [id, owner] of [
    [own, "our-jam"],
    [other, "other"],
    [platform, null],
  ])
    await f.db.query(
      "INSERT INTO sponsor_videos(id,owner_artist_id,sponsor_name,object_key,sha256,duration_seconds,active) VALUES($1::uuid,$2,'Sponsor',$1::text,'test',5,true)",
      [id, owner],
    );
  await f.db.query(
    "UPDATE event_commerce SET own_video_ids=$1 WHERE event_id=$2",
    [JSON.stringify([own, other, platform]), f.event.id],
  );
  const plan = await freezeSponsorPlan(f.db, f.event.id, 121);
  assert.deepEqual(
    plan.clips.map((c) => c.id),
    [own],
  );
  assert.equal(plan.durationSeconds, 15);
  await f.db.query(
    "UPDATE event_commerce SET tier='ad_free' WHERE event_id=$1",
    [f.event.id],
  );
  assert.deepEqual(await freezeSponsorPlan(f.db, f.event.id, 121), {
    durationSeconds: 0,
    clips: [],
  });
});
test("server rejects waves during sponsor opening and countdown freezes with paused playback", async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const p = await purchase(f);
  await applyPaymentEvent(f.db, p.event);
  const lease = await claimPlayback(f.db, "our-jam", f.event.id);
  const opened = await advance(
    f.db,
    "our-jam",
    f.event.id,
    randomUUID(),
    0,
    { ...lease, sequence: 1 },
    false,
    true,
  );
  const participant = randomUUID();
  await f.db.query(
    "INSERT INTO participants(id,name,avatar_seed) VALUES($1,'Fan','x')",
    [participant],
  );
  await f.db.query(
    "INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",
    [f.event.id, participant],
  );
  await assert.rejects(
    submitWave(f.db, { participantId: participant }, opened.roundId!, {
      commandId: randomUUID(),
      expectedRevision: 0,
      text: "Warm piano",
    }),
    (e: any) => e.code === "sponsor_break",
  );
  await pausePlayback(
    f.db,
    "our-jam",
    f.event.id,
    { ...lease, sequence: 2 },
    true,
    randomUUID(),
  );
  const paused = (
    await f.db.query("SELECT * FROM rounds WHERE id=$1", [opened.roundId])
  ).rows[0];
  assert.equal(
    sponsorElapsed(paused, Date.now()),
    sponsorElapsed(paused, Date.now() + 100000),
  );
  await pausePlayback(
    f.db,
    "our-jam",
    f.event.id,
    { ...lease, sequence: 3 },
    false,
    randomUUID(),
  );
  await f.db.query(
    "UPDATE rounds SET opened_at=opened_at-interval '16 seconds' WHERE id=$1",
    [opened.roundId],
  );
  await submitWave(f.db, { participantId: participant }, opened.roundId!, {
    commandId: randomUUID(),
    expectedRevision: 0,
    text: "Warm piano",
  });
  const publicState = await snapshot(f.db, f.event.slug, participant);
  assert.equal(publicState.round?.waves.length, 1);
  assert.ok(publicState.round?.sponsorBreak.elapsedMs >= 15000);
  assert.equal(JSON.stringify(publicState).includes("Private"), false);
});
test("admin and payment routes reject artist/guest escalation, unsigned callbacks and cross-origin mutations", async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const app = await createApp(f.db, {
    origin,
    secureCookies: false,
    operatorToken: "test-only-artist-key-1234567890123456",
    commerce: {
      enabled: true,
      adminToken: "test-only-platform-key-1234567890123",
      gateway: f.gateway,
    },
  });
  t.after(() => app.close());
  assert.equal(
    (await app.inject({ url: "/api/admin/commerce" })).statusCode,
    401,
  );
  const login = await app.inject({
    method: "POST",
    url: "/api/operator/login",
    headers: { origin },
    payload: { token: "test-only-artist-key-1234567890123456" },
  });
  const cookie = login.headers["set-cookie"]!.toString().split(";")[0];
  assert.equal(
    (await app.inject({ url: "/api/admin/commerce", headers: { cookie } }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/webhooks/stripe",
        headers: { "stripe-signature": "forged" },
        payload: { id: "forged" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/admin/login",
        headers: { origin: "https://evil.example" },
        payload: { token: "test-only-platform-key-1234567890123" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/operator/sponsor-videos?name=x",
        headers: { origin, cookie, "content-type": "application/octet-stream" },
        payload: Buffer.alloc(64),
      })
    ).statusCode,
    403,
  );
  assert.throws(
    () =>
      configuredCommerce({
        COMMERCE_ENABLED: "1",
        STRIPE_SECRET_KEY: "sk_live_test-only",
      }),
    /test keys/,
  );
});
