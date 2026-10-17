import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { COMPARISON_ENGINE_IDS } from "../packages/providers/src/comparison-catalog.js";
import { comparisonReadiness } from "../apps/api/src/comparison-settings.js";

const origin = "http://our-jam.test";
const secret = "private-comparison-administrator-key-12345678";

test("only logged-in platform admin can manage a persistent six-engine selection", async t => {
  const db = await testDatabase();
  const app = await createApp(db, { origin, secureCookies: false, adminToken: secret });
  t.after(async () => { await app.close(); await db.close(); });
  const url = "/api/admin/comparison/settings";
  assert.equal((await app.inject({ method: "GET", url })).statusCode, 401);
  assert.equal((await app.inject({ method: "PATCH", url, headers: { origin }, payload: {} })).statusCode, 401);
  const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin }, payload: { token: secret } });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = login.cookies.find(c => c.name === "oj_platform_admin");
  assert.ok(cookie?.value);
  const headers = { origin, cookie: "oj_platform_admin=" + cookie!.value };
  const initialResponse = await app.inject({ method: "GET", url, headers });
  assert.equal(initialResponse.statusCode, 200, initialResponse.body);
  const initial = initialResponse.json();
  assert.deepEqual(initial.selectedProviders, ["mureka", "stability"]);
  assert.equal(initial.providers.length, 6);
  assert.equal(initial.providers.find((p: any) => p.id === "musicgen").rights, "noncommercial_only");
  assert.equal(initial.providers.find((p: any) => p.id === "stable_audio_open").rights, "community_license_eligibility_required");
  assert.ok(initial.providers.every((p: any) => p.validated === false), "configuration must not claim live GPU acceptance");

  const payload = { commandId: randomUUID(), expectedRevision: initial.revision, selectedProviders: [...COMPARISON_ENGINE_IDS] };
  const updated = await app.inject({ method: "PATCH", url, headers, payload });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.deepEqual(updated.json().selectedProviders, COMPARISON_ENGINE_IDS);
  assert.equal((await app.inject({ method: "PATCH", url, headers, payload })).statusCode, 200, "identical retry is idempotent");
  assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { ...payload, commandId: randomUUID() } })).statusCode, 409, "stale revision cannot overwrite current selection");
  assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { commandId: randomUUID(), expectedRevision: 1, selectedProviders: [] } })).statusCode, 400);
  assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { commandId: randomUUID(), expectedRevision: 1, selectedProviders: ["mureka", "mureka"] } })).statusCode, 400);
  assert.equal((await app.inject({ method: "PATCH", url, headers: { ...headers, origin: "https://untrusted.example" }, payload })).statusCode, 403);
  assert.equal((await db.query("SELECT count(*)::integer n FROM platform_policy_audit WHERE action='comparison.selection'")).rows[0].n, 1);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/logout", headers, payload: {} })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url, headers })).statusCode, 401);
});

test("readiness describes configured secret presence but never credentials or imaginary prices", () => {
  const configured = comparisonReadiness({ MUREKA_API_KEY: "secret", STABLE_AUDIO_KEY: "also-secret", OURJAM_GPU_GATEWAY_URL: "https://gpu.example", OURJAM_GPU_GATEWAY_TOKEN: "gpu-secret" });
  assert.equal(configured.length, 6);
  assert.ok(configured.every(p => p.configured));
  assert.ok(configured.every(p => !p.validated && !p.costRateKnown));
  assert.doesNotMatch(JSON.stringify(configured), /also-secret|gpu-secret|"secret"/);
  const empty = comparisonReadiness({});
  assert.ok(empty.every(p => !p.configured));
});
