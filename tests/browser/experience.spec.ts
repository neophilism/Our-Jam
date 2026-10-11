import { test, expect } from "@playwright/test";
test("a phone can join, contribute, reallocate and receive another participant’s live votes", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /THREE|Shader|VALIDATE_STATUS/.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your sound. Our next track." }),
  ).toBeVisible();
  const events = await (await page.request.get("/api/events")).json();
  const slug = events.events.find(
    (e: any) => e.title === "The first wave",
  ).slug;
  await page.goto("/event/" + slug);
  await page.getByRole("button", { name: "I'm in. Let's make music" }).click();
  const text = "Brass " + Date.now();
  await page.getByLabel("What would you mix this with?").fill(text);
  await page.getByRole("button", { name: "Contribute Sound Wave" }).click();
  await expect(
    page.getByRole("button", { name: "Support " + text, exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Support " + text, exact: true })
    .click();
  await expect(page.getByLabel("3 of 5 points remaining")).toBeVisible();
  const other = await browser.newContext();
  const friend = await other.newPage();
  await friend.goto("/event/" + slug);
  await friend
    .getByRole("button", { name: "I'm in. Let's make music" })
    .click();
  await friend
    .getByRole("button", { name: "Support " + text, exact: true })
    .click();
  await expect(
    page.locator(".wave-row").filter({ hasText: text }),
  ).toContainText("3 points");
  await page
    .getByRole("button", { name: "Remove a point from " + text, exact: true })
    .click();
  await expect(page.getByLabel("4 of 5 points remaining")).toBeVisible();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-audience.png`,
    fullPage: true,
  });
  await other.close();
  expect(errors).toEqual([]);
});
test("performer authentication is required and console can open crowd view", async ({
  page,
}) => {
  await page.goto("/performer");
  await expect(
    page.getByRole("heading", { name: "Performer access" }),
  ).toBeVisible();
  await page
    .getByLabel("Performer credential")
    .fill("browser-test-only-operator-token-123456");
  await page.getByRole("button", { name: "Open my console" }).click();
  await page
    .getByRole("link", { name: /The first wave/ })
    .first()
    .click();
  await expect(
    page.getByText("PERFORMER CONSOLE", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open crowd display" }),
  ).toBeVisible();
  const events = await (await page.request.get("/api/events")).json();
  await page.goto(
    "/screen/" +
      events.events.find((e: any) => e.title === "The first wave").slug,
  );
  await expect(page.getByText("FREE · JOIN & DOWNLOAD")).toBeVisible();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-screen.png`,
    fullPage: true,
  });
});

test("performer owns playback, pauses voting, and recovers saved recording chunks", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await page.goto("/performer");
  await page
    .getByLabel("Performer credential")
    .fill("browser-test-only-operator-token-123456");
  await page.getByRole("button", { name: "Open my console" }).click();
  const slug = "control-" + Date.now();
  const response = await page.request.post("/api/operator/events", {
    headers: { Origin: "http://127.0.0.1:4173" },
    data: {
      title: "Control rehearsal",
      artistName: "Test Artist",
      slug,
      minimumRoundSeconds: 0,
      sources: [
        {
          title: "Control source",
          corePrompt: "Synthetic test",
          durationSeconds: 180,
        },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/performer/" + slug);
  await page
    .getByRole("button", { name: "Use this device for show playback" })
    .click();
  await page.getByRole("button", { name: "Start the first round" }).click();
  await expect(
    page.getByRole("heading", { name: "Control source" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause the round", exact: true })
    .click();
  await expect(page.getByText("VOTING PAUSED")).toBeVisible();
  await page
    .getByRole("button", { name: "Resume the round", exact: true })
    .click();
  await expect(page.getByText("UNTIL THE NEXT WAVE")).toBeVisible();
  await page.getByRole("button", { name: "Record browser microphone" }).click();
  await expect(
    page.getByRole("button", { name: "Stop recording" }),
  ).toBeVisible();
  await expect(page.getByText(/1 chunks saved/)).toBeVisible({
    timeout: 12000,
  });
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator(".recording summary").first()).toContainText(
    "completed",
  );
  await page.reload();
  await page.locator(".recording > details > summary").first().click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save manifest" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toContain("-manifest.json");
});
