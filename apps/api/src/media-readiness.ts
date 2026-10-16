import type { MediaStore } from "../../../packages/providers/src/storage.js";

/**
 * Opt-in deployment acceptance: a small private object must survive actual
 * S3 PUT, HEAD, GET and DELETE before we claim media is usable.
 * No artist content, provider requests or event records are involved.
 */
export async function verifyStartupMedia(
  store: MediaStore | undefined,
  setting: string | undefined,
): Promise<"verified" | "not_requested"> {
  if (setting !== "1") return "not_requested";
  if (!store?.verifyRoundTrip)
    throw new Error("MEDIA_PROBE_ON_START requires private storage with a round-trip probe.");
  await store.verifyRoundTrip();
  return "verified";
}
