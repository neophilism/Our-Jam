import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createEvent, advance, submitWave } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { setGenerationProvider } from "../apps/api/src/provider-controls.js";
import { generationTick, type GenerationConfig } from "../apps/api/src/generation.js";
import { reconciliationBlock, requestReconciliation } from "../apps/api/src/generation-reconciliation.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { ProviderError, type MusicProvider, type GeneratedAudio } from "../packages/providers/src/stability.js";
import { murekaProvider } from "../packages/providers/src/mureka.js";
import { createApp } from "../apps/api/src/app.js";

type DB = Awaited<ReturnType<typeof testDatabase>>;
const revision = async (db: DB, eventId: string) => (await db.query("SELECT revision FROM events WHERE id=$1", [eventId])).rows[0].revision;
const readJob = async (db: DB, eventId: string) => (await db.query("SELECT * FROM generation_jobs WHERE event_id=$1", [eventId])).rows[0];
async function prepare(db: DB) {
  const event = await createEvent(db, "our-jam", eventInput.parse({
    title: "Saved task test", artistName: "Fixture", slug: "reconcile-" + randomUUID(), minimumRoundSeconds: 0,
    sources: [{ title: "Original", corePrompt: "PRIVATE_RECOVERY_CORE", durationSeconds: 30 }],
  }));
  await setGenerationProvider(db, "our-jam", event.id, { provider: "mureka", commandId: randomUUID(), expectedRevision: 0 });
  const lease = await claimPlayback(db, "our-jam", event.id);
  const opened = await advance(db, "our-jam", event.id, randomUUID(), await revision(db, event.id), { ...lease, sequence: 1 }, true);
  const participant = randomUUID();
  await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,'test')", [participant]);
  await db.query("INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)", [event.id, participant]);
  await submitWave(db, { participantId: participant }, opened.roundId!, { commandId: randomUUID(), expectedRevision: 0, text: "Warm brass" });
  await advance(db, "our-jam", event.id, randomUUID(), await revision(db, event.id), { ...lease, sequence: 2 }, true);
  return event;
}
function fixture() {
  let submitted = 0, resumed = 0;
  const keys: string[] = [];
  const provider: MusicProvider = {
    name: "mureka", model: "fixture-model", variableDuration: true,
    generate: async (_prompt, _duration, context) => {
      submitted++;
      await context?.onAccepted?.("saved_task");
      throw new ProviderError("provider_poll_interrupted", true);
    },
    resume: async (reference, prompt, _duration, context) => {
      resumed++;
      assert.equal(reference, "saved_task");
      assert.match(prompt, /PRIVATE_RECOVERY_CORE/);
      await context?.onAccepted?.(reference);
      return { bytes: new Uint8Array([7, 8, 9]), providerRef: reference };
    },
  };
  const config: GenerationConfig = {
    provider, maxJobCents: 20, eventBudgetCents: 20, totalBudgetCents: 20, durationSeconds: 90,
    store: { put: async (key) => { keys.push(key); }, url: async () => "" },
    validate: async () => ({ durationSeconds: 60.25, meanDb: -12 }),
  };
  return { config, provider, keys, counts: () => ({ submitted, resumed }) };
}
async function request(db: DB, eventId: string, config: GenerationConfig) {
  const row = await readJob(db, eventId);
  const input = { commandId: randomUUID(), expectedRevision: await revision(db, eventId) };
  const result = await requestReconciliation(db, "our-jam", row.id, input, config);
  return { row, input, result };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("the explicit Mureka resume capability only GETs the saved task and media", async () => {
  const calls: string[] = [];
  const provider = murekaProvider("fixture-only", { request: async (url, options) => {
    calls.push(options?.method ?? "GET");
    if (String(url).includes("/query/")) return new Response(JSON.stringify({ id: "saved_task", status: "succeeded", choices: [{ url: "https://cdn.mureka.ai/fixture.mp3" }] }), { headers: { "content-type": "application/json" } });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
  } });
  assert.ok(provider.resume);
  const result = await provider.resume("saved_task", "Core", 90);
  assert.equal(result.providerRef, "saved_task");
  assert.deepEqual(calls, ["GET", "GET"]);
});

test("explicit reconciliation is owner-scoped, replay-safe, and retains one paid attempt/reservation", async (t) => {
  const db = await testDatabase(); t.after(() => db.close());
  const event = await prepare(db); const f = fixture();
  await generationTick(db, f.config);
  const before = await readJob(db, event.id);
  assert.equal(before.state, "unknown");
  await generationTick(db, f.config);
  assert.deepEqual(f.counts(), { submitted: 1, resumed: 0 });
  const input = { commandId: randomUUID(), expectedRevision: await revision(db, event.id) };
  await assert.rejects(requestReconciliation(db, "another-artist", before.id, input, f.config));
  const responses = await Promise.all([requestReconciliation(db, "our-jam", before.id, input, f.config), requestReconciliation(db, "our-jam", before.id, input, f.config)]);
  assert.deepEqual(responses[0], responses[1]);
  await Promise.all([generationTick(db, f.config), generationTick(db, f.config)]);
  const after = await readJob(db, event.id);
  assert.equal(after.state, "published");
  assert.equal(after.attempts, before.attempts);
  assert.equal(after.attempt_id, before.attempt_id);
  assert.equal(after.reserved_cents, before.reserved_cents);
  assert.deepEqual(f.counts(), { submitted: 1, resumed: 1 });
  assert.equal(f.keys.length, 1);
  assert.match(f.keys[0], /\/[a-f0-9]{64}\.mp3$/);
  assert.equal((await db.query("SELECT count(*)::int n FROM releases WHERE event_id=$1", [event.id])).rows[0].n, 1);
  assert.deepEqual(await requestReconciliation(db, "our-jam", before.id, input, f.config), responses[0]);
  await generationTick(db, f.config);
  assert.deepEqual(f.counts(), { submitted: 1, resumed: 1 });
});

test("zero budget blocks both requesting and dispatching a previously requested reconciliation", async (t) => {
  const db = await testDatabase(); t.after(() => db.close());
  const event = await prepare(db); const f = fixture();
  await generationTick(db, f.config);
  const row = await readJob(db, event.id);
  const input = { commandId: randomUUID(), expectedRevision: await revision(db, event.id) };
  const zero = { ...f.config, eventBudgetCents: 0 };
  await assert.rejects(requestReconciliation(db, "our-jam", row.id, input, zero), (e: any) => e.code === "approved_budget_zero");
  await requestReconciliation(db, "our-jam", row.id, input, f.config);
  await generationTick(db, zero);
  const after = await readJob(db, event.id);
  assert.equal(after.state, "unknown"); assert.equal(after.reason, "approved_budget_zero");
  assert.equal(after.attempts, 1); assert.equal(after.reserved_cents, 20);
  assert.deepEqual(f.counts(), { submitted: 1, resumed: 0 }); assert.equal(f.keys.length, 0);
});

test("missing receipts, wrong models and providers without an explicit resume capability fail closed", () => {
  const f = fixture();
  const row = { provider: "mureka", requested_provider: "mureka", model: "fixture-model", provider_ref: "saved_task", attempt_id: randomUUID(), attempts: 1, reserved_cents: 20 };
  assert.equal(reconciliationBlock(f.config, row), null);
  assert.equal(reconciliationBlock(f.config, { ...row, provider_ref: null }), "provider_receipt_missing");
  assert.equal(reconciliationBlock(f.config, { ...row, provider_ref: "../new-task" }), "provider_receipt_missing");
  assert.equal(reconciliationBlock(f.config, { ...row, attempts: 0 }), "provider_receipt_missing");
  assert.equal(reconciliationBlock(f.config, { ...row, reserved_cents: 0 }), "provider_receipt_missing");
  assert.equal(reconciliationBlock(f.config, { ...row, model: "new-model" }), "provider_model_changed");
  assert.equal(reconciliationBlock(f.config, { ...row, requested_provider: "stability" }), "provider_task_not_resumable");
  assert.equal(reconciliationBlock({ ...f.config, provider: { ...f.provider, resume: undefined } }, row), "provider_task_not_resumable");
});

test("a stale worker cannot replace the state of an explicitly resumed task", { timeout: 30000 }, async (t) => {
  const db = await testDatabase(); t.after(() => db.close());
  const event = await prepare(db); const f = fixture();
  const originalStarted = deferred<void>(), originalResult = deferred<GeneratedAudio>();
  const resumedStarted = deferred<void>(), resumedResult = deferred<GeneratedAudio>();
  f.provider.generate = async (_p, _d, context) => { await context?.onAccepted?.("saved_task"); originalStarted.resolve(); return originalResult.promise; };
  f.provider.resume = async (_ref, _p, _d, context) => { await context?.onAccepted?.("saved_task"); resumedStarted.resolve(); return resumedResult.promise; };
  const original = generationTick(db, f.config);
  await originalStarted.promise;
  await db.query("UPDATE generation_jobs SET lease_until=now()-interval '1 second' WHERE event_id=$1", [event.id]);
  await generationTick(db, f.config);
  assert.equal((await readJob(db, event.id)).state, "unknown");
  await request(db, event.id, f.config);
  const resumed = generationTick(db, f.config);
  await resumedStarted.promise;
  originalResult.reject(new ProviderError("late_original_failure", true));
  await original;
  assert.equal((await readJob(db, event.id)).state, "submitting");
  resumedResult.resolve({ bytes: new Uint8Array([8, 9, 10]), providerRef: "saved_task" });
  await resumed;
  assert.equal((await readJob(db, event.id)).state, "published");
  assert.equal((await readJob(db, event.id)).attempts, 1);
});

test("a mismatched resumed receipt is never stored or released", async (t) => {
  const db = await testDatabase(); t.after(() => db.close());
  const event = await prepare(db); const f = fixture();
  await generationTick(db, f.config); await request(db, event.id, f.config);
  f.provider.resume = async () => ({ bytes: new Uint8Array([9]), providerRef: "different_task" });
  await generationTick(db, f.config);
  const job = await readJob(db, event.id);
  assert.equal(job.state, "unknown"); assert.equal(job.reason, "provider_task_mismatch");
  assert.equal(f.keys.length, 0);
  assert.equal((await db.query("SELECT count(*)::int n FROM releases", [])).rows[0].n, 0);
});

test("reconciliation API requires operator identity, exact Origin and a fresh revision; receipt remains private", async (t) => {
  const db = await testDatabase(); t.after(() => db.close());
  const event = await prepare(db); const f = fixture(); await generationTick(db, f.config);
  const row = await readJob(db, event.id);
  const origin = "https://ourjam.example.test", token = "test-only-operator-reconciliation-secret";
  const app = await createApp(db, { origin, operatorToken: token, secureCookies: true, generation: f.config });
  t.after(() => app.close());
  const login = await app.inject({ method: "POST", url: "/api/operator/login", headers: { origin }, payload: { token } });
  assert.equal(login.statusCode, 200);
  const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const url = `/api/operator/jobs/${row.id}/reconcile`;
  const input = { commandId: randomUUID(), expectedRevision: await revision(db, event.id) };
  assert.equal((await app.inject({ method: "POST", url, headers: { origin }, payload: input })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url, headers: { cookie, origin: "https://attacker.example.test" }, payload: input })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url, headers: { cookie, origin }, payload: { ...input, providerRef: "attacker-selected" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url, headers: { cookie, origin }, payload: { ...input, expectedRevision: 0 } })).statusCode, 409);
  const privateUrl = `/api/operator/events/${event.id}/generation-provider`;
  assert.equal((await app.inject({ url: privateUrl })).statusCode, 401);
  const info = (await app.inject({ url: privateUrl, headers: { cookie } })).json();
  assert.equal(info.jobs[0].providerRef, "saved_task");
  assert.equal(info.jobs[0].reconciliation.canRequest, true);
  assert.equal(JSON.stringify(info).includes("PRIVATE_RECOVERY_CORE"), false);
  const queued = await app.inject({ method: "POST", url, headers: { cookie, origin }, payload: input });
  assert.equal(queued.statusCode, 200);
  assert.equal(queued.json().createsNewTask, false);
  assert.deepEqual(f.counts(), { submitted: 1, resumed: 0 });
});
