import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("platform admin chooses fixed limits or an artist-defined range; artists cannot exceed it", async ({page}) => {
  const origin = "http://127.0.0.1:4173";
  await page.goto("/admin");
  await expect(page.getByRole("heading",{name:"Sound Wave voting"})).toBeVisible();
  await expect(page.getByText("Administrator sign-in")).toBeVisible();
  await page.getByLabel("Administrator credential").fill("browser-test-only-platform-admin-token-123456789");
  await page.getByRole("button",{name:"Sign in to platform settings"}).click();
  await expect(page.getByRole("heading",{name:"Voting allowance for all artists"})).toBeVisible();
  await page.getByLabel("Artist chooses within a range I approve").check();
  await page.getByLabel("Minimum artist choice").fill("3");
  await page.getByLabel("Maximum artist choice").fill("20");
  await page.getByRole("button",{name:"Save voting policy"}).click();
  await expect(page.getByRole("status")).toContainText("Voting settings saved");
  await operatorSession(page);
  await page.goto("/performer");
  await expect(page.getByLabel("How many votes can each fan cast per song?")).toHaveAttribute("min","3");
  await expect(page.getByLabel("How many votes can each fan cast per song?")).toHaveAttribute("max","20");
  await page.goto("/admin");
  await page.getByLabel("Platform chooses one fixed number for every artist").check();
  await page.getByLabel("Votes per listener per song").fill("5");
  await page.getByRole("button",{name:"Save voting policy"}).click();
  await expect(page.getByRole("status")).toContainText("Voting settings saved");
  await page.getByRole("button",{name:"Sign out of admin"}).click();
  await expect(page.getByText("Administrator sign-in")).toBeVisible();
});
