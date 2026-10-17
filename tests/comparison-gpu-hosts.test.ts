import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {testDatabase} from "./database.js";
import {hostEndpoint,hostRateSku,hostAvailability} from "../apps/api/src/comparison-gpu-hosts.js";
import {comparisonConfiguration,comparisonPreflight,startComparisonBatch} from "../apps/api/src/comparison-dispatch.js";
import {readComparisonSelection,updateComparisonSelection} from "../apps/api/src/comparison-settings.js";
import {prepareComparisonBatch,readComparisonBatch} from "../apps/api/src/comparison-batches.js";
import {setComparisonRate,comparisonRateInput} from "../apps/api/src/comparison-rates.js";
import {comparisonMusicProvider} from "../apps/api/src/comparison-inference.js";
import {COMPARISON_ENGINES} from "../packages/providers/src/comparison-catalog.js";

const env:NodeJS.ProcessEnv={
  COMPARISON_GENERATION_ENABLED:"1",COMPARISON_COMMERCIAL_RIGHTS_APPROVED:"1",
  MODAL_ACE_STEP_BASE_URL:"https://ourjam-ace.modal.run/",MODAL_ACE_STEP_TOKEN:"modal-ace-private-token",
  MODAL_GPU_GATEWAY_URL:"https://ourjam-gpu.modal.run/",MODAL_GPU_GATEWAY_TOKEN:"modal-gateway-private-token",
  LIGHTNING_ACE_STEP_BASE_URL:"https://studio.lightning.example/",LIGHTNING_ACE_STEP_TOKEN:"lightning-ace-private-token",
  LIGHTNING_GPU_GATEWAY_URL:"https://gateway.lightning.example/",LIGHTNING_GPU_GATEWAY_TOKEN:"lightning-gateway-private-token",
  MODAL_GPU_SKU:"Modal L40S",LIGHTNING_GPU_SKU:"Lightning L40S",
  ACE_STEP_CHECKPOINT_APPROVED:"1",HEARTMULA_CHECKPOINT_APPROVED:"1",
  STABLE_AUDIO_OPEN_LICENSE_APPROVED:"1",MUSICGEN_NONCOMMERCIAL_RESEARCH_APPROVED:"1",
  COMPARISON_GPU_ENFORCED_BILLING_SECONDS:"300",COMPARISON_GPU_HOST_BILLING_LIMIT_ACK:"1",
};
test("Modal and Lightning endpoints are fixed private origins, never browser-supplied",()=>{
  assert.equal(hostEndpoint("modal","gateway",env)?.baseUrl,env.MODAL_GPU_GATEWAY_URL);
  assert.equal(hostEndpoint("lightning","ace_step",env)?.baseUrl,env.LIGHTNING_ACE_STEP_BASE_URL);
  assert.equal(hostRateSku("modal","heartmula",env),"Modal L40S");
  assert.equal(hostRateSku("lightning","ace_step",env),"Lightning L40S");
  assert.equal(hostEndpoint("modal","gateway",{...env,MODAL_GPU_GATEWAY_URL:"http://bad.invalid/"}),null);
  assert.equal(hostEndpoint("modal","gateway",{...env,MODAL_GPU_GATEWAY_URL:"https://bad.invalid.evil/#fragment"}),null);
  assert.equal(hostEndpoint("modal","gateway",{...env,MODAL_GPU_GATEWAY_URL:"https://user@bad.invalid/"}),null);
  assert.equal(hostEndpoint("modal","gateway",{...env,MODAL_GPU_GATEWAY_URL:"https://bad.invalid:8443/"}),null);
  assert.equal(hostEndpoint("modal","gateway",{...env,MODAL_GPU_GATEWAY_TOKEN:""}),null);
  const publicInfo=hostAvailability(env);
  assert.equal(publicInfo.length,2);
  assert.ok(publicInfo.every(info=>info.gatewayConfigured && info.aceConfigured && !info.liveVerified));
  assert.doesNotMatch(JSON.stringify(publicInfo),/modal-gateway-private-token|lightning-gateway-private-token/);
});
test("quality-first pinned checkpoints use XL and 4B planner, HNY 3B and research-only Large",()=>{
  const list=Object.fromEntries(COMPARISON_ENGINES.map(e=>[e.id,e]));
  assert.equal(list.ace_step.checkpoint,"acestep-v15-xl-sft");
  assert.equal(list.heartmula.checkpoint,"HeartMuLa-oss-3B-happy-new-year");
  assert.equal(list.musicgen.checkpoint,"facebook/musicgen-large");
  assert.equal(list.stable_audio_open.checkpoint,"stable-audio-3-medium");
  assert.equal(list.musicgen.rights,"noncommercial_only");
  assert.equal(comparisonMusicProvider("ace_step","commercial_evaluation",env,"modal").model,"acestep-v15-xl-sft");
  assert.equal(comparisonMusicProvider("heartmula","commercial_evaluation",env,"lightning").model,"HeartMuLa-oss-3B-happy-new-year");
  assert.throws(()=>comparisonMusicProvider("musicgen","commercial_evaluation",env,"modal"));
  assert.throws(()=>comparisonMusicProvider("heartmula","commercial_evaluation",env,"modal","HeartMuLa-oss-3B"));
  assert.match(comparisonConfiguration("ace_step","commercial_evaluation",
    {...env,LIGHTNING_ACE_STEP_BASE_URL:""},"lightning")??"",/endpoint/);
});
test("host change only affects new comparisons, with separate rates for identical checkpoints",async t=>{
  const db=await testDatabase();t.after(()=>db.close());
  const original=await readComparisonSelection(db);
  const choice=await updateComparisonSelection(db,{
    commandId:randomUUID(),expectedRevision:original.revision,
    selectedProviders:["ace_step","heartmula"],gpuHost:"lightning",
  });
  const first=await prepareComparisonBatch(db,{commandId:randomUUID(),
    expectedSelectionRevision:choice.revision,durationSeconds:30,
    prompt:"Energetic instrumental brass funk with punchy bass and live drums.",
    purpose:"commercial_evaluation"});
  const newer=await updateComparisonSelection(db,{
    commandId:randomUUID(),expectedRevision:choice.revision,
    selectedProviders:["ace_step","heartmula"],gpuHost:"modal",
  });
  const second=await prepareComparisonBatch(db,{commandId:randomUUID(),
    expectedSelectionRevision:newer.revision,durationSeconds:30,
    prompt:"Energetic instrumental brass funk with punchy bass and live drums.",
    purpose:"commercial_evaluation"});
  const details=await Promise.all([readComparisonBatch(db,first.id),readComparisonBatch(db,second.id)]);
  assert.deepEqual(details[0].runs.map(r=>r.gpuHost),["lightning","lightning"]);
  assert.deepEqual(details[1].runs.map(r=>r.gpuHost),["modal","modal"]);
  assert.deepEqual(details[0].runs.map(r=>r.modelCheckpoint),details[1].runs.map(r=>r.modelCheckpoint));
  for(const provider of ["ace_step","heartmula"] as const) {
    await setComparisonRate(db,comparisonRateInput.parse({
      commandId:randomUUID(),provider,sku:"Lightning L40S",unit:"gpu_hour",
      rateMicroUsd:2500000,supplier:"Fixture provider",sourceDescription:"Synthetic Lightning GPU rate"
    }));
    await setComparisonRate(db,comparisonRateInput.parse({
      commandId:randomUUID(),provider,sku:"Modal L40S",unit:"gpu_hour",
      rateMicroUsd:1500000,supplier:"Fixture provider",sourceDescription:"Synthetic Modal GPU rate"
    }));
  }
  const firstQuote=await comparisonPreflight(db,first.id,env);
  const secondQuote=await comparisonPreflight(db,second.id,env);
  assert.equal(firstQuote.allReady,true);
  assert.equal(secondQuote.allReady,true);
  assert.equal(firstQuote.estimatedTotalMicroUsd,2*Math.ceil(2500000*300/3600));
  assert.equal(secondQuote.estimatedTotalMicroUsd,2*Math.ceil(1500000*300/3600));
  assert.ok(firstQuote.quotes.every(q=>q.rateSnapshot?.gpuHost==="lightning"));
  assert.ok(secondQuote.quotes.every(q=>q.rateSnapshot?.gpuHost==="modal"));
  const live=await startComparisonBatch(db,first.id,{
    commandId:randomUUID(),approvedCeilingMicroUsd:1000000
  },env);
  assert.equal(live.queuedRuns,2);
  const historical=await readComparisonBatch(db,first.id);
  assert.deepEqual(historical.runs.map(r=>r.gpuHost),["lightning","lightning"]);
  assert.equal((await db.query("SELECT count(*)::int n FROM generation_jobs")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int n FROM comparison_usage_events")).rows[0].n,0);
});
