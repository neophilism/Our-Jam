import { test, expect } from "@playwright/test";

test("a fan follows an artist and recovers the same profile in another browser", async ({
  page,
  browser,
}) => {
  await page.goto("/artist/our-jam");
  await page
    .getByRole("button", { name: "Follow artist", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Following artist", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/account");
  const name = "Fan " + test.info().project.name;
  await page.getByLabel("Display name", { exact: true }).fill(name);
  await page.getByLabel("Show my contributions as Anonymous").uncheck();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  const original = (await (await page.request.get("/api/session")).json())
    .profile.id;
  await page
    .getByLabel("I will keep my recovery key somewhere private.")
    .check();
  await page
    .getByRole("button", { name: "Create recovery key", exact: true })
    .click();
  const keyField = page.getByLabel("Your new recovery key", { exact: true });
  await expect(keyField).toBeVisible();
  const key = await keyField.inputValue();
  expect(key).toMatch(/^ojr_[a-f0-9]{64}$/);
  await page
    .getByRole("button", { name: "I saved it. Hide key", exact: true })
    .click();
  await expect(keyField).toHaveCount(0);
  const other = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const recovered = await other.newPage();
    await recovered.goto("/account");
    await recovered.getByLabel("Saved recovery key", { exact: true }).fill(key);
    await recovered
      .getByRole("button", { name: "Recover profile", exact: true })
      .click();
    await expect(recovered.getByRole("status")).toHaveText(
      "Your profile is back. Your other devices have been signed out.",
    );
    await expect(
      recovered.getByLabel("Display name", { exact: true }),
    ).toHaveValue(name);
    expect(
      (await (await recovered.request.get("/api/session")).json()).profile.id,
    ).toBe(original);
    expect(
      (await (await page.request.get("/api/session")).json()).profile,
    ).toBeNull();
    expect(
      await recovered.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await recovered.screenshot({
      path: `test-results/${test.info().project.name}-recovered-profile.png`,
      fullPage: false,
    });
    await recovered.goto("/library");
    await expect(
      recovered.locator(".following-feed a[href='/artist/our-jam']"),
    ).toBeVisible();
    await recovered.goto("/artist/our-jam");
    await recovered
      .getByRole("button", { name: "Following artist", exact: true })
      .click();
    await expect(
      recovered.getByRole("button", { name: "Follow artist", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
  } finally {
    await other.close();
  }
});

test("a fan can disable a saved key before signing out", async ({ page }) => {
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Create a guest profile", exact: true })
    .click();
  await page
    .getByLabel("I will keep my recovery key somewhere private.")
    .check();
  await page
    .getByRole("button", { name: "Create recovery key", exact: true })
    .click();
  const field = page.getByLabel("Your new recovery key", { exact: true });
  await expect(field).toBeVisible();
  const key = await field.inputValue();
  await page
    .getByLabel("I will keep my recovery key somewhere private.")
    .check();
  await page
    .getByRole("button", { name: "Disable recovery", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Recovery disabled. Your saved key no longer works.",
  );
  await page
    .getByRole("button", { name: "Sign out of this profile", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create a guest profile", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Saved recovery key", { exact: true }).fill(key);
  await page
    .getByRole("button", { name: "Recover profile", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "That recovery key is not valid. Check your saved copy.",
  );
});
