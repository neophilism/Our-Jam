import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createEvent, advance, submitWave } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { configuredGeneration } from "../apps/api/src/generation-config.js";
import { generationTick, type GenerationConfig } from "../apps/api/src/generation.js";
import { setGenerationProvider } from "../apps/api/src/provider-controls.js";
import { createApp } from "../apps/api/src/app.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { murekaProvider } from "../packages/providers/src/mureka.js";
import { stabilityProvider, ProviderError } from "../packages/providers/src/stability.js";
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

test("Mureka submits exactly one instrumental, persists task before polls, and downloads without auth", async () => {
  let calls = 0; let accepted = "";
  const provider = murekaProvider("test-only", { wait: async () => {}, request: async (url, init) => {
    calls++;
    if (calls === 1) {
      assert.equal(url, "https://api.mureka.ai/v1/instrumental/generate");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(init?.body as string), { model: "mureka-9.5", n: 1, prompt: "Original core. Warm brass", stream: false });
      return json({ id: "task_1", status: "queued" });
    }
    assert.equal(accepted, "task_1");
    if (calls === 2) {
      assert.equal(url, "https://api.mureka.ai/v1/instrumental/query/task_1");
      assert.equal(init?.method, "GET");
      return json({ id: "task_1", status: "succeeded", choices: [{ url: "https://cdn.mureka.ai/test.mp3" }] });
    }
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    assert.equal(init?.redirect, "error");
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
  } });
  const result = await provider.generate("Original core. Warm brass", 90, { onAccepted: async (id) => { accepted = id; } });
  assert.equal(result.providerRef, "task_1"); assert.equal(result.bytes.length, 3); assert.equal(calls, 3);
});

test("Mureka uncertainty and provider credit rejection never retry; unsafe media and long prompts fail closed", async () => {
  let calls = 0;
  const credit = murekaProvider("test-only", { request: async () => { calls++; return new Response("", { status: 402 }); } });
  await assert.rejects(credit.generate("Core", 90), (e: any) => e instanceof ProviderError && e.reason === "provider_insufficient_credits" && !e.uncertain);
  assert.equal(calls, 1);
  await assert.rejects(credit.generate("x".repeat(1025), 90)); assert.equal(calls, 1);
  const unknown = murekaProvider("test-only", { request: async () => { calls++; throw new Error("network"); } });
  await assert.rejects(unknown.generate("Core", 90), (e: any) => e instanceof ProviderError && e.uncertain);
  assert.equal(calls, 2);
  const badHost = murekaProvider("test-only", { request: async () => { calls++; return json({ id: "safe-id", status: "succeeded", choices: [{ url: "https://127.0.0.1/private" }] }); } });
  await assert.rejects(badHost.generate("Core", 90), (e: any) => e.reason === "provider_unapproved_media_host");
  assert.equal(calls, 3);
  const stable = stabilityProvider("test-only", async () => new Response("", { status: 402 }));
  await assert.rejects(stable.generate("Core", 90), (e: any) => e.reason === "provider_insufficient_credits");
});

test("Mureka resume is GET-only and cannot create another paid task", async () => {
  const methods: string[] = [];
  const provider = murekaProvider("test-only", { request: async (url, init) => {
    methods.push(init?.method ?? "GET");
    if (String(url).includes("/query/")) return json({ id: "existing", status: "succeeded", choices: [{ url: "https://cdn.mureka.ai/existing.mp3" }] });
    return new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } });
  } });
  const result = await provider.generate("Core", 90, { resumeRef: "existing" });
  assert.equal(result.providerRef, "existing"); assert.deepEqual(methods, ["GET", "GET"]);
});

test("zero-dollar configuration accepts both key names without requiring paid activation", () => {
  const config = configuredGeneration(undefined, {
    GENERATION_ENABLED: "1", GENERATION_EVENT_BUDGET_CENTS: "0", GENERATION_TOTAL_BUDGET_CENTS: "0",
    STABLE_AUDIO_KEY: "test-stable", MUREKA_API_KEY: "test-mureka",
  })!;
  assert.equal(config.providers?.stability?.name, "stability");
  assert.equal(config.providers?.mureka?.name, "mureka");
  assert.equal(config.totalBudgetCents, 0);
  assert.equal(config.store, undefined);
});

