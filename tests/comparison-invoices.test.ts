import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { readComparisonSelection } from "../apps/api/src/comparison-settings.js";
import { prepareComparisonBatch } from "../apps/api/src/comparison-batches.js";
import { reconcileComparisonInvoice,comparisonInvoiceHistory } from "../apps/api/src/comparison-invoices.js";
import { createApp } from "../apps/api/src/app.js";

async function seed(){
  const db=await testDatabase();
  const selection=await readComparisonSelection(db);
  const b=await prepareComparisonBatch(db,{
    commandId:randomUUID(),expectedSelectionRevision:selection.revision,
    prompt:"Cinematic funky bass with brass and laidback drums, instrumental.",
    purpose:"commercial_evaluation",durationSeconds:45,
  });
  const run=(await db.query("SELECT id FROM comparison_runs WHERE batch_id=$1 LIMIT 1",[b.id])).rows[0];
  await db.query("UPDATE comparison_runs SET state='failed' WHERE id=$1",[run.id]);
  return {db,batchId:b.id,runId:run.id};
}
const invoice={commandId:randomUUID(),expectedRevision:0,amountMicroUsd:345000,
  evidenceReference:"GPU-invoice-reference-2026-10",allocationMethod:"Fully loaded charge allocated by GPU reserved seconds",
  certainty:"invoiced" as const,includesFullAllocatedCost:false,reason:"First actual supplier charge"};
test("invoice entry is durable and idempotent; correction appends rather than overwrites",async t=>{
  const {db,batchId,runId}=await seed();t.after(()=>db.close());
  const first=await reconcileComparisonInvoice(db,batchId,runId,invoice);
  assert.equal(first.revision,1);
  assert.deepEqual(await reconcileComparisonInvoice(db,batchId,runId,invoice),first);
  const second=await reconcileComparisonInvoice(db,batchId,runId,{
    ...invoice,commandId:randomUUID(),expectedRevision:1,
    amountMicroUsd:355000,certainty:"reconciled",
    includesFullAllocatedCost:true,reason:"Allocated GPU cold start and idle across all tasks",
  });
  assert.equal(second.revision,2);
  const rows=(await comparisonInvoiceHistory(db,batchId)).entries;
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.revision),[2,1]);
  const now=(await db.query("SELECT actual_cost_micro_usd,cost_certainty FROM comparison_runs WHERE id=$1",[runId])).rows[0];
  assert.equal(Number(now.actual_cost_micro_usd),355000);
  assert.equal(now.cost_certainty,"reconciled");
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM platform_policy_audit WHERE action='comparison.invoice.revision'")).rows[0].n,2);
});
test("cannot claim full reconciliation without full allocation confirmation or override newer revision",async t=>{
  const {db,batchId,runId}=await seed();t.after(()=>db.close());
  await assert.rejects(reconcileComparisonInvoice(db,batchId,runId,{
    ...invoice,certainty:"reconciled",
  }),{code:"incomplete_cost_attribution"});
  await reconcileComparisonInvoice(db,batchId,runId,invoice);
  await assert.rejects(reconcileComparisonInvoice(db,batchId,runId,{
    ...invoice,commandId:randomUUID(),
  }),{code:"revision_conflict"});
  assert.equal((await comparisonInvoiceHistory(db,batchId)).entries.length,1);
});
test("actual invoice entry requires platform admin cookie and same-origin mutation",async t=>{
  const {db,batchId,runId}=await seed();
  const origin="http://our-jam.test",adminToken="invoice-admin-test-credential-over-32-chars";
  const app=await createApp(db,{origin,secureCookies:false,adminToken});t.after(async()=>{await app.close();await db.close();});
  const url="/api/admin/comparisons/"+batchId+"/runs/"+runId+"/invoice";
  assert.equal((await app.inject({method:"POST",url,headers:{origin},payload:invoice})).statusCode,401);
  const login=await app.inject({method:"POST",url:"/api/admin/login",headers:{origin},payload:{token:adminToken}});
  assert.equal(login.statusCode,200);
  const cookie=login.cookies.find(x=>x.name==="oj_platform_admin")!.value;
  const headers={origin,cookie:"oj_platform_admin="+cookie};
  assert.equal((await app.inject({method:"POST",url,headers:{...headers,origin:"https://attacker.invalid"},payload:invoice})).statusCode,403);
  const saved=await app.inject({method:"POST",url,headers,payload:invoice});
  assert.equal(saved.statusCode,200,saved.body);
  const history=await app.inject({method:"GET",url:"/api/admin/comparisons/"+batchId+"/invoices",headers});
  assert.equal(history.statusCode,200,history.body);
  assert.equal(history.json().entries.length,1);
});
