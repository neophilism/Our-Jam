import { configuredIdentity } from "./identity.js";
import { configuredCommerce } from "./commerce.js";
import { publicOrigin } from "./runtime-config.js";
import { postgres, migrate } from "./db.js";
import {
  configuredStorage,
  configuredGeneration,
} from "./generation-config.js";
import { generationTick } from "./generation.js";
import { tickRounds } from "./playback.js";
import { createApp } from "./app.js";
import { configuredEmail } from "./email-config.js";
import { verifyStartupMedia } from "./media-readiness.js";
import { emailTick } from "./email.js";
const production = process.env.NODE_ENV === "production";
const url = process.env.DATABASE_URL;
if (!url)
  throw new Error(
    "DATABASE_URL is required. Use the project-specific database.",
  );
const origin = publicOrigin(process.env);
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
const mediaStore = configuredStorage();
const mediaStatus = await verifyStartupMedia(
  mediaStore,
  process.env.MEDIA_PROBE_ON_START,
);
const generation = configuredGeneration(mediaStore);
const email = configuredEmail(origin);
const app = await createApp(db, {
  origin,
  commerce: configuredCommerce(),
  identity: configuredIdentity(),
  operatorToken: process.env.OPERATOR_TOKEN,
  adminToken: process.env.PLATFORM_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN,
  secureCookies: production,
  serveWeb: true,
  providerReady: Boolean(generation),
  mediaStore,
  mediaVerified: mediaStatus === "verified",
  email,
});
await app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" });
console.log(
  JSON.stringify({
    application: "Our Jam",
    status: "listening",
    generation: generation ? "configured" : "not_configured",
    media: mediaStatus,
  }),
);
let ticking = false;
const roundTimer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await tickRounds(db, Boolean(generation));
  } catch {
    console.error(JSON.stringify({ event: "round_tick_failed" }));
  } finally {
    ticking = false;
  }
}, 1000);
roundTimer.unref();
let generating = false;
const generationTimer =
  generation && process.env.RUN_INLINE_GENERATION === "1"
    ? setInterval(async () => {
        if (generating) return;
        generating = true;
        try {
          await generationTick(db, generation);
        } catch {
          console.error(JSON.stringify({ event: "generation_worker_failed" }));
        } finally {
          generating = false;
        }
      }, 2000)
    : undefined;
generationTimer?.unref();
let emailing = false;
const emailTimer = email
  ? setInterval(async () => {
      if (emailing) return;
      emailing = true;
      try {
        await emailTick(db, email);
      } catch {
        console.error(JSON.stringify({ event: "email_worker_failed" }));
      } finally {
        emailing = false;
      }
    }, 1000)
  : undefined;
emailTimer?.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(roundTimer);
    clearInterval(generationTimer);
    clearInterval(emailTimer);
    await app.close();
    await db.close();
    process.exit(0);
  });
