import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { testDatabase } from "./database.js";
import { createEvent, advance, submitWave } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import {
  generationTick,
  type GenerationConfig,
} from "../apps/api/src/generation.js";
import { validateAudio } from "../apps/api/src/media.js";
import { configuredGeneration } from "../apps/api/src/generation-config.js";
import { eventInput } from "../packages/contracts/src/index.js";
import {
  stabilityProvider,
  ProviderError,
} from "../packages/providers/src/stability.js";
test("provider uses the documented contract and does not retry an ambiguous POST", async () => {
  let calls = 0;
  const provider = stabilityProvider("test-key", async (url, options) => {
    calls++;
    assert.equal(
      url,
      "https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio",
    );
    const form = options!.body as FormData;
    assert.equal(form.get("model"), "stable-audio-2.5");
    assert.equal(form.get("prompt"), "Original core.\nAudience: Warm brass");
    assert.equal(form.get("duration"), "60");
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  });
  assert.equal(
    (await provider.generate("Original core.\nAudience: Warm brass", 60)).bytes
      .length,
    3,
  );
  assert.equal(calls, 1);
  const failing = stabilityProvider("test-key", async () => {
    calls++;
    throw new Error("socket reset");
  });
  await assert.rejects(
    failing.generate("Core", 60),
    (e: any) => e instanceof ProviderError && e.uncertain,
  );
  assert.equal(calls, 2);
  assert.equal(configuredGeneration(undefined, {}), undefined);
  assert.throws(() =>
    configuredGeneration(undefined, { GENERATION_ENABLED: "1" }),
  );
});
test("media decode checks reject silence and malformed data", async () => {
  const sound = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=10",
    "-f",
    "mp3",
    "pipe:1",
  ]);
  const checked = await validateAudio(sound, 10);
  assert.ok(checked.durationSeconds >= 10);
  const silence = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-t",
    "10",
    "-f",
    "mp3",
    "pipe:1",
  ]);
  await assert.rejects(validateAudio(silence, 10));
  await assert.rejects(validateAudio(new Uint8Array(2048), 10));
});
test("generation reserves cost once, publishes verified storage, and never resubmits uncertainty", async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  async function job() {
    const e = await createEvent(
      db,
      "our-jam",
      eventInput.parse({
        title: "Generation test",
        artistName: "Test Artist",
        slug: "gen-" + randomUUID(),
        minimumRoundSeconds: 0,
        sources: [
          {
            title: "Core track",
            corePrompt: "PRIVATE_TEST_CORE",
            durationSeconds: 30,
          },
        ],
      }),
    );
    const lease = await claimPlayback(db, "our-jam", e.id);
    const opened = await advance(
      db,
      "our-jam",
      e.id,
      randomUUID(),
      0,
      { ...lease, sequence: 1 },
      true,
    );
    const p = randomUUID();
    await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,$2)", [
      p,
      "seed",
    ]);
    await db.query(
      "INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",
      [e.id, p],
    );
    await submitWave(db, { participantId: p }, opened.roundId, {
      commandId: randomUUID(),
      expectedRevision: 0,
      text: "Warm brass",
    });
    await advance(
      db,
      "our-jam",
      e.id,
      randomUUID(),
      1,
      { ...lease, sequence: 2 },
      true,
    );
    return e;
  }
  let calls = 0,
    stored = 0;
  const cfg: GenerationConfig = {
    maxJobCents: 20,
    eventBudgetCents: 20,
    totalBudgetCents: 40,
    durationSeconds: 60,
    provider: {
      name: "test",
      model: "test-only",
      generate: async (prompt) => {
        assert.ok(prompt.startsWith("PRIVATE_TEST_CORE"));
        calls++;
        return { bytes: new Uint8Array([7, 8, 9]) };
      },
    },
    store: {
      put: async () => {
        stored++;
      },
      url: async () => "",
    },
    validate: async () => ({ durationSeconds: 60, meanDb: -12 }),
  };
  const first = await job();
  await Promise.all([generationTick(db, cfg), generationTick(db, cfg)]);
  assert.equal(calls, 1);
  assert.equal(stored, 1);
  const output = (
    await db.query("SELECT * FROM releases WHERE event_id=$1", [first.id])
  ).rows;
  assert.equal(output.length, 1);
  assert.ok(output[0].published_at);
  assert.match(output[0].asset_sha256, /^[a-f0-9]{64}$/);
  const second = await job();
  cfg.provider.generate = async () => {
    calls++;
    throw new ProviderError("provider_acceptance_unknown", true);
  };
  await generationTick(db, cfg);
  await generationTick(db, cfg);
  assert.equal(calls, 2);
  assert.equal(
    (
      await db.query("SELECT state FROM generation_jobs WHERE event_id=$1", [
        second.id,
      ])
    ).rows[0].state,
    "unknown",
  );
  const third = await job();
  await generationTick(db, cfg);
  assert.equal(calls, 2);
  assert.equal(
    (
      await db.query("SELECT reason FROM generation_jobs WHERE event_id=$1", [
        third.id,
      ])
    ).rows[0].reason,
    "approved_budget_exhausted",
  );
});
