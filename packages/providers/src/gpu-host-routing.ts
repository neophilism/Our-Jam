import { ProviderError } from "./stability.js";
import type { ComparisonEngineId } from "./comparison-catalog.js";

export type GpuHostId = "modal" | "lightning" | "legacy";
export type GpuHostProtocol = "gateway" | "ace";
export type HostTarget = Readonly<{
  id: GpuHostId;
  root: string;
  token: string;
  protocol: GpuHostProtocol;
  engine: ComparisonEngineId;
  model: string;
}>;
export type ProbeResult = {
  host: GpuHostId;
  healthy: boolean;
  reason: "ready" | "not_configured" | "not_reachable" | "model_unavailable" | "invalid_response";
};
const hostIds = ["modal","lightning"] as const;

export function secureGpuRoot(value:string):string {
  const url=new URL(value);
  if(url.protocol!=="https:" || url.username || url.password || url.hash || url.search ||
     url.pathname!=="/" || (url.port&&url.port!=="443") ||
     /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname))
    throw new Error("GPU host must be a trusted HTTPS origin without credentials, paths, or query.");
  return url.toString();
}
/** Credentials/URLs are injected only by the server; never from user JSON or a remote redirect. */
export function gpuHostTargets(engine:ComparisonEngineId,model:string,env:NodeJS.ProcessEnv=process.env):HostTarget[] {
  if(!model || model.length>150 || !/^[A-Za-z0-9._/-]+$/.test(model))
    throw new Error("Unknown or invalid model checkpoint.");
  const order=env.OURJAM_GPU_HOST_ORDER==="lightning,modal"?["lightning","modal"] as const:hostIds;
  if(env.OURJAM_GPU_HOST_ORDER && !["modal,lightning","lightning,modal"].includes(env.OURJAM_GPU_HOST_ORDER))
    throw new Error("Invalid GPU host priority; only Modal and Lightning are supported.");
  const targets:HostTarget[]=[];
  for(const id of order){
    const prefix="OURJAM_GPU_"+id.toUpperCase();
    const ace=engine==="ace_step";
    const root=env[prefix+(ace?"_ACE_URL":"_URL")];
    const token=env[prefix+(ace?"_ACE_TOKEN":"_TOKEN")];
    if(!root && !token)continue;
    if(!root||!token||token.length<16)throw new Error("Incomplete or weak "+id+" GPU credentials.");
    targets.push({id,root:secureGpuRoot(root),token,protocol:ace?"ace":"gateway",engine,model});
  }
  // During migration, keep the existing manual private GPU gateway functional;
  // it is NOT silently treated as an independent third backup.
  if(!targets.length){
    const ace=engine==="ace_step";
    const root=env[ace?"ACE_STEP_BASE_URL":"OURJAM_GPU_GATEWAY_URL"];
    const token=env[ace?"ACE_STEP_TOKEN":"OURJAM_GPU_GATEWAY_TOKEN"];
    if(root&&token) targets.push({id:"legacy",root:secureGpuRoot(root),token,protocol:ace?"ace":"gateway",engine,model});
  }
  return targets;
}
const waitAbort=(ms:number)=>{
  const controller=new AbortController();
  const handle=setTimeout(()=>controller.abort(),ms);
  return {signal:controller.signal,clear:()=>clearTimeout(handle)};
};
/**
 * GET-only preflight. A backup is selected only if its capability probe succeeds
 * BEFORE ANY submission; a POST is NEVER retried against a second host.
 */
export async function probeGpuHost(target:HostTarget, request:typeof fetch=fetch):Promise<ProbeResult>{
  const timeout=waitAbort(12000);
  try{
    const path=target.protocol==="ace"?"/v1/models":"/v1/health";
    const response=await request(new URL(path,target.root),{
      headers:{authorization:"Bearer "+target.token,accept:"application/json"},
      method:"GET",redirect:"error",signal:timeout.signal,
    });
    if(!response.ok){await response.body?.cancel();return {host:target.id,healthy:false,reason:"not_reachable"};}
    if(!response.headers.get("content-type")?.toLowerCase().includes("application/json")){
      await response.body?.cancel();return {host:target.id,healthy:false,reason:"invalid_response"};
    }
    const limit=Number(response.headers.get("content-length")??0);
    if(limit>8192){await response.body?.cancel();return {host:target.id,healthy:false,reason:"invalid_response"};}
    const body=await response.text();
    if(body.length>8192)return {host:target.id,healthy:false,reason:"invalid_response"};
    let decoded:unknown;
    try{decoded=JSON.parse(body);}catch{return {host:target.id,healthy:false,reason:"invalid_response"};}
    let supported=false;
    if(target.protocol==="gateway"){
      const json=decoded as {ok?:unknown;models?:unknown};
      supported=json?.ok===true && Array.isArray(json.models) && json.models.some((item:unknown)=>{
        const x=item as {engine?:string;model?:string;available?:boolean};
        return x?.engine===target.engine && x?.model===target.model && x?.available===true;
      });
    }else{
      const json=decoded as {code?:number;data?:{models?:unknown}};
      supported=json?.code===200 && Array.isArray(json.data?.models) &&
        json.data.models.some((x:unknown)=>(x as {name?:string})?.name===target.model);
    }
    return {host:target.id,healthy:supported,reason:supported?"ready":"model_unavailable"};
  }catch{return {host:target.id,healthy:false,reason:"not_reachable"};}
  finally{timeout.clear();}
}
export async function chooseGpuHost(targets:readonly HostTarget[],request:typeof fetch=fetch):Promise<HostTarget> {
  for(const target of targets){
    if((await probeGpuHost(target,request)).healthy)return target;
  }
  throw new ProviderError("no_compatible_gpu_host_before_submission",false);
}
