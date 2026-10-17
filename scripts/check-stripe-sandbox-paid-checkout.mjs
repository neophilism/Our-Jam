import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { chromium } from "@playwright/test";
import { development, validateDevelopmentEnvironment, validateDevelopmentService } from "./deploy-development.mjs";
import { testDatabase } from "../tests/database.ts";
import { createEvent } from "../apps/api/src/service.ts";
import { eventInput } from "../packages/contracts/src/index.ts";
import { quoteEvent, beginCheckout, configuredCommerce } from "../apps/api/src/commerce.ts";
import { eventAccess } from "../apps/api/src/commerce-policy.ts";
import { createApp } from "../apps/api/src/app.ts";

// This runs ONLY against the approved isolated environment using Stripe TEST
// keys and a disposable in-process PGlite DB. It submits a public Stripe test
// card through an actual Checkout page, then refunds the sandbox payment.
// Never write credentials, checkout URLs, payment IDs, browser traces, raw
// provider errors, request bodies, cookies or card fields to logs/artifacts.
const note = (label) => console.log(label + ": PASS");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readEnvironment() {
  if (!process.env.RENDER_API_KEY) throw new Error("Approved Render API credential missing");
  const read = async (suffix) => {
    const response = await fetch("https://api.render.com/v1/services/" + development.service + suffix, {
      redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { authorization: "Bearer " + process.env.RENDER_API_KEY, accept: "application/json" },
    });
    if (!response.ok) throw Error("Approved Render read failed");
    return response.json();
  };
  const service = await read("");
  validateDevelopmentService(service);
  assert.equal(service.branch, development.branch);
  assert.equal(service.autoDeployTrigger, "off");
  const values = {};
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const rows = await read("/env-vars?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    if (!Array.isArray(rows)) throw Error("Invalid Render environment listing");
    for (const row of rows) {
      if (typeof row.envVar?.key !== "string" || typeof row.envVar?.value !== "string")
        throw Error("Invalid Render configuration");
      values[row.envVar.key] = row.envVar.value;
    }
    if (rows.length < 100) break;
    const next = rows.at(-1)?.cursor;
    if (!next || next === cursor) throw Error("Render pagination failed");
    cursor = next;
    if (page === 9) throw Error("Render pagination limit exceeded");
  }
  validateDevelopmentEnvironment(values);
  if (!/^(sk|rk)_test_/.test(values.STRIPE_SECRET_KEY ?? "") ||
      !values.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"))
    throw Error("Only the configured Stripe sandbox credentials are accepted");
  return values;
}

// Stripe Checkout may host its Payment Element in a nested iframe. Search
// accessible browser frames without depending on one particular DOM layout.
async function fillField(page, selectors, value, { required = true } = {}) {
  for (let round = 0; round < 24; round++) {
    for (const frame of page.frames()) {
      for (const selector of selectors) {
        try {
          const field = frame.locator(selector).first();
          if (await field.count() && await field.isVisible()) {
            await field.fill(value, { timeout: 6000 });
            return true;
          }
        } catch { /* Try the next frame if Stripe replaces an iframe. */ }
      }
    }
    if (!required && round >= 2) return false;
    await pause(500);
  }
  if (required) throw Error("Stripe Checkout required test field unavailable");
  return false;
}

async function payTestCard(url) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ locale: "en-US", viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    // No private browser storage or screenshots are retained.
    await fillField(page, ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]'],
      "ourjam-test-" + randomUUID().slice(0, 12) + "@example.com");
    // Stripe's dynamic payment methods may initially emphasize Link.
    for (const type of ["radio", "tab", "button"]) {
      const option = page.getByRole(type, { name: /^card$/i }).first();
      if (await option.count() && await option.isVisible()) {
        try { await option.click({ timeout: 3500 }); } catch {}
        break;
      }
    }
    await fillField(page, [
      'input[autocomplete="cc-number"]', 'input[name="cardNumber"]',
      'input[name="cardnumber"]', 'input[placeholder*="1234"]',
      'input[aria-label*="Card number"]',
    ], "4242424242424242");
    await fillField(page, [
      'input[autocomplete="cc-exp"]', 'input[name="cardExpiry"]',
      'input[name="exp-date"]', 'input[placeholder*="MM"]',
      'input[aria-label*="Expiration"]',
    ], "12 / 30");
    await fillField(page, [
      'input[autocomplete="cc-csc"]', 'input[name="cardCvc"]',
      'input[name="cvc"]', 'input[placeholder*="CVC"]', 'input[placeholder*="123"]',
    ], "123");
    await fillField(page, [
      'input[autocomplete="cc-name"]', 'input[name="billingName"]',
      'input[placeholder="Full name"]',
    ], "Our Jam Test", { required: false });
    await fillField(page, [
      'input[autocomplete="postal-code"]', 'input[name="billingPostalCode"]',
      'input[placeholder="ZIP"]', 'input[placeholder="ZIP code"]',
    ], "10001", { required: false });
    const payButton = page.getByRole("button", { name: /^pay\b|^complete\b|^place order\b/i }).last();
    if (await payButton.count() && await payButton.isVisible())
      await payButton.click({ timeout: 12000 });
    else
      await page.locator('button[type="submit"]').last().click({ timeout: 12000 });
    note("Stripe sandbox browser submitted a real test-card Checkout");
    // Redirect need not succeed: the Checkout return URL is loopback-only.
    await pause(2000);
  } finally {
    await browser.close();
  }
}

