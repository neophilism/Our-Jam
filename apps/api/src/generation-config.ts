import { z } from "zod";
import { stabilityProvider } from "../../../packages/providers/src/stability.js";
import { murekaProvider } from "../../../packages/providers/src/mureka.js";
import { s3Store, type MediaStore } from "../../../packages/providers/src/storage.js";
import type { GenerationConfig } from "./generation.js";
export function configuredStorage(env: NodeJS.ProcessEnv = process.env): MediaStore | undefined {
  if (!env.MEDIA_BUCKET) return undefined;
  const c = z.object({
    MEDIA_BUCKET: z.string().min(1), MEDIA_REGION: z.string().min(1),
    MEDIA_ACCESS_KEY_ID: z.string().min(1), MEDIA_SECRET_ACCESS_KEY: z.string().min(1),
    MEDIA_ENDPOINT: z.url().startsWith("https://").optional(),
  }).parse({ ...env, MEDIA_ENDPOINT: env.MEDIA_ENDPOINT || undefined });
  return s3Store({ bucket: c.MEDIA_BUCKET, region: c.MEDIA_REGION, accessKeyId: c.MEDIA_ACCESS_KEY_ID, secretAccessKey: c.MEDIA_SECRET_ACCESS_KEY, endpoint: c.MEDIA_ENDPOINT });
}
export function configuredGeneration(store: MediaStore | undefined, env: NodeJS.ProcessEnv = process.env): GenerationConfig | undefined {
  if (env.GENERATION_ENABLED !== "1") return undefined;
  const c = z.object({
    GENERATION_EVENT_BUDGET_CENTS: z.coerce.number().int().nonnegative(),
    GENERATION_TOTAL_BUDGET_CENTS: z.coerce.number().int().nonnegative(),
    GENERATION_DURATION_SECONDS: z.coerce.number().int().min(10).max(180).default(90),
  }).parse(env);
  const zero = c.GENERATION_EVENT_BUDGET_CENTS === 0 || c.GENERATION_TOTAL_BUDGET_CENTS === 0;
  if (!zero && env.GENERATION_RIGHTS_ACK !== "our-jam-public-downloads-approved")
    throw new Error("Approve the intended generation and download rights before enabling spending.");
  if (!zero && !store) throw new Error("Generation needs project-specific durable media storage.");
  // Accept the owner's existing secret name. Never place either key in a public client.
  const stableKey = env.STABLE_AUDIO_KEY || env.STABILITY_API_KEY;
  const stable = stabilityProvider(stableKey ?? "");
  const mureka = env.MUREKA_API_KEY ? murekaProvider(env.MUREKA_API_KEY, {
    model: env.MUREKA_MODEL || "mureka-9.5",
    mediaHosts: env.MUREKA_MEDIA_HOSTS?.split(",").map((s) => s.trim()).filter(Boolean),
  }) : undefined;
  return {
    provider: stable, store,
    providers: { stability: stableKey ? stable : undefined, mureka },
    providerPrices: {
      stability: { maxJobCents: Number(env.STABLE_AUDIO_MAX_JOB_CENTS || env.GENERATION_MAX_JOB_CENTS || 0), verifiedUntil: env.STABLE_AUDIO_PRICE_VERIFIED_UNTIL || env.GENERATION_PRICE_VERIFIED_UNTIL },
      mureka: { maxJobCents: Number(env.MUREKA_MAX_JOB_CENTS || 0), verifiedUntil: env.MUREKA_PRICE_VERIFIED_UNTIL },
    },
    maxJobCents: Number(env.GENERATION_MAX_JOB_CENTS || 0),
    eventBudgetCents: c.GENERATION_EVENT_BUDGET_CENTS,
    totalBudgetCents: c.GENERATION_TOTAL_BUDGET_CENTS,
    durationSeconds: c.GENERATION_DURATION_SECONDS,
  };
}
