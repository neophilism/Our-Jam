import { createApp as createCoreApp, type AppConfig as CoreAppConfig } from "./app-core.js";
import type { Database } from "./db.js";
import type { GenerationConfig } from "./generation.js";
import { configuredGeneration } from "./generation-config.js";
import { registerGenerationControls } from "./provider-controls.js";
export type AppConfig = CoreAppConfig & { generation?: GenerationConfig };
/** Compose feature routes without expanding the existing core route module. */
export async function createApp(db: Database, config: AppConfig) {
  const app = await createCoreApp(db, config);
  registerGenerationControls(app, db, config.generation ?? configuredGeneration(config.mediaStore));
  return app;
}
