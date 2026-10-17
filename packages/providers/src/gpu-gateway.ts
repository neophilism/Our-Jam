import { ProviderError, MAX_AUDIO_BYTES, type MusicProvider } from "./stability.js";
export type GatewayEngine = "heartmula" | "stable_audio_open" | "musicgen";
export type GatewayPurpose = "private_research" | "commercial_evaluation";

/**
 * OurJam-owned authenticated GPU inference gateway protocol (NOT an upstream API).
 * A real private GPU host must implement /v1/jobs, /v1/jobs/{id}, and /v1/jobs/{id}/audio.
 * This adapter never provisions infrastructure or claims an upstream protocol exists.
 */
export function gpuGatewayProvider(config: {
  engine: GatewayEngine;
  baseUrl: string;
  token: string;
  model: string;
  purpose: GatewayPurpose;
  checkpointApproved: boolean;
  request?: typeof fetch;
  wait?: (ms:number)=>Promise<void>;
  maxPolls?: number;
}): MusicProvider {
  const root = new URL(config.baseUrl);
  if(root.protocol!=="https:" || root.username || root.password || root.port && root.port!=="443" ||
     root.search || root.hash || root.pathname!=="/" || !config.token || !config.model)
    throw new Error("GPU gateway must be an authenticated trusted HTTPS root with a pinned model.");
  if(config.engine==="musicgen" && config.purpose!=="private_research")
    throw new Error("MusicGen weights are noncommercial and may only be evaluated privately.");
  if(!config.checkpointApproved)
    throw new Error("Checkpoint/license must be reviewed before self-hosted inference.");
  const request=config.request??fetch;
  const wait=config.wait??((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  const polls=config.maxPolls??120;
  if(!Number.isSafeInteger(polls) || polls<1 || polls>1000)throw new Error("Invalid polling limit.");
  const bearer={ authorization:"Bearer "+config.token };

  async function bounded(response:Response,limit:number,uncertain:boolean):Promise<Uint8Array>{
    if(Number(response.headers.get("content-length")??0)>limit)throw new ProviderError("gpu_response_too_large",uncertain);
    const reader=response.body?.getReader();
    if(!reader)throw new ProviderError("gpu_empty_response",uncertain);
    const chunks:Uint8Array[]=[];let size=0;
    try{
      for(;;){const {value,done}=await reader.read();if(done)break;
        size+=value.byteLength;if(size>limit){await reader.cancel();throw new ProviderError("gpu_response_too_large",uncertain);}chunks.push(value);
      }
    }catch(e){await reader.cancel().catch(()=>{});if(e instanceof ProviderError)throw e;throw new ProviderError("gpu_transfer_interrupted",true);}
    const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
  }

  async function json(path:string,submit:boolean,payload?:object):Promise<any>{
    let response:Response;
    try{response=await request(new URL(path,root),{
      method:submit?"POST":"GET",redirect:"error",
      headers:{...bearer,accept:"application/json",...(submit?{"content-type":"application/json"}:{})},
      body:submit?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(submit?60000:20000),
    });}catch{throw new ProviderError(submit?"gpu_submission_unknown":"gpu_status_interrupted",true);}
    if(!response.ok){await response.body?.cancel();throw new ProviderError("gpu_http_"+response.status,submit||response.status>=500||response.status===408);}
    if(!response.headers.get("content-type")?.toLowerCase().includes("application/json")){await response.body?.cancel();throw new ProviderError("gpu_bad_json",submit);}
    try{return JSON.parse(new TextDecoder().decode(await bounded(response,32768,submit)));}
    catch(e){if(e instanceof ProviderError)throw e;throw new ProviderError("gpu_bad_json",submit);}
  }

  function validReceipt(value:unknown):value is string{return typeof value==="string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);}
  async function collect(jobId:string):Promise<{bytes:Uint8Array;providerRef:string}>{
    for(let i=0;i<polls;i++){
      if(i>0)await wait(3000);
      const state=await json("/v1/jobs/"+encodeURIComponent(jobId),false);
      if(state?.id!==jobId || state?.engine!==config.engine || state?.model!==config.model)
        throw new ProviderError("gpu_task_mismatch",true);
      if(state.state==="failed" || state.state==="cancelled")throw new ProviderError("gpu_task_"+state.state,false);
      if(state.state==="queued" || state.state==="running")continue;
      if(state.state!=="succeeded")throw new ProviderError("gpu_unknown_state",true);
      if(state.contentType!=="audio/mpeg")throw new ProviderError("gpu_invalid_audio_content_type",true);
      let response:Response;
      try{response=await request(new URL("/v1/jobs/"+encodeURIComponent(jobId)+"/audio",root),
        {headers:bearer,redirect:"error",signal:AbortSignal.timeout(60000)});}
      catch{throw new ProviderError("gpu_audio_download_interrupted",true);}
      if(!response.ok){await response.body?.cancel();throw new ProviderError("gpu_audio_download_failed",true);}
      if(response.headers.get("content-type")?.toLowerCase().split(";")[0]!=="audio/mpeg")
        throw new ProviderError("gpu_audio_format_mismatch",true);
      return {bytes:await bounded(response,MAX_AUDIO_BYTES,true),providerRef:jobId};
    }
    throw new ProviderError("gpu_poll_timeout",true);
  }
  return {
    name:config.engine,model:config.model,
    async generate(prompt,durationSeconds,context){
      if(!prompt.trim()||prompt.length>3500||!Number.isSafeInteger(durationSeconds)||durationSeconds<10||durationSeconds>180)
        throw new ProviderError("invalid_generation_parameters",false);
      const created=await json("/v1/jobs",true,{
        engine:config.engine,model:config.model,purpose:config.purpose,description:prompt,
        durationSeconds,instrumental:true,outputs:1,
      });
      if(!validReceipt(created?.id))throw new ProviderError("gpu_invalid_task_id",true);
      await context?.onAccepted?.(created.id);
      return collect(created.id);
    },
    async resume(providerRef){
      if(!validReceipt(providerRef))throw new ProviderError("gpu_invalid_task_id",true);
      return collect(providerRef);
    },
  };
}
