import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import "./comparison-audition.css";
type Run={id:string;provider:string;checkpoint:string;state:string;reason:string|null};
type Review={runId:string;soundQuality:number|null;promptAdherence:number|null;approvedUsable:boolean|null;favorite:boolean;notes:string;
  quotedCostMicroUsd:number|null;actualCostMicroUsd:number|null;costCertainty:string};
export function ComparisonAudition({batchId,runs,onBlindChange}:{batchId:string;runs:Run[];onBlindChange?:(blind:boolean)=>void}) {
  const playable=runs.filter(run=>run.state==="succeeded");
  const [order,setOrder]=useState<string[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [blind,setBlind]=useState(true);
  const [revealed,setRevealed]=useState(false);
  const [reviews,setReviews]=useState<Review[]>([]);
  const [quality,setQuality]=useState(3),[adherence,setAdherence]=useState(3);
  const [usable,setUsable]=useState(false),[favorite,setFavorite]=useState(false);
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const audio=useRef<HTMLAudioElement|null>(null);
  const playback=useRef({position:0,continuePlaying:false});
  const playableKey=playable.map(run=>run.id).join("|");
  async function loadReviews() {
    const result=await api<{reviews:Review[]}>("/admin/comparisons/"+batchId+"/reviews");
    setReviews(result.reviews);
  }
  useEffect(()=>{
    let active=true;
    setOrder(playable.map(r=>r.id).sort(()=>Math.random()-0.5));
    setSelected(null);
    void api<{reviews:Review[]}>("/admin/comparisons/"+batchId+"/reviews")
      .then(r=>{if(active)setReviews(r.reviews);}).catch(e=>{if(active)setError((e as Error).message);});
    return()=>{active=false;};
  },[batchId,playableKey]);
  useEffect(()=>{onBlindChange?.(blind&&!revealed);},[blind,revealed,onBlindChange]);
  useEffect(()=>{
    const review=reviews.find(r=>r.runId===selected);
    setQuality(review?.soundQuality??3);setAdherence(review?.promptAdherence??3);
    setUsable(review?.approvedUsable??false);setFavorite(review?.favorite??false);
    setNotes(review?.notes??"");
  },[selected,reviews]);
  function pick(id:string) {
    const player=audio.current;
    playback.current={position:player?.currentTime??0,continuePlaying:Boolean(player&&!player.paused)};
    setSelected(id);setMessage("");setError("");
  }
  function onLoaded() {
    const player=audio.current;
    if(!player)return;
    const cap=Number.isFinite(player.duration)?Math.max(0,player.duration-0.25):playback.current.position;
    try{player.currentTime=Math.min(playback.current.position,cap);}catch{}
    if(playback.current.continuePlaying)void player.play().catch(()=>{});
    playback.current.continuePlaying=false;
  }
  async function save(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(!selected)return;
    setBusy(true);setMessage("");setError("");
    try{
      await api("/admin/comparisons/"+batchId+"/runs/"+selected+"/review","POST",{
        commandId:crypto.randomUUID(),soundQuality:quality,promptAdherence:adherence,
        approvedUsable:usable,favorite,notes,
      });
      await loadReviews();
      setMessage("Review saved. The cost per usable song report can now include this decision.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const selectedRun=playable.find(r=>r.id===selected);
  const current=reviews.find(r=>r.runId===selected);
  const identify=(run:Run)=>blind&&!revealed?"Track "+String.fromCharCode(65+order.indexOf(run.id)) : run.provider.replaceAll("_"," ");
  return <section className="comparison-audition card" aria-labelledby="audition-title">
    <span className="eyebrow">COMPARE BY EAR</span>
    <h3 id="audition-title">Listen to the same brief from each model</h3>
    <p>Choose a track to play or switch while keeping approximately the same playback position. The audio masters are unchanged. Playback volume is uniform, but measured loudness normalization is not yet calibrated.</p>
    <div className="comparison-audition-actions">
      <label><input type="checkbox" checked={blind} onChange={e=>{setBlind(e.target.checked);setRevealed(false);}}/> Blind listening</label>
      {blind&&<button type="button" className="ghost small" onClick={()=>setRevealed(v=>!v)}>{revealed?"Hide identities":"Reveal engines"}</button>}
      <button type="button" className="ghost small" onClick={()=>setOrder(old=>[...old].sort(()=>Math.random()-0.5))}>Shuffle order</button>
    </div>
    {playable.length===0?<p className="muted">No valid generated audio yet. When jobs finish, their private tracks appear here.</p>:<>
      <div className="comparison-audition-choices">
        {order.filter(id=>playable.some(r=>r.id===id)).map(id=>{
          const run=playable.find(r=>r.id===id)!;
          const review=reviews.find(r=>r.runId===id);
          return <button key={id} className={selected===id?"":"ghost"} type="button" aria-pressed={selected===id} onClick={()=>pick(id)}>
            {identify(run)}{review?.favorite?" ★":""}{review?.approvedUsable?" ✓":""}
          </button>;
        })}
      </div>
      {selectedRun && <>
        <p><strong>{identify(selectedRun)}</strong>{!(blind&&!revealed)&&" · "+selectedRun.checkpoint}</p>
        <audio ref={audio} controls preload="metadata" src={"/api/admin/comparisons/"+batchId+"/runs/"+selectedRun.id+"/audio"} onLoadedMetadata={onLoaded} aria-label={"Private generated audio for "+identify(selectedRun)}/>
        <p className="muted">Estimated cost: {current?.quotedCostMicroUsd===null||current?.quotedCostMicroUsd===undefined?"Unknown":("$"+(current.quotedCostMicroUsd/1_000_000).toFixed(4))} · Actual invoiced cost: {current?.actualCostMicroUsd===null||current?.actualCostMicroUsd===undefined?"Not reconciled":("$"+(current.actualCostMicroUsd/1_000_000).toFixed(4))}</p>
        <form className="comparison-audition-review" onSubmit={e=>void save(e)}>
          <label>Sound quality (1–5)
            <select value={quality} onChange={e=>setQuality(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label>Prompt adherence (1–5)
            <select value={adherence} onChange={e=>setAdherence(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label><input type="checkbox" checked={usable} onChange={e=>setUsable(e.target.checked)}/> Good enough to use</label>
          <label><input type="checkbox" checked={favorite} onChange={e=>setFavorite(e.target.checked)}/> Favorite of this batch</label>
          <label className="comparison-audition-notes">Listening notes
            <textarea rows={3} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/>
          </label>
          <button disabled={busy}>{busy?"Saving...":"Save listening review"}</button>
        </form>
      </>}
    </>}
    {error&&<p role="alert" className="notice">{error}</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
