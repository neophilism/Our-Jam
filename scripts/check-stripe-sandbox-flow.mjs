import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { development, validateDevelopmentEnvironment, validateDevelopmentService } from "./deploy-development.mjs";
import { testDatabase } from "../tests/database.ts";
import { createEvent } from "../apps/api/src/service.ts";
import { eventInput } from "../packages/contracts/src/index.ts";
import { quoteEvent, beginCheckout, configuredCommerce } from "../apps/api/src/commerce.ts";
import { eventAccess } from "../apps/api/src/commerce-policy.ts";
import { createApp } from "../apps/api/src/app.ts";

// Exact development service only. No log, artifact or exception includes a key,
// Stripe session URL, signature, request body or database connection string.
async function readSandboxEnvironment() {
  if (!process.env.RENDER_API_KEY) throw new Error("Approved Render control-plane access missing");
  const read = async (suffix) => {
    const r = await fetch("https://api.render.com/v1/services/" + development.service + suffix, {
      signal: AbortSignal.timeout(30000), redirect: "error",
      headers: { authorization: "Bearer " + process.env.RENDER_API_KEY, accept: "application/json" },
    });
    if (!r.ok) throw new Error("Approved Render read refused");
    return r.json();
  };
  const host = await read("");
  validateDevelopmentService(host);
  assert.equal(host.branch, development.branch);
  assert.equal(host.autoDeployTrigger, "off");
  const values = {};
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const rows = await read("/env-vars?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    if (!Array.isArray(rows)) throw new Error("Unexpected Render environment listing");
    for (const row of rows) {
      if (typeof row.envVar?.key !== "string" || typeof row.envVar?.value !== "string")
        throw new Error("Malformed environment record");
      values[row.envVar.key] = row.envVar.value;
    }
    if (rows.length < 100) break;
    const next = rows.at(-1)?.cursor;
    if (!next || next === cursor) throw new Error("Environment pagination mismatch");
    cursor = next;
    if (i === 9) throw new Error("Environment pagination too large");
  }
  validateDevelopmentEnvironment(values);
  if (!values.STRIPE_SECRET_KEY || !values.STRIPE_WEBHOOK_SECRET)
    throw new Error("Both sandbox Stripe secrets are required");
  return values;
}

