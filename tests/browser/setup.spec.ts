import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("performer prepares audio, reorders tracks and preserves unsaved settings across live updates", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:4173";
  const post = (path: string, data: unknown) =>
    page.request.post("/api" + path, { headers: { Origin: origin }, data });
  await page.goto("/");
  await operatorSession(page);
  const slug = "setup-" + Date.now(),
    media = "https://media.example.test/setup.wav";
  const created = await post("/operator/events", {
    title: "Setup rehearsal",
    artistName: "Test artist",
    slug,
    sources: [
      {
        title: "Opening song",
        corePrompt: "First signature",
        durationSeconds: 60,
      },
      {
        title: "Second song",
        corePrompt: "Second signature",
        audioUrl: media,
        durationSeconds: 30,
      },
      {
        title: "Closing song",
        corePrompt: "Third signature",
        durationSeconds: 60,
      },
    ],
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const event = await created.json();
  // Twenty-second PCM metadata fixture. No audio device or physical routing is claimed.
  const bytes = Buffer.alloc(44 + 8000 * 20 * 2);
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
  await page.route(media, (route) =>
    route.fulfill({ contentType: "audio/wav", body: bytes }),
  );
  await page.goto("/performer/" + slug);
  await page
    .getByRole("button", { name: "Move Closing song next", exact: true })
    .click();
  await expect(
    page
      .locator(".queue-actions")
      .first()
      .getByRole("button", { name: "Move Closing song next", exact: true }),
  ).toBeDisabled();
  await page
    .getByText("Event, screen & participation settings", { exact: true })
    .click();
  await page.getByLabel("Event title", { exact: true }).fill("Renamed show");
  // A second controller's change must not reset the draft or silently overwrite it.
  const state = await (
    await page.request.get("/api/operator/events/" + slug)
  ).json();
  const reorder = await page.request.put(
    `/api/operator/events/${event.id}/queue`,
    {
      headers: { Origin: origin },
      data: {
        commandId: crypto.randomUUID(),
        expectedRevision: state.event.revision,
        queueIds: state.queue
          .filter((q: any) => q.state === "queued")
          .map((q: any) => q.id)
          .reverse(),
      },
    },
  );
  expect(reorder.ok()).toBeTruthy();
  await expect(page.getByLabel("Event title", { exact: true })).toHaveValue(
    "Renamed show",
  );
  await page
    .getByRole("button", { name: "Save show settings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Refresh before saving settings",
  );
  await page
    .getByRole("button", { name: "Reload settings fields", exact: true })
    .click();
  await page
    .getByLabel("Event title", { exact: true })
    .fill("Ready for the room");
  await page.getByLabel("Waves visible on screen", { exact: true }).fill("24");
  await page
    .getByRole("button", { name: "Save show settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready for the room", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Check this device’s audio links",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".audio-checks li").filter({ hasText: "Second song" }),
  ).toContainText("Duration mismatch");
  expect(
    await page
      .locator("audio")
      .evaluateAll((nodes) =>
        nodes.every((node) => (node as HTMLAudioElement).paused),
      ),
  ).toBe(true);
  await page
    .getByText("Review your songs and musical descriptions", { exact: true })
    .click();
  const form = page.locator(".show-setup .source-form").filter({
    has: page.getByRole("heading", { name: "Second song", exact: true }),
  });
  await form
    .getByLabel("Track duration in seconds", { exact: true })
    .fill("20");
  await form
    .getByRole("button", { name: "Save album track", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Check this device’s audio links",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".audio-checks li").filter({ hasText: "Second song" }),
  ).toContainText("Metadata OK");
  await page.screenshot({
    path: `test-results/${test.info().project.name}-show-setup.png`,
    fullPage: true,
  });
});
