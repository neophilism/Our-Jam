import test from "node:test";
import assert from "node:assert/strict";
import {chooseGpuHost,gpuHostTargets,probeGpuHost} from "../packages/providers/src/gpu-host-routing.js";
import {ProviderError} from "../packages/providers/src/stability.js";

const env:NodeJS.ProcessEnv={
  OURJAM_GPU_MODAL_URL:"https://modal.example/",
  OURJAM_GPU_MODAL_TOKEN:"modal-private-token-12345",
  OURJAM_GPU_LIGHTNING_URL:"https://lightning.example/",
  OURJAM_GPU_LIGHTNING_TOKEN:"lightning-private-token-12345",
  OURJAM_GPU_MODAL_ACE_URL:"https://ace-modal.example/",
  OURJAM_GPU_MODAL_ACE_TOKEN:"modal-ace-private-token-12345",
  OURJAM_GPU_LIGHTNING_ACE_URL:"https://ace-lightning.example/",
  OURJAM_GPU_LIGHTNING_ACE_TOKEN:"lightning-ace-private-token-12345",
};
test("two independently authenticated GPU hosts are selected in explicit priority",()=>{
  const a=gpuHostTargets("heartmula","HeartMuLa-oss-3B-happy-new-year",env);
  assert.deepEqual(a.map(x=>x.id),["modal","lightning"]);
  assert.deepEqual(a.map(x=>x.protocol),["gateway","gateway"]);
  assert.notEqual(a[0].token,a[1].token);
  assert.deepEqual(gpuHostTargets("ace_step","acestep-v15-xl-sft",env).map(x=>x.protocol),["ace","ace"]);
  assert.deepEqual(gpuHostTargets("musicgen","facebook/musicgen-large",{
    ...env,OURJAM_GPU_HOST_ORDER:"lightning,modal"
  }).map(x=>x.id),["lightning","modal"]);
});
test("pre-submit GET health can select secondary host, but does not POST even once",async()=>{
  const hosts=gpuHostTargets("heartmula","HeartMuLa-oss-3B-happy-new-year",env);
  const calls:string[]=[];
  const selected=await chooseGpuHost(hosts,async(input,options)=>{
    calls.push((options?.method||"GET")+" "+new URL(String(input)).hostname);
    assert.equal(options?.redirect,"error");
    const hostname=new URL(String(input)).hostname;
    const ok=hostname==="lightning.example";
    return new Response(JSON.stringify({ok,models:[{engine:"heartmula",model:"HeartMuLa-oss-3B-happy-new-year",available:ok}]}),{headers:{"content-type":"application/json"}});
  });
  assert.equal(selected.id,"lightning");
  assert.deepEqual(calls,["GET modal.example","GET lightning.example"]);
});
test("model mismatch and missing healthy endpoints do not submit or incur generation",async()=>{
  const hosts=gpuHostTargets("heartmula","HeartMuLa-oss-3B-happy-new-year",env);
  await assert.rejects(chooseGpuHost(hosts,async()=>
    new Response(JSON.stringify({ok:true,models:[{engine:"heartmula",model:"other",available:true}]}),{
      headers:{"content-type":"application/json"}
    })),(err:any)=>err instanceof ProviderError&&!err.uncertain);
  const bad=await probeGpuHost(hosts[0],async()=>new Response("<html/>",{headers:{"content-type":"text/html"}}));
  assert.equal(bad.healthy,false);
  const unavailable=await probeGpuHost(hosts[0],async()=>{throw new Error("offline");});
  assert.equal(unavailable.healthy,false);
});
test("ACE-Step model capability probe only accepts exact requested XL model",async()=>{
  const hosts=gpuHostTargets("ace_step","acestep-v15-xl-sft",env);
  const selected=await chooseGpuHost(hosts,async(input)=>{
    const host=new URL(String(input)).hostname;
    assert.equal(new URL(String(input)).pathname,"/v1/models");
    return new Response(JSON.stringify({code:200,data:{models:[{name:host==="ace-lightning.example"?
      "acestep-v15-xl-sft":"acestep-v15-turbo"}]}}),{headers:{"content-type":"application/json"}});
  });
  assert.equal(selected.id,"lightning");
});
test("rejects insecure roots, credentials in URLs and ambiguous host priorities",()=>{
  for(const uri of ["http://modal.example/","https://user:pass@modal.example/",
    "https://modal.example/route","https://modal.example/?x=1","https://127.0.0.1/"])
    assert.throws(()=>gpuHostTargets("heartmula","HeartMuLa-oss-3B-happy-new-year",{...env,OURJAM_GPU_MODAL_URL:uri}));
  assert.throws(()=>gpuHostTargets("heartmula","HeartMuLa-oss-3B-happy-new-year",{
    ...env,OURJAM_GPU_HOST_ORDER:"unknown,modal"}));
  assert.throws(()=>gpuHostTargets("heartmula","HeartMuLa-oss-3B-happy-new-year",{
    ...env,OURJAM_GPU_MODAL_TOKEN:"x"}));
});
test("legacy GPU host is used only if no Modal/Lightning credential configured",()=>{
  const legacy=gpuHostTargets("stable_audio_open","stable-audio-3-medium",{
    OURJAM_GPU_GATEWAY_URL:"https://old-gpu.example/",
    OURJAM_GPU_GATEWAY_TOKEN:"secret123456789abc",
  });
  assert.deepEqual(legacy.map(x=>x.id),["legacy"]);
  assert.equal(gpuHostTargets("heartmula","HeartMuLa-oss-3B-happy-new-year",{}).length,0);
});
