import { useEffect,useState } from "react";
import { api } from "./api";
type Row={provider:string;runs:number;successful:number;usable:number;failedOrUnknown:number;
  quotedTotalMicroUsd:number|null;actualTotalMicroUsd:number|null;quoteCostPerUsableMicroUsd:number|null;
  actualCostPerUsableMicroUsd:number|null;ratedCount:number;averageQuality:number|null};
const money=(value:number|null)=>value===null?"Not measured":"$"+(value/1_000_000).toFixed(4);
export function ComparisonCostReport() {
  const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function refresh() {
    setBusy(true);
    try{const result=await api<{providers:Row[]}>("/admin/comparisons/cost-report");
      setRows(result.providers);setError("");
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  useEffect(()=>{void refresh();},[]);
  return <section className="card comparison-admin" aria-labelledby="comparison-cost-report-title">
    <h2 id="comparison-cost-report-title">Music model quality and cost comparison</h2>
    <p>These figures count failed runs and repeat generations in the cost numerator. A track is usable only when you explicitly mark it that way after listening. All rate-card figures are estimates until a real supplier charge is reconciled.</p>
    <div className="comparison-actions">
      <button type="button" className="ghost small" disabled={busy} onClick={()=>void refresh()}>{busy?"Refreshing...":"Refresh report"}</button>
      <a className="button ghost small" href="/api/admin/comparisons/cost-report.csv" download="ourjam-comparison-costs.csv">Export cost report CSV</a>
    </div>
    {error&&<p role="alert" className="notice">{error}</p>}
    <div className="comparison-cost-table" style={{overflowX:"auto"}}>
      <table><thead><tr>
        <th>Provider</th><th>Runs</th><th>Success</th><th>Usable</th><th>Average quality</th>
        <th>Quoted total</th><th>Quoted per usable</th><th>Actual total</th><th>Actual per usable</th>
      </tr></thead><tbody>
        {rows.map(r=><tr key={r.provider}>
          <td>{r.provider.replaceAll("_"," ")}</td><td>{r.runs}</td><td>{r.successful}</td>
          <td>{r.usable}</td><td>{r.averageQuality??"Unrated"}</td>
          <td>{money(r.quotedTotalMicroUsd)}</td><td>{money(r.quoteCostPerUsableMicroUsd)}</td>
          <td>{money(r.actualTotalMicroUsd)}</td><td>{money(r.actualCostPerUsableMicroUsd)}</td>
        </tr>)}
        {!rows.length&&<tr><td colSpan={9}>No comparison attempts have been recorded yet. Unknown costs are never displayed as free.</td></tr>}
      </tbody></table>
    </div>
    <p className="muted">A lower estimated price is not proof of savings. GPU host startup, idle time, retries, storage and real invoices must be included before declaring a winner.</p>
  </section>;
}
