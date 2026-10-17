import { useEffect, useState } from "react";
import { api } from "./api";
import { ComparisonAudition } from "./ComparisonAudition";
import { ComparisonInvoiceAdmin } from "./ComparisonInvoiceAdmin";

type BatchSummary = {
  id: string; purpose: "private_research" | "commercial_evaluation";
  state: string; selectedProviders: string[]; durationSeconds: number; createdAt: string;
};
type BatchDetail = {
  id: string; prompt: string; purpose: string; state: string; selectedProviders: string[];
  runs: { id:string; provider:string; checkpoint:string; state:string; reason:string|null;
    attempts:number; actualCostMicroUsd:number|null; estimatedCostMicroUsd:number|null; costCertainty:string }[];
};

type Quote = {provider:string;label:string;ready:boolean;reason:string|null;estimatedCostMicroUsd:number|null;costBasis:string|null};
type Preflight = {batchId:string;allReady:boolean;quotes:Quote[];estimatedTotalMicroUsd:number|null;warning:string};
export function ComparisonBatchAdmin({ selectionRevision, selectedProviders }: { selectionRevision: number; selectedProviders: string[] }) {
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDuration] = useState(60);
  const [purpose, setPurpose] = useState<"private_research"|"commercial_evaluation">("commercial_evaluation");
  const [acceptedResearch, setAcceptedResearch] = useState(false);
  const [list, setList] = useState<BatchSummary[]>([]);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [blindAudition, setBlindAudition] = useState(true);
  const [ceilingUsd, setCeilingUsd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const includesResearchOnly = selectedProviders.includes("musicgen");

  async function refresh() {
    const response = await api<{batches:BatchSummary[]}>("/admin/comparisons");
    setList(response.batches);
  }
  useEffect(() => { void refresh().catch(e => setError((e as Error).message)); }, []);
  async function prepare(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (includesResearchOnly && (purpose !== "private_research" || !acceptedResearch)) {
      setError("MusicGen is noncommercial. Only genuinely noncommercial research is allowed; private commercial product development is not permitted.");
      return;
    }
    setBusy(true);setError("");setSaved("");
    try {
      const batch = await api<{id:string}>("/admin/comparisons","POST",{
        commandId:crypto.randomUUID(),expectedSelectionRevision:selectionRevision,
        prompt,durationSeconds,purpose,
      });
      setDetail(await api<BatchDetail>("/admin/comparisons/"+batch.id));
      setPreflight(await api<Preflight>("/admin/comparisons/"+batch.id+"/preflight"));
      await refresh();
      setSaved("Comparison prepared. The selected model runs are stored separately. No API generation, GPU billing or audio output has started yet.");
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function view(id:string) {
    setError("");
    try {
      setDetail(await api<BatchDetail>("/admin/comparisons/"+id));
      setPreflight(await api<Preflight>("/admin/comparisons/"+id+"/preflight"));
    }
    catch(e) { setError((e as Error).message); }
  }
  async function start() {
    if (!detail || !preflight?.allReady || preflight.estimatedTotalMicroUsd===null) return;
    const amount = Number(ceilingUsd);
    const approvedCeilingMicroUsd = Math.round(amount*1_000_000);
    if(!Number.isSafeInteger(approvedCeilingMicroUsd) ||
       approvedCeilingMicroUsd < preflight.estimatedTotalMicroUsd) {
      setError("Enter an explicit USD spending ceiling at least as high as the quoted total.");
      return;
    }
    if(!window.confirm("Queue the selected music-generation requests? Actual API charges and GPU rental usage may exceed estimates if the host does not enforce its configured limit. Confirm your budget before proceeding.")) return;
    setBusy(true);setError("");setSaved("");
    try{
      await api("/admin/comparisons/"+detail.id+"/start","POST",{
        commandId:crypto.randomUUID(),approvedCeilingMicroUsd,
      });
      setDetail(await api<BatchDetail>("/admin/comparisons/"+detail.id));
      setPreflight(await api<Preflight>("/admin/comparisons/"+detail.id+"/preflight"));
      await refresh();
      setSaved("Comparison queued with the approved spending ceiling. Actual generation requires a separately configured worker; no output is implied until a run succeeds.");
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  return <section className="comparison-batch-panel" aria-labelledby="comparison-create-title">
    <h3 id="comparison-create-title">Prepare an instrumental comparison</h3>
    <p>Use a single prompt for the saved engine selection. Each model will get a distinct attempt so its quality, timing and costs can be measured independently.</p>
    <form className="comparison-batch-form" onSubmit={e=>void prepare(e)}>
      <label>Instrumental direction
        <textarea rows={4} minLength={8} maxLength={3500} required value={prompt} disabled={busy}
          placeholder="Deep bass, cinematic brass, syncopated drums, no vocals..." onChange={e=>setPrompt(e.target.value)}/>
      </label>
      <label>Requested duration in seconds
        <input type="number" min={10} max={180} step={1} required value={durationSeconds} disabled={busy} onChange={e=>setDuration(Number(e.target.value))}/>
      </label>
      <fieldset>
        <legend>Intended use</legend>
        <label><input type="radio" name="comparison-purpose" checked={purpose==="commercial_evaluation"} onChange={()=>setPurpose("commercial_evaluation")}/> Commercial evaluation (only appropriately licensed checkpoints)</label>
        <label><input type="radio" name="comparison-purpose" checked={purpose==="private_research"} onChange={()=>setPurpose("private_research")}/> Genuinely noncommercial research (not product development)</label>
      </fieldset>
      {includesResearchOnly && <label className="comparison-research-ack">
        <input type="checkbox" checked={acceptedResearch} onChange={e=>setAcceptedResearch(e.target.checked)}/>
        I confirm this is genuinely noncommercial research, not private development of a commercial product. MusicGen outputs cannot be used commercially without separate permission.
      </label>}
      <button disabled={busy || !prompt.trim() || (includesResearchOnly && (purpose!=="private_research" || !acceptedResearch))}>
        {busy ? "Preparing..." : `Prepare ${selectedProviders.length}-engine comparison`}
      </button>
    </form>
    {saved && <p role="status">{saved}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <details className="comparison-history" open={Boolean(detail)}>
      <summary>Saved comparison runs ({list.length})</summary>
      {list.length===0 && <p>No comparison runs have been prepared yet.</p>}
      {list.map(b => <button className="ghost small" type="button" key={b.id} onClick={()=>void view(b.id)}>
        {new Date(b.createdAt).toLocaleString()} · {b.selectedProviders.length} models · {b.state}
      </button>)}
      {detail && <div className="comparison-result-panel">
        <h4>Comparison {detail.id.slice(0,8)} · {detail.state}</h4>
        <p>{detail.prompt}</p>
        {preflight?.batchId===detail.id && <>
          <h4>Pricing and readiness preflight</h4>
          <p className="muted">{preflight.warning}</p>
          <ul>{preflight.quotes.map(quote=><li key={quote.provider}>
            <strong>{quote.label}</strong>: {quote.ready?"Ready to queue":quote.reason}
            {" · "}{quote.estimatedCostMicroUsd===null?"Cost not available":("$"+(quote.estimatedCostMicroUsd/1_000_000).toFixed(4)+" estimated")}
            {quote.costBasis && <span className="muted"> · {quote.costBasis}</span>}
          </li>)}</ul>
          {preflight.estimatedTotalMicroUsd!==null && <p><strong>Estimated total: {"$"+(preflight.estimatedTotalMicroUsd/1_000_000).toFixed(4)}</strong></p>}
          {detail.state==="prepared" && <div className="comparison-batch-form">
            <label>Maximum budget you approve for this batch (USD)
              <input type="number" min="0.000001" step="0.000001" value={ceilingUsd} disabled={busy}
                onChange={e=>setCeilingUsd(e.target.value)} placeholder="Enter your maximum spending approval"/>
            </label>
            <button type="button" disabled={busy || !preflight.allReady} onClick={()=>void start()}>
              {busy?"Queuing...":"Approve budget and queue selected generators"}
            </button>
            {!preflight.allReady && <p className="muted">Generation cannot start until each selected engine has a valid rate, server configuration and applicable license approval.</p>}
          </div>}
        </>}
        <ComparisonAudition batchId={detail.id} runs={detail.runs} onBlindChange={setBlindAudition}/>
        {!blindAudition && <ComparisonInvoiceAdmin batchId={detail.id} runs={detail.runs}/>}
        {blindAudition && detail.runs.some(r=>r.state==="succeeded") && <p className="muted">Reveal provider identities or turn off blind listening to enter supplier invoice evidence.</p>}
        {(!blindAudition || !detail.runs.some(r=>r.state==="succeeded")) && <div className="comparison-result-grid">
          {detail.runs.map(r => <div className="comparison-result" key={r.id}>
            <strong>{r.provider.replaceAll("_"," ")}</strong>
            <span>{r.checkpoint}</span>
            <span>Status: {r.state}{r.reason ? " · "+r.reason : ""}</span>
            <span>Generation cost: {r.costCertainty==="unknown" || r.actualCostMicroUsd===null ? "Not measured" : "$"+(r.actualCostMicroUsd/1000000).toFixed(4)}</span>
            <span>{r.state==="succeeded" ? "Private audio available in the listening panel" : "No playable audio yet"}</span>
          </div>)}
        </div>}
      </div>}
    </details>
  </section>;
}
