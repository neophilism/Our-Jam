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
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:4174",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
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
      body = { token: "fixture-valid" };
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
});
