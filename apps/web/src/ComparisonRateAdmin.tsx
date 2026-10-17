import { useEffect, useState } from "react";
import { api } from "./api";
type RateUnit = "gpu_hour"|"api_generation"|"storage_gib_month"|"egress_gib";
type Rate = {
  id:string;provider:string;sku:string;unit:RateUnit;rateMicroUsd:number;
  supplier:string;sourceDescription:string;provenance:string;effectiveAt:string;
};
const providers=[
  ["mureka","Mureka API",false],["stability","Stable Audio API",false],
  ["ace_step","ACE-Step 1.5",true],["heartmula","HeartMuLa",true],
  ["stable_audio_open","Stable Audio 3 Medium",true],["musicgen","MusicGen research-only",true],
] as const;
const units=[
  ["api_generation","per generation"],["gpu_hour","per billed GPU hour"],
  ["storage_gib_month","per GiB-month of storage"],["egress_gib","per GiB egress"],
] as const;

export function ComparisonRateAdmin() {
  const [rates,setRates]=useState<Rate[]>([]);
  const [provider,setProvider]=useState("ace_step");
  const [unit,setUnit]=useState<RateUnit>("gpu_hour");
  const [sku,setSku]=useState("");
  const [usd,setUsd]=useState("");
  const [supplier,setSupplier]=useState("");
  const [sourceDescription,setSourceDescription]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function load() {const data=await api<{rates:Rate[]}>("/admin/comparison/rates");setRates(data.rates);}
  useEffect(()=>{void load().catch(e=>setError((e as Error).message));},[]);
  async function save(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError("");setNotice("");
    const amount=Number(usd);
    if(!Number.isFinite(amount)||amount<=0||amount>1_000_000){setError("Enter a positive USD amount, up to $1,000,000.");setBusy(false);return;}
    try{
      await api("/admin/comparison/rates","POST",{
        commandId:crypto.randomUUID(),provider,sku,unit,rateMicroUsd:Math.round(amount*1_000_000),supplier,sourceDescription,
      });
      await load();
      setNotice("Rate recorded as an operator estimate. It is not an observed invoice or actual incurred generation cost.");
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  return <section className="card comparison-admin" aria-labelledby="comparison-rates-title">
    <span className="eyebrow">COST ASSUMPTIONS</span>
    <h2 id="comparison-rates-title">Compute and API rate cards</h2>
    <p>Enter what GPU providers actually quote per billed hour and what each API charges per generation. These are rate assumptions only. Actual billed seconds, idle time, storage, network and invoices must be reconciled separately after testing.</p>
    <form onSubmit={e=>void save(e)} className="comparison-batch-form">
      <label>Engine
        <select value={provider} onChange={e=>{const id=e.target.value;setProvider(id);setUnit(id==="mureka"||id==="stability"?"api_generation":"gpu_hour");}}>
          {providers.map(p=><option key={p[0]} value={p[0]}>{p[1]}</option>)}
        </select>
      </label>
      <label>Rate unit
        <select value={unit} onChange={e=>setUnit(e.target.value as RateUnit)}>
          {units.filter(u=>provider==="mureka"||provider==="stability"?u[0]==="api_generation":u[0]!=="api_generation").map(u=><option key={u[0]} value={u[0]}>{u[1]}</option>)}
        </select>
      </label>
      <label>Machine / plan (optional for APIs)
        <input value={sku} maxLength={100} disabled={busy} onChange={e=>setSku(e.target.value)} placeholder="RTX 4090 secure GPU"/>
      </label>
      <label>Quoted USD per unit
        <input type="number" step="0.000001" min="0.000001" required value={usd} disabled={busy} onChange={e=>setUsd(e.target.value)} placeholder="0.50"/>
      </label>
      <label>Supplier
        <input value={supplier} minLength={2} maxLength={100} required disabled={busy} onChange={e=>setSupplier(e.target.value)}/>
      </label>
      <label>Quote / invoice source
        <input value={sourceDescription} minLength={3} maxLength={500} required disabled={busy} onChange={e=>setSourceDescription(e.target.value)} placeholder="GPU vendor pricing page, quote date, or manual invoice note"/>
      </label>
      <button disabled={busy}>{busy?"Saving...":"Record rate estimate"}</button>
    </form>
    {error&&<p className="notice" role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <table><thead><tr><th>Engine</th><th>Plan</th><th>Rate</th><th>Evidence</th></tr></thead><tbody>
      {rates.map(r=><tr key={r.id}><td>{r.provider}</td><td>{r.sku||"Default"}</td><td>{(r.rateMicroUsd/1_000_000).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:4})} / {r.unit.replaceAll("_"," ")}</td><td>{r.provenance.replaceAll("_"," ")} · {r.supplier}</td></tr>)}
      {!rates.length&&<tr><td colSpan={4}>No provider pricing has been entered. Unknown is not the same as free.</td></tr>}
    </tbody></table>
  </section>;
}