async function run() {
  const values = await readSandboxEnvironment();
  const stripe = new Stripe(values.STRIPE_SECRET_KEY, { maxNetworkRetries: 0, timeout: 15000 });
  const commerce = configuredCommerce({
    COMMERCE_ENABLED: "1", STRIPE_SECRET_KEY: values.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: values.STRIPE_WEBHOOK_SECRET,
  });
  assert.ok(commerce?.gateway);
  const db = await testDatabase(); // Separate ephemeral PGlite instance; NEVER hosted/prod DB.
  let app;
  const sessions = [];
  const testOrigin = "http://127.0.0.1:4176";
  const verify = (condition, label) => {
    assert.ok(condition);
    console.log(label + ": PASS");
  };
  const signedWebhook = async (type, object, eventId = "evt_test_ourjam_" + randomUUID()) => {
    const raw = JSON.stringify({ id: eventId, type, livemode: false, data: { object } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: values.STRIPE_WEBHOOK_SECRET });
    const result = await app.inject({
      method: "POST", url: "/api/webhooks/stripe",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      payload: Buffer.from(raw),
    });
    return result.statusCode;
  };
  try {
    app = await createApp(db, {
      origin: testOrigin, operatorToken: "isolated-test-only-operator-token-123456", secureCookies: false,
      commerce,
    });
    const artist = "our-jam";
    const event = await createEvent(db, artist, eventInput.parse({
      title: "Isolated Stripe sandbox contract fixture",
      artistName: "Fixture artist",
      slug: "stripe-contract-" + randomUUID(),
      sources: [{ title: "Fixture song", corePrompt: "Unpublished sandbox research song", durationSeconds: 121 }],
      minimumRoundSeconds: 0,
    }));
    await db.query("UPDATE source_tracks SET duration_verified=true WHERE event_id=$1", [event.id]);
    await db.query("UPDATE commerce_settings SET currency='usd',prices=$1", [
      JSON.stringify({ platform: 100, ad_free: 200, own_sponsors: 300 }),
    ]);
    const quote = await quoteEvent(db, event.id, "platform");
    verify(quote.billableMinutes === 3 && quote.amountCents === 300 && quote.currency === "usd", "Measured setlist minute quote");

    const newSession = async () => {
      const q = await quoteEvent(db, event.id, "platform");
      const response = await beginCheckout(db, artist, event.id, {
        commandId: randomUUID(), tier: "platform", quoteHash: q.hash,
      }, commerce.gateway, testOrigin);
      const purchase = (await db.query("SELECT * FROM event_purchases WHERE id=$1", [response.purchaseId])).rows[0];
      assert.equal(purchase.session_id, response.url ? purchase.session_id : null);
      assert.ok(purchase.session_id?.startsWith("cs_test_"));
      assert.equal(new URL(response.url).hostname, "checkout.stripe.com");
      sessions.push(purchase.session_id);
      return purchase;
    };
    const expired = await newSession();
    verify(!(await eventAccess(db, event.id)).paid, "Real sandbox Checkout creates no unpaid entitlement");
    const expiredSession = await stripe.checkout.sessions.expire(expired.session_id);
    verify(expiredSession.status === "expired" && !expiredSession.livemode, "Real Stripe sandbox Checkout expiry");
    const expiredObject = {
      id: expired.session_id, client_reference_id: expired.id,
      metadata: { purchaseId: expired.id }, payment_status: "unpaid",
    };
    const expiredEventId = "evt_test_ourjam_expired_" + randomUUID();
    verify(await signedWebhook("checkout.session.expired", expiredObject, expiredEventId) === 200,
      "Signed expiration accepted through actual Fastify route");
    verify(await signedWebhook("checkout.session.expired", expiredObject, expiredEventId) === 200,
      "Duplicate signed expiration ignored");
    const expiredRow = (await db.query("SELECT state FROM event_purchases WHERE id=$1", [expired.id])).rows[0];
    verify(expiredRow.state === "expired" && !(await eventAccess(db, event.id)).paid,
      "Expiry and replay leave purchase unentitled");

    const next = await newSession();
    const intent = "pi_test_isolated_fixture_" + randomUUID();
    const paid = {
      id: next.session_id, client_reference_id: next.id,
      metadata: { purchaseId: next.id }, mode: "payment",
      payment_status: "paid", amount_total: next.amount_cents,
      currency: next.currency, payment_intent: intent,
    };
    const forged = await app.inject({
      method: "POST", url: "/api/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": "forged" },
      payload: Buffer.from(JSON.stringify({
        id: "evt_unauth_" + randomUUID(), type: "checkout.session.completed",
        livemode: false, data: { object: paid },
      })),
    });
    verify(forged.statusCode === 400 && !(await eventAccess(db, event.id)).paid,
      "Unsigned payment completion cannot grant access");
    const wrongAmount = { ...paid, amount_total: next.amount_cents + 1 };
    verify(await signedWebhook("checkout.session.completed", wrongAmount) === 400
      && !(await eventAccess(db, event.id)).paid, "Signed wrong-amount event cannot grant access");
    const paidEventId = "evt_test_ourjam_paid_" + randomUUID();
    verify(await signedWebhook("checkout.session.completed", paid, paidEventId) === 200
      && (await eventAccess(db, event.id)).paid, "Signed fixture completion grants test event access");
    verify(await signedWebhook("checkout.session.completed", paid, paidEventId) === 200,
      "Completed webhook signature replay is idempotent");
    const refund = { payment_intent: intent };
    verify(await signedWebhook("charge.refunded", refund) === 200
      && !(await eventAccess(db, event.id)).paid, "Signed fixture refund revokes test event access");
    verify(await signedWebhook("checkout.session.completed", paid) === 200
      && !(await eventAccess(db, event.id)).paid, "Late successful event cannot restore revoked entitlement");
    const receipts = await db.query("SELECT count(*)::int AS count FROM payment_receipts");
    verify(receipts.rows[0].count >= 4, "Webhook receipt audit persisted only in ephemeral test DB");
    console.log("No production/hosted rows or customers were created. No card was charged.");
    console.log("Signed success/refund events are explicitly SYNTHETIC fixtures; genuine Stripe payment and delivery still require separate testing.");
  } finally {
    // Real Stripe sessions remain UNPAID. Expire any not already expired.
    for (const id of sessions) {
      try { await stripe.checkout.sessions.expire(id); } catch {}
    }
    await app?.close();
    await db.close();
  }
}
run().catch(() => {
  console.error("Isolated Stripe sandbox purchase contract test failed (private details suppressed).");
  process.exitCode = 1;
});
