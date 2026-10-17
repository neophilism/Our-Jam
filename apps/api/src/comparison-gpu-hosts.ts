/** Closed set of GPU destinations; the browser never supplies an endpoint or secret. */
export const GPU_HOSTS = [
  { id: "modal", label: "Modal", billing: "recurring_monthly_compute_credit", tier: "L40S" },
  { id: "lightning", label: "Lightning AI", billing: "one_time_intro_credits", tier: "L40S" },
] as const;
export type GpuHost = "modal" | "lightning" | "legacy";
export type PublicGpuHost = (typeof GPU_HOSTS)[number]["id"];
export type GpuEndpointKind = "gateway" | "ace_step";
export const GPU_HOST_NAMES: readonly PublicGpuHost[] = ["modal","lightning"];

function secureHttpsRoot(raw: string|undefined): boolean {
  if(!raw) return false;
  try {
    const value = new URL(raw);
    return value.protocol === "https:" && !value.username && !value.password &&
      !value.search && !value.hash && value.pathname === "/" &&
      (value.port === "" || value.port === "443");
  } catch { return false; }
}
export function hostEndpoint(host: GpuHost, kind: GpuEndpointKind, env: NodeJS.ProcessEnv = process.env):
  { baseUrl:string; token:string } | null {
  const prefix=host === "modal"?"MODAL_":host === "lightning"?"LIGHTNING_":"";
  const urlKey = kind === "ace_step" ? prefix+"ACE_STEP_BASE_URL" :
    host === "legacy" ? "OURJAM_GPU_GATEWAY_URL" : prefix+"GPU_GATEWAY_URL";
  const tokenKey = kind === "ace_step" ? prefix+"ACE_STEP_TOKEN" :
    host === "legacy" ? "OURJAM_GPU_GATEWAY_TOKEN" : prefix+"GPU_GATEWAY_TOKEN";
  const baseUrl=env[urlKey],token=env[tokenKey];
  if(!secureHttpsRoot(baseUrl) || typeof token!=="string" || token.length<12) return null;
  return {baseUrl:baseUrl!,token};
}
export function hostRateSku(host: GpuHost, engine: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const name=host==="modal"?"MODAL":host==="lightning"?"LIGHTNING":"COMPARISON";
  const sku=env[`${name}_${engine.toUpperCase()}_GPU_SKU`]??env[`${name}_GPU_SKU`];
  return typeof sku==="string" && sku.trim() && sku.length<=100?sku.trim():null;
}
/** Readiness only checks configuration, not entitlement, live health or available credits. */
export function hostAvailability(env: NodeJS.ProcessEnv = process.env) {
  return GPU_HOSTS.map(host=>({
    ...host,
    gatewayConfigured:Boolean(hostEndpoint(host.id,"gateway",env)),
    aceConfigured:Boolean(hostEndpoint(host.id,"ace_step",env)),
    gpuSkuConfigured:Boolean(hostRateSku(host.id,"ace_step",env)),
    liveVerified:false,
  }));
}
