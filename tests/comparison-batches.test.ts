import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID,createHash } from "node:crypto";
import { testDatabase } from "./database.js";
import { readComparisonSelection,updateComparisonSelection } from "../apps/api/src/comparison-settings.js";
import { prepareComparisonBatch, listComparisonBatches, readComparisonBatch } from "../apps/api/src/comparison-batches.js";
import { COMPARISON_ENGINE_IDS } from "../packages/providers/src/comparison-catalog.js";
import { createApp } from "../apps/api/src/app.js";

test("prepared batch persists exactly one private per-provider job and sends no provider call",async t=>{
  const db=await testDatabase(); t.after(()=>db.close());
  const before=await readComparisonSelection(db);
  const selection=await updateComparisonSelection(db,{commandId:randomUUID(),expectedRevision:before.revision,selectedProviders:[...COMPARISON_ENGINE_IDS]});
  const prompt="Instrumental test with crisp drums, bass, and cinematic strings.";
  const cmd=randomUUID();
  const input={commandId:cmd,expectedSelectionRevision:selection.revision,prompt,durationSeconds:60,purpose:"private_research" as const};
  const prepared=await prepareComparisonBatch(db,input);
  assert.equal(prepared.hasDispatched,false);
  assert.equal(prepared.state,"prepared");
  assert.equal(prepared.selectedProviders.length,6);
  assert.deepEqual(await prepareComparisonBatch(db,input),prepared,"idempotent retry must not make more jobs");
  const detail=await readComparisonBatch(db,prepared.id);
  assert.equal(detail.prompt,prompt);
  assert.equal(detail.promptHash,createHash("sha256").update(prompt).digest("hex"));
  assert.equal(detail.runs.length,6);
  assert.ok(detail.runs.every(r=>r.state==="prepared" && r.attempts===0 && r.costCertainty==="unknown"));
  assert.ok(detail.runs.every(r=>r.actualCostMicroUsd===null),"not observed is not zero");
  assert.equal((await db.query("SELECT count(*)::integer n FROM comparison_runs WHERE batch_id=$1",[prepared.id])).rows[0].n,6);
  assert.equal((await db.query("SELECT count(*)::integer n FROM comparison_usage_events")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::integer n FROM generation_jobs")).rows[0].n,0,"must not touch show generation");
  const summaries=await listComparisonBatches(db);
  assert.equal(summaries[0].id,prepared.id);
  assert.equal(JSON.stringify(summaries).includes(prompt),false,"list does not disclose private prompt");
});
test("research-only weights cannot be used in a commercial comparison, and stale selection cannot dispatch",async t=>{
  const db=await testDatabase();t.after(()=>db.close());
  const s=await readComparisonSelection(db);
  await updateComparisonSelection(db,{commandId:randomUUID(),expectedRevision:s.revision,selectedProviders:[...COMPARISON_ENGINE_IDS]});
  const base={prompt:"Commercially distributed jazzy funk instrumental.",durationSeconds:60};
  await assert.rejects(
    prepareComparisonBatch(db,{...base,commandId:randomUUID(),expectedSelectionRevision:1,purpose:"commercial_evaluation"}),
    {code:"research_only_model"},
  );
  await assert.rejects(
    prepareComparisonBatch(db,{...base,commandId:randomUUID(),expectedSelectionRevision:0,purpose:"private_research"}),
    {code:"revision_conflict"},
  );
  assert.equal((await db.query("SELECT count(*)::integer n FROM comparison_batches")).rows[0].n,0);
  await updateComparisonSelection(db,{commandId:randomUUID(),expectedRevision:1,selectedProviders:["ace_step","stability"]});
  const batch=await prepareComparisonBatch(db,{...base,commandId:randomUUID(),expectedSelectionRevision:2,purpose:"commercial_evaluation"});
  assert.deepEqual(batch.selectedProviders,["ace_step","stability"]);
  assert.equal((await readComparisonBatch(db,batch.id)).runs.length,2);
});

test("private batch HTTP endpoints reject guests and Origin spoofing without creating paid generations",async t=>{
  const db=await testDatabase();
  const origin="http://our-jam.test";
  const adminKey="comparison-admin-tests-secret-123456789";
  const app=await createApp(db,{origin,secureCookies:false,adminToken:adminKey});
  t.after(async()=>{await app.close();await db.close();});
  const url="/api/admin/comparisons";
  assert.equal((await app.inject({method:"GET",url})).statusCode,401);
  assert.equal((await app.inject({method:"POST",url,headers:{origin},payload:{}})).statusCode,401);
  const login=await app.inject({method:"POST",url:"/api/admin/login",headers:{origin},payload:{token:adminKey}});
  assert.equal(login.statusCode,200,login.body);
  const cookie=login.cookies.find(c=>c.name==="oj_platform_admin")!.value;
  const headers={origin,cookie:"oj_platform_admin="+cookie};
  const saved=await app.inject({method:"POST",url,headers,payload:{
    commandId:randomUUID(),expectedSelectionRevision:0,prompt:"Deep funk instrumental with soulful horns and jazz drums.",durationSeconds:45,purpose:"commercial_evaluation",
  }});
  assert.equal(saved.statusCode,200,saved.body);
  assert.equal(saved.json().selectedProviders.length,2);
  const preparedId=saved.json().id;
  const list=await app.inject({method:"GET",url,headers});
  assert.equal(list.statusCode,200,list.body);
  assert.equal(list.json().batches[0].id,preparedId);
  const details=await app.inject({method:"GET",url:url+"/"+preparedId,headers});
  assert.equal(details.statusCode,200,details.body);
  assert.equal(details.json().runs.length,2);
  assert.equal((await app.inject({method:"GET",url:url+"/"+preparedId})).statusCode,401);
  assert.equal((await app.inject({method:"POST",url,headers:{...headers,origin:"https://evil.invalid"},payload:{}})).statusCode,403);
  assert.equal((await db.query("SELECT count(*)::integer n FROM generation_jobs")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::integer n FROM comparison_usage_events")).rows[0].n,0);
});