async function main() {
  const env = await readEnvironment();
  note("Isolated Render configuration and test-only keys");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 0, timeout: 15000 });
  const commerce = configuredCommerce({
    COMMERCE_ENABLED: "1", STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
  });
  assert.ok(commerce?.gateway);
  const db = await testDatabase();
  let app, sessionId, paymentIntent, refunded = false, paySucceeded = false;
  try {
    const origin = "http://127.0.0.1:4176";
    app = await createApp(db, {
      origin, secureCookies: false,
      operatorToken: "sandbox-browser-test-only-operator-token-1234567",
      commerce,
    });
    const event = await createEvent(db, "our-jam", eventInput.parse({
      title: "Isolated real sandbox payment test",
      artistName: "Our Jam Test",
      slug: "sandbox-paid-" + randomUUID(),
      minimumRoundSeconds: 0,
      sources: [{ title: "Test track", corePrompt: "Not a released recording", durationSeconds: 121 }],
    }));
    await db.query("UPDATE source_tracks SET duration_verified=true WHERE event_id=$1", [event.id]);
    await db.query("UPDATE commerce_settings SET currency='usd', prices=$1", [
      JSON.stringify({ platform: 100, ad_free: 200, own_sponsors: 300 }),
    ]);
    const quote = await quoteEvent(db, event.id, "platform");
    assert.equal(quote.amountCents, 300);
    const checkout = await beginCheckout(db, "our-jam", event.id, {
      commandId: randomUUID(), tier: "platform", quoteHash: quote.hash,
    }, commerce.gateway, origin);
    const purchase = (await db.query("SELECT * FROM event_purchases WHERE id=$1", [checkout.purchaseId])).rows[0];
    assert.equal(purchase.session_id.startsWith("cs_test_"), true);
    assert.equal(new URL(checkout.url).hostname, "checkout.stripe.com");
    sessionId = purchase.session_id;
    assert.equal((await eventAccess(db, event.id)).paid, false);
    note("Actual event-based Stripe Checkout created and isolated");
    await payTestCard(checkout.url);
    let stripeSession;
    for (let attempt = 0; attempt < 30; attempt++) {
      stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      if (stripeSession.payment_status === "paid" && stripeSession.status === "complete") break;
      await pause(3000);
    }
    assert.equal(stripeSession.payment_status, "paid");
    assert.equal(stripeSession.status, "complete");
    assert.equal(stripeSession.amount_total, purchase.amount_cents);
    assert.equal(stripeSession.currency, "usd");
    assert.equal(stripeSession.client_reference_id, purchase.id);
    assert.equal(stripeSession.metadata?.purchaseId, purchase.id);
    assert.equal(stripeSession.livemode, false);
    paymentIntent = typeof stripeSession.payment_intent === "string"
      ? stripeSession.payment_intent : stripeSession.payment_intent?.id;
    assert.ok(paymentIntent?.startsWith("pi_"));
    paySucceeded = true;
    note("Real Stripe sandbox card payment and saved Checkout amount verified");

    const signedEvent = async (type, object) => {
      const raw = JSON.stringify({
        id: "evt_ourjam_sandbox_real_" + randomUUID(),
        type, livemode: false, data: { object },
      });
      // Local signature exercises the actual app verifier. This is NOT proof
      // of Stripe's configured remote webhook delivery.
      const signature = Stripe.webhooks.generateTestHeaderString({
        payload: raw, secret: env.STRIPE_WEBHOOK_SECRET,
      });
      return app.inject({
        method: "POST", url: "/api/webhooks/stripe",
        headers: { "stripe-signature": signature, "content-type": "application/json" },
        payload: Buffer.from(raw),
      });
    };
    assert.equal((await signedEvent("checkout.session.completed", stripeSession)).statusCode, 200);
    assert.equal((await eventAccess(db, event.id)).paid, true);
    note("Real paid Checkout object grants isolated test event access through signed verifier");

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntent,
      reason: "requested_by_customer",
    }, { idempotencyKey: "ourjam-test-refund-" + purchase.id });
    assert.equal(refund.livemode, false);
    assert.ok(["succeeded", "pending"].includes(refund.status));
    refunded = true;
    note("Real Stripe sandbox refund accepted");

    const refundEvent = { payment_intent: paymentIntent };
    assert.equal((await signedEvent("charge.refunded", refundEvent)).statusCode, 200);
    assert.equal((await eventAccess(db, event.id)).paid, false);
    assert.equal((await signedEvent("checkout.session.completed", stripeSession)).statusCode, 200);
    assert.equal((await eventAccess(db, event.id)).paid, false);
    note("Signed refund revokes entitlement and prevents late-payment replay");
    console.log("SANDBOX ONLY: no production customer, live charge, hosted database write or rehearsal change.");
    console.log("Provider delivery of Checkout/refund webhooks is a separate release gate.");
  } finally {
    try {
      if (paymentIntent && !refunded) {
        const refund = await stripe.refunds.create({
          payment_intent: paymentIntent, reason: "requested_by_customer",
        }, { idempotencyKey: "ourjam-test-cleanup-" + paymentIntent });
        refunded = ["succeeded", "pending"].includes(refund.status);
      }
      if (sessionId && !paySucceeded) {
        const checkout = await stripe.checkout.sessions.retrieve(sessionId);
        if (checkout.status === "open") await stripe.checkout.sessions.expire(sessionId);
        if (checkout.payment_status === "paid" && !refunded && checkout.payment_intent) {
          const intent = typeof checkout.payment_intent === "string"
            ? checkout.payment_intent : checkout.payment_intent.id;
          const refund = await stripe.refunds.create({ payment_intent: intent, reason: "requested_by_customer" },
            { idempotencyKey: "ourjam-test-cleanup-" + intent });
          refunded = ["succeeded", "pending"].includes(refund.status);
        }
      }
      if (paySucceeded && !refunded) throw Error("Stripe sandbox payment was not refunded");
    } finally {
      await app?.close();
      await db.close();
    }
  }
}
main().catch(() => {
  // Avoid serializing Playwright errors, URLs, cards, Stripe API errors or keys.
  console.error("Real Stripe sandbox test payment/refund not accepted; private diagnostic details suppressed.");
  process.exitCode = 1;
});
