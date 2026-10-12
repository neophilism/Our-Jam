import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("monitor launcher opens the real event screen without an opener and shows exact native connection details", async ({ page, context }) => {
  const origin = "http://127.0.0.1:4173";
  await page.goto("/");
  await operatorSession(page);
  const slug = "windows-" + Date.now();
  const response = await page.request.post("/api/operator/events", {
    headers: { Origin: origin },
    data: { title: "Window acceptance", artistName: "Isolated test", slug, purchaseUrl: "https://example.test/album",
      sources: [{ title: "User supplied source slot", corePrompt: "PRIVATE_WINDOW_TEST", durationSeconds: 180 }] },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/performer/" + slug);
  await expect(page.getByLabel("Native app server", { exact: true })).toHaveValue(origin);
  await expect(page.getByLabel("Native app event code", { exact: true })).toHaveValue(slug);
  const opening = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open monitor window", exact: true }).click();
  const display = await opening;
  try {
    await expect(display).toHaveURL(origin + "/screen/" + slug);
    await expect(display.locator(".stage")).toBeVisible();
    await expect(display.getByText("Window acceptance", { exact: true })).toBeVisible();
    await expect(display.locator(".qr-pair img")).toHaveCount(2);
    expect(await display.evaluate(() => window.opener === null)).toBe(true);
    await expect(display.getByText("PRIVATE_WINDOW_TEST", { exact: true })).toHaveCount(0);
  } finally { await display.close(); }
  await expect(page.getByRole("link", { name: "Open the same public-screen link" })).toHaveAttribute("href", origin + "/screen/" + slug);
  await expect(page.getByRole("note").filter({ hasText: "same-Mac rehearsal" })).toBeVisible();
});
