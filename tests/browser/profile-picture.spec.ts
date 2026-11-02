import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(new URL("../avatar-fixtures.json", import.meta.url), "utf8"),
);

test("a listener explicitly publishes a normalized photo, hides it with Anonymous and restores the musical avatar", async ({
  page,
}) => {
  await page.goto("/");
  const events = await (await page.request.get("/api/events")).json();
  const slug = events.events.find(
    (event: any) => event.title === "The first wave",
  ).slug;
  await page.goto("/event/" + slug);
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page.getByLabel("Your display name").fill("Photo fixture listener");
  await page.getByLabel("Show my contributions as Anonymous").uncheck();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page
    .getByLabel("Choose profile picture")
    .setInputFiles({
      name: "fixture.png",
      mimeType: "image/png",
      buffer: Buffer.from(fixture.metadata, "base64"),
    });
  await expect(page.getByAltText("New profile picture preview")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save profile picture", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("I have permission to use this picture on my public profile.")
    .check();
  await page
    .getByRole("button", { name: "Save profile picture", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Public profile picture saved.",
  );
  const session = await (await page.request.get("/api/session")).json();
  const imagePath = "/api/avatars/" + session.profile.avatar_sha;
  const image = await page.request.get(imagePath);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  expect((await image.body()).includes(Buffer.from("secret-fixture"))).toBe(
    false,
  );
  await page.getByLabel("Show my contributions as Anonymous").check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  expect((await page.request.get(imagePath)).status()).toBe(404);
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Use my musical avatar", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Profile picture removed.",
  );
});
