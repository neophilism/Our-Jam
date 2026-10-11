import { z } from "zod";
export const id = z.uuid();
export const command = z.object({ commandId: id });
export const profileInput = z.object({
  name: z.string().trim().min(1).max(32),
  anonymous: z.boolean().default(false),
});
export const waveInput = command.extend({
  text: z.string().max(192),
  expectedRevision: z.number().int().nonnegative(),
  moveFrom: id.optional(),
});
export const allocationInput = command.extend({
  expectedRevision: z.number().int().nonnegative(),
  allocations: z.record(id, z.number().int().positive().max(5)),
});
export const httpsUrl = z.url().refine((s) => {
  const u = new URL(s);
  return u.protocol === "https:" && !u.username && !u.password;
}, "An HTTPS URL without credentials is required.");
export const sourceInput = z.object({
  title: z.string().trim().min(1).max(120),
  corePrompt: z.string().trim().min(1).max(3000),
  audioUrl: httpsUrl.optional(),
  durationSeconds: z.number().int().min(15).max(1200),
});
export const eventInput = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(60),
  artistName: z.string().trim().min(1).max(100),
  purchaseUrl: httpsUrl.optional(),
  screenLimit: z.number().int().min(4).max(60).default(16),
  minimumRoundSeconds: z.number().int().min(0).max(300).default(60),
  maxWaves: z.number().int().min(1).max(12).default(8),
  maxGenerations: z.number().int().min(0).max(100).default(12),
  admissionMode: z.enum(["open", "room_code"]).default("open"),
  participantLimit: z.number().int().min(1).max(100).default(100),
  releaseMode: z.enum(["boundary", "immediate", "review"]).default("boundary"),
  sources: z.array(sourceInput).min(1).max(60),
});
export const releaseInput = z.object({
  title: z.string().trim().min(1).max(120),
  audioUrl: httpsUrl,
  downloadUrl: httpsUrl,
  durationSeconds: z.number().min(1).max(1200),
  rightsConfirmed: z.literal(true),
});
export const listenInput = z.object({
  intervals: z
    .array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]))
    .max(120),
});
