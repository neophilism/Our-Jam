import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { readComparisonSelection } from "../apps/api/src/comparison-settings.js";
import { prepareComparisonBatch } from "../apps/api/src/comparison-batches.js";
import { saveComparisonReview,readComparisonReviews,comparisonCostReport,costReportCsv } from "../apps/api/src/comparison-evaluation.js";
import { createApp } from "../apps/api/src/app.js";

async function seeded() {
  const db=await testDatabase();
  const settings=await readComparisonSelection(db);
  const batch=await prepareComparisonBatch(db,{commandId:randomUUID(),expectedSelectionRevision:settings.revision,
    prompt:"Brass and drums driving instrumental with an exciting bass solo.",durationSeconds:45,purpose:"commercial_evaluation"});
  const runs=(await db.query("SELECT id,provider FROM comparison_runs WHERE batch_id=$1 ORDER BY provider",[batch.id])).rows;
  await db.query("UPDATE comparison_runs SET state='succeeded',estimated_cost_micro_usd=100000,cost_certainty='estimated' WHERE id=$1",[runs[0].id]);
  await db.query("UPDATE comparison_runs SET state='succeeded',estimated_cost_micro_usd=200000,cost_certainty='estimated' WHERE id=$1",[runs[1].id]);
  return {db,batch,runs};
}
test("scoring saves favorite and usable decision, and changing favorite unsets previous in same batch",async t=>{
  const {db,batch,runs}=await seeded();t.after(()=>db.close());
  const first={commandId:randomUUID(),soundQuality:5,promptAdherence:4,approvedUsable:true,favorite:true,notes:"Best snare and bass"};
  const saved=await saveComparisonReview(db,batch.id,runs[0].id,first);
  assert.deepEqual(await saveComparisonReview(db,batch.id,runs[0].id,first),saved);
  await saveComparisonReview(db,batch.id,runs[1].id,{...first,commandId:randomUUID(),soundQuality:3,approvedUsable:false,notes:"Not strong"});
  const reviews=await readComparisonReviews(db,batch.id);
  assert.equal(reviews.filter(r=>r.favorite).length,1);
  assert.equal(reviews.find(r=>r.runId===runs[1].id)?.favorite,true);
  assert.equal(reviews.find(r=>r.runId===runs[0].id)?.favorite,false);
  assert.equal(reviews.find(r=>r.runId===runs[0].id)?.approvedUsable,true);
  const report=await comparisonCostReport(db);
  assert.equal(report.reduce((sum,row)=>sum+row.usable,0),1);
  assert.equal(report.reduce((sum,row)=>sum+row.actualTotalMicroUsd,0),0);
  assert.ok(report.every(row=>row.actualTotalMicroUsd===null));
  assert.match(costReportCsv(report),/provider,runs,successful,usable/);
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM platform_policy_audit WHERE action='comparison.review'")).rows[0].n,2);
});
test("cannot review tracks that are not successful or belong to another batch",async t=>{
  const {db,batch,runs}=await seeded();t.after(()=>db.close());
  await db.query("UPDATE comparison_runs SET state='unknown' WHERE id=$1",[runs[0].id]);
  const input={commandId:randomUUID(),soundQuality:3,promptAdherence:3,approvedUsable:false,favorite:false,notes:"No output"};
  await assert.rejects(saveComparisonReview(db,batch.id,runs[0].id,input),{code:"comparison_audio_not_ready"});
  await assert.rejects(saveComparisonReview(db,randomUUID(),runs[1].id,{...input,commandId:randomUUID()}),{code:"comparison_not_found"});
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM comparison_reviews")).rows[0].n,0);
});
test("rating and cost report APIs are admin-only and Origin protected",async t=>{
  const {db,batch,runs}=await seeded();
  const origin="http://our-jam.test",adminToken="evaluation-admin-test-secret-123456789";
  const app=await createApp(db,{origin,secureCookies:false,adminToken});
  t.after(async()=>{await app.close();await db.close();});
  const reviewUrl="/api/admin/comparisons/"+batch.id+"/runs/"+runs[0].id+"/review";
  const costUrl="/api/admin/comparisons/cost-report";
  assert.equal((await app.inject({method:"GET",url:costUrl})).statusCode,401);
  assert.equal((await app.inject({method:"POST",url:reviewUrl,headers:{origin},payload:{}})).statusCode,401);
  const login=await app.inject({method:"POST",url:"/api/admin/login",headers:{origin},payload:{token:adminToken}});
  assert.equal(login.statusCode,200);
  const cookie=login.cookies.find(x=>x.name==="oj_platform_admin")!.value;
  const headers={origin,cookie:"oj_platform_admin="+cookie};
  const saved=await app.inject({method:"POST",url:reviewUrl,headers,payload:{
    commandId:randomUUID(),soundQuality:5,promptAdherence:5,approvedUsable:true,favorite:true,notes:"Sounds great",
  }});
  assert.equal(saved.statusCode,200,saved.body);
  assert.equal((await app.inject({method:"GET",url:costUrl,headers})).statusCode,200);
  const csv=await app.inject({method:"GET",url:costUrl+".csv",headers});
  assert.equal(csv.statusCode,200,csv.body);
  assert.match(csv.body,/estimated_total_micro_usd/);
  assert.equal((await app.inject({method:"POST",url:reviewUrl,headers:{...headers,origin:"https://attacker.invalid"},payload:{}})).statusCode,403);
});
