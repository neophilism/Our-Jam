import test from "node:test";
import assert from "node:assert/strict";
import { allocateGpuInvoice, summarizeCost, costPerUsableSong, formatCost } from "../packages/providers/src/comparison-cost.js";

test("GPU invoice distributes shared boot, idle and active cost once without double counting", () => {
  const r = allocateGpuInvoice({
    rateMicroUsdPerHour: 500000, billedSeconds: 600,
    jobs: [{ runId: "ace", busyGpuSeconds: 120 }, { runId:"heart", busyGpuSeconds: 80 }],
    certainty:"invoiced",
  });
  assert.equal(r.totalMicroUsd, 83334);
  assert.equal(r.allocated.length, 2);
  assert.equal(r.allocated.reduce((sum,j)=>sum+(j.amountMicroUsd??0),0),r.totalMicroUsd);
  assert.equal(r.unallocatedMicroUsd,0);
  assert.equal(r.certainty,"invoiced");
});
test("a rented but idle GPU is accounted for and not assigned to fake generations", () => {
  const r = allocateGpuInvoice({ rateMicroUsdPerHour:1000000,billedSeconds:3600,jobs:[],certainty:"estimated" });
  assert.equal(r.totalMicroUsd,1000000);
  assert.equal(r.unallocatedMicroUsd,1000000);
  assert.deepEqual(r.allocated,[]);
});
test("missing host price and unknown invoices are not misrepresented as $0", () => {
  const r = allocateGpuInvoice({ rateMicroUsdPerHour:null,billedSeconds:300,jobs:[{runId:"a",busyGpuSeconds:20}],certainty:"unknown" });
  assert.equal(r.totalMicroUsd,null);
  assert.equal(r.allocated[0].amountMicroUsd,null);
  assert.equal(formatCost(null),"Unknown");
  assert.equal(summarizeCost([]).knownMicroUsd,null);
  assert.equal(summarizeCost([{id:"a",category:"gpu",amountMicroUsd:null,certainty:"unknown"}]).complete,false);
});
test("only validated charge amounts contribute to bill totals", () => {
  const r=summarizeCost([
    {id:"api",category:"api",amountMicroUsd:200000,certainty:"invoiced"},
    {id:"storage",category:"storage",amountMicroUsd:2500,certainty:"estimated"},
    {id:"network",category:"egress",amountMicroUsd:null,certainty:"unknown"},
  ]);
  assert.equal(r.knownMicroUsd,202500);
  assert.equal(r.complete,false);
  assert.equal(r.estimated,true);
  assert.equal(costPerUsableSong(r.knownMicroUsd,2),101250);
  assert.equal(costPerUsableSong(r.knownMicroUsd,0),null);
  assert.equal(formatCost(202500),"$0.2025");
  assert.throws(()=>summarizeCost([{id:"duplicate",category:"api",amountMicroUsd:1,certainty:"invoiced"},{id:"duplicate",category:"gpu",amountMicroUsd:1,certainty:"invoiced"}]));
});
