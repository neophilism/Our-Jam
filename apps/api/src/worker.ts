import { postgres } from "./db.js";
import {
  configuredGeneration,
  configuredStorage,
} from "./generation-config.js";
import { generationTick } from "./generation.js";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const config = configuredGeneration(configuredStorage());
if (!config)
  throw new Error(
    "Generation worker is disabled. Configure approved rights, budget, provider and storage first.",
  );
const db = postgres(process.env.DATABASE_URL);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
  });
while (!stopping) {
  try {
    await generationTick(db, config);
  } catch {
    console.error(JSON.stringify({ event: "generation_worker_failed" }));
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 2000));
}
await db.close();
