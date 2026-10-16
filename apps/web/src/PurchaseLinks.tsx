import { useEffect, useState } from "react";
import { purchaseProviders, type PurchaseLink } from "../../../packages/contracts/src/purchase-providers";

export function PurchaseEditor({ links, onChange, disabled = false }: {
  links: PurchaseLink[]; onChange: (links: PurchaseLink[]) => void; disabled?: boolean;
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
    <button type="button" className="ghost small" disabled={disabled || links.length >= purchaseProviders.length}
      onClick={() => {
        const next = purchaseProviders.find(p => !links.some(link => link.provider === p.id));
        if (next) onChange([...links, { provider: next.id, url: "" }]);
      }}>+ Add music provider</button>
  </fieldset>;
}
export function PurchaseChoices({ links, label = "Get the album" }: { links: PurchaseLink[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!links.length) return null;
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
  const [data, setData] = useState<{ title: string; links: PurchaseLink[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/events/" + encodeURIComponent(slug), { credentials: "same-origin" }).then(async response => {
    if (!response.ok) throw new Error("This session is unavailable.");
    return response.json();
  }).then(result => setData({ title: result.event.title, links: result.event.purchaseLinks ?? [] }))
    .catch(e => setError(e.message)); }, [slug]);
  return <main className="purchase-landing">
    <h1>Get the original album</h1>
    <p>{data?.title ?? "Finding this artist's album..."}</p>
    {error && <p role="alert">{error}</p>}
    {data && (data.links.length ? <div className="purchase-landing-list">
      {data.links.map(link => {
        const provider = purchaseProviders.find(p => p.id === link.provider);
        return <a className="button ghost" key={link.provider} href={link.url} target="_blank" rel="noopener noreferrer">{provider?.label ?? "Artist store"} ↗</a>;
      })}
    </div> : <p>No album destinations have been added yet.</p>)}
    <a href={"/event/" + encodeURIComponent(slug)}>Back to the jam</a>
  </main>;
}
