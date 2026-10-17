import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import { id } from "../../../packages/contracts/src/index.js";
import { prepareComparisonInput, prepareComparisonBatch, listComparisonBatches, readComparisonBatch } from "./comparison-batches.js";
import { requirePlatformAdmin } from "./platform-admin.js";
import { configuredStorage } from "./generation-config.js";
import { saveComparisonReview, comparisonReviewInput, readComparisonReviews, comparisonCostReport, costReportCsv } from "./comparison-evaluation.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { comparisonPreflight, startComparisonBatch, startComparisonInput } from "./comparison-dispatch.js";
import { comparisonReadiness, comparisonSelectionInput, readComparisonSelection, updateComparisonSelection } from "./comparison-settings.js";

export function registerComparisonAdmin(app: FastifyInstance, db: Database) {
  app.get("/api/admin/comparisons", async req => {
    await requirePlatformAdmin(db, req);
    return { batches: await listComparisonBatches(db) };
  });
  app.get("/api/admin/comparisons/cost-report",async req=>{
    await requirePlatformAdmin(db,req);
    return {providers:await comparisonCostReport(db)};
  });
  app.get("/api/admin/comparisons/cost-report.csv",async(req,reply)=>{
    await requirePlatformAdmin(db,req);
    return reply.type("text/csv").header("Content-Disposition",'attachment; filename="ourjam-comparison-costs.csv"')
      .header("Cache-Control","private, no-store").send(costReportCsv(await comparisonCostReport(db)));
  });
  app.get("/api/admin/comparisons/:id/reviews",async req=>{
    await requirePlatformAdmin(db,req);
    return {reviews:await readComparisonReviews(db,id.parse((req.params as {id:string}).id))};
  });
  app.post("/api/admin/comparisons/:id/runs/:runId/review",async req=>{
    await requirePlatformAdmin(db,req);
    const params=req.params as {id:string;runId:string};
    return saveComparisonReview(db,id.parse(params.id),id.parse(params.runId),comparisonReviewInput.parse(req.body));
  });
  app.get("/api/admin/comparisons/:id/runs/:runId/audio", async (req,reply) => {
    await requirePlatformAdmin(db,req);
    const params=req.params as {id:string;runId:string};
    const batchId=id.parse(params.id),runId=id.parse(params.runId);
    const result=(await db.query("SELECT asset_key,state FROM comparison_runs WHERE id=$1 AND batch_id=$2",[runId,batchId])).rows[0];
    requireThat(result?.state==="succeeded" && typeof result.asset_key==="string" &&
      result.asset_key.startsWith("comparison/"+batchId+"/"+runId+"/"),
      "audio_not_ready","The private comparison track is not ready.",404);
    const store=configuredStorage();
    requireThat(store,"storage_not_configured","Private comparison media storage is not configured.",503);
    const url=await store!.url(result.asset_key,false);
    return reply.header("Cache-Control","private, no-store").header("Referrer-Policy","no-referrer").redirect(url);
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
