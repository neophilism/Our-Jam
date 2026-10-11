import { postgres, migrate } from "./db.js";
import { tickRounds } from "./playback.js";
import { createApp } from "./app.js";
const production = process.env.NODE_ENV === "production";
const url = process.env.DATABASE_URL;
if (!url)
  throw new Error(
    "DATABASE_URL is required. Use the project-specific database.",
  );
const origin =
  process.env.PUBLIC_ORIGIN ?? (production ? "" : "http://localhost:5173");
if (!origin || new URL(origin).origin !== origin)
  throw new Error("PUBLIC_ORIGIN must be an exact origin.");
if (production && !origin.startsWith("https://"))
  throw new Error("Production requires HTTPS.");
const db = postgres(url);
if (process.env.RUN_MIGRATIONS === "1") {
  const direct = process.env.DATABASE_URL_UNPOOLED;
  if (!direct || new URL(direct).hostname.includes("-pooler"))
    throw new Error("RUN_MIGRATIONS requires a direct DATABASE_URL_UNPOOLED.");
  const migrationDb = postgres(direct);
  try {
    await migrate(migrationDb);
  } finally {
    await migrationDb.close();
  }
}
const app = await createApp(db, {
  origin,
  operatorToken: process.env.OPERATOR_TOKEN,
  secureCookies: production,
  serveWeb: true,
  providerReady: false,
});
await app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" });
console.log(
  JSON.stringify({
    application: "Our Jam",
    status: "listening",
    generation: "not_configured",
  }),
);
let ticking = false;
const roundTimer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await tickRounds(db);
  } catch {
    console.error(JSON.stringify({ event: "round_tick_failed" }));
  } finally {
    ticking = false;
  }
}, 1000);
roundTimer.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(roundTimer);
    await app.close();
    await db.close();
    process.exit(0);
  });
