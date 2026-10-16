import { useEffect, useState } from "react";
import { purchaseProviders, preferredPurchaseUrl, type PurchaseLink, type PurchaseMode } from "../../../packages/contracts/src/purchase-providers";

export function PurchaseEditor({ links, onChange, disabled = false, mode = "menu", onModeChange, preferredProvider = "", onPreferredChange }: {
  links: PurchaseLink[]; onChange: (links: PurchaseLink[]) => void; disabled?: boolean;
  mode?: PurchaseMode; onModeChange?: (mode: PurchaseMode) => void;
  preferredProvider?: string; onPreferredChange?: (provider: string) => void;
}) {
  return <fieldset className="purchase-editor">
    <legend>Where can fans get your album?</legend>
    <p className="muted">Choose each destination you offer and paste its album or artist-store link. Streaming-only services appear as listening destinations; no sale is implied.</p>
    {links.map((entry, index) => (
      <div className="purchase-editor-row" key={index}>
        <label>Provider
          <select aria-label={`Music provider ${index + 1}`} disabled={disabled}
            value={entry.provider} onChange={e => onChange(links.map((item, i) => i === index ? { ...item, provider: e.target.value as PurchaseLink["provider"] } : item))}>
            {purchaseProviders.map(p => <option key={p.id} value={p.id} disabled={links.some((l,j) => j !== index && l.provider === p.id)}>{p.label}</option>)}
          </select>
        </label>
        <label>Link URL
          <input aria-label={`Provider URL ${index + 1}`} type="url" required disabled={disabled} placeholder="https://…" value={entry.url}
            onChange={e => onChange(links.map((item,i) => i === index ? { ...item, url: e.target.value } : item))}/>
        </label>
        <button type="button" className="ghost small" disabled={disabled} onClick={() => onChange(links.filter((_, i) => i !== index))}>Remove</button>
      </div>
    ))}
    <fieldset className="purchase-mode-settings">
      <legend>How should fans reach your music?</legend>
      <label><input type="radio" name="purchase-mode" value="menu" checked={mode === "menu"} disabled={disabled} onChange={() => onModeChange?.("menu")}/> Show a menu of all my providers</label>
      <label><input type="radio" name="purchase-mode" value="direct" checked={mode === "direct"} disabled={disabled} onChange={() => onModeChange?.("direct")}/> Send fans directly to one preferred provider</label>
      {mode === "direct" && <label>Preferred destination
        <select aria-label="Preferred purchase provider" required disabled={disabled} value={preferredProvider} onChange={e => onPreferredChange?.(e.target.value)}>
          <option value="">Select a provider</option>
          {links.map(link => <option key={link.provider} value={link.provider}>{purchaseProviders.find(p => p.id === link.provider)?.label ?? "Artist store"}</option>)}
        </select>
      </label>}
      {mode === "direct" && <p className="tiny muted">Fans go straight to your chosen provider. This also applies to the venue QR code.</p>}
    </fieldset>
    <button type="button" className="ghost small" disabled={disabled || links.length >= purchaseProviders.length}
      onClick={() => {
        const next = purchaseProviders.find(p => !links.some(link => link.provider === p.id));
        if (next) onChange([...links, { provider: next.id, url: "" }]);
      }}>+ Add music provider</button>
  </fieldset>;
}
export function PurchaseChoices({ links, label = "Get the album", mode = "menu", preferredProvider = null }: {
  links: PurchaseLink[]; label?: string; mode?: PurchaseMode; preferredProvider?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!links.length) return null;
  const direct = preferredPurchaseUrl(links, mode, preferredProvider);
  if (direct) return <a className="button" href={direct} target="_blank" rel="noopener noreferrer">{label} ↗</a>;
  return <span className="purchase-menu">
    <button type="button" className="purchase-menu-button" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ↗</button>
    {open && <div className="purchase-menu-options" role="group" aria-label="Choose an album provider">
      <strong>Choose where to get the music</strong>
      {links.map(link => {
        const provider = purchaseProviders.find(p => p.id === link.provider);
        return <a key={link.provider} href={link.url} target="_blank" rel="noopener noreferrer">
          {provider?.label ?? "Artist store"} ↗
        </a>;
      })}
      <button type="button" className="ghost small" onClick={() => setOpen(false)}>Close</button>
    </div>}
  </span>;
}
export function PurchaseLanding({ slug }: { slug: string }) {
  const [data, setData] = useState<{ title: string; links: PurchaseLink[]; mode: PurchaseMode; preferredProvider: string | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/events/" + encodeURIComponent(slug), { credentials: "same-origin" }).then(async response => {
    if (!response.ok) throw new Error("This session is unavailable.");
    return response.json();
  }).then(result => setData({ title: result.event.title, links: result.event.purchaseLinks ?? [], mode: result.event.purchaseMode ?? "menu", preferredProvider: result.event.preferredPurchaseProvider ?? null }))
    .catch(e => setError(e.message)); }, [slug]);
  useEffect(() => {
    if (!data) return;
    const direct = preferredPurchaseUrl(data.links, data.mode, data.preferredProvider);
    if (direct) window.location.replace(direct);
  }, [data]);
  return <main className="purchase-landing">
    <h1>Get the original album</h1>
    <p>{data?.title ?? "Finding this artist's album..."}</p>
    {error && <p role="alert">{error}</p>}
    {data && preferredPurchaseUrl(data.links, data.mode, data.preferredProvider) && <p role="status">Opening the artist's chosen provider...</p>}
    {data && (data.links.length ? <div className="purchase-landing-list">
      {data.links.map(link => {
        const provider = purchaseProviders.find(p => p.id === link.provider);
        return <a className="button ghost" key={link.provider} href={link.url} target="_blank" rel="noopener noreferrer">{provider?.label ?? "Artist store"} ↗</a>;
      })}
    </div> : <p>No album destinations have been added yet.</p>)}
    <a href={"/event/" + encodeURIComponent(slug)}>Back to the jam</a>
  </main>;
}
