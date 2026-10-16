import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { validateRuntimeReadiness } = createRequire(import.meta.url)(
  "../scripts/hosted-runtime-readiness.mjs",
) as {
  validateRuntimeReadiness: (
    data: unknown,
    options?: { requireMediaVerified?: boolean; expectZeroSpend?: boolean },
  ) => void;
};
test("hosted readiness accepts intentionally configured providers without weakening authentication or media checks", () => {
  const ready = {
    database: "ready",
    operator: "configured",
    media: "verified",
    generation: "not_configured",
    email: "not_configured",
  };
  validateRuntimeReadiness(ready, {
    requireMediaVerified: true,
    expectZeroSpend: true,
  });
  validateRuntimeReadiness(
    { ...ready, generation: "configured" },
    { requireMediaVerified: true },
  );
  assert.throws(
    () =>
      validateRuntimeReadiness(
        { ...ready, generation: "configured" },
        { expectZeroSpend: true },
      ),
    /Explicit zero-spend/,
  );
  assert.throws(
    () => validateRuntimeReadiness({ ...ready, operator: "not_configured" }),
    /authentication/,
  );
  assert.throws(
    () =>
      validateRuntimeReadiness(
        { ...ready, media: "configured" },
        { requireMediaVerified: true },
      ),
    /round-trip/,
  );
  assert.throws(
    () => validateRuntimeReadiness({ ...ready, generation: "unknown" }),
    /Unexpected/,
  );
});
