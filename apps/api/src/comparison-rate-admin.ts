import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import { requirePlatformAdmin } from "./platform-admin.js";
import { comparisonRateInput, currentComparisonRates, setComparisonRate } from "./comparison-rates.js";

export function registerComparisonRateAdmin(app: FastifyInstance, db: Database) {
  app.get("/api/admin/comparison/rates", async req => {
    await requirePlatformAdmin(db, req);
    return { rates: await currentComparisonRates(db), warning: "Operator rates are estimates until reconciled to a cloud or API invoice." };
  });
  app.post("/api/admin/comparison/rates", async req => {
    await requirePlatformAdmin(db, req);
    return setComparisonRate(db, comparisonRateInput.parse(req.body));
  });
}
