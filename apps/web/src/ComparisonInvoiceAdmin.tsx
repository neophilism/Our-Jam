import { useEffect,useState } from "react";
import { api } from "./api";
type Run={id:string;provider:string;state:string;actualCostMicroUsd:number|null;costCertainty:string};
type Invoice={id:string;runId:string;revision:number;amountMicroUsd:number;evidenceReference:string;
  allocationMethod:string;certainty:"invoiced"|"reconciled";includesFullAllocatedCost:boolean;reason:string;createdAt:string};
export function ComparisonInvoiceAdmin({batchId,runs}:{batchId:string;runs:Run[]}) {
  const [entries,setEntries]=useState<Invoice[]>([]);
  const [selected,setSelected]=useState("");
  const [usd,setUsd]=useState("");
  const [reference,setReference]=useState("");
  const [method,setMethod]=useState("");
  const [reason,setReason]=useState("First invoice entry");
  const [status,setStatus]=useState<"invoiced"|"reconciled">("invoiced");
  const [complete,setComplete]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState("");
  const eligible=runs.filter(r=>["succeeded","failed","unknown","blocked","cancelled"].includes(r.state));
  const selectedRun=eligible.find(r=>r.id===selected);
  const current=entries.find(row=>row.runId===selected);
  async function load(){
    const result=await api<{entries:Invoice[]}>("/admin/comparisons/"+batchId+"/invoices");
    setEntries(result.entries);
  }
  useEffect(()=>{setSelected("");void load().catch(e=>setError((e as Error).message));},[batchId]);
  useEffect(()=>{
    if(!selectedRun)return;
    setUsd(current?String(current.amountMicroUsd/1_000_000):"");
    setReference(current?.evidenceReference??"");
    setMethod(current?.allocationMethod??"");
    setStatus(current?.certainty??"invoiced");
    setComplete(current?.includesFullAllocatedCost??false);
    setReason(current?"Correction to previously recorded invoice":"First invoice entry");
  },[selected,current?.revision]);
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(!selectedRun)return;
    const amount=Number(usd);
    const amountMicroUsd=Math.round(amount*1_000_000);
    if(usd.trim()===""||!Number.isSafeInteger(amountMicroUsd)||amountMicroUsd<0){
      setError("Enter a valid nonnegative USD amount from an actual charge or supplier statement.");
      return;
    }
    if(status==="reconciled"&&!complete){
      setError("A fully reconciled charge must include all allocated GPU idle time, retries, transfers, storage and other fees.");
      return;
    }
    setBusy(true);setError("");setSaved("");
    try{
      await api("/admin/comparisons/"+batchId+"/runs/"+selected+"/invoice","POST",{
        commandId:crypto.randomUUID(),expectedRevision:current?.revision??0,
        amountMicroUsd,evidenceReference:reference,allocationMethod:method,
        certainty:status,includesFullAllocatedCost:complete,reason,
      });
      await load();setSaved("Invoice entry saved, including its previous revision history. Refresh the cost report to see the new status.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="comparison-invoice-panel card" aria-labelledby="invoice-title">
    <span className="eyebrow">ACTUAL COST EVIDENCE</span>
    <h3 id="invoice-title">Reconcile real API or GPU charges</h3>
    <p>Record amounts taken from real supplier invoices, not from generation estimates. Include any billed idle/startup time and allocate shared costs between tracks. Failed attempts may incur charges. Corrections are saved as new audited revisions.</p>
    <form className="comparison-batch-form" onSubmit={e=>void submit(e)}>
      <label>Provider run
        <select value={selected} required disabled={busy} onChange={e=>setSelected(e.target.value)}>
          <option value="">Choose a completed or failed attempt</option>
          {eligible.map(r=><option key={r.id} value={r.id}>{r.provider.replaceAll("_"," ")} · {r.state} · {r.id.slice(0,8)}</option>)}
        </select>
      </label>
      {selectedRun&&<>
        <p>Current revision {current?.revision??0}; evidence status: {current?.certainty??"Not provided"}.</p>
        <label>Actual provider charge allocated to this track (USD)
          <input type="number" min={0} max={1_000_000} step="0.000001" required disabled={busy} value={usd} onChange={e=>setUsd(e.target.value)} />
        </label>
        <label>Supplier invoice/charge reference (do not paste sensitive payment details)
          <input minLength={5} maxLength={500} required disabled={busy} value={reference} onChange={e=>setReference(e.target.value)}/>
        </label>
        <label>Allocation method and covered costs
          <textarea minLength={5} maxLength={1000} rows={2} required disabled={busy} value={method} onChange={e=>setMethod(e.target.value)} placeholder="Provider itemized charge, or GPU invoice total allocated by reserved seconds including startup, failed runs, idle..." />
        </label>
        <label>Reason for entry / correction
          <textarea minLength={5} maxLength={1000} rows={2} required disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/>
        </label>
        <fieldset><legend>Level of billing evidence</legend>
          <label><input type="radio" checked={status==="invoiced"} disabled={busy} onChange={()=>setStatus("invoiced")}/> Supplier invoice obtained; some allocations may still be missing</label>
          <label><input type="radio" checked={status==="reconciled"} disabled={busy} onChange={()=>setStatus("reconciled")}/> All charges fully attributed and reconciled</label>
        </fieldset>
        <label><input type="checkbox" checked={complete} disabled={busy} onChange={e=>setComplete(e.target.checked)}/>
          I verified all applicable billed GPU time (including idle/loading and failures), API charges, storage, egress and fees are included in this per-track amount.
        </label>
        <button disabled={busy}>{busy?"Saving...":"Save actual invoice evidence"}</button>
      </>}
    </form>
    {saved&&<p role="status">{saved}</p>}
    {error&&<p role="alert" className="notice">{error}</p>}
    <details><summary>Invoice revision history ({entries.length})</summary>
      {entries.map(e=><p key={e.id}><strong>{runs.find(r=>r.id===e.runId)?.provider}</strong> · revision {e.revision} · {e.certainty} · {"$"+(e.amountMicroUsd/1_000_000).toFixed(4)} · {e.evidenceReference} · {e.reason}</p>)}
      {!entries.length&&<p>No actual charges entered yet; estimates are not treated as invoices.</p>}
    </details>
  </section>;
}
