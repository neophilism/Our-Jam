import test from "node:test";
import assert from "node:assert/strict";
import { gpuGatewayProvider } from "../packages/providers/src/gpu-gateway.js";
import { ProviderError } from "../packages/providers/src/stability.js";
const id="550e8400-e29b-41d4-a716-446655440000";
const engineModels=[["heartmula","HeartMuLa-oss-3B-happy-new-year"],["stable_audio_open","stable-audio-3-medium"],["musicgen","facebook/musicgen-large"]] as const;
test("all three GPU-hosted engine adapters use a private task receipt, a distinct provider ID and one instrumental output",async()=>{
  for(const [engine,model] of engineModels){
    const calls:string[]=[];
    const provider=gpuGatewayProvider({
      engine,model,purpose:"private_research",baseUrl:"https://gpu.ourjam.example/",token:"private-gpu-secret",checkpointApproved:true,
      request:async(input,options)=>{
        const path=new URL(String(input)).pathname;calls.push(path);
        assert.equal((options?.headers as Record<string,string>).authorization,"Bearer private-gpu-secret");
        if(path==="/v1/jobs"){
          const body=JSON.parse(String(options?.body));
          assert.equal(body.engine,engine);assert.equal(body.model,model);
          assert.equal(body.instrumental,true);assert.equal(body.outputs,1);
          return new Response(JSON.stringify({id}),{headers:{"content-type":"application/json"}});
        }
        if(path==="/v1/jobs/"+id)
          return new Response(JSON.stringify({id,engine,model,state:"succeeded",contentType:"audio/mpeg"}),{headers:{"content-type":"application/json"}});
        if(path==="/v1/jobs/"+id+"/audio")return new Response(new Uint8Array([1,2,3]),{headers:{"content-type":"audio/mpeg"}});
        throw new Error("Unexpected path");
      },
    });
    let saved="";
    const audio=await provider.generate("Hard bop instrumental horns and bass",45,{onAccepted:async value=>{saved=value;}});
    assert.equal(provider.name,engine);assert.equal(saved,id);assert.equal(audio.providerRef,id);
    assert.deepEqual(calls,["/v1/jobs","/v1/jobs/"+id,"/v1/jobs/"+id+"/audio"]);
  }
});
test("MusicGen cannot be configured commercially; missing rights approval blocks GPU submission",()=>{
  assert.throws(()=>gpuGatewayProvider({engine:"musicgen",purpose:"commercial_evaluation",model:"facebook/musicgen-large",baseUrl:"https://gpu.ourjam.example/",token:"private",checkpointApproved:true}),/noncommercial/);
  assert.throws(()=>gpuGatewayProvider({engine:"stable_audio_open",purpose:"commercial_evaluation",model:"stable-audio-3-medium",baseUrl:"https://gpu.ourjam.example/",token:"private",checkpointApproved:false}),/Checkpoint/);
  assert.throws(()=>gpuGatewayProvider({engine:"heartmula",purpose:"private_research",model:"HeartMuLa-oss-3B-happy-new-year",baseUrl:"http://gpu.ourjam.example/",token:"private",checkpointApproved:true}),/HTTPS/);
});
test("saved GPU task resume never submits a new generation",async()=>{
  const paths:string[]=[];const engine="heartmula",model="HeartMuLa-oss-3B-happy-new-year";
  const provider=gpuGatewayProvider({engine,model,purpose:"private_research",baseUrl:"https://gpu.ourjam.example/",token:"secret",checkpointApproved:true,
    request:async(input)=>{
      const p=new URL(String(input)).pathname;paths.push(p);
      if(p==="/v1/jobs/"+id)return new Response(JSON.stringify({id,engine,model,state:"succeeded",contentType:"audio/mpeg"}),{headers:{"content-type":"application/json"}});
      if(p==="/v1/jobs/"+id+"/audio")return new Response(new Uint8Array([10]),{headers:{"content-type":"audio/mpeg"}});
      throw new Error("Unexpected POST");
    }});
  const result=await provider.resume!(id,"prompt",45);
  assert.equal(result.providerRef,id);assert.equal(paths.includes("/v1/jobs"),false);
});
test("unknown acceptance and provider mismatches fail closed",async()=>{
  let calls=0;
  const provider=gpuGatewayProvider({engine:"musicgen",model:"facebook/musicgen-large",purpose:"private_research",baseUrl:"https://gpu.ourjam.example/",token:"secret",checkpointApproved:true,
    request:async()=>{calls++;throw new Error("Disconnected");}});
  await assert.rejects(provider.generate("Quiet cinematic instrumental",45),(err:any)=>err instanceof ProviderError && err.uncertain===true);
  assert.equal(calls,1);
});
