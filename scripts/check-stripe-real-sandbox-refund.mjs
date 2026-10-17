import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { development, validateDevelopmentService, validateDevelopmentEnvironment } from "./deploy-development.mjs";

// Reconcile a genuine sandbox payment with an actual Stripe sandbox refund.
// This is NOT a Checkout browser flow or proof of Stripe-origin webhook delivery.
// Only a fixed development service and TEST mode are accepted.
async function environment() {
  if (!process.env.RENDER_API_KEY) throw Error("Approved Render API credential missing");
  const load = async (path) => {
    const response = await fetch("https://api.render.com/v1/services/" + development.service + path, {
      redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { authorization: "Bearer " + process.env.RENDER_API_KEY, accept: "application/json" },
    });
    if (!response.ok) throw Error("Fixed Render read returned HTTP " + response.status);
    return response.json();
  };
  const service = await load("");
  validateDevelopmentService(service);
  assert.equal(service.branch, development.branch);
  assert.equal(service.autoDeployTrigger, "off");
  const values = {};
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const list = await load("/env-vars?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    if (!Array.isArray(list)) throw Error("Unexpected isolated configuration response");
    for (const item of list) {
      if (typeof item.envVar?.key !== "string" || typeof item.envVar?.value !== "string")
        throw Error("Malformed Render environment record");
      values[item.envVar.key] = item.envVar.value;
    }
    if (list.length < 100) break;
    const next = list.at(-1)?.cursor;
    if (!next || next === cursor || page === 9) throw Error("Environment paging failed");
    cursor = next;
  }
  validateDevelopmentEnvironment(values);
  if (!/^(sk|rk)_test_/.test(values.STRIPE_SECRET_KEY ?? ""))
    throw Error("Only Stripe sandbox keys are allowed");
  return values.STRIPE_SECRET_KEY;
}

let stage = "read isolated sandbox environment";
async function main() {
  const key = await environment();
  console.log("Development service isolation and test-mode key: PASS");
  const stripe = new Stripe(key, { maxNetworkRetries: 0, timeout: 15000 });
  const testId = randomUUID();
  let intent, refund;
  try {
    stage = "create real sandbox payment";
    intent = await stripe.paymentIntents.create({
      amount: 300, currency: "usd", payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: "Our Jam isolated sandbox payment/refund readiness fixture",
      metadata: { purpose: "ourjam-sandbox-ci", fixture_id: testId },
    }, { idempotencyKey: "ourjam-test-intent-" + testId });
    assert.equal(intent.livemode, false);
    assert.equal(intent.amount, 300);
    assert.equal(intent.currency, "usd");
    assert.equal(intent.status, "succeeded");
    assert.equal(intent.amount_received, 300);
    console.log("Stripe actually processed test-mode PaymentIntent: PASS");
    stage = "refund actual sandbox payment";
    refund = await stripe.refunds.create({
      payment_intent: intent.id, reason: "requested_by_customer",
    }, { idempotencyKey: "ourjam-test-intent-refund-" + testId });
    assert.equal(refund.livemode, false);
    assert.equal(refund.amount, 300);
    assert.ok(["succeeded", "pending"].includes(refund.status));
    console.log("Stripe accepted actual test-mode refund: PASS");
    stage = "verify refundable state";
    const receipt = await stripe.refunds.retrieve(refund.id);
    assert.equal(receipt.livemode, false);
    assert.equal(receipt.amount, 300);
    assert.ok(["succeeded", "pending"].includes(receipt.status));
    console.log("Stripe returned the expected test-mode refund receipt: PASS");
    console.log("No live funds, application database writes or existing customer purchases.");
    console.log("Checkout web completion and Stripe-origin delivery remain separate acceptance gates.");
  } finally {
    if (intent?.status === "succeeded" && !refund) {
      // A failure may have happened after Stripe created a sandbox payment.
      stage = "emergency sandbox refund cleanup";
      refund = await stripe.refunds.create({
        payment_intent: intent.id, reason: "requested_by_customer",
      }, { idempotencyKey: "ourjam-test-intent-cleanup-" + testId });
      if (!["succeeded", "pending"].includes(refund.status))
        throw Error("Stripe sandbox refund cleanup not accepted");
    }
  }
}
main().catch(error => {
  // Only SDK-defined code/status classifications; never raw exception text,
  // Stripe IDs, key material or request/response bodies.
  const s = (x) => typeof x === "string" && /^[a-z_]{1,64}$/.test(x) ? x : "unknown";
  const status = Number.isInteger(error?.statusCode) && error.statusCode >= 400 &&
    error.statusCode < 600 ? error.statusCode : "none";
  console.error("Stripe sandbox intent/refund failed at " + stage +
    "; classification code=" + s(error?.code ?? error?.raw?.code) + " HTTP=" + status);
  process.exitCode = 1;
});
