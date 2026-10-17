import test from "node:test";
import assert from "node:assert/strict";
import {stableAudio3ComparisonProvider} from "../packages/providers/src/stable-audio-3.js";
import {stabilityProvider} from "../packages/providers/src/stability.js";
import {ProviderError} from "../packages/providers/src/stability.js";
const id="a6dc6c6e20acda010fe14d71f180658f2896ed9b4ec25aa99a6ff06c796987c4";
const receipt=()=>new Response(JSON.stringify({id}),{status:202,headers:{"content-type":"application/json"}});
const audio=()=>new Response(new Uint8Array(1250),{status:200,headers:{"content-type":"audio/mpeg"}});
test("Stable Audio 3.0 comparison submits once, polls async receipt, saves private provider ID",async()=>{
  const paths:string[]=[];let checks=0;
  const p=stableAudio3ComparisonProvider("private-test-key",async(input,options)=>{
    const url=new URL(String(input));paths.push(url.pathname);
    assert.equal(url.host,"api.stability.ai");
    assert.equal((options?.headers as Record<string,string>).authorization,"Bearer private-test-key");
    if(options?.method==="POST"){
      const form=options.body as FormData;
      assert.equal(form.get("model"),"stable-audio-3");
      assert.equal(form.get("duration"),"45");
      assert.equal(form.get("output_format"),"mp3");
      return receipt();
    }
    checks++;return checks===1?new Response(null,{status:202}):audio();
  },async()=>{},3);
  let accepted="";
  const result=await p.generate("Groovy instrumental soul funk with a horn section",45,{
    onAccepted:async value=>{accepted=value;}
  });
  assert.equal(p.name,"stability");
  assert.equal(p.model,"stable-audio-3");
  assert.equal(accepted,id);
  assert.equal(result.providerRef,id);
  assert.equal(result.bytes.length,1250);
  assert.deepEqual(paths,[
    "/v2beta/audio/stable-audio/text-to-audio",
    "/v2beta/audio/results/"+id,
    "/v2beta/audio/results/"+id,
  ]);
});
test("Stable 3 resume only polls; older show provider remains 2.5",async()=>{
  const paths:string[]=[];
  const p=stableAudio3ComparisonProvider("test",async(input,options)=>{
    paths.push(new URL(String(input)).pathname);
    assert.equal(options?.method,"GET");
    return audio();
  });
  const result=await p.resume!(id,"unused",30);
  assert.equal(result.providerRef,id);
  assert.deepEqual(paths,["/v2beta/audio/results/"+id]);
  assert.equal(stabilityProvider("separate-show-key").model,"stable-audio-2.5");
});
test("failed or ambiguous Stability 3 submissions are not silently retried",async()=>{
  let attempts=0;
  const p=stableAudio3ComparisonProvider("test",async()=>{
    attempts++;throw new Error("network interrupted");
  });
  await assert.rejects(p.generate("Instrumental piano and bass",30),
    e=>e instanceof ProviderError&&e.uncertain===true);
  assert.equal(attempts,1);
  await assert.rejects(p.resume!("malicious/../receipt","",30),
    e=>e instanceof ProviderError&&e.uncertain===false);
});
test("Stable Audio 3 rejects invalid response and oversized audio",async()=>{
  const p=stableAudio3ComparisonProvider("test",async(input,options)=>{
    if(options?.method==="POST")return receipt();
    return new Response(new Uint8Array(1250),{
      status:200,headers:{"content-type":"audio/mpeg","content-length":"999999999"},
    });
  });
  await assert.rejects(p.generate("Instrumental cinematic strings and drums",60),
    e=>e instanceof ProviderError&&e.reason==="stable3_audio_too_large");
});
