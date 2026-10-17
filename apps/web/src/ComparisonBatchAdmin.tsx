import { useEffect, useState } from "react";
import { api } from "./api";

type BatchSummary = {
  id: string; purpose: "private_research" | "commercial_evaluation";
  state: string; selectedProviders: string[]; durationSeconds: number; createdAt: string;
};
type BatchDetail = {
  id: string; prompt: string; purpose: string; state: string; selectedProviders: string[];
  runs: { id:string; provider:string; checkpoint:string; state:string; reason:string|null;
    attempts:number; actualCostMicroUsd:number|null; estimatedCostMicroUsd:number|null; costCertainty:string }[];
};

export function ComparisonBatchAdmin({ selectionRevision, selectedProviders }: { selectionRevision: number; selectedProviders: string[] }) {
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDuration] = useState(60);
  const [purpose, setPurpose] = useState<"private_research"|"commercial_evaluation">("commercial_evaluation");
  const [acceptedResearch, setAcceptedResearch] = useState(false);
  const [list, setList] = useState<BatchSummary[]>([]);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
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
      await refresh();
      setSaved("Comparison prepared. The selected model runs are stored separately. No API generation, GPU billing or audio output has started yet.");
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function view(id:string) {
    setError("");
    try { setDetail(await api<BatchDetail>("/admin/comparisons/"+id)); }
    catch(e) { setError((e as Error).message); }
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
        I understand MusicGen's published weights prohibit commercial use; these results remain private research and cannot be distributed as a commercial OurJam release.
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
        <div className="comparison-result-grid">
          {detail.runs.map(r => <div className="comparison-result" key={r.id}>
            <strong>{r.provider.replaceAll("_"," ")}</strong>
            <span>{r.checkpoint}</span>
            <span>Status: {r.state}{r.reason ? " · "+r.reason : ""}</span>
            <span>Generation cost: {r.costCertainty==="unknown" || r.actualCostMicroUsd===null ? "Not measured" : "$"+(r.actualCostMicroUsd/1000000).toFixed(4)}</span>
            <span>{r.state==="succeeded" ? "Audio audition to be connected" : "No playable audio yet"}</span>
          </div>)}
        </div>
      </div>}
    </details>
  </section>;
}
