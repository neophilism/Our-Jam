import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function supportedNode(version) {
  return /^24\.[0-9]+\.[0-9]+(?:[-+].*)?$/.test(version);
}

export function inspectSetup({ version = process.versions.node, platform = process.platform, run = spawnSync } = {}) {
  const checks = [{
    name: "Node.js 24", required: true, ok: supportedNode(version),
    detail: supportedNode(version) ? `Found ${version}` : `Found ${version}; this release requires Node.js 24.x, not a different major version.`,
  }];
  for (const [name, binary, args, expected] of [
    ["npm", "npm", ["--version"], /[0-9]+\.[0-9]+/],
    ["FFmpeg MP3 encoder", "ffmpeg", ["-hide_banner", "-encoders"], /\blibmp3lame\b/],
    ["FFprobe", "ffprobe", ["-version"], /ffprobe version/i],
  ]) {
    const result = run(binary, args, { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 });
    const ok = result.status === 0 && expected.test(String(result.stdout ?? "") + String(result.stderr ?? ""));
    checks.push({ name, required: true, ok, detail: ok ? "Available" : `${name} is missing or unusable. Install it before starting the local show.` });
  }
  if (platform === "darwin") {
    const result = run("xcrun", ["--find", "simctl"], { encoding: "utf8", timeout: 15000 });
    const ok = result.status === 0 && String(result.stdout ?? "").includes("simctl");
    checks.push({ name: "iOS Simulator tools", required: false, ok, detail: ok ? "Xcode Simulator tools available; the simulator launcher also checks installed runtimes." : "Install Xcode and an iOS Simulator runtime for the native app. Web/monitor use does not require Xcode." });
  } else {
    checks.push({ name: "iOS Simulator", required: false, ok: false, detail: "The native iOS Simulator runs on macOS. The local web/monitor application can still run here." });
  }
  return { ready: checks.filter((c) => c.required).every((c) => c.ok), checks };
}

export function installFingerprint(root, { version = process.versions.node, platform = process.platform, arch = process.arch } = {}) {
  return createHash("sha256")
    .update(readFileSync(path.join(root, "package.json")))
    .update("\0").update(readFileSync(path.join(root, "package-lock.json")))
    .update(`\0${version.split(".")[0]}\0${platform}\0${arch}`).digest("hex");
}

export function ensureDependencies(root, { run = spawnSync, runtime = {} } = {}) {
  const fingerprint = installFingerprint(root, runtime);
  const modules = path.join(root, "node_modules");
  const marker = path.join(modules, ".our-jam-install.json");
  let saved;
  try { saved = JSON.parse(readFileSync(marker, "utf8")); } catch { /* Missing or corrupt install evidence triggers npm ci. */ }
  const complete = existsSync(path.join(modules, ".package-lock.json")) &&
    existsSync(path.join(modules, "tsx", "package.json")) &&
    existsSync(path.join(modules, "@electric-sql", "pglite", "package.json"));
  if (complete && saved?.fingerprint === fingerprint) return { installed: false, fingerprint };
  const result = run("npm", ["ci", "--include=dev"], {
    cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: "development" },
  });
  if (result.error || result.status !== 0) throw new Error("Dependency installation failed. No successful-install marker was saved. Check the network/error above and run Start Our Jam again.");
  if (!existsSync(path.join(modules, ".package-lock.json")) ||
      !existsSync(path.join(modules, "tsx", "package.json")) ||
      !existsSync(path.join(modules, "@electric-sql", "pglite", "package.json")))
    throw new Error("npm finished without the required local runtime dependencies. The install was not marked successful.");
  mkdirSync(modules, { recursive: true });
  writeFileSync(marker, JSON.stringify({ fingerprint }) + "\n", { mode: 0o600 });
  return { installed: true, fingerprint };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? "check";
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (!["check", "prepare"].includes(mode)) { console.error("Usage: node scripts/local-setup.mjs check|prepare"); process.exitCode = 2; }
  else {
    const report = inspectSetup();
    console.log("Our Jam local setup - no provider calls, account purchases, or cloud changes\n");
    for (const check of report.checks) console.log(`${check.ok ? "OK" : check.required ? "NEEDED" : "OPTIONAL"} - ${check.name}: ${check.detail}`);
    console.log("\nGeneration remains locked at $0. First startup needs internet to install locked npm dependencies; an unchanged successful installation is reused.");
    if (!report.ready) process.exitCode = 1;
    else if (mode === "prepare") {
      try {
        const outcome = ensureDependencies(root);
        console.log(outcome.installed ? "Locked dependencies installed and checked." : "Reusing the checked installation for this exact source and platform.");
      } catch (error) { console.error(error.message); process.exitCode = 1; }
    }
  }
}
