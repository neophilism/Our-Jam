// Explicit real single-Mac deployment. No seeded events, fake votes, test routes or provider calls.
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createApp } from "../apps/api/src/app.js";
import { migrate, type Database, type Sql } from "../apps/api/src/db.js";
import { configuredGeneration } from "../apps/api/src/generation-config.js";
import { generationTick } from "../apps/api/src/generation.js";
import { localMediaStore } from "../apps/api/src/local-media-store.js";
if (process.env.NODE_ENV === "production") throw new Error("Use the hosted entry point for production. This script is explicitly loopback-only.");
const directory = path.resolve(process.env.OUR_JAM_LOCAL_DIR || path.join(homedir(), ".our-jam-local"));
const port = Number(process.env.OUR_JAM_LOCAL_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local port.");
const origin = `http://127.0.0.1:${port}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const tokenPath = path.join(directory, "performer-key.txt");
let token: string;
try { token = (await readFile(tokenPath, "utf8")).trim(); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  token = randomBytes(32).toString("hex"); await writeFile(tokenPath, token + "\n", { mode: 0o600, flag: "wx" });
}
if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Local performer key is invalid. Restore it from your own backup; do not reset another session's identity.");
await chmod(tokenPath, 0o600);
const pg = new PGlite(path.join(directory, "database"));
const db: Database = { query: (sql, params) => pg.query(sql, params), transaction: (fn) => pg.transaction((tx) => fn(tx as Sql)), close: () => pg.close() };
await migrate(db);
const media = await localMediaStore(path.join(directory, "audio"), origin, token);
// Hardcoded zero budget and no provider credentials. External environment cannot enable spending here.
const generation = configuredGeneration(media.store, { GENERATION_ENABLED: "1", GENERATION_EVENT_BUDGET_CENTS: "0", GENERATION_TOTAL_BUDGET_CENTS: "0" })!;
const app = await createApp(db, { origin, operatorToken: token, secureCookies: false, serveWeb: true, mediaStore: media.store, providerReady: true, generation });
media.register(app);
let active = false;
const timer = setInterval(async () => {
  if (active) return; active = true;
  try { await generationTick(db, generation); }
  catch { console.error("Local generation processing failed; saved rounds were not resubmitted."); }
  finally { active = false; }
}, 1000);
await app.listen({ host: "127.0.0.1", port });
console.log(`Our Jam is running locally at ${origin}`);
console.log(`Your private performer key is in ${tokenPath}`);
console.log("Open that file and paste the key at /performer. Do not upload or share the key.");
console.log("Create your own session, upload your own songs, open its Public screen, and use its event code in the native app.");
console.log("No provider keys are needed: the real generation worker records the hard $0 spending block. No test data is seeded.");
console.log("Keep this terminal open. Ctrl-C stops the server; your events and files persist on this Mac.");
if (process.platform === "darwin" && process.env.OUR_JAM_NO_OPEN !== "1") {
  spawn("open", [origin + "/performer"], { stdio: "ignore" }).unref();
  spawn("open", ["-a", "TextEdit", tokenPath], { stdio: "ignore" }).unref();
}
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  if (closing) return; closing = true; clearInterval(timer);
  await app.close(); await db.close(); process.exit(0);
});
