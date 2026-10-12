import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("local setup diagnoses prerequisites and maintains exact locked install evidence", () => {
  execFileSync(process.execPath, ["--test", "scripts/local-setup.test.mjs"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30000,
  });
});
