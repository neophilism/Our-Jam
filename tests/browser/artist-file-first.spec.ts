import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("independent artists choose files, not hosted audio links, for new sessions", async ({ page }) => {
  await page.goto("/performer");
  await operatorSession(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create a jam around your songs." })).toBeVisible();
  await expect(page.getByLabel("Upload track (MP3 or WAV)")).toBeVisible();
  await expect(page.getByLabel("Track audio URL (HTTPS)")).toHaveCount(0);
  await expect(page.getByText("No separate audio hosting required.")).toBeVisible();
  // The browser fixture intentionally has no private media store.
  // Never create an unusable show merely because a selected file looks valid.
  await expect(page.getByRole("button", { name: "Create and upload album" })).toBeDisabled();
});
