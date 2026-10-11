import { test, expect } from "@playwright/test";
test("audience explicitly confirms optional email and can unsubscribe without a guest cookie", async ({
  page,
  browser,
}) => {
  const origin = "http://127.0.0.1:4173";
  const events = await (await page.request.get("/api/events")).json();
  const slug = events.events.find(
    (e: any) => e.title === "The first wave",
  ).slug;
  await page.goto("/event/" + slug);
  await page.getByRole("button", { name: "I'm in. Let's make music" }).click();
  const preferences = page.getByLabel("Release email preferences");
  await expect(preferences).toBeVisible();
  const address = `browser-${test.info().project.name}-${Date.now()}@example.test`;
  await preferences.getByLabel("Email address", { exact: true }).fill(address);
  await preferences.getByRole("checkbox").check();
  await preferences
    .getByRole("button", { name: "Send confirmation", exact: true })
    .click();
  await expect(preferences.getByRole("status")).toContainText(
    "confirmation will arrive",
  );
  expect(
    (
      await page.request.post("/__test__/email/tick", {
        headers: { Origin: origin },
        data: {},
      })
    ).ok(),
  ).toBeTruthy();
  const messages = (await (await page.request.get("/__test__/email")).json())
    .messages;
  const mail = messages.find((m: any) => m.to[0] === address);
  expect(mail).toBeTruthy();
  const confirm = mail.text.match(
    /http:\/\/127.0.0.1:4173\/email\/verify#[a-f0-9]{64}/,
  )[0];
  const unsubscribe = mail.text.match(
    /http:\/\/127.0.0.1:4173\/email\/unsubscribe#[a-f0-9]{64}/,
  )[0];
  const other = await browser.newContext();
  const inbox = await other.newPage();
  await inbox.goto(confirm);
  await expect(
    inbox.getByRole("button", { name: "Confirm release emails", exact: true }),
  ).toBeEnabled();
  expect(new URL(inbox.url()).hash).toBe("");
  await inbox
    .getByRole("button", { name: "Confirm release emails", exact: true })
    .click();
  await expect(inbox.getByRole("status")).toContainText("You’re confirmed");
  await page.reload();
  await expect(preferences).toContainText("Your address is confirmed");
  await inbox.goto(unsubscribe);
  await inbox
    .getByRole("button", { name: "Unsubscribe from this event", exact: true })
    .click();
  await expect(inbox.getByRole("status")).toContainText("have stopped");
  await page.reload();
  await expect(
    preferences.getByRole("button", { name: "Send confirmation", exact: true }),
  ).toBeVisible();
  await other.close();
});
