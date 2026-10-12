import { ProviderError, MAX_AUDIO_BYTES, type MusicProvider } from "./stability.js";

/** Mureka's instrumental API is asynchronous and does not accept a target duration. */
export function murekaProvider(
  key: string,
  options: {
    request?: typeof fetch;
    wait?: (ms: number) => Promise<void>;
    maxPolls?: number;
    model?: string;
    mediaHosts?: string[];
  } = {},
): MusicProvider {
  const request = options.request ?? fetch;
  const wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const model = options.model ?? "mureka-9.5";
  if (!["mureka-7.6", "mureka-8", "mureka-9", "mureka-9.5"].includes(model))
    throw new Error("Unsupported Mureka model; review the provider contract before changing it.");
  const hosts = options.mediaHosts ?? ["cdn.mureka.ai", "mureka.ai"];
  async function read(response: Response, limit: number): Promise<Uint8Array> {
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body?.cancel();
      throw new ProviderError("provider_response_too_large", true);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ProviderError("provider_empty_response", true);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new ProviderError("provider_response_too_large", true);
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("provider_transfer_interrupted", true);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  }
  async function task(path: string, body?: object): Promise<any> {
    let response: Response;
    try {
      response = await request("https://api.mureka.ai" + path, {
        method: body ? "POST" : "GET",
        headers: { authorization: `Bearer ${key}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ProviderError(body ? "provider_acceptance_unknown" : "provider_poll_interrupted", true);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError(
        response.status === 402 ? "provider_insufficient_credits" : `provider_http_${response.status}`,
        !body || response.status >= 500 || response.status === 408,
      );
    }
    try { return JSON.parse(new TextDecoder().decode(await read(response, 65536))); }
    catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("provider_invalid_task_response", true);
    }
  }
  const provider: MusicProvider = {
    name: "mureka",
    model,
    variableDuration: true,
    async generate(prompt, _durationSeconds, context) {
      if (!prompt.trim() || prompt.length > 1024)
        throw new ProviderError("provider_prompt_too_long", false);
      let result: any;
      if (context?.resumeRef) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(context.resumeRef))
          throw new ProviderError("provider_invalid_task_id", true);
        result = await task("/v1/instrumental/query/" + encodeURIComponent(context.resumeRef));
      } else {
        // n defaults to two upstream. Always request exactly one billed output.
        result = await task("/v1/instrumental/generate", { model, n: 1, prompt, stream: false });
      }
      const taskId = result?.id;
      if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId) || (context?.resumeRef && taskId !== context.resumeRef))
        throw new ProviderError("provider_invalid_task_id", true);
      // Persist immediately, before polling or downloading. Never repeat the POST.
      await context?.onAccepted?.(taskId);
      const polls = options.maxPolls ?? 75;
      for (let i = 0; result.status !== "succeeded"; i++) {
        if (["failed", "timeouted", "cancelled"].includes(result.status))
          throw new ProviderError("provider_task_" + result.status, false);
        if (!["preparing", "queued", "running", "streaming"].includes(result.status))
          throw new ProviderError("provider_unknown_task_state", true);
        if (i >= polls) throw new ProviderError("provider_poll_timeout", true);
        await wait(3000);
        result = await task("/v1/instrumental/query/" + encodeURIComponent(taskId));
        if (result?.id !== taskId) throw new ProviderError("provider_task_mismatch", true);
      }
      const choice = result.choices?.[0];
      if (typeof choice?.url !== "string") throw new ProviderError("provider_missing_audio", true);
      let url: URL;
      try { url = new URL(choice.url); } catch { throw new ProviderError("provider_invalid_audio_url", true); }
      // No arbitrary URL fetches, auth forwarding, non-HTTPS URLs, or redirects.
      if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
          !hosts.some((host) => url.hostname === host || (host === "mureka.ai" && url.hostname.endsWith(".mureka.ai"))))
        throw new ProviderError("provider_unapproved_media_host", true);
      let response: Response;
      try { response = await request(url.toString(), { redirect: "error", signal: AbortSignal.timeout(60000) }); }
      catch { throw new ProviderError("provider_audio_download_interrupted", true); }
      if (!response.ok) { await response.body?.cancel(); throw new ProviderError("provider_audio_download_failed", true); }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("audio/") && !contentType.startsWith("application/octet-stream")) {
        await response.body?.cancel(); throw new ProviderError("provider_invalid_audio", true);
      }
      return { bytes: await read(response, MAX_AUDIO_BYTES), providerRef: taskId };
    },
  };
  // A separate capability prevents reconciliation from falling back
  // to a provider that ignores resumeRef and sends a new generation POST.
  provider.resume = (reference, prompt, duration, context) =>
    provider.generate(prompt, duration, { ...context, resumeRef: reference });
  return provider;
}
