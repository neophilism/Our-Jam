import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { development } from "./deploy-development.mjs";

// Read-only public OAuth initiation acceptance on the *isolated* dev origin.
// Intercepts Google authorization BEFORE contacting Google, so no accounts,
// tokens, passwords, consent or provider sessions are created.
// NEVER log the OAuth authorize URL, client ID, state, cookies or URL params.
async function verifyRole(browser, role) {
  const context = await browser.newContext({
    viewport: role === "performer" ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: role === "performer",
    hasTouch: role === "performer",
  });
  try {
    let captured;
    let resolveIntercept;
    const seen = new Promise((resolve) => { resolveIntercept = resolve; });
    await context.route("https://accounts.google.com/**", async (route) => {
      captured = new URL(route.request().url());
      resolveIntercept();
      await route.abort();
    });
    const page = await context.newPage();
    await page.goto(development.origin + "/signin?role=" + role + "&next=%2F", {
      waitUntil: "domcontentloaded", timeout: 60000,
    });
    const login = page.getByRole("button", { name: "Continue with Google", exact: true });
    await login.waitFor({ timeout: 30000 });
    await (role === "performer" ? login.tap() : login.click());
    await Promise.race([
      seen,
      new Promise((_, reject) => setTimeout(() => reject(Error("OAuth authorization redirect unavailable")), 30000)),
    ]);
    assert.ok(captured);
    assert.equal(captured.protocol, "https:");
    assert.equal(captured.hostname, "accounts.google.com");
    assert.equal(captured.searchParams.get("response_type"), "code");
    const callback = captured.searchParams.get("redirect_uri");
    assert.equal(callback, development.auth + "/callback/google");
    assert.ok((captured.searchParams.get("client_id") ?? "").length >= 10);
    assert.ok((captured.searchParams.get("state") ?? "").length >= 20);
    assert.ok((captured.searchParams.get("scope") ?? "").includes("email"));
    console.log(role + " Google OAuth provider redirect, state and callback: PASS");
    return captured.searchParams.get("state");
  } finally {
    await context.close();
  }
}
let browser;
async function main() {
  browser = await chromium.launch();
  const audienceState = await verifyRole(browser, "audience");
  const performerState = await verifyRole(browser, "performer");
  assert.notEqual(audienceState, performerState, "Separate sign-ins must not share OAuth state");
  console.log("Distinct performer/audience Google OAuth states: PASS");
  console.log("OAuth start only; user consent, verified accounts and physical devices are not yet accepted.");
}
main().catch(() => {
  console.error("Isolated Google OAuth initiation/callback acceptance failed; request details suppressed.");
  process.exitCode = 1;
}).finally(async () => { await browser?.close(); });
