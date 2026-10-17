import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { development, validateDevelopmentService, validateDevelopmentEnvironment } from "./deploy-development.mjs";

// No actual payment, test customers or app database writes: create a deliberately
// unpayable-to-anyone sandbox Checkout Session and immediately expire it.
// Never print keys, request/response bodies, session URLs, IDs or Stripe errors.
async function main() {
  if (!process.env.RENDER_API_KEY) throw Error("Render API key unavailable");
  const request = async (suffix) => {
    const response = await fetch(`https://api.render.com/v1/services/${development.service}${suffix}`, {
      redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${process.env.RENDER_API_KEY}`, accept: "application/json" },
    });
    if (!response.ok) throw Error("Approved Render read failed: HTTP " + response.status);
    return response.json();
  };
  const service = await request("");
  validateDevelopmentService(service);
  assert.equal(service.branch, development.branch, "isolated branch mismatch");
  assert.equal(service.autoDeployTrigger, "off", "automatic deploys must be disabled");
  const values = {};
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const page = await request("/env-vars?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    if (!Array.isArray(page)) throw Error("Invalid Render environment listing");
    for (const row of page) {
      if (typeof row.envVar?.key !== "string" || typeof row.envVar?.value !== "string")
        throw Error("Invalid Render environment value");
      values[row.envVar.key] = row.envVar.value;
    }
    if (page.length < 100) break;
    const next = page.at(-1)?.cursor;
    if (!next || next === cursor) throw Error("Render environment pagination failed");
    cursor = next;
    if (i === 9) throw Error("Render environment pagination exceeded bound");
  }
  validateDevelopmentEnvironment(values);
  if (!values.STRIPE_SECRET_KEY || !values.STRIPE_WEBHOOK_SECRET)
    throw Error("Stripe sandbox secret pair missing");
  if (!/^(sk|rk)_test_/.test(values.STRIPE_SECRET_KEY))
    throw Error("Stripe key is not a test key");
  if (!values.STRIPE_WEBHOOK_SECRET.startsWith("whsec_"))
    throw Error("Stripe signing secret not configured");
  console.log("Approved host, isolated database and test-only Stripe credentials: PASS");

  const stripe = new Stripe(values.STRIPE_SECRET_KEY, { maxNetworkRetries: 0, timeout: 15000 });
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price_data: {
        currency: "usd",
        product_data: { name: "Our Jam automated sandbox API permission check (not an event purchase)" },
        unit_amount: 100,
      }, quantity: 1 }],
      success_url: development.origin + "/performer?stripe_preflight=complete",
      cancel_url: development.origin + "/performer?stripe_preflight=cancel",
      client_reference_id: "ourjam-preflight-" + randomUUID(),
      expires_at: Math.floor(Date.now()/1000) + 3600,
    }, { idempotencyKey: "ourjam-preflight-" + randomUUID() });
    if (!session.id?.startsWith("cs_test_") || session.livemode !== false ||
        !session.url || new URL(session.url).hostname !== "checkout.stripe.com")
      throw Error("Stripe returned an unexpected checkout mode");
    console.log("Stripe accepted sandbox Checkout creation: PASS");
    const expired = await stripe.checkout.sessions.expire(session.id);
    if (expired.status !== "expired" || expired.livemode !== false)
      throw Error("Stripe Checkout expiration not verified");
    console.log("Stripe accepted sandbox Checkout expiration: PASS");
  } catch {
    // No raw Stripe exception is printed (it may carry request/response context).
    throw Error(session ? "Sandbox Checkout expiration or validation failed; inspect restricted-key permissions" :
      "Sandbox Checkout creation failed; inspect restricted-key permissions");
  }
  // A valid whsec prefix cannot prove signed webhook delivery. That is a separate test.
  console.log("No customer charge or application event purchase was created.");
  console.log("Signed webhook delivery, paid fulfillment and refund remain unverified.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
