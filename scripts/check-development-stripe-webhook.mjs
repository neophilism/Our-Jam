import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { development, validateDevelopmentService, validateDevelopmentEnvironment } from "./deploy-development.mjs";

// This isolated-host test intentionally never targets a real purchase. Its
// unknown UUID rolls back receipt insertion after successful signature
// validation. Do not log credentials, payloads, responses or request headers.
async function run() {
  if (!process.env.RENDER_API_KEY) throw Error("Render API access unavailable");
  const read = async (suffix) => {
    const response = await fetch(`https://api.render.com/v1/services/${development.service}${suffix}`, {
      redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { authorization: "Bearer " + process.env.RENDER_API_KEY, accept: "application/json" },
    });
    if (!response.ok) throw Error("Approved Render configuration read failed: HTTP " + response.status);
    return response.json();
  };
  const service = await read("");
  validateDevelopmentService(service);
  if (service.branch !== development.branch || service.autoDeployTrigger !== "off")
    throw Error("Expected isolated development branch with manual deployments");
  const vars = {};
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const rows = await read("/env-vars?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    if (!Array.isArray(rows)) throw Error("Malformed development configuration");
    for (const row of rows) {
      if (typeof row.envVar?.key !== "string" || typeof row.envVar?.value !== "string")
        throw Error("Malformed development configuration");
      vars[row.envVar.key] = row.envVar.value;
    }
    if (rows.length < 100) break;
    const next = rows.at(-1)?.cursor;
    if (!next || next === cursor) throw Error("Development configuration pagination failed");
    cursor = next;
    if (page === 9) throw Error("Development configuration exceeded page limit");
  }
  validateDevelopmentEnvironment(vars);
  if (!vars.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"))
    throw Error("Sandbox webhook signing secret unavailable");

  const before = await fetch(development.origin + "/api/health", { redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!before.ok) throw Error("Hosted health unavailable");
  const health = await before.json();
  if (health.application !== "Our Jam" || !/^[a-f0-9]{40}$/.test(health.commit))
    throw Error("Incorrect hosted application");

  const missingId = randomUUID();
  const raw = JSON.stringify({
    id: "evt_ourjam_signature_check_" + randomUUID(),
    type: "checkout.session.expired",
    livemode: false,
    data: { object: {
      id: "cs_test_signature_check_" + randomUUID(),
      client_reference_id: missingId,
      metadata: { purchaseId: missingId },
      payment_status: "unpaid",
    } },
  });
  const sign = (payload, timestamp) => Stripe.webhooks.generateTestHeaderString({
    payload, secret: vars.STRIPE_WEBHOOK_SECRET,
    ...(timestamp ? { timestamp } : {}),
  });
  const submit = async (payload, signature) => {
    const response = await fetch(development.origin + "/api/webhooks/stripe", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    });
    return response.status;
  };
  if (await submit(raw, "forged") !== 400)
    throw Error("Forged webhook was not rejected with HTTP 400");
  console.log("Real hosted webhook rejects forged signatures: PASS");
  if (await submit(raw + " ", sign(raw)) !== 400)
    throw Error("Tampered webhook was not rejected with HTTP 400");
  console.log("Real hosted webhook rejects body tampering: PASS");
  if (await submit(raw, sign(raw, Math.floor(Date.now()/1000) - 600)) !== 400)
    throw Error("Expired webhook signature was not rejected with HTTP 400");
  console.log("Real hosted webhook rejects stale signatures: PASS");
  // 409 = signature accepted, but the purchase deliberately does not exist.
  // Domain transaction rolls back, leaving no payment receipt or grant.
  if (await submit(raw, sign(raw)) !== 409)
    throw Error("Signed unknown purchase must be rejected with HTTP 409");
  console.log("Real hosted webhook accepts configured signing secret but rejects unknown purchase: PASS");
  const after = await fetch(development.origin + "/api/health", { redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!after.ok || (await after.json()).commit !== health.commit)
    throw Error("Host commit changed during signature acceptance");
  console.log("Development host commit stayed constant: PASS");
  console.log("This is not evidence of actual Stripe event delivery, paid fulfillment or refunds.");
}
run().catch(() => {
  console.error("Isolated webhook signature acceptance failed; details intentionally suppressed");
  process.exitCode = 1;
});
