import { test, expect } from "@playwright/test";

test("a first-time visitor understands the experience before joining", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Jam with the music you love." })).toBeVisible();
  const explanation = page.locator(".ourjam-explainer");
  await expect(explanation).toContainText("music itself");
  await expect(explanation).toContainText("Sound Wave");
  await expect(explanation).toContainText("vote for the ideas you love");
  await expect(explanation).toContainText("new track inspired by the music");
  await expect(explanation).toContainText("don't need to be a musician");
  await expect(page.locator(".how")).toContainText("Vote on the crowd's ideas.");
  await expect(page.locator("body")).not.toContainText(/five points|five votes|your points/i);
});

test("the audience sees votes with clear, control-specific explanations", async ({ page }) => {
  const events = await (await page.request.get("/api/events")).json();
  const slug = events.events.find((event: any) => event.title === "The first wave").slug;
  await page.goto("/event/" + slug);
  await expect(page.locator(".audience")).toContainText("Sound Wave");
  await page.getByRole("button", { name: "I'm in. Let's make music", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Vote on Sound Waves" })).toBeVisible();
  await expect(page.locator(".vote-explanation")).toContainText("Tap + to vote");
  await expect(page.locator(".vote-explanation")).toContainText("take one back");
  await expect(page.getByRole("progressbar", { name: /votes remaining/ })).toHaveAttribute("aria-valuemax", "5");
  await expect(page.locator(".audience")).not.toContainText(/five points|points left|move your points/i);
  await expect(page.getByRole("progressbar", { name: /votes remaining/ })).toHaveAttribute("aria-valuenow","5");
});
