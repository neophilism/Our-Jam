import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { readComparisonSelection,updateComparisonSelection } from "../apps/api/src/comparison-settings.js";
import { prepareComparisonBatch,readComparisonBatch } from "../apps/api/src/comparison-batches.js";
import { comparisonPreflight,comparisonConfiguration,startComparisonBatch } from "../apps/api/src/comparison-dispatch.js";
import { setComparisonRate,comparisonRateInput } from "../apps/api/src/comparison-rates.js";
import { createApp } from "../apps/api/src/app.js";

const env:NodeJS.ProcessEnv={
  COMPARISON_GENERATION_ENABLED:"1",
  COMPARISON_COMMERCIAL_RIGHTS_APPROVED:"1",
  MUREKA_API_KEY:"test-synthetic-key",
  STABLE_AUDIO_KEY:"test-synthetic-key",
};
async function setup() {
  const db=await testDatabase();
  const settings=await readComparisonSelection(db);
  const choice=await updateComparisonSelection(db,{commandId:randomUUID(),expectedRevision:settings.revision,selectedProviders:["mureka","stability"]});
  const batch=await prepareComparisonBatch(db,{commandId:randomUUID(),expectedSelectionRevision:choice.revision,
    prompt:"Funky drums and brass, expressive electric bass, instrumental.",durationSeconds:45,purpose:"commercial_evaluation"});
  for (const provider of ["mureka","stability"] as const) {
    await setComparisonRate(db,comparisonRateInput.parse({commandId:randomUUID(),provider,sku:"",
      unit:"api_generation",rateMicroUsd:180000,supplier:"Test only",
      sourceDescription:"Synthetic rate for verified no-cost tests, not real pricing"}));
  }
  return {db,batch};
}
test("preflight quotes two independently priced API runs and dispatch freezes a budget without any music request", async t=>{
  const {db,batch}=await setup();t.after(()=>db.close());
  const quoted=await comparisonPreflight(db,batch.id,env);
  assert.equal(quoted.allReady,true);
  assert.equal(quoted.quotes.length,2);
  assert.equal(quoted.estimatedTotalMicroUsd,360000);
  assert.ok(quoted.quotes.every(r=>r.ready && r.rateCardId));
  const commandId=randomUUID();
  const input={commandId,approvedCeilingMicroUsd:500000};
  const started=await startComparisonBatch(db,batch.id,input,env);
  assert.equal(started.state,"queued");
  assert.equal(started.queuedRuns,2);
  assert.deepEqual(await startComparisonBatch(db,batch.id,input,env),started);
  const detail=await readComparisonBatch(db,batch.id);
  assert.equal(detail.state,"queued");
  assert.deepEqual(detail.runs.map(r=>r.state),["queued","queued"]);
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM comparison_runs WHERE batch_id=$1 AND estimated_cost_micro_usd=180000",[batch.id])).rows[0].n,2);
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM comparison_usage_events")).rows[0].n,0);
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM generation_jobs")).rows[0].n,0);
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM platform_policy_audit WHERE action='comparison.start'")).rows[0].n,1);
  await assert.rejects(startComparisonBatch(db,batch.id,{commandId:randomUUID(),approvedCeilingMicroUsd:500000},env),{code:"comparison_not_ready"});
});
test("never silently generates with missing secrets, quote, budget or licenses",async t=>{
  const {db,batch}=await setup();t.after(()=>db.close());
  assert.equal((await comparisonPreflight(db,batch.id,{})).allReady,false);
  await assert.rejects(startComparisonBatch(db,batch.id,{commandId:randomUUID(),approvedCeilingMicroUsd:999999},{}),{code:"comparison_not_ready"});
  await assert.rejects(startComparisonBatch(db,batch.id,{commandId:randomUUID(),approvedCeilingMicroUsd:100},env),{code:"comparison_ceiling_too_low"});
  assert.equal((await readComparisonBatch(db,batch.id)).state,"prepared");
  assert.match(comparisonConfiguration("musicgen","commercial_evaluation",env) ?? "",/noncommercial|gateway|licensed/i);
  assert.match(comparisonConfiguration("stable_audio_open","private_research",env) ?? "",/gateway|license/);
  assert.match(comparisonConfiguration("ace_step","private_research",{...env,ACE_STEP_BASE_URL:"http://localhost/",ACE_STEP_TOKEN:"x"})??"",/HTTPS/);
});
test("admin preflight rejects unauthenticated guests and cannot queue with bad Origin",async t=>{
  const {db,batch}=await setup();const origin="http://our-jam.test",adminToken="comparison-test-admin-token-over-32-characters";
  const app=await createApp(db,{origin,secureCookies:false,adminToken});t.after(async()=>{await app.close();await db.close();});
  assert.equal((await app.inject({method:"GET",url:`/api/admin/comparisons/${batch.id}/preflight`})).statusCode,401);
  const login=await app.inject({method:"POST",url:"/api/admin/login",headers:{origin},payload:{token:adminToken}});
  assert.equal(login.statusCode,200,login.body);
  const cookie=login.cookies.find(x=>x.name==="oj_platform_admin")!.value;
  const headers={cookie:"oj_platform_admin="+cookie,origin};
  const quote=await app.inject({method:"GET",url:`/api/admin/comparisons/${batch.id}/preflight`,headers});
  assert.equal(quote.statusCode,200,quote.body);
  const start=`/api/admin/comparisons/${batch.id}/start`;
  assert.equal((await app.inject({method:"POST",url:start,headers:{...headers,origin:"https://attacker.invalid"},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:start,headers:{origin},payload:{}})).statusCode,401);
  assert.equal((await app.inject({method:"POST",url:start,headers,payload:{commandId:randomUUID(),approvedCeilingMicroUsd:1000000}})).statusCode,409,
    "server test environment is not explicitly enabled for paid generation");
});
