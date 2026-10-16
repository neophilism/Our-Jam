import { test, expect } from "@playwright/test";

test("still waves avoid the graphics download and voting survives a lost WebGL context", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("our-jam-visual-mode"))
      localStorage.setItem("our-jam-visual-mode", "still");
  });
  const graphics: string[] = [];
  page.on("request", (r) => {
    if (/\/assets\/WaveField-.*\.js/.test(r.url())) graphics.push(r.url());
  });
  await page.goto("/");
  const events = await (await page.request.get("/api/events")).json();
  const slug = events.events.find(
    (e: any) => e.title === "The first wave",
  ).slug;
  await page.goto("/event/" + slug);
  const field = page.locator(".crowd-scene .wave-field");
  await expect(field).toHaveAttribute("data-mode", "still");
  await expect(field.locator("canvas")).toHaveCount(0);
  expect(graphics).toHaveLength(0);
  await page
    .getByRole("button", { name: "I'm in. Let's make music", exact: false })
    .click();
  const phrase = "Soft pads " + Date.now();
  await page
    .getByLabel("What would you mix this with?", { exact: true })
    .fill(phrase);
  await page
    .getByRole("button", { name: "Contribute Sound Wave", exact: true })
    .click();
  await expect(
    page.locator(".wave-row").filter({ hasText: phrase }),
  ).toBeVisible();
  await page.reload();
  await expect(field).toHaveAttribute("data-mode", "still");
  expect(graphics).toHaveLength(0);
  await page.locator(".visual-preferences summary").click();
  await page
    .getByLabel("Sound Wave motion", { exact: true })
    .selectOption("economy");
  await expect(field).toHaveAttribute("data-mode", "economy");
  await field.scrollIntoViewIfNeeded();
  const canvas = field.locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  expect(graphics.length).toBeGreaterThan(0);
  const lost = await canvas.evaluate((node: HTMLCanvasElement) => {
    const gl = node.getContext("webgl2") ?? node.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(
    lost,
    "The browser must expose real context-loss simulation for this acceptance check",
  ).toBe(true);
  await expect(field).toHaveAttribute("data-mode", "fallback");
  await expect(canvas).toHaveCount(0);
  await page
    .getByRole("button", { name: "Vote for " + phrase, exact: true })
    .click();
  await expect(
    page.getByLabel("3 of 5 votes remaining", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-visual-fallback.png`,
    fullPage: true,
  });
  // A device-level reduced-motion preference takes precedence over light animation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(field).toHaveAttribute("data-mode", "still");
  await expect(field.locator("canvas")).toHaveCount(0);
});
