import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import { id } from "../../../packages/contracts/src/index.js";
import { prepareComparisonInput, prepareComparisonBatch, listComparisonBatches, readComparisonBatch } from "./comparison-batches.js";
import { requirePlatformAdmin } from "./platform-admin.js";
import { comparisonPreflight, startComparisonBatch, startComparisonInput } from "./comparison-dispatch.js";
import { comparisonReadiness, comparisonSelectionInput, readComparisonSelection, updateComparisonSelection } from "./comparison-settings.js";

export function registerComparisonAdmin(app: FastifyInstance, db: Database) {
  app.get("/api/admin/comparisons", async req => {
    await requirePlatformAdmin(db, req);
    return { batches: await listComparisonBatches(db) };
  });
  app.get("/api/admin/comparisons/:id", async req => {
    await requirePlatformAdmin(db, req);
    return readComparisonBatch(db, id.parse((req.params as {id:string}).id));
  });
  app.get("/api/admin/comparisons/:id/preflight", async req => {
    await requirePlatformAdmin(db, req);
    return comparisonPreflight(db, id.parse((req.params as {id:string}).id));
  });
  app.post("/api/admin/comparisons/:id/start", async req => {
    await requirePlatformAdmin(db, req);
    return startComparisonBatch(db, id.parse((req.params as {id:string}).id), startComparisonInput.parse(req.body));
  });
  app.post("/api/admin/comparisons", async req => {
    await requirePlatformAdmin(db, req);
    return prepareComparisonBatch(db, prepareComparisonInput.parse(req.body));
  });
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
