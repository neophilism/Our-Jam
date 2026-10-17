import type {ComparisonEngineId} from "../../../packages/providers/src/comparison-catalog.js";
import {gpuHostTargets,type GpuHostId} from "../../../packages/providers/src/gpu-host-routing.js";
import type {currentComparisonRates} from "./comparison-rates.js";
type Rate=Awaited<ReturnType<typeof currentComparisonRates>>[number];
export type HostQuote={
  host:GpuHostId;sku:string;rateMicroUsd:number;
  quoteMicroUsd:number;id:string;supplier:string;sourceDescription:string;
};
/**
 * All configured backup hosts are priced before an operator approves a batch.
 * Reserve against the MOST EXPENSIVE possible host; never use the cheap Modal
 * price to authorize an expensive Lightning failover.
 */
export function quoteGpuHosts(
  provider:ComparisonEngineId,model:string,rates:readonly Rate[],
  billableLimitSeconds:number|null,env:NodeJS.ProcessEnv,
):{quotes:HostQuote[];maximumMicroUsd:number|null;reason:string|null}{
  if(billableLimitSeconds===null)return {quotes:[],maximumMicroUsd:null,reason:"An enforced GPU billing limit must be configured."};
  let targets:ReturnType<typeof gpuHostTargets>;
  try{targets=gpuHostTargets(provider,model,env);}
  catch{return {quotes:[],maximumMicroUsd:null,reason:"The GPU host endpoint or token is invalid."};}
  if(targets.length===0)return {quotes:[],maximumMicroUsd:null,reason:"No approved GPU host is configured."};
  const quotes:HostQuote[]=[];
  for(const target of targets) {
    const hostName=target.id.toUpperCase();
    const sku=target.id==="legacy"
      ? env[provider.toUpperCase()+"_GPU_SKU"]||env.COMPARISON_GPU_SKU||""
      : env[provider.toUpperCase()+"_GPU_"+hostName+"_SKU"]||env["OURJAM_GPU_"+hostName+"_SKU"]||"";
    // For two cloud hosts, an explicit SKU is required to avoid silently billing
    // a backup against the primary's rate card.
    if(target.id!=="legacy"&&!sku)
      return {quotes,maximumMicroUsd:null,reason:target.id+" GPU host is missing its rate-card SKU."};
    const matches=rates.filter(r=>r.provider===provider && r.unit==="gpu_hour" && (!sku||r.sku===sku));
    if(matches.length!==1)
      return {quotes,maximumMicroUsd:null,reason:"Missing or ambiguous "+target.id+" GPU hourly rate for "+provider+"."};
    const rate=matches[0];
    const quoteMicroUsd=Math.ceil(rate.rateMicroUsd*billableLimitSeconds/3600);
    if(!Number.isSafeInteger(quoteMicroUsd)||quoteMicroUsd<=0)
      return {quotes,maximumMicroUsd:null,reason:"GPU cost estimate is outside safe limits."};
    quotes.push({host:target.id,sku:rate.sku,rateMicroUsd:rate.rateMicroUsd,
      quoteMicroUsd,id:rate.id,supplier:rate.supplier,sourceDescription:rate.sourceDescription});
  }
  return {quotes,maximumMicroUsd:Math.max(...quotes.map(q=>q.quoteMicroUsd)),reason:null};
}
