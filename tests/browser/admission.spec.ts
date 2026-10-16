import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("a listener joins without votes, then enters the artist's code to contribute", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:4173";
  await page.goto("/");
  await operatorSession(page);
  const slug = "room-code-" + Date.now();
  const create = await page.request.post("/api/operator/events", {
    headers: { Origin: origin },
    data: {
      title: "Room code rehearsal",
      artistName: "Artist",
      slug,
      admissionMode: "room_code",
      sources: [
        { title: "Original", corePrompt: "Signature", durationSeconds: 180 },
      ],
    },
  });
  expect(create.ok()).toBeTruthy();
  const event = await create.json();
  await page.goto("/performer/" + slug);
  const settings = page.getByRole("region", { name: "Audience admission" });
  await expect(settings).toContainText("Set a room code");
  await settings
    .getByRole("button", { name: "Edit audience admission", exact: true })
    .click();
  await settings.getByLabel("Set room code", { exact: true }).fill("ROOM2026");
  await settings.getByLabel("Contributor capacity", { exact: true }).fill("2");
  await settings
    .getByRole("button", { name: "Save audience admission", exact: true })
    .click();
  await expect(settings).toContainText("Contributors need the room code.");
  const lease = await (
    await page.request.post(`/api/operator/events/${event.id}/playback/claim`, {
      headers: { Origin: origin },
      data: {},
    })
  ).json();
  const started = await page.request.post(
    `/api/operator/events/${event.id}/advance`,
    {
      headers: { Origin: origin },
      data: {
        commandId: crypto.randomUUID(),
        expectedRevision: 1,
        playback: { ...lease, sequence: 1 },
      },
    },
  );
  expect(started.ok(), await started.text()).toBeTruthy();
  await page.goto("/event/" + slug);
  await expect(page.getByText(/To share Sound Waves or vote/)).toBeVisible();
  await page
    .getByRole("button", { name: "Join as a listener", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Listen to the tracks your crowd created.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sound Waves", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Join and vote", exact: false }),
  ).toBeDisabled();
  await page.getByLabel("Room code", { exact: true }).fill("WRONGCODE");
  await page
    .getByRole("button", { name: "Join and vote", exact: false })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "room code did not match",
  );
  await page.getByLabel("Room code", { exact: true }).fill("room-2026");
  await page
    .getByRole("button", { name: "Join and vote", exact: false })
    .click();
  await expect(
    page.getByLabel("What would you mix this with?", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("What would you mix this with?", { exact: true })
    .fill("Soulful strings");
  await page
    .getByRole("button", { name: "Contribute Sound Wave", exact: false })
    .click();
  await expect(
    page.locator(".wave-row").filter({ hasText: "Soulful strings" }),
  ).toBeVisible();
});
