import { ProviderError, MAX_AUDIO_BYTES, type MusicProvider } from "./stability.js";

/** 
 * ACE-Step 1.5 documented API: POST /release_task, POST /query_result, GET /v1/audio.
 * Run on a separately secured GPU host. Do not expose its token or accept URLs from browsers.
 * https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
 */
export function aceStepProvider(config: {
  baseUrl: string;
  token: string;
  model?: "acestep-v15-xl-sft" | "acestep-v15-xl-turbo" | "acestep-v15-turbo" | "acestep-v15-base";
  request?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  maxPolls?: number;
}): MusicProvider {
  const root = new URL(config.baseUrl);
  if (root.protocol !== "https:" || root.username || root.password || root.search || root.hash ||
      root.pathname !== "/" || !config.token || root.port && root.port !== "443")
    throw new Error("ACE-Step gateway must use a trusted HTTPS root and nonempty private token.");
  const request = config.request ?? fetch;
  const wait = config.wait ?? ((ms:number) => new Promise<void>(resolve=>setTimeout(resolve,ms)));
  const maxPolls = config.maxPolls ?? 90;
  if (!Number.isSafeInteger(maxPolls) || maxPolls < 1 || maxPolls > 1000)
    throw new Error("Invalid ACE-Step polling limit.");
  const model = config.model ?? "acestep-v15-xl-sft";
  const headers = { authorization: "Bearer " + config.token };

  async function bytes(response: Response, limit: number, uncertain: boolean): Promise<Uint8Array> {
    if (Number(response.headers.get("content-length") ?? 0)>limit)
      throw new ProviderError("provider_response_too_large",uncertain);
    const stream = response.body?.getReader();
    if (!stream) throw new ProviderError("provider_empty_response",uncertain);
    const parts: Uint8Array[]=[];let total=0;
    try {
      for(;;) {
        const next=await stream.read();
        if (next.done) break;
        total+=next.value.byteLength;
        if(total>limit) { await stream.cancel();throw new ProviderError("provider_response_too_large",uncertain); }
        parts.push(next.value);
      }
    }catch(e){
      await stream.cancel().catch(()=>undefined);
      if(e instanceof ProviderError)throw e;
      throw new ProviderError("provider_transfer_interrupted",true);
    }
    const output=new Uint8Array(total);let offset=0;
    for(const part of parts){output.set(part,offset);offset+=part.length;}
    return output;
  }

  async function post(path:string, body:object, submits:boolean):Promise<any> {
    let response:Response;
    try{
      response=await request(new URL(path,root),{
        method:"POST",redirect:"error",headers:{...headers,"content-type":"application/json","accept":"application/json"},
        body:JSON.stringify(body),signal:AbortSignal.timeout(submits?60000:20000),
      });
    }catch{throw new ProviderError(submits?"provider_acceptance_unknown":"provider_poll_interrupted",true);}
    if(!response.ok){await response.body?.cancel();
      throw new ProviderError("ace_http_"+response.status,submits||response.status>=500||response.status===408);
    }
    if(!response.headers.get("content-type")?.toLowerCase().includes("application/json")){
      await response.body?.cancel();throw new ProviderError("ace_invalid_response",submits);
    }
    let result:any;
    try{result=JSON.parse(new TextDecoder().decode(await bytes(response,1024*1024,submits)));}
    catch(e){if(e instanceof ProviderError)throw e;throw new ProviderError("ace_invalid_response",submits);}
    if(result?.code !== 200 || !result?.data)
      throw new ProviderError("ace_invalid_response",submits);
    return result.data;
  }

  function validTaskId(id:unknown): id is string { return typeof id==="string" && /^[A-Za-z0-9_-]{8,128}$/.test(id); }

  async function collect(taskId:string):Promise<{bytes:Uint8Array;providerRef:string}> {
    for(let i=0;i<maxPolls;i++){
      if(i>0)await wait(3000);
      const results=await post("/query_result",{task_id_list:[taskId]},false);
      if(!Array.isArray(results))throw new ProviderError("ace_invalid_task_result",true);
      const item=results.find((x:any)=>x?.task_id===taskId);
      if(!item)throw new ProviderError("ace_task_missing",true);
      if(item.status===2)throw new ProviderError("ace_task_failed",false);
      if(item.status===0)continue;
      if(item.status!==1)throw new ProviderError("ace_unknown_task_state",true);
      let recordings:any[];
      try{recordings=typeof item.result==="string"?JSON.parse(item.result):item.result;}
      catch{throw new ProviderError("ace_invalid_task_result",true);}
      const reference=recordings?.[0]?.file;
      if(typeof reference!=="string")throw new ProviderError("ace_missing_audio",true);
      let url:URL;
      try{url=new URL(reference,root);}catch{throw new ProviderError("ace_invalid_audio_url",true);}
      if(url.origin!==root.origin || url.pathname!=="/v1/audio" || !url.searchParams.has("path") ||
         url.username || url.password || url.hash)
        throw new ProviderError("ace_unapproved_audio_url",true);
      let response:Response;
      try{response=await request(url,{headers,redirect:"error",signal:AbortSignal.timeout(60000)});}
      catch{throw new ProviderError("ace_audio_download_interrupted",true);}
      if(!response.ok){await response.body?.cancel();throw new ProviderError("ace_audio_download_failed",true);}
      const type=response.headers.get("content-type")?.toLowerCase() ?? "";
      if(!type.startsWith("audio/") && !type.startsWith("application/octet-stream")){
        await response.body?.cancel();throw new ProviderError("ace_invalid_audio_content_type",true);
      }
      return {bytes:await bytes(response,MAX_AUDIO_BYTES,true),providerRef:taskId};
    }
    throw new ProviderError("ace_poll_timeout",true);
  }

  return {
    name:"ace_step",model,
    async generate(prompt,durationSeconds,context){
      if(!prompt.trim() || prompt.length>3500 || !Number.isInteger(durationSeconds) || durationSeconds<10 || durationSeconds>180)
        throw new ProviderError("invalid_generation_parameters",false);
      const result=await post("/release_task",{
        prompt,lyrics:"[Instrumental]",thinking:true,lm_model_path:"acestep-5Hz-lm-4B",inference_steps:64,model,audio_duration:durationSeconds,
        audio_format:"mp3",batch_size:1,
      },true);
      const taskId=result?.task_id;
      if(!validTaskId(taskId))throw new ProviderError("ace_invalid_task_id",true);
      await context?.onAccepted?.(taskId);
      return collect(taskId);
    },
    async resume(providerRef){
      if(!validTaskId(providerRef))throw new ProviderError("ace_invalid_task_id",true);
      return collect(providerRef);
    },
  };
}
