import { test, expect, type Page, type BrowserContext } from "@playwright/test";
const origin = "http://127.0.0.1:4174";
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;
async function login(page: Page) {
  if (cookies) {
    await page.context().addCookies(cookies);
    return;
  }
  const r = await page.request.post("/api/operator/login", {
    headers: { origin },
    data: { token: "browser-test-only-operator-token-123456" },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  cookies = (await page.context().cookies()).filter(
    (c) => c.name === "oj_operator",
  );
}
async function fixture(page: Page, paid = false, tier = "platform") {
  await login(page);
  const r = await page.request.post("/__test__/event", {
    headers: { origin },
    data: { paid, tier },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
test("artist sees measured event quote and admin can configure prices without granting performer admin rights", async ({
  page,
}) => {
  const event = await fixture(page);
  await page.goto("/performer/" + event.slug);
  await expect(
    page.getByRole("heading", { name: "Your event plan", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".commerce-panel")).toContainText(
    "3 setlist minutes",
  );
  await expect(page.locator(".commerce-panel")).toContainText("$3.00");
  await page
    .getByLabel("Event plan", { exact: true })
    .selectOption("own_sponsors");
  await expect(page.locator(".commerce-panel")).toContainText("$9.00");
  expect((await page.request.get("/api/admin/commerce")).status()).toBe(401);
  await page.goto("/admin");
  await page
    .getByLabel("Platform admin credential", { exact: true })
    .fill("browser-test-only-admin-token-12345678");
  await page
    .getByRole("button", { name: "Sign in as administrator", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Platform video library", exact: true }),
  ).toBeVisible();
  const video = await (await page.request.get("/__test__/video")).body();
  await page
    .getByLabel("Sponsor name", { exact: true })
    .fill("My actual test sponsor");
  await page
    .getByLabel("Silent video ad (MP4)", { exact: true })
    .setInputFiles({
      name: "sponsor.mp4",
      mimeType: "video/mp4",
      buffer: video,
    });
  await page
    .getByRole("button", { name: "Upload sponsor video", exact: true })
    .click();
  const row = page
    .locator(".sponsor-video-row")
    .filter({ hasText: "My actual test sponsor" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Publish video", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Unpublish", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("sponsor-admin.png"),
    fullPage: true,
  });
});
test("silent sponsor video and countdown pause with music and the server prevents premature participation", async ({
  page,
}) => {
  const event = await fixture(page, true);
  const post = (url: string, data: any) =>
    page.request.post(url, { headers: { origin }, data });
  const lease = await (
    await post(`/api/operator/events/${event.id}/playback/claim`, {})
  ).json();
  const opened = await (
    await post(`/api/operator/events/${event.id}/advance`, {
      commandId: crypto.randomUUID(),
      expectedRevision: 0,
      playback: { ...lease, sequence: 1 },
    })
  ).json();
  await post("/api/session", {});
  await post(`/api/events/${event.slug}/join`, {});
  const early = await post(`/api/rounds/${opened.roundId}/waves`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    text: "Warm piano",
  });
  expect(early.status()).toBe(409);
  expect((await early.json()).error).toBe("sponsor_break");
  await post(`/api/operator/events/${event.id}/playback/pause`, {
    ...lease,
    sequence: 2,
    commandId: crypto.randomUUID(),
    pause: true,
  });
  await page.goto("/screen/" + event.slug);
  const sponsor = page.getByRole("region", {
    name: "Sponsor video break",
    exact: true,
  });
  await expect(sponsor).toBeVisible();
  await expect(sponsor).toContainText("Countdown paused with the music");
  await expect(sponsor.locator("video")).toHaveJSProperty("muted", true);
  await expect(sponsor.locator("video")).toHaveJSProperty("paused", true);
  await page.screenshot({
    path: test.info().outputPath("sponsor-countdown.png"),
    fullPage: true,
  });
  await post(`/api/operator/events/${event.id}/playback/pause`, {
    ...lease,
    sequence: 3,
    commandId: crypto.randomUUID(),
    pause: false,
  });
  await page.request.post("/__test__/elapsed", {
    headers: { origin },
    data: { eventId: event.id },
  });
  await expect(sponsor).toHaveCount(0);
  const accepted = await post(`/api/rounds/${opened.roundId}/waves`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    text: "Warm piano",
  });
  expect(accepted.ok(), await accepted.text()).toBeTruthy();
});
test("ad-free paid event has immediate participation with no sponsor video", async ({
  page,
}) => {
  const event = await fixture(page, true, "ad_free");
  const post = (url: string, data: any) =>
    page.request.post(url, { headers: { origin }, data });
  const lease = await (
    await post(`/api/operator/events/${event.id}/playback/claim`, {})
  ).json();
  const r = await post(`/api/operator/events/${event.id}/advance`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    playback: { ...lease, sequence: 1 },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  await page.goto("/screen/" + event.slug);
  await expect(
    page.getByRole("region", { name: "Sponsor video break", exact: true }),
  ).toHaveCount(0);
});
