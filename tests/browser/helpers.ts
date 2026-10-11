import { expect, type BrowserContext, type Page } from "@playwright/test";
let operatorCookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;
// API fixture setup shares one real authenticated session per test worker.
// Separate UI authentication stories still exercise login from an empty jar.
export async function operatorSession(page: Page) {
  if (operatorCookies) {
    await page.context().addCookies(operatorCookies);
    return;
  }
  const response = await page.request.post("/api/operator/login", {
    headers: { Origin: "http://127.0.0.1:4173" },
    data: { token: "browser-test-only-operator-token-123456" },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  operatorCookies = (await page.context().cookies()).filter(
    (c) => c.name === "oj_operator",
  );
  expect(operatorCookies).toHaveLength(1);
}
