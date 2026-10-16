import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWave, validateAllocations, compilePrompt } from "../packages/domain/src/index.js";

// Deterministic fuzz corpus: replay failures with the same seed and iteration.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
function choose<T>(values: readonly T[], next: () => number): T {
  return values[Math.floor(next() * values.length)];
}
test("compatibility-normalized markup is never accepted as a Sound Wave", () => {
  for (const text of [
    "＜script＞", "﹤script﹥", "＜img src=x＞",
    "  ＜b＞  ", "a\u200bb", "\u0000music",
  ]) assert.throws(() => normalizeWave(text), { code: "invalid_wave" });
  assert.equal(normalizeWave("ＢＲＡＳＳ").normalized, "brass");
});
test("seeded fuzz: normalized public Sound Waves never contain markup or controls", () => {
  const next = random(0x5eed2026);
  const alphabet = [
    "A", "b", " ", "   ", "＜", "＞", "﹤", "﹥", "<", ">",
    "\u200b", "\u0000", "é", "Å", "Ｂ", "🍃", "\u0301",
  ];
  for (let iteration = 0; iteration < 1800; iteration++) {
    const length = 1 + Math.floor(next() * 70);
    const raw = Array.from({ length }, () => choose(alphabet, next)).join("");
    try {
      const wave = normalizeWave(raw);
      assert.ok(!/[\p{C}<>]/u.test(wave.text), "unexpected normalized control or markup at " + iteration);
      assert.ok([...wave.text].length >= 2 && [...wave.text].length <= 48);
      assert.ok(Buffer.byteLength(wave.text) <= 192);
      assert.equal(wave.normalized, wave.text.toLocaleLowerCase("en-US"));
      assert.equal(wave.text, raw.normalize("NFKC").trim().replace(/\s+/gu, " "));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "invalid_wave"))
        throw error;
    }
  }
});
test("seeded fuzz: all accepted voting allocations respect the five-point invariant", () => {
  const next = random(0xa110ca7e);
  const values = [-100, -1, 0, 1, 2, 3, 4, 5, 6, 7, 1.5, NaN, Infinity];
  for (let iteration = 0; iteration < 1800; iteration++) {
    const count = Math.floor(next() * 8);
    const allocation: Record<string, number> = {};
    for (let n = 0; n < count; n++) allocation["wave-" + n] = choose(values, next);
    const points = Object.values(allocation);
    const allowed = points.length <= 5 &&
      points.every(p => Number.isSafeInteger(p) && p > 0 && p <= 5) &&
      points.reduce((sum, p) => sum + p, 0) <= 5;
    if (allowed) assert.doesNotThrow(() => validateAllocations(allocation));
    else assert.throws(() => validateAllocations(allocation));
  }
});
test("seeded fuzz: compiled provider prompts never truncate the immutable core", () => {
  const next = random(0xc0debeef);
  for (let iteration = 0; iteration < 700; iteration++) {
    const max = 1 + Math.floor(next() * 1024);
    const core = "a".repeat(1 + Math.floor(next() * 1200));
    const ranked = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), text: "brass " + i, votes: 10 - i,
      supporters: 1, authorId: "guest", createdAt: "",
    }));
    if (core.length > max) {
      assert.throws(() => compilePrompt(core, ranked, max));
      continue;
    }
    const result = compilePrompt(core, ranked, max, 8);
    assert.ok(result.prompt.startsWith(core));
    assert.ok(result.prompt.length <= max);
    assert.ok(result.selected.length <= 8);
    assert.deepEqual(result.selected, ranked.slice(0, result.selected.length));
    assert.equal(result.hash.length, 64);
  }
});
