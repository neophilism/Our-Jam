import { z } from "zod";
const httpsUrl = z.url().refine((value) => { const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password; }, "Use a valid HTTPS URL without credentials.");
export const purchaseProviders = [
  { id: "bandcamp", label: "Bandcamp", hosts: ["bandcamp.com"] },
  { id: "itunes", label: "Apple Music / iTunes", hosts: ["music.apple.com", "itunes.apple.com", "apps.apple.com"] },
  { id: "amazon", label: "Amazon Music", hosts: ["music.amazon.com", "amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de", "amazon.co.jp"] },
  { id: "qobuz", label: "Qobuz", hosts: ["qobuz.com"] },
  { id: "beatport", label: "Beatport", hosts: ["beatport.com"] },
  { id: "7digital", label: "7digital", hosts: ["7digital.com"] },
  { id: "spotify", label: "Spotify", hosts: ["open.spotify.com"] },
  { id: "youtube", label: "YouTube Music", hosts: ["music.youtube.com"] },
  { id: "deezer", label: "Deezer", hosts: ["deezer.com"] },
  { id: "tidal", label: "TIDAL", hosts: ["tidal.com", "listen.tidal.com"] },
  { id: "soundcloud", label: "SoundCloud", hosts: ["soundcloud.com"] },
  { id: "other", label: "Artist store / other", hosts: [] },
] as const;
const ids = purchaseProviders.map((p) => p.id);
export type PurchaseLink = { provider: typeof purchaseProviders[number]["id"]; url: string };
export const purchaseLinksInput = z.array(z.object({
  provider: z.enum(ids as [typeof ids[number], ...typeof ids[number][]]),
  url: httpsUrl.max(2048),
}).superRefine((link, context) => {
  const p = purchaseProviders.find(x => x.id === link.provider)!;
  if (p.id === "other") return;
  const host = new URL(link.url).hostname.toLowerCase();
  if (!p.hosts.some((root) => host === root || host.endsWith("." + root)))
    context.addIssue({ code: "custom", message: "This URL does not belong to " + p.label + "." });
})).max(12).superRefine((links, context) => {
  const found = new Set<string>();
  for (let i = 0; i < links.length; i++) {
    const key = links[i].provider;
    if (found.has(key)) context.addIssue({ code: "custom", path: [i, "provider"], message: "Choose each provider once." });
    found.add(key);
  }
});
export function publicPurchaseLinks(value: unknown, legacy: unknown): PurchaseLink[] {
  const result = purchaseLinksInput.safeParse(value);
  if (result.success && result.data.length) return result.data;
  const fallback = httpsUrl.safeParse(legacy);
  return fallback.success ? [{ provider: "other", url: fallback.data }] : [];
}
