import test from "node:test";
import assert from "node:assert/strict";
import { COMPARISON_ENGINES, COMPARISON_ENGINE_IDS, uniqueComparisonSelection, isCommercialComparisonAllowed } from "../packages/providers/src/comparison-catalog.js";

test("comparison offers exactly the requested two API and four open-weight engines", () => {
  assert.equal(COMPARISON_ENGINES.length, 6);
  assert.equal(new Set(COMPARISON_ENGINE_IDS).size, 6);
  assert.equal(COMPARISON_ENGINES.filter(x => x.execution === "paid_api").length, 2);
  assert.equal(COMPARISON_ENGINES.filter(x => x.execution === "self_hosted").length, 4);
});
test("operator choices accept only unique nonempty provider subsets", () => {
  assert.deepEqual(uniqueComparisonSelection(["mureka","ace_step"]), ["mureka","ace_step"]);
  assert.deepEqual(uniqueComparisonSelection([...COMPARISON_ENGINE_IDS]), COMPARISON_ENGINE_IDS);
  for (const invalid of [[], ["invalid"], ["mureka", "mureka"], [...COMPARISON_ENGINE_IDS, "musicgen"]])
    assert.throws(() => uniqueComparisonSelection(invalid));
});
test("MusicGen model weights cannot be misrepresented as commercially licensed", () => {
  assert.equal(isCommercialComparisonAllowed("musicgen"), false);
  assert.equal(COMPARISON_ENGINES.find(x=>x.id==="musicgen")?.rights, "noncommercial_only");
  assert.equal(COMPARISON_ENGINES.find(x=>x.id==="stable_audio_open")?.rights, "community_license_eligibility_required");
});
