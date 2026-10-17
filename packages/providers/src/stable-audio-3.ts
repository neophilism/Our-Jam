import {MAX_AUDIO_BYTES,ProviderError,type MusicProvider} from "./stability.js";

/** Highest-quality Stable Audio REST endpoint. Does not change the older live-show adapter. */
export function stableAudio3ComparisonProvider(
  key:string,
  request:typeof fetch=fetch,
  wait:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
  maxPolls=90,
):MusicProvider {
  if(!key.trim()||!Number.isSafeInteger(maxPolls)||maxPolls<1||maxPolls>180)
    throw new Error("Stable Audio 3 comparison requires a private key and bounded polling.");
  const endpoint="https://api.stability.ai";
  const resultPath="/v2beta/audio/results/";
  const bearer={authorization:"Bearer "+key,accept:"audio/*","stability-client-id":"our-jam-model-comparison"};
  async function takeBytes(response:Response,max:number):Promise<Uint8Array>{
    const length=Number(response.headers.get("content-length")??0);
    if(length>max)throw new ProviderError("stable3_audio_too_large",true);
    const reader=response.body?.getReader();
    if(!reader)throw new ProviderError("stable3_empty_response",true);
    const chunks:Uint8Array[]=[];
    let size=0;
    try{
      for(;;){
        const {value,done}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>max){await reader.cancel();throw new ProviderError("stable3_audio_too_large",true);}
        chunks.push(value);
      }
    }catch(e){
      await reader.cancel().catch(()=>{});
      if(e instanceof ProviderError)throw e;
      throw new ProviderError("stable3_transfer_interrupted",true);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return bytes;
  }
  function idValid(id:unknown):id is string {
    return typeof id==="string"&&/^[a-f0-9]{64}$/i.test(id);
  }
  async function collect(id:string):Promise<{bytes:Uint8Array;providerRef:string}>{
    for(let n=0;n<maxPolls;n++){
      if(n>0)await wait(10000);
      let response:Response;
      try{
        response=await request(endpoint+resultPath+id,{
          method:"GET",headers:bearer,redirect:"error",signal:AbortSignal.timeout(40000),
        });
      }catch{throw new ProviderError("stable3_result_unknown",true);}
      if(response.status===202){await response.body?.cancel();continue;}
      if(response.status!==200){
        await response.body?.cancel();
        throw new ProviderError("stable3_result_http_"+response.status,response.status>=500||response.status===408);
      }
      const type=response.headers.get("content-type")?.toLowerCase().split(";")[0];
      if(type!=="audio/mpeg"&&type!=="audio/mp3"){
        await response.body?.cancel();
        throw new ProviderError("stable3_invalid_audio_type",true);
      }
      const audio=await takeBytes(response,MAX_AUDIO_BYTES);
      if(audio.length<1000)throw new ProviderError("stable3_audio_too_short",true);
      return {bytes:audio,providerRef:id};
    }
    throw new ProviderError("stable3_poll_timeout",true);
  }
  return {
    name:"stability",model:"stable-audio-3",
    async generate(prompt,durationSeconds,context){
      if(!prompt.trim()||prompt.length>3500||!Number.isSafeInteger(durationSeconds)||
        durationSeconds<10||durationSeconds>180)
        throw new ProviderError("invalid_generation_parameters",false);
      const form=new FormData();
      form.set("prompt",prompt);
      form.set("duration",String(durationSeconds));
      form.set("model","stable-audio-3");
      form.set("output_format","mp3");
      let response:Response;
      try{
        response=await request(endpoint+"/v2beta/audio/stable-audio/text-to-audio",{
          method:"POST",headers:bearer,body:form,redirect:"error",signal:AbortSignal.timeout(60000),
        });
      }catch{throw new ProviderError("stable3_acceptance_unknown",true);}
      if(response.status!==202){
        await response.body?.cancel();
        throw new ProviderError("stable3_submission_http_"+response.status,response.status>=500||response.status===408);
      }
      if(!response.headers.get("content-type")?.toLowerCase().includes("application/json")){
        await response.body?.cancel();throw new ProviderError("stable3_invalid_receipt",true);
      }
      let id:unknown;
      try{const receipt=JSON.parse(new TextDecoder().decode(await takeBytes(response,16384)));id=receipt?.id;}
      catch{throw new ProviderError("stable3_invalid_receipt",true);}
      if(!idValid(id))throw new ProviderError("stable3_invalid_receipt",true);
      await context?.onAccepted?.(id);
      return collect(id);
    },
    async resume(providerRef){
      if(!idValid(providerRef))throw new ProviderError("stable3_invalid_receipt",false);
      return collect(providerRef);
    },
  };
}
