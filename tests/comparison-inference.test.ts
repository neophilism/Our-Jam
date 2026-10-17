import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { readComparisonSelection,updateComparisonSelection } from "../apps/api/src/comparison-settings.js";
import { prepareComparisonBatch,readComparisonBatch } from "../apps/api/src/comparison-batches.js";
import { startComparisonBatch } from "../apps/api/src/comparison-dispatch.js";
import { setComparisonRate,comparisonRateInput } from "../apps/api/src/comparison-rates.js";
import { comparisonGenerationTick,comparisonMusicProvider } from "../apps/api/src/comparison-inference.js";
import { ProviderError, type MusicProvider } from "../packages/providers/src/stability.js";

const env:NodeJS.ProcessEnv={COMPARISON_GENERATION_ENABLED:"1",COMPARISON_COMMERCIAL_RIGHTS_APPROVED:"1",
  STABLE_AUDIO_KEY:"synthetic-test-key",MUREKA_API_KEY:"synthetic-test-key"};
async function queued() {
  const db=await testDatabase();
  const current=await readComparisonSelection(db);
  const settings=await updateComparisonSelection(db,{commandId:randomUUID(),expectedRevision:current.revision,selectedProviders:["mureka","stability"]});
  const batch=await prepareComparisonBatch(db,{commandId:randomUUID(),expectedSelectionRevision:settings.revision,
    prompt:"Fast upbeat funk instrumental with drums, bass, and horns.",durationSeconds:45,purpose:"commercial_evaluation"});
  for(const provider of ["stability","mureka"] as const)
    await setComparisonRate(db,comparisonRateInput.parse({
      commandId:randomUUID(),provider,sku:"",unit:"api_generation",rateMicroUsd:125000,
      supplier:"Test rate",sourceDescription:"Synthetic non-billable test quote only",
    }));
  await startComparisonBatch(db,batch.id,{commandId:randomUUID(),approvedCeilingMicroUsd:300000},env);
  return {db,batch};
}
const playable=new Uint8Array([1,2,3,4]);
const validate=async()=>({durationSeconds:45,meanDb:-12});
test("one queued comparison emits one private result per engine and never publishes to live events",async t=>{
  const {db,batch}=await queued();t.after(()=>db.close());
  const posted:string[]=[];const stored:string[]=[];
  const makeProvider=(engine:string):MusicProvider=>({
    name:engine,model:"synthetic-fixture",async generate(prompt,duration,context){
      posted.push(engine);
      assert.equal(prompt,"Fast upbeat funk instrumental with drums, bass, and horns.");
      assert.equal(duration,45);
      await context?.onAccepted?.("task-fixture-"+engine);
      return {bytes:playable,providerRef:"task-fixture-"+engine};
    },
  });
  const store={async put(key:string,_bytes:Uint8Array,_sha:string){stored.push(key);},async url(){return "https://private.invalid/signed";}};
  const config={store,env,validate,makeProvider};
  assert.equal(await comparisonGenerationTick(db,config),true);
  assert.equal(await comparisonGenerationTick(db,config),true);
  assert.equal(await comparisonGenerationTick(db,config),false);
  assert.equal(posted.length,2);
  assert.equal(new Set(posted).size,2);
  assert.ok(stored.every(key=>key.startsWith("comparison/")));
  const detail=await readComparisonBatch(db,batch.id);
  assert.equal(detail.state,"complete");
  assert.ok(detail.runs.every(r=>r.state==="succeeded" && r.attempts===1 && r.actualCostMicroUsd===null && r.costCertainty==="estimated"));
  assert.equal((await db.query("SELECT count(*)::int n FROM comparison_usage_events")).rows[0].n,2);
  assert.equal((await db.query("SELECT count(*)::int n FROM generation_jobs")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int n FROM releases")).rows[0].n,0);
});
test("unknown provider acceptance never triggers blind retry; other providers remain dispatchable",async t=>{
  const {db,batch}=await queued();t.after(()=>db.close());
  let first=0,second=0;
  const makeProvider=(engine:string):MusicProvider=>({
    name:engine,model:"fixture",
    async generate(){
      if(engine==="mureka"){first++;throw new ProviderError("provider_acceptance_unknown",true);}
      second++;return {bytes:playable};
    },
  });
  const config={env,store:{async put(){},async url(){return "https://private.invalid/";}},validate,makeProvider};
  assert.equal(await comparisonGenerationTick(db,config),true);
  assert.equal(await comparisonGenerationTick(db,config),true);
  assert.equal(await comparisonGenerationTick(db,config),false);
  assert.equal(first,1);assert.equal(second,1);
  const detail=await readComparisonBatch(db,batch.id);
  assert.equal(detail.state,"partial");
  assert.ok(detail.runs.some(r=>r.state==="unknown"));
  assert.ok(detail.runs.some(r=>r.state==="succeeded"));
});
test("expired running lease is marked unknown, never automatically sent twice",async t=>{
  const {db,batch}=await queued();t.after(()=>db.close());
  const row=(await db.query("SELECT id FROM comparison_runs WHERE batch_id=$1 LIMIT 1",[batch.id])).rows[0];
  await db.query("UPDATE comparison_runs SET state='running',attempts=1,attempt_id=$2,lease_until=now()-interval '1 minute' WHERE id=$1",[row.id,randomUUID()]);
  const calls:string[]=[];
  const config={env,store:{async put(){},async url(){return "https://private.invalid/";}},validate,
    makeProvider:(engine:string):MusicProvider=>({name:engine,model:"fixture",async generate(){calls.push(engine);return {bytes:playable};}})};
  await comparisonGenerationTick(db,config);
  const changed=(await db.query("SELECT state,reason FROM comparison_runs WHERE id=$1",[row.id])).rows[0];
  assert.equal(changed.state,"unknown");
  assert.equal(changed.reason,"worker_interrupted");
  assert.ok(!calls.includes("mureka") || !calls.includes("stability"),"only one remaining queued sibling can run");
});
test("missing commercial rights or unsigned insecure checkpoint cannot generate",()=>{
  assert.throws(()=>comparisonMusicProvider("musicgen","commercial_evaluation",env),{reason:"comparison_engine_not_authorized"});
  assert.throws(()=>comparisonMusicProvider("ace_step","commercial_evaluation",env),{reason:"comparison_engine_not_authorized"});
});
