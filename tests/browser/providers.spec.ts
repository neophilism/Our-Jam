import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("provider toggle persists while an unfunded real round still sends audience tags to the actual stage route", async ({ page, browser }) => {
  const origin = "http://127.0.0.1:4173";
  const slug = "providers-" + Date.now();
  await page.goto("/");
  await operatorSession(page);
  const created = await page.request.post("/api/operator/events", {
    headers: { Origin: origin },
    data: { title: "Provider controls test", artistName: "Test artist", slug, minimumRoundSeconds: 0,
      sources: [{ title: "Provider test source", corePrompt: "Private test-only core", durationSeconds: 900 }] },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const event = await created.json();
  await page.goto("/performer/" + slug);
  const controls = page.getByRole("region", { name: "Music generation" });
  await expect(controls.getByRole("button", { name: "Stable Audio", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(controls.getByRole("status")).toContainText("approved spending limit is $0");
  await controls.getByRole("button", { name: "Mureka", exact: true }).click();
  await expect(controls.getByRole("button", { name: "Mureka", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(controls.getByRole("button", { name: "Mureka", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Use this device for show playback" }).click();
  await page.getByRole("button", { name: "Start the first round" }).click();
  await expect(controls).toContainText("Active round: Mureka");
  await controls.getByRole("button", { name: "Stable Audio", exact: true }).click();
  await expect(controls.getByRole("button", { name: "Stable Audio", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(controls).toContainText("Active round: Mureka");
  const listenerContext = await browser.newContext();
  const screenContext = await browser.newContext();
  try {
    const audience = await listenerContext.newPage();
    const screen = await screenContext.newPage();
    await screen.goto(origin + "/screen/" + slug);
    await audience.goto(origin + "/event/" + slug);
    await audience.getByRole("button", { name: "I'm in. Let's make music" }).click();
    const text = "Warm woodwinds " + Date.now();
    await audience.getByLabel("What would you mix this with?").fill(text);
    await audience.getByRole("button", { name: "Contribute Sound Wave" }).click();
    await expect(audience.getByRole("button", { name: "Support " + text, exact: true })).toBeEnabled();
    await expect(screen.getByText(text, { exact: true }).first()).toBeVisible();
    const privateResponse = await audience.request.get(origin + `/api/operator/events/${event.id}/generation-provider`);
    expect(privateResponse.status()).toBe(401);
    await expect(screen.getByText("Private test-only core", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `test-results/${test.info().project.name}-provider-controls.png`, fullPage: true });
    await screen.screenshot({ path: `test-results/${test.info().project.name}-provider-stage.png`, fullPage: true });
  } finally {
    await listenerContext.close(); await screenContext.close();
  }
});
