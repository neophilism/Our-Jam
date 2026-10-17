import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {testDatabase} from "./database.js";
import {comparisonRateInput,setComparisonRate,currentComparisonRates} from "../apps/api/src/comparison-rates.js";

test("meter rates store explicit operator estimates and never invent $0 GPU costs",async t=>{
  const db=await testDatabase();t.after(()=>db.close());
  assert.deepEqual(await currentComparisonRates(db),[]);
  const sample={commandId:randomUUID(),provider:"ace_step" as const,sku:"RTX 4090 rental",unit:"gpu_hour" as const,rateMicroUsd:890000,
    supplier:"Rental provider",sourceDescription:"Published GPU hourly-rate estimate, subject to invoice"};
  const first=await setComparisonRate(db,comparisonRateInput.parse(sample));
  assert.equal(first.provenance,"operator_estimate");
  assert.deepEqual(await setComparisonRate(db,comparisonRateInput.parse(sample)),first,"idempotent save");
  let rates=await currentComparisonRates(db);
  assert.equal(rates.length,1);assert.equal(rates[0].rateMicroUsd,890000);
  await setComparisonRate(db,comparisonRateInput.parse({...sample,commandId:randomUUID(),rateMicroUsd:940000}));
  rates=await currentComparisonRates(db);
  assert.equal(rates.length,1);assert.equal(rates[0].rateMicroUsd,940000);
  assert.equal((await db.query("SELECT count(*)::integer n FROM comparison_rate_cards")).rows[0].n,2,"audit historical rates are retained");
  assert.equal((await db.query("SELECT count(*)::integer n FROM platform_policy_audit WHERE action='comparison.rate.create'")).rows[0].n,2);
});
test("API jobs cannot masquerade as GPU-seconds; missing rates remain absent not zero",async t=>{
  const db=await testDatabase();t.after(()=>db.close());
  const base={commandId:randomUUID(),provider:"stability" as const,sku:"",unit:"api_generation" as const,rateMicroUsd:100000,
    supplier:"Stability",sourceDescription:"Manual estimate awaiting final invoice"};
  await setComparisonRate(db,comparisonRateInput.parse(base));
  await assert.rejects(setComparisonRate(db,comparisonRateInput.parse({...base,commandId:randomUUID(),unit:"gpu_hour"})),{code:"invalid_billing_unit"});
  assert.throws(()=>comparisonRateInput.parse({...base,rateMicroUsd:0}));
  assert.throws(()=>comparisonRateInput.parse({...base,rateMicroUsd:-10}));
  assert.equal((await currentComparisonRates(db)).length,1);
});
