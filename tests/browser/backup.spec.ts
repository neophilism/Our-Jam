import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";
test("prepared local audio survives reload, releases live control and advances without network", async ({
  page,
  context,
}) => {
  const origin = "http://127.0.0.1:4173";
  await page.goto("/");
  await operatorSession(page);
  const slug = "backup-" + Date.now();
  const response = await page.request.post("/api/operator/events", {
    headers: { Origin: origin },
    data: {
      title: "Backup rehearsal",
      artistName: "Artist",
      slug,
      sources: [
        { title: "Backup one", corePrompt: "Core one", durationSeconds: 20 },
        { title: "Backup two", corePrompt: "Core two", durationSeconds: 20 },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const event = await response.json();
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
  for (let i = 0; i < 8000 * 20; i++)
    bytes.writeInt16LE(
      Math.round(Math.sin((i / 8000) * 440 * Math.PI * 2) * 6000),
      44 + i * 2,
    );
  await page.goto("/performer/" + slug);
  const backup = page.getByRole("region", { name: "Local album backup" });
  for (const title of ["Backup one", "Backup two"]) {
    await backup
      .getByLabel("Local file for " + title, { exact: true })
      .setInputFiles({
        name: title + ".wav",
        mimeType: "audio/wav",
        buffer: bytes,
      });
    await expect(
      backup.getByRole("button", {
        name: "Play backup: " + title,
        exact: true,
      }),
    ).toBeEnabled();
  }
  await page.reload();
  await expect(
    backup.getByRole("button", {
      name: "Play backup: Backup one",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Use this device for show playback",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Start the first round", exact: false })
    .click();
  await expect(
    page.getByText("UNTIL THE NEXT WAVE", { exact: true }),
  ).toBeVisible();
  await backup
    .getByRole("button", { name: "Play backup: Backup one", exact: true })
    .click();
  await expect(
    backup.getByText("Backup playing: Backup one", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("VOTING PAUSED", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Use this device for show playback",
      exact: true,
    }),
  ).toBeDisabled();
  const before = await (
    await page.request.get("/api/operator/events/" + slug)
  ).json();
  await context.setOffline(true);
  const audio = backup.locator("audio");
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.2);
  await audio.evaluate((a: HTMLAudioElement) => {
    a.currentTime = a.duration - 0.1;
  });
  await expect(
    backup.getByText("Backup playing: Backup two", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.2);
  await backup
    .getByRole("button", {
      name: "Stop backup & return to live controls",
      exact: true,
    })
    .click();
  await context.setOffline(false);
  const after = await (
    await page.request.get("/api/operator/events/" + slug)
  ).json();
  expect(after.current.id).toBe(before.current.id);
  expect(after.jobs).toHaveLength(0);
  expect(after.round.state).toBe("paused");
  // Corrupt the fixture copy to prove the pre-play checksum actually protects the path.
  const source = before.queue.find(
    (q: any) => q.source_id && q.title === "Backup one",
  ).source_id;
  await page.evaluate(
    async ({ eventId, sourceId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("our-jam-album-backup", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("files", "readwrite"),
          store = tx.objectStore("files"),
          r = store.get([eventId, sourceId]);
        r.onsuccess = () => {
          store.put({ ...r.result, blob: new Blob(["corrupt"]) });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { eventId: event.id, sourceId: source },
  );
  await backup
    .getByRole("button", { name: "Play backup: Backup one", exact: true })
    .click();
  await expect(backup.getByRole("alert")).toContainText(
    "Backup checksum mismatch",
  );
});
