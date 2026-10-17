import test from "node:test";
import assert from "node:assert/strict";
import { aceStepProvider } from "../packages/providers/src/ace-step.js";
import { ProviderError } from "../packages/providers/src/stability.js";

const id="550e8400-e29b-41d4-a716-446655440000";
const json=(data:unknown)=>new Response(JSON.stringify({code:200,data}),{headers:{"content-type":"application/json"}});
test("ACE-Step official async task persists receipt, polls and fetches private-host audio",async()=>{
  const paths:string[]=[];let saved="";
  const provider=aceStepProvider({baseUrl:"https://gpu.ourjam.example/",token:"private-token",maxPolls:2,wait:async()=>{},
    request:async(input,options)=>{
      const uri=new URL(String(input));paths.push(uri.pathname);
      assert.equal(uri.hostname,"gpu.ourjam.example");
      assert.equal((options?.headers as Record<string,string>)?.authorization,"Bearer private-token");
      if(uri.pathname==="/release_task"){
        const form=JSON.parse(String(options?.body));
        assert.equal(form.audio_duration,45);
        assert.equal(form.batch_size,1);
        assert.equal(form.audio_format,"mp3");
        assert.equal(form.lyrics,"[Instrumental]");
        return json({task_id:id,status:"queued"});
      }
      if(uri.pathname==="/query_result"){
        assert.deepEqual(JSON.parse(String(options?.body)).task_id_list,[id]);
        return json([{task_id:id,status:1,result:JSON.stringify([{file:"/v1/audio?path=%2Foutput%2Ftrack.mp3"}])}]);
      }
      assert.equal(uri.pathname,"/v1/audio");
      return new Response(new Uint8Array([1,2,3]),{headers:{"content-type":"audio/mpeg"}});
    }});
  const audio=await provider.generate("Funky drums and warm horns",45,{onAccepted:async taskId=>{saved=taskId;}});
  assert.equal(saved,id);
  assert.equal(audio.providerRef,id);
  assert.deepEqual(Array.from(audio.bytes),[1,2,3]);
  assert.deepEqual(paths,["/release_task","/query_result","/v1/audio"]);
});
test("ACE-Step saved task reconciliation never issues another generation POST",async()=>{
  const calls:string[]=[];
  const provider=aceStepProvider({baseUrl:"https://gpu.ourjam.example/",token:"private-token",request:async(input)=>{
    const pathname=new URL(String(input)).pathname;calls.push(pathname);
    if(pathname==="/query_result")return json([{task_id:id,status:1,result:JSON.stringify([{file:"/v1/audio?path=ok"}])}]);
    if(pathname==="/v1/audio")return new Response(new Uint8Array([10,20]),{headers:{"content-type":"audio/mpeg"}});
    throw new Error("Unexpected paid POST");
  }});
  const audio=await provider.resume!(id,"prompt",30);
  assert.equal(audio.providerRef,id);
  assert.deepEqual(calls,["/query_result","/v1/audio"]);
});
test("ACE-Step malicious cross-host audio URLs and insecure GPU endpoints fail closed",async()=>{
  assert.throws(()=>aceStepProvider({baseUrl:"http://gpu.ourjam.example/",token:"secret"}));
  assert.throws(()=>aceStepProvider({baseUrl:"https://gpu.ourjam.example/",token:""}));
  let calls=0;
  const provider=aceStepProvider({baseUrl:"https://gpu.ourjam.example/",token:"secret",request:async(input)=>{
    calls++;
    const path=new URL(String(input)).pathname;
    if(path==="/release_task")return json({task_id:id});
    return json([{task_id:id,status:1,result:JSON.stringify([{file:"https://evil.invalid/recording.mp3"}])}]);
  }});
  await assert.rejects(provider.generate("A jazzy instrumental",30),(error:any)=>error instanceof ProviderError && error.reason==="ace_unapproved_audio_url");
  assert.equal(calls,2,"never fetch a remote host supplied by model output");
});
test("ambiguous submission is not retried by the ACE-Step adapter",async()=>{
  let calls=0;
  const provider=aceStepProvider({baseUrl:"https://gpu.ourjam.example/",token:"secret",request:async()=>{calls++;throw new Error("timeout");}});
  await assert.rejects(provider.generate("An instrumental with no vocals",30),(error:any)=>error instanceof ProviderError && error.uncertain===true);
  assert.equal(calls,1);
});
