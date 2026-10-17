import { z } from "zod";
import type { Database, Sql } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { replay, remember } from "./service.js";
import { COMPARISON_ENGINES, COMPARISON_ENGINE_IDS, uniqueComparisonSelection } from "../../../packages/providers/src/comparison-catalog.js";
import { hostAvailability, hostEndpoint, type PublicGpuHost } from "./comparison-gpu-hosts.js";

export const comparisonSelectionInput = z.object({
  commandId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  gpuHost: z.enum(["modal","lightning"]).optional(),
  selectedProviders: z.array(z.string()).min(1).max(6).refine(
    values => new Set(values).size === values.length && values.every(value => COMPARISON_ENGINE_IDS.includes(value as typeof COMPARISON_ENGINE_IDS[number])),
    { message: "Choose unique providers from the six supported engines." },
  ),
}).strict();

export async function readComparisonSelection(sql: Sql, lock = false) {
  const row = (await sql.query("SELECT selected_providers,gpu_host,revision,updated_at FROM comparison_admin_settings WHERE id=1" + (lock ? " FOR UPDATE" : ""))).rows[0];
  requireThat(row, "comparison_settings_missing", "Comparison settings have not been migrated.", 503);
  return { selectedProviders: uniqueComparisonSelection(row.selected_providers), gpuHost: row.gpu_host as PublicGpuHost, revision: row.revision as number, updatedAt: row.updated_at };
}

export async function updateComparisonSelection(db: Database, input: z.infer<typeof comparisonSelectionInput>) {
  const selected = uniqueComparisonSelection(input.selectedProviders);
  return db.transaction(async (tx) => {
    const before = await readComparisonSelection(tx, true);
    const cached = await replay(tx, "platform-comparison-admin", input.commandId, { type:"comparison.selection", ...input });
    if (cached.response) return cached.response;
    requireThat(before.revision === input.expectedRevision, "revision_conflict", "The provider selection changed. Refresh before saving.", 409);
    await tx.query("UPDATE comparison_admin_settings SET selected_providers=$1::text[],gpu_host=$2,revision=revision+1,updated_at=now() WHERE id=1", [selected,input.gpuHost??before.gpuHost]);
    const after = await readComparisonSelection(tx);
    await tx.query("INSERT INTO platform_policy_audit(action,previous_policy,updated_policy) VALUES('comparison.selection',$1,$2)", [JSON.stringify(before),JSON.stringify(after)]);
    await remember(tx, "platform-comparison-admin", input.commandId, cached.hash, after);
    return after;
  });
}

export function comparisonReadiness(env: NodeJS.ProcessEnv = process.env, host: PublicGpuHost|"legacy" = "legacy") {
  // The previous generic gateway remains supported for historical prepared batches.
  const credentials: Record<string,boolean> = {
    mureka:Boolean(env.MUREKA_API_KEY),
    stability:Boolean(env.STABLE_AUDIO_KEY || env.STABILITY_API_KEY),
    ace_step:Boolean(hostEndpoint(host,"ace_step",env)),
    heartmula:Boolean(hostEndpoint(host,"gateway",env)),
    stable_audio_open:Boolean(hostEndpoint(host,"gateway",env)),
    musicgen:Boolean(hostEndpoint(host,"gateway",env)),
  };
  return COMPARISON_ENGINES.map(engine=>({
    ...engine,
    configured:Boolean(credentials[engine.id]),
    validated:false,
    costRateKnown:false,
    requiresExtraLicense:engine.id==="stable_audio_open"||engine.id==="musicgen",
  }));
}
export function comparisonGpuHostsReadiness(env:NodeJS.ProcessEnv=process.env) {
  return hostAvailability(env);
}
