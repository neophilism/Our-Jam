import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";
test("artist edits public music links and remote visitors explore the session archive", async ({
  page,
}) => {
  await page.goto("/");
  await operatorSession(page);
  await page.goto("/performer");
  await page.getByText("Your public artist page", { exact: true }).click();
  const name = "Archive Artist " + test.info().project.name;
  await page.getByLabel("Artist page name", { exact: true }).fill(name);
  await page
    .getByLabel("About your music", { exact: true })
    .fill("A sound that grows with every crowd.");
  const linkInputs = page.getByLabel("Link label", { exact: true });
  if ((await linkInputs.count()) === 0)
    await page
      .getByRole("button", { name: "Add music link", exact: true })
      .click();
  await linkInputs.first().fill("Stream the album");
  await page
    .getByLabel("Link URL", { exact: true })
    .first()
    .fill("https://example.test/music");
  await page
    .getByRole("button", { name: "Save artist page", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Artist page saved.");
  await page.goto("/artist/our-jam");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Stream the album", exact: false }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await page.screenshot({
    path: `test-results/${test.info().project.name}-artist-archive.png`,
    fullPage: false,
  });
  await page.getByRole("button", { name: "Live now", exact: true }).click();
  const session = page
    .locator(".archive-event")
    .filter({
      has: page.getByRole("heading", { name: "The first wave", exact: true }),
    });
  await session
    .getByRole("link", { name: "Listen & explore", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "The room has a sound.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Our tracks/ })).toHaveClass(
    "active",
  );
});

test("audience voting stops while offline and refreshes before re-enabling after reconnect", async ({
  page,
  context,
}) => {
  const events = await (await page.request.get("/api/events")).json(),
    slug = events.events.find((e: any) => e.title === "The first wave").slug;
  await page.goto("/event/" + slug);
  await page.getByRole("button", { name: "I'm in. Let's make music" }).click();
  const text = "Reconnect " + Date.now();
  await page.getByLabel("What would you mix this with?").fill(text);
  await page.getByRole("button", { name: "Contribute Sound Wave" }).click();
  const support = page.getByRole("button", {
    name: "Support " + text,
    exact: true,
  });
  await expect(support).toBeEnabled();
  await context.setOffline(true);
  await expect(support).toBeDisabled();
  await expect(
    page.getByText(
      "The room is reconnecting. Voting resumes when its current state arrives.",
      { exact: true },
    ),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(support).toBeEnabled({ timeout: 15000 });
  await support.click();
  await expect(page.getByLabel("3 votes remaining in this song")).toBeVisible();
});
