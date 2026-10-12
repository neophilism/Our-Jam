import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { supportedNode, inspectSetup, ensureDependencies, installFingerprint } from "./local-setup.mjs";

const runTools = (binary) => ({ status: 0, stdout: ({npm:"11.0.0",ffmpeg:" A..... libmp3lame MP3",ffprobe:"ffprobe version 8.0",xcrun:"/Xcode/usr/bin/simctl"})[binary], stderr: "" });
const runtime = {version:"24.0.0",platform:"darwin",arch:"arm64"};
function source(t) {
  const root = mkdtempSync(path.join(tmpdir(), "ourjam-setup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "package.json"), '{"name":"test"}');
  writeFileSync(path.join(root, "package-lock.json"), '{"lockfileVersion":3}');
  return root;
}
function installed(root) {
  const modules = path.join(root, "node_modules");
  for (const name of ["tsx", "@electric-sql/pglite"]) { mkdirSync(path.join(modules, name), { recursive: true }); writeFileSync(path.join(modules, name, "package.json"), "{}"); }
  writeFileSync(path.join(modules, ".package-lock.json"), "{}");
}
test("setup follows the repository's Node 24 major constraint", () => {
  for (const v of ["24.0.0", "24.22.1"]) assert.equal(supportedNode(v), true);
  for (const v of ["22.16.0", "25.0.0", "24", "24.0.invalid"]) assert.equal(supportedNode(v), false);
});
test("web setup is independent of the optional Simulator toolchain", () => {
  assert.equal(inspectSetup({ version:"24.0.0", platform:"linux", run:runTools }).ready, true);
  const report = inspectSetup({ version:"24.0.0", platform:"darwin", run:(name) => name === "xcrun" ? {status:1} : runTools(name) });
  assert.equal(report.ready, true);
  assert.equal(report.checks.at(-1).required, false);
  assert.equal(report.checks.at(-1).ok, false);
});
test("missing encoder, npm, probe, and timed-out tools fail closed without printing tool output", () => {
  for (const tool of ["npm", "ffmpeg", "ffprobe"]) {
    const report = inspectSetup({ version:"24.0.0", platform:"darwin", run:(name) => name === tool ? {status:null,stdout:"secret-value",error:new Error("timeout")} : runTools(name) });
    assert.equal(report.ready, false);
    assert.ok(!JSON.stringify(report).includes("secret-value"));
  }
  assert.equal(inspectSetup({version:"24.0.0",platform:"linux",run:(name) => name === "ffmpeg" ? {status:0,stdout:"Only AAC encoder"} : runTools(name)}).ready, false);
});
test("successful locked install is reused but lock changes force npm ci", (t) => {
  const root = source(t); let calls = 0;
  const run = (cmd,args,options) => { calls++; assert.equal(cmd,"npm"); assert.deepEqual(args,["ci","--include=dev"]); assert.equal(options.env.NODE_ENV,"development"); installed(root); return {status:0}; };
  assert.equal(ensureDependencies(root,{run,runtime}).installed,true);
  assert.equal(ensureDependencies(root,{run,runtime}).installed,false);
  writeFileSync(path.join(root,"package-lock.json"),'{"lockfileVersion":3,"changed":true}');
  assert.equal(ensureDependencies(root,{run,runtime}).installed,true);
  assert.equal(calls,2);
});
test("install evidence is specific to manifest, architecture, OS, and Node major", (t) => {
  const root = source(t), before=installFingerprint(root,runtime);
  assert.notEqual(before,installFingerprint(root,{...runtime,arch:"x64"}));
  assert.notEqual(before,installFingerprint(root,{...runtime,platform:"linux"}));
  assert.notEqual(before,installFingerprint(root,{...runtime,version:"25.0.0"}));
  assert.equal(before,installFingerprint(root,{...runtime,version:"24.22.2"}));
  writeFileSync(path.join(root,"package.json"),'{"name":"changed"}');
  assert.notEqual(before,installFingerprint(root,runtime));
});
test("failed or incomplete installs do not receive a successful-install marker", (t) => {
  const root=source(t), marker=path.join(root,"node_modules/.our-jam-install.json");
  assert.throws(() => ensureDependencies(root,{runtime,run:()=>({status:1})}),/installation failed/);
  assert.equal(existsSync(marker),false);
  assert.throws(() => ensureDependencies(root,{runtime,run:()=>({status:0})}),/required local runtime/);
  assert.equal(existsSync(marker),false);
});
test("partially deleted or corrupt cached installation gets reinstalled", (t) => {
  const root=source(t); let calls=0;
  const run=()=>{calls++;installed(root);return {status:0};};
  ensureDependencies(root,{run,runtime});
  rmSync(path.join(root,"node_modules/tsx"),{recursive:true});
  ensureDependencies(root,{run,runtime});
  writeFileSync(path.join(root,"node_modules/.our-jam-install.json"),"not-json");
  ensureDependencies(root,{run,runtime});
  assert.equal(calls,3);
});
