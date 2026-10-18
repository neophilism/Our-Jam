import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

// Explicit high-confidence signatures only. No findings include secret values.
export const signatures = [
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { id: "github-classic-token", pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { id: "github-fine-grained-token", pattern: /github_pat_[A-Za-z0-9_]{40,}/ },
  { id: "aws-access-key", pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/ },
  { id: "stripe-live-key", pattern: /sk_live_[A-Za-z0-9]{20,}/ },
  { id: "neon-live-credential", pattern: /(?:nak_live_|nsk_live_|nt_live_)[A-Za-z0-9_-]{16,}/ },
  { id: "openai-project-secret", pattern: /sk-proj-[A-Za-z0-9_-]{30,}/ },
  { id: "slack-bot-token", pattern: /xox[baprs]-[0-9A-Za-z-]{20,}/ },
];
const binaryExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2",
  ".ttf", ".otf", ".zip", ".gz", ".pdf", ".mp3", ".wav", ".mp4", ".lockb",
]);
export function inspect(path, bytes) {
  if (binaryExtensions.has(extname(path).toLowerCase()) || bytes.includes(0)) return [];
  const body = bytes.toString("utf8");
  return signatures.filter(({pattern}) => pattern.test(body)).map(x => x.id);
}
export function run() {
  const files = execFileSync("git", ["ls-files", "-z"], { maxBuffer: 8*1024*1024 })
    .toString("utf8").split("\0").filter(Boolean);
  const findings = [];
  for (const path of files) {
    let bytes;
    try { bytes = readFileSync(path); } catch { continue; }
    for (const type of inspect(path, bytes))
      findings.push({path, type});
  }
  if (findings.length) {
    for (const finding of findings) console.error("Secret signature detected:", finding.path, finding.type);
    process.exitCode = 1;
  } else console.log("Tracked-source high-confidence secret scan: PASS");
}
if (process.argv[1]?.endsWith("secret-scan.mjs")) run();
