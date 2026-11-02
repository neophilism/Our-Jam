import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { expectedDeploymentCommit, verifyDeploymentHealth } from "../scripts/hosted-source.js";
test("explicit deployment source rejects stale, missing or malformed health metadata", () => {
  const head="a".repeat(40), old="b".repeat(40);
  assert.equal(expectedDeploymentCommit(undefined),null);
  assert.equal(expectedDeploymentCommit(head.toUpperCase()),head);
  for (const bad of ["", "main", head.slice(1), head+"x", "https://example.test/token"]) assert.throws(()=>expectedDeploymentCommit(bad),/complete 40-character/);
  assert.equal(verifyDeploymentHealth({status:"ok",application:"Our Jam",commit:head.toUpperCase()},head),head);
  for (const bad of [{status:"ok",application:"Our Jam",commit:old},{status:"ok",application:"Our Jam"},{status:"ok",application:"Another app",commit:head},null,[],{status:"failed",application:"Our Jam",commit:head}]) assert.throws(()=>verifyDeploymentHealth(bad,head));
  assert.equal(verifyDeploymentHealth({status:"ok",application:"Our Jam",commit:"unbounded untrusted metadata"},null),"unknown");
});
test("the real smoke CLI rejects a malformed expected SHA before any network probe", () => {
  const result = spawnSync(process.execPath,["scripts/check-hosted-readiness.mjs","https://example.invalid"],{encoding:"utf8",timeout:2000,env:{...process.env,OUR_JAM_EXPECT_COMMIT:"main"}});
  assert.equal(result.status,2);assert.match(result.stderr,/complete 40-character commit SHA/);assert.equal(result.stdout,"");
});
