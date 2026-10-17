import { useEffect, useState } from "react";
import { api } from "./api";
import { ComparisonRateAdmin } from "./ComparisonRateAdmin";
import { ComparisonCostReport } from "./ComparisonCostReport";
import { ComparisonBatchAdmin } from "./ComparisonBatchAdmin";
import "./comparison-admin.css";

type Engine = {
  id: string;
  label: string;
  execution: "paid_api" | "self_hosted";
  rights: string;
  configured: boolean;
  validated: boolean;
  costRateKnown: boolean;
  requiresExtraLicense: boolean;
};
type GpuHost = "modal" | "lightning";
type HostInfo = {id:GpuHost;label:string;billing:string;tier:string;gatewayConfigured:boolean;aceConfigured:boolean;gpuSkuConfigured:boolean;liveVerified:boolean};
type SelectionState = { selectedProviders: string[];gpuHost:GpuHost;gpuHosts:HostInfo[];revision: number; providers: Engine[]; updatedAt: string };
const licenseLabel: Record<string, string> = {
  commercial_approval_required: "API entitlement required",
  checkpoint_review_required: "Checkpoint license review required",
  community_license_eligibility_required: "Conditional community license / eligibility required",
  noncommercial_only: "Research only — do not use commercially",
};

export function ComparisonAdmin() {
  const [data, setData] = useState<SelectionState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [gpuHost,setGpuHost] = useState<GpuHost>("modal");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const result = await api<SelectionState>("/admin/comparison/settings");
    setData(result);
    setSelected(result.selectedProviders);
    setGpuHost(result.gpuHost);
  }
  useEffect(() => { void load().catch(e => setError((e as Error).message)); }, []);
  function choose(id: string, checked: boolean) {
    setSaved("");
    setSelected(prev => checked ? [...prev.filter(name => name !== id), id] : prev.filter(name => name !== id));
  }
  async function save() {
    if (!data || !selected.length) { setError("Select at least one provider."); return; }
    setBusy(true); setError(""); setSaved("");
    try {
      await api("/admin/comparison/settings", "PATCH", {
        commandId: crypto.randomUUID(), expectedRevision: data.revision, selectedProviders: selected, gpuHost,
      });
      await load();
      setSaved("Comparison provider selection saved. No music generation or billing has been started.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="card comparison-admin" aria-labelledby="comparison-admin-title">
    <span className="eyebrow">MUSIC MODEL COMPARISON</span>
    <h2 id="comparison-admin-title">Choose the engines to compare</h2>
    <p>Send the same instrumental brief to any combination of two hosted APIs and four self-hosted models. Saving this selection never generates songs or incurs charges. Actual test-run and cost controls are being integrated separately.</p>
    {data ? <>
      <fieldset className="comparison-choices" aria-label="GPU hosting service">
        <legend>Where should open-weight models run?</legend>
        <p>GPU hosts are not separate music models. Both run the same quality-first checkpoints. Hosting choice applies only to newly prepared comparisons, never previously queued attempts.</p>
        {data.gpuHosts.map(host=><label className="comparison-choice" key={host.id}>
          <input type="radio" name="comparison-gpu-host" checked={gpuHost===host.id} disabled={busy}
            onChange={()=>{setGpuHost(host.id);setSaved("");}}/>
          <span><strong>{host.label}</strong>
            <small>{host.id==="modal"?"Recurring compute credit; metered beyond allowance":"Introductory GPU credits; metered thereafter"} · suggested GPU {host.tier}</small>
            <small>GPU gateway: {host.gatewayConfigured?"endpoint/token provided":"setup needed"}
              {" · "}ACE-Step: {host.aceConfigured?"endpoint/token provided":"setup needed"}
              {" · "}Rate SKU: {host.gpuSkuConfigured?"configured":"not configured"}
              {" · "}Live verified: {host.liveVerified?"yes":"no"}</small>
          </span>
        </label>)}
      </fieldset>
      <div className="comparison-actions">
        <button type="button" className="ghost small" disabled={busy} onClick={() => setSelected(data.providers.map(p => p.id))}>Select all six</button>
        <button type="button" className="ghost small" disabled={busy} onClick={() => setSelected(data.providers.filter(p => p.rights !== "noncommercial_only").map(p => p.id))}>Commercially eligible candidates</button>
        <button type="button" className="ghost small" disabled={busy} onClick={() => setSelected([])}>Clear</button>
      </div>
      <fieldset className="comparison-choices">
        <legend>Providers for the next comparison ({selected.length} selected)</legend>
        {data.providers.map(engine => <label className="comparison-choice" key={engine.id}>
          <input type="checkbox" checked={selected.includes(engine.id)} disabled={busy} onChange={e => choose(engine.id,e.target.checked)}/>
          <span><strong>{engine.label}</strong><small>{engine.execution === "paid_api" ? "Hosted API" : "Rented GPU / self-hosted"} · {licenseLabel[engine.rights] ?? engine.rights}</small><small>{engine.configured ? "Credentials/endpoint present — not yet live-verified" : "Setup required before a real test"} · {engine.costRateKnown ? "Cost rate configured" : "Cost unknown until metered"}</small></span>
        </label>)}
      </fieldset>
      {data.gpuHost!==gpuHost && <p className="muted">Unsaved host change. Save before preparing a comparison.</p>}
      {selected.includes("musicgen") && <p className="comparison-warning" role="note">MusicGen model weights are noncommercial. It may be included in private research comparisons but must never become a commercially distributed OurJam track without separate authorization.</p>}
      <div className="comparison-footer">
        <button type="button" disabled={busy || !selected.length} onClick={() => void save()}>{busy ? "Saving selection..." : "Save provider selection"}</button>
        <span className="muted">{selected.length ? `${selected.length} engine${selected.length===1?"":"s"} selected` : "Choose at least one engine"}</span>
      </div>
    </> : !error ? <p>Loading provider catalog...</p> : null}
    {saved && <p role="status">{saved}</p>}
    {error && <p role="alert" className="notice">{error}</p>}
    {data && <ComparisonBatchAdmin selectionRevision={data.revision} selectedProviders={data.selectedProviders}/>}
    <ComparisonRateAdmin />
    <ComparisonCostReport />
    <p className="tiny muted">Cloud invoices, host billing, and cost per usable track are tracked separately from estimated rate cards. An installed open-weight model does not include free GPU computation.</p>
  </section>;
}
