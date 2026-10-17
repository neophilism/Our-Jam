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
  await page.goto("/admin/commerce");
  await page
    .getByLabel("Platform admin credential", { exact: true })
    .fill("browser-test-only-admin-token-12345678");
  await page
    .getByRole("button", { name: "Sign in as administrator", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Platform video library", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Integration setup" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Webhook endpoint", { exact: true }),
  ).toHaveValue(origin + "/api/webhooks/stripe");
  await expect(
    page.getByLabel("google authorized redirect URI", { exact: true }),
  ).toHaveValue("https://auth.example.test/neondb/auth/callback/google");
  const video = await (await page.request.get("/__test__/video")).body();
  const sponsorName = "My test sponsor " + crypto.randomUUID();
  await page.getByLabel("Sponsor name", { exact: true }).fill(sponsorName);
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
    .filter({ hasText: sponsorName });
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

test("uploaded album detects duration on the server and retries an invalid recording without duplicating the event", async ({
  page,
}) => {
  await login(page);
  await page.goto("/performer");
  const form = page.locator(".create-event");
  await form
    .getByLabel("Event title", { exact: true })
    .fill("Automatic duration");
  await form.getByLabel("Artist name", { exact: true }).fill("Test artist");
  const slug = "auto-duration-" + crypto.randomUUID();
  await form.getByLabel("Event code", { exact: true }).fill(slug);
  await form.getByLabel("Track title", { exact: true }).fill("Measured song");
  await form
    .getByLabel("Describe this song's signature sound", { exact: true })
    .fill("Test signature");
  await expect(
    form.getByLabel("Track duration in seconds", { exact: true }),
  ).toHaveCount(0);
  await expect(
    form.getByLabel("Track audio URL (HTTPS)", { exact: true }),
  ).toHaveCount(0);
  const file = form.getByLabel("Upload track (MP3 or WAV)", { exact: true });
  await file.setInputFiles({
    name: "invalid.wav",
    mimeType: "audio/wav",
    buffer: Buffer.alloc(1024, 120),
  });
  await form
    .getByRole("button", { name: "Create and upload album ↗", exact: true })
    .click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form).toContainText(
    "Your session was saved. Retry remaining uploads",
  );
  await expect(page).toHaveURL(/\/performer$/);
  const saved = await (
    await page.request.get("/api/operator/events/" + slug)
  ).json();
  const bytes = Buffer.alloc(44 + 8000 * 23 * 2);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 0; i < 8000 * 23; i++)
    bytes.writeInt16LE(
      Math.round(10000 * Math.sin((2 * Math.PI * 220 * i) / 8000)),
      44 + i * 2,
    );
  await file.setInputFiles({
    name: "measured.wav",
    mimeType: "audio/wav",
    buffer: bytes,
  });
  await form
    .getByRole("button", { name: "Retry remaining uploads ↗", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("/performer/" + slug + "$"));
  const catalog = await (
    await page.request.get(
      "/api/operator/events/" + saved.event.id + "/sources",
    )
  ).json();
  expect(catalog.sources).toHaveLength(1);
  expect(catalog.sources[0].duration_verified).toBe(true);
  // MP3 framing can add a fraction of a second; the stored duration rounds up.
  expect(Number(catalog.sources[0].duration_seconds)).toBeGreaterThanOrEqual(23);
  expect(Number(catalog.sources[0].duration_seconds)).toBeLessThanOrEqual(24);
  const state = await (
    await page.request.get("/api/operator/events/" + slug)
  ).json();
  expect(state.event.id).toBe(saved.event.id);
  expect(state.event.settings.voteMode).toBe("single");
  const quote = await (
    await page.request.get(
      "/api/operator/events/" + saved.event.id + "/commerce",
    )
  ).json();
  expect(quote.quote.verified).toBe(true);
  expect(quote.quote.billableMinutes).toBe(1);
});
