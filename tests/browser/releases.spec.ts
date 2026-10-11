import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("artist holds a result through set end, previews privately and approves public release", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:4173";
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post("/api" + path, {
      headers: { Origin: origin },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  await page.goto("/");
  await operatorSession(page);
  const slug = "review-ui-" + Date.now();
  const event = await post("/operator/events", {
    title: "Artist review",
    artistName: "Test artist",
    slug,
    minimumRoundSeconds: 0,
    sources: [
      { title: "Opening", corePrompt: "Signature", durationSeconds: 180 },
    ],
  });
  await page.goto("/performer/" + slug);
  await page
    .getByText("Event, screen & participation settings", { exact: true })
    .click();
  await page
    .getByLabel("Crowd release timing", { exact: true })
    .selectOption("review");
  await page
    .getByRole("button", { name: "Save show settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save show settings", exact: true }),
  ).toHaveCount(0);
  const state = await (
    await page.request.get("/api/operator/events/" + slug)
  ).json();
  expect(state.event.settings.releaseMode).toBe("review");
  const lease = await post(`/operator/events/${event.id}/playback/claim`, {});
  const opened = await post(`/operator/events/${event.id}/advance`, {
    playback: { ...lease, sequence: 1 },
    commandId: crypto.randomUUID(),
    expectedRevision: state.event.revision,
  });
  await post("/session", {});
  await post(`/events/${slug}/join`, {});
  await post(`/rounds/${opened.roundId}/waves`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    text: "Soulful piano",
  });
  await post(`/operator/events/${event.id}/advance`, {
    playback: { ...lease, sequence: 2 },
    commandId: crypto.randomUUID(),
    expectedRevision: state.event.revision + 1,
  });
  const job = page.locator(".job-detail").first();
  await job.locator("summary").click();
  await expect(job).toContainText("On hold.");
  await job
    .getByLabel("Track title", { exact: true })
    .fill("Our private result");
  await job
    .getByLabel("Audio URL", { exact: true })
    .fill("https://media.example.test/review.wav");
  await job
    .getByLabel("Download URL", { exact: true })
    .fill("https://media.example.test/review.wav");
  await job.getByLabel("Duration (seconds)", { exact: true }).fill("20");
  await job.getByRole("checkbox").check();
  await job
    .getByRole("button", { name: "Prepare for release", exact: true })
    .click();
  await expect(
    job.getByRole("button", { name: "Publish to everyone now", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/events/" + slug)).json()).releases,
  ).toHaveLength(0);
  // Keep the external artist-supplied fixture local to this browser test.
  await page.route("https://media.example.test/review.wav", (route) =>
    route.fulfill({ status: 204 }),
  );
  await job
    .getByRole("button", { name: "Preview unreleased track", exact: false })
    .click();
  await expect(page.locator(".private-preview audio")).toHaveAttribute(
    "src",
    /\/api\/operator\/releases\/.*\/audio/,
  );
  await job
    .getByRole("button", { name: "Publish to everyone now", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Our private result", exact: true }),
  ).toBeVisible();
  const published = await (
    await page.request.get("/api/events/" + slug)
  ).json();
  expect(published.releases).toHaveLength(1);
  expect(published.releases[0].published_at).toBeTruthy();
});
