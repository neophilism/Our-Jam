import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

test("saved-task UI contract keeps zero-budget checks disabled and asks before a fixture reconciliation", async ({ page }) => {
  const origin = "http://127.0.0.1:4173";
  await page.goto("/"); await operatorSession(page);
  const slug = "receipt-ui-" + Date.now();
  const response = await page.request.post("/api/operator/events", {
    headers: { Origin: origin }, data: {
      title: "Receipt UI fixture", artistName: "Test", slug,
      sources: [{ title: "Original", corePrompt: "Private fixture prompt", durationSeconds: 900 }],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const event = await response.json();
  const jobId = "c1bcc7e2-b804-4c7d-80cd-ec4f7ed44a09";
  let funded = false, requested = false, posts = 0;
  // UI-only receipt fixture: real SQL authorization, worker accounting, and
  // lease races are separately covered by generation-reconciliation.test.ts.
  // This intercept never calls a provider or changes the server's $0 allowance.
  await page.route(origin + `/api/operator/events/${event.id}/generation-provider`, async (route) => {
    const base = await route.fetch();
    const state = await base.json();
    await route.fulfill({ response: base, json: {
      ...state, state: funded ? "configured" : "approved_budget_zero",
      eventBudgetCents: funded ? 20 : 0, totalBudgetCents: funded ? 20 : 0,
      jobs: [{ id: jobId, state: "unknown", reason: requested ? "reconciliation_requested" : "provider_poll_timeout",
        requested_provider: "mureka", provider: "mureka", model: "fixture-only", providerRef: "fixture_saved_task", attempts: 1, reservedCents: 20,
        reconciliation: { canRequest: funded && !requested, blockReason: funded ? null : "approved_budget_zero" } }],
    } });
  });
  await page.route(origin + `/api/operator/jobs/${jobId}/reconcile`, async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual(["commandId", "expectedRevision"]);
    expect(body.commandId).toMatch(/^[a-f0-9-]{36}$/);
    posts++; requested = true;
    await route.fulfill({ json: { ok: true, reconciliation: "requested", createsNewTask: false } });
  });
  await page.goto("/performer/" + slug);
  const controls = page.getByRole("region", { name: "Music generation" });
  await controls.getByText("Generation activity (1)", { exact: true }).click();
  await expect(controls.getByRole("button", { name: "Check existing task" })).toBeDisabled();
  await expect(controls).toContainText("fixture_saved_task");
  expect(posts).toBe(0);
  funded = true;
  await page.reload();
  await controls.getByText("Generation activity (1)", { exact: true }).click();
  const check = controls.getByRole("button", { name: "Check existing task" });
  await expect(check).toBeEnabled();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("never creates a new generation");
    await dialog.accept();
  });
  await check.click();
  await expect(check).toBeDisabled();
  await expect(controls).toContainText("A check of the saved task is queued");
  expect(posts).toBe(1);
});
