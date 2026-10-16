import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("performer sees honest readiness before making a real event", async ({ page }) => {
  await page.goto("/performer");
  await operatorSession(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Rehearsal readiness" })).toBeVisible();
  await expect(page.getByText("Database connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Private media storage not connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Performer access configured", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Recheck readiness" }).click();
  await expect(page.getByText("Database connected", { exact: true })).toBeVisible();
  await expect(page.getByText(/does not replace a real song upload/)).toBeVisible();
});
