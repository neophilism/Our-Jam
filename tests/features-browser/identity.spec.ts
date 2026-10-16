import { fixtureIdentityToken } from "../fixtures/identity-token";
import { test, expect } from "@playwright/test";
test("performers and audience receive standard signup choices and email verification without exposing an admin role", async ({
  page,
}) => {
  let signedIn = false,
    verified = false;
  const user = () => ({
    id: "browser-identity",
    email: "fixture@example.test",
    name: "Fixture account",
    emailVerified: verified,
  });
  await page.route("https://auth.example.test/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers: Record<string, string> = {
      "access-control-allow-origin": "http://127.0.0.1:4174",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (signedIn && url.pathname.endsWith("/get-session")) {
      headers["set-auth-jwt"] = fixtureIdentityToken;
      headers["access-control-expose-headers"] = "set-auth-jwt";
    }
    let body: any = { status: true };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname.endsWith("/get-session"))
      body = signedIn
        ? {
            user: user(),
            session: {
              id: "fixture-session",
              userId: "browser-identity",
              token: "managed-fixture",
              expiresAt: new Date(Date.now() + 900000).toISOString(),
            },
          }
        : null;
    else if (url.pathname.endsWith("/sign-up/email")) {
      signedIn = true;
      body = { user: user(), token: "managed-fixture" };
    } else if (url.pathname.endsWith("/email-otp/verify-email")) {
      verified = true;
      body = { status: true, user: user() };
    } else if (url.pathname.endsWith("/sign-in/email")) {
      signedIn = true;
      body = { user: user(), token: "managed-fixture" };
    } else if (url.pathname.endsWith("/token"))
      body = { token: fixtureIdentityToken };
    else if (url.pathname.endsWith("/sign-out")) signedIn = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify(body),
    });
  });
  await page.goto("/signin?role=performer&next=%2Fperformer");
  await expect(
    page.getByRole("button", { name: "Continue with Google", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("I’m here as", { exact: true })).toHaveValue(
    "performer",
  );
  await page.screenshot({
    path: test.info().outputPath("standard-signin.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Fixture account");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("fixture@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-only-password-12345");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verify your email.", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Verification code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-only-password-12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/performer$/);
  const account = await (await page.request.get("/api/operator/events")).json();
  expect(account.events).toHaveLength(0);
  expect((await page.request.get("/api/admin/commerce")).status()).toBe(401);
  await page.goto("/signin?role=performer&next=%2Fperformer");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Signed out.");
  expect((await page.request.get("/api/operator/events")).status()).toBe(401);
});

test("password reset stays on the app origin and removes the reset token after use", async ({
  page,
}) => {
  const calls: { path: string; body: any }[] = [];
  await page.route("https://auth.example.test/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:4174",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers":
        req.headers()["access-control-request-headers"] ??
        "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (req.method() === "POST") calls.push({ path, body: req.postDataJSON() });
    await route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify(
        path.endsWith("/get-session") ? null : { status: true },
      ),
    });
  });
  await page.goto("/signin?role=audience&next=https%3A%2F%2Fevil.example");
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("fixture@example.test");
  await page
    .getByRole("button", { name: "Send reset email", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "If this address has an account",
  );
  const reset = calls.find((c) => c.path.endsWith("/request-password-reset"));
  expect(reset?.body.redirectTo).toBe(
    "http://127.0.0.1:4174/signin?role=audience&next=%2Faccount",
  );
  await page.goto(
    "/signin?role=audience&token=fixture-reset-token&next=%2Faccount",
  );
  await page
    .getByLabel("Password", { exact: true })
    .fill("new-test-only-password-12345");
  await page
    .getByRole("button", { name: "Save new password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await expect(page).not.toHaveURL(/token=/);
  expect(
    calls.find((c) => c.path.endsWith("/reset-password"))?.body.token,
  ).toBe("fixture-reset-token");
});

test("native sign-in requires an explicit return confirmation and redeems only on its initiating device", async ({
  page,
}) => {
  const { createHash } = await import("node:crypto");
  const origin = "http://127.0.0.1:4174",
    verifier = "c".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const mobile = (
    await (
      await page.request.post("/api/mobile/session", {
        headers: { origin },
        data: {},
      })
    ).json()
  ).token;
  const started = await (
    await page.request.post("/api/identity/native/start", {
      headers: { origin, authorization: "Bearer " + mobile },
      data: { challenge },
    })
  ).json();
  await page.route("https://auth.example.test/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers":
        req.headers()["access-control-request-headers"] ??
        "content-type,authorization",
      "access-control-expose-headers": "set-auth-jwt",
      "set-auth-jwt": fixtureIdentityToken,
    };
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const user = {
      id: "browser-identity",
      email: "fixture@example.test",
      emailVerified: true,
      name: "Fixture account",
    };
    const body = path.endsWith("/get-session")
      ? {
          user,
          session: {
            id: "native-browser-fixture",
            userId: user.id,
            token: "managed-fixture",
            expiresAt: new Date(Date.now() + 900000).toISOString(),
          },
        }
      : { token: fixtureIdentityToken };
    await route.fulfill({
      status: 200,
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });
  const signIn = new URL(started.signInUrl);
  signIn.searchParams.set("role", "performer");
  await page.goto(signIn.href);
  await expect(page.getByLabel("I’m here as", { exact: true })).toHaveValue(
    "audience",
  );
  await expect(page.getByLabel("I’m here as", { exact: true })).toBeDisabled();
  const button = page.getByRole("button", {
    name: "Return to iOS with this account",
    exact: true,
  });
  await expect(button).toBeVisible();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/identity/native/approve"),
  );
  await button.click();
  const approved = await response;
  expect(approved.status()).toBe(200);
  const callback = new URL((await approved.json()).callback);
  expect(callback.protocol).toBe("com.neophilism.ourjam:");
  expect(callback.searchParams.has("token")).toBe(false);
  const redeemed = await page.request.post("/api/identity/native/redeem", {
    headers: { origin, authorization: "Bearer " + mobile },
    data: {
      requestId: started.requestId,
      code: callback.searchParams.get("code"),
      verifier,
    },
  });
  expect(redeemed.status()).toBe(200);
  const credential = (await redeemed.json()).token;
  expect(credential).toMatch(/^ojm_[a-f0-9]{64}$/);
  expect(
    (
      await page.request.get("/api/operator/events", {
        headers: { authorization: "Bearer " + credential },
      })
    ).status(),
  ).toBe(401);
});
