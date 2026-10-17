import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import { requirePlatformAdmin } from "./platform-admin.js";
import { comparisonReadiness, comparisonSelectionInput, readComparisonSelection, updateComparisonSelection } from "./comparison-settings.js";

export function registerComparisonAdmin(app: FastifyInstance, db: Database) {
  app.get("/api/admin/comparison/settings", async (req) => {
    await requirePlatformAdmin(db, req);
    const [selection, providers] = await Promise.all([readComparisonSelection(db), Promise.resolve(comparisonReadiness())]);
    return { ...selection, providers };
  });
  app.patch("/api/admin/comparison/settings", async (req) => {
    await requirePlatformAdmin(db, req);
    return updateComparisonSelection(db, comparisonSelectionInput.parse(req.body));
  });
}
