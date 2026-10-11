import { z } from "zod";
import { stabilityProvider } from "../../../packages/providers/src/stability.js";
import {
  s3Store,
  type MediaStore,
} from "../../../packages/providers/src/storage.js";
import type { GenerationConfig } from "./generation.js";
export function configuredStorage(
  env: NodeJS.ProcessEnv = process.env,
): MediaStore | undefined {
  if (!env.MEDIA_BUCKET) return undefined;
  const c = z
    .object({
      MEDIA_BUCKET: z.string().min(1),
      MEDIA_REGION: z.string().min(1),
      MEDIA_ACCESS_KEY_ID: z.string().min(1),
      MEDIA_SECRET_ACCESS_KEY: z.string().min(1),
      MEDIA_ENDPOINT: z.url().startsWith("https://").optional(),
    })
    .parse({ ...env, MEDIA_ENDPOINT: env.MEDIA_ENDPOINT || undefined });
  return s3Store({
    bucket: c.MEDIA_BUCKET,
    region: c.MEDIA_REGION,
    accessKeyId: c.MEDIA_ACCESS_KEY_ID,
    secretAccessKey: c.MEDIA_SECRET_ACCESS_KEY,
    endpoint: c.MEDIA_ENDPOINT,
  });
}
export function configuredGeneration(
  store: MediaStore | undefined,
  env: NodeJS.ProcessEnv = process.env,
): GenerationConfig | undefined {
  if (env.GENERATION_ENABLED !== "1") return undefined;
  const c = z
    .object({
      STABILITY_API_KEY: z.string().min(20),
      GENERATION_RIGHTS_ACK: z.literal("our-jam-public-downloads-approved"),
      GENERATION_MAX_JOB_CENTS: z.coerce.number().int().positive().max(10000),
      GENERATION_EVENT_BUDGET_CENTS: z.coerce.number().int().positive(),
      GENERATION_TOTAL_BUDGET_CENTS: z.coerce.number().int().positive(),
      GENERATION_DURATION_SECONDS: z.coerce.number().int().min(10).max(180),
      GENERATION_PRICE_VERIFIED_UNTIL: z.iso.datetime(),
    })
    .parse(env);
  if (!store)
    throw new Error("Generation needs project-specific durable media storage.");
  if (new Date(c.GENERATION_PRICE_VERIFIED_UNTIL).getTime() <= Date.now())
    throw new Error(
      "The approved provider price must be reviewed before enabling generation.",
    );
  return {
    provider: stabilityProvider(c.STABILITY_API_KEY),
    store,
    maxJobCents: c.GENERATION_MAX_JOB_CENTS,
    eventBudgetCents: c.GENERATION_EVENT_BUDGET_CENTS,
    totalBudgetCents: c.GENERATION_TOTAL_BUDGET_CENTS,
    durationSeconds: c.GENERATION_DURATION_SECONDS,
    priceVerifiedUntil: c.GENERATION_PRICE_VERIFIED_UNTIL,
  };
}
