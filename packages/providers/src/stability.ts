export class ProviderError extends Error {
  constructor(public reason: string, public uncertain: boolean) { super(reason); }
}
export type GeneratedAudio = { bytes: Uint8Array; providerRef?: string };
export type GenerationContext = { onAccepted?: (providerRef: string) => Promise<void>; resumeRef?: string };
export type MusicProvider = {
  name: string;
  model: string;
  variableDuration?: boolean;
  generate(prompt: string, durationSeconds: number, context?: GenerationContext): Promise<GeneratedAudio>;
  resume?(providerRef: string, prompt: string, durationSeconds: number, context?: GenerationContext): Promise<GeneratedAudio>;
};
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export function stabilityProvider(key: string, request: typeof fetch = fetch): MusicProvider {
  return {
    name: "stability", model: "stable-audio-2.5",
    async generate(prompt, durationSeconds) {
      if (prompt.length > 3500 || durationSeconds < 10 || durationSeconds > 180)
        throw new ProviderError("invalid_generation_parameters", false);
      const form = new FormData();
      form.set("prompt", prompt); form.set("duration", String(durationSeconds));
      form.set("model", "stable-audio-2.5"); form.set("output_format", "mp3");
      let response: Response;
      try {
        response = await request("https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio", {
          method: "POST", headers: { authorization: `Bearer ${key}`, accept: "audio/*", "stability-client-id": "our-jam" },
          body: form, redirect: "error", signal: AbortSignal.timeout(240000),
        });
      } catch { throw new ProviderError("provider_acceptance_unknown", true); }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderError(response.status === 402 ? "provider_insufficient_credits" : response.status === 403 ? "provider_moderation" : `provider_http_${response.status}`, response.status >= 500 || response.status === 408);
      }
      if (!response.headers.get("content-type")?.toLowerCase().startsWith("audio/")) {
        await response.body?.cancel(); throw new ProviderError("provider_invalid_audio", false);
      }
      if (Number(response.headers.get("content-length")) > MAX_AUDIO_BYTES) {
        await response.body?.cancel(); throw new ProviderError("provider_audio_too_large", false);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError("provider_empty_audio", false);
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_AUDIO_BYTES) { await reader.cancel(); throw new ProviderError("provider_audio_too_large", false); }
          chunks.push(value);
        }
      } catch (e) { if (e instanceof ProviderError) throw e; throw new ProviderError("provider_transfer_interrupted", true); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { bytes, providerRef: response.headers.get("x-request-id") ?? undefined };
    },
  };
}