async function prepare(db: Awaited<ReturnType<typeof testDatabase>>) {
  return createEvent(db, "our-jam", eventInput.parse({ title: "Isolated provider test", artistName: "Test", slug: "dual-" + randomUUID(), minimumRoundSeconds: 0,
    sources: [{ title: "Test source", corePrompt: "PRIVATE_CORE", durationSeconds: 30 }] }));
}
async function tag(db: Awaited<ReturnType<typeof testDatabase>>, eventId: string, roundId: string) {
  const participant = randomUUID();
  await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,$2)", [participant, "test"]);
  await db.query("INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)", [eventId, participant]);
  await submitWave(db, { participantId: participant }, roundId, { commandId: randomUUID(), expectedRevision: 0, text: "Warm brass" });
}

test("provider toggle is owner-scoped, replay-safe and frozen into the active round", async (t) => {
  const db = await testDatabase(); t.after(() => db.close());
  const event = await prepare(db);
  const change = { provider: "mureka" as const, commandId: randomUUID(), expectedRevision: 0 };
  await assert.rejects(setGenerationProvider(db, "another-artist", event.id, change));
  const response = await setGenerationProvider(db, "our-jam", event.id, change);
  assert.deepEqual(await setGenerationProvider(db, "our-jam", event.id, change), response);
  await assert.rejects(setGenerationProvider(db, "our-jam", event.id, { ...change, provider: "stability" }));
  const lease = await claimPlayback(db, "our-jam", event.id);
  const opened = await advance(db, "our-jam", event.id, randomUUID(), 1, { ...lease, sequence: 1 }, true);
  await setGenerationProvider(db, "our-jam", event.id, { provider: "stability", commandId: randomUUID(), expectedRevision: 2 });
  await tag(db, event.id, opened.roundId!);
  await advance(db, "our-jam", event.id, randomUUID(), 3, { ...lease, sequence: 2 }, true);
  let calls = 0;
  const mureka = { name: "mureka", model: "test", variableDuration: true, generate: async (_prompt: string, _seconds: number, context?: any) => { calls++; await context?.onAccepted("persisted-task"); return { bytes: new Uint8Array([1, 2, 3]), providerRef: "persisted-task" }; } };
  const config: GenerationConfig = { provider: mureka, providers: { mureka, stability: { name: "stability", model: "test", generate: async () => { throw new Error("Wrong provider selected"); } } }, maxJobCents: 1, eventBudgetCents: 2, totalBudgetCents: 2, durationSeconds: 90,
    store: { put: async () => {}, url: async () => "" }, validate: async (_bytes, expected) => { assert.equal(expected, undefined); return { durationSeconds: 60.25, meanDb: -12 }; } };
  await generationTick(db, config);
  const row = (await db.query("SELECT * FROM generation_jobs WHERE event_id=$1", [event.id])).rows[0];
  assert.equal(calls, 1); assert.equal(row.provider, "mureka"); assert.equal(row.provider_ref, "persisted-task"); assert.equal(row.state, "published");
  const app = await createApp(db, { origin: "http://localhost:5173", secureCookies: false });
  t.after(() => app.close());
  assert.equal((await app.inject({ method: "GET", url: `/api/operator/events/${event.id}/generation-provider` })).statusCode, 401);
});

test("a real closed round at $0 retains tags and blocks before attempts, cost, storage or provider calls", async (t) => {
  const db = await testDatabase(); t.after(() => db.close()); const event = await prepare(db);
  const lease = await claimPlayback(db, "our-jam", event.id);
  const opened = await advance(db, "our-jam", event.id, randomUUID(), 0, { ...lease, sequence: 1 }, true);
  await tag(db, event.id, opened.roundId!);
  await advance(db, "our-jam", event.id, randomUUID(), 1, { ...lease, sequence: 2 }, true);
  let calls = 0;
  const config: GenerationConfig = { provider: { name: "stability", model: "test", generate: async () => { calls++; throw new Error("No paid request allowed"); } }, maxJobCents: 0, eventBudgetCents: 0, totalBudgetCents: 0, durationSeconds: 90 };
  await generationTick(db, config); await generationTick(db, config);
  const row = (await db.query("SELECT * FROM generation_jobs WHERE event_id=$1", [event.id])).rows[0];
  assert.equal(row.reason, "approved_budget_zero"); assert.equal(row.state, "blocked"); assert.equal(row.attempts, 0); assert.equal(row.reserved_cents, 0); assert.equal(calls, 0);
  assert.match(row.prompt, /Warm brass/); assert.equal(row.snapshot.selected.length, 1);
});
