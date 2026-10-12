import { useEffect, useRef, useState } from "react";
import { api, type EventState } from "./api";
type Provider = "stability" | "mureka";
type State = {
  provider: Provider; revision: number; activeRoundProvider: Provider | null; state: string;
  eventBudgetCents: number; totalBudgetCents: number;
  providers: { name: string; keyConfigured: boolean }[];
  jobs: { id: string; state: string; reason: string | null; requested_provider: Provider; provider?: string; model?: string; providerRef?: string; attempts?: number; reservedCents?: number; reconciliation?: { canRequest: boolean; blockReason: string | null } }[];
};
const names = { stability: "Stable Audio", mureka: "Mureka" };
const reasons: Record<string, string> = {
  approved_budget_zero: "Generation blocked: your approved spending limit is $0. No provider request was sent. Your tags and votes are saved.",
  approved_budget_exhausted: "The approved generation budget is used up. No new request was sent.",
  provider_insufficient_credits: "The provider rejected generation because its API account has insufficient credits.",
  selected_provider_not_configured: "This provider's key is not configured on the server yet.",
  provider_not_configured: "Generation is not enabled on this server. Tags and voting remain available.",
  provider_price_not_verified: "A current price and spending allowance must be approved before contacting this provider.",
  media_storage_not_configured: "Private audio storage must be configured before generating music.",
  provider_prompt_too_long: "Mureka accepts at most 1,024 prompt characters. This round's saved prompt was not truncated or sent.",
  no_supported_waves: "This round had no supported sound tags to include.",
  participation_window_too_short: "The participation window was shorter than the show's minimum.",
  reconciliation_requested: "A check of the saved task is queued. No new generation will be submitted.",
  provider_task_not_resumable: "This provider/task cannot be checked automatically. Do not submit a replacement without verifying the original task.",
  provider_receipt_missing: "The original provider receipt is missing. Automatic resubmission is disabled to prevent duplicate charges.",
  provider_model_changed: "The configured provider model changed. Restore the original configuration before checking this task.",
  provider_poll_timeout: "The existing Mureka task is taking longer. Its task ID is saved; do not submit a duplicate.",
};
export function ProviderControls({ data, refresh }: { data: EventState; refresh: () => Promise<void> }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const sequence = useRef(0);
  const eventId = data.event.id;
  async function load() {
    const seq = ++sequence.current;
    try { const value = await api(`/operator/events/${eventId}/generation-provider`); if (seq === sequence.current) { setState(value); setError(""); } }
    catch (e) { if (seq === sequence.current) setError((e as Error).message); }
  }
  useEffect(() => {
    setState(null); void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 3000);
    return () => { clearInterval(timer); sequence.current++; };
  }, [eventId]);
  useEffect(() => { void load(); }, [data.event.revision]);
  async function change(provider: Provider) {
    if (!state || busy || state.provider === provider) return;
    setBusy(true); setError("");
    try {
      await api(`/operator/events/${eventId}/generation-provider`, "PATCH", { provider, commandId: crypto.randomUUID(), expectedRevision: state.revision });
      await refresh(); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function reconcile(jobId: string) {
    if (!state || busy || !window.confirm("Check the saved Mureka task? This only retrieves the existing task; it never creates a new generation or increases the approved budget.")) return;
    setBusy(true); setError("");
    try {
      await api(`/operator/jobs/${jobId}/reconcile`, "POST", { commandId: crypto.randomUUID(), expectedRevision: state.revision });
      await refresh(); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-labelledby="provider-heading" style={{ padding: 20, marginBottom: 20 }}>
    <h3 id="provider-heading">Music generation</h3>
    <p>Choose the provider for the next round. The active round keeps its original selection.</p>
    <div role="group" aria-label="Music provider" style={{ display: "flex", gap: 8, margin: "14px 0" }}>
      {(["mureka", "stability"] as Provider[]).map((provider) => <button key={provider} type="button" className={state?.provider === provider ? "" : "ghost"} aria-pressed={state?.provider === provider} disabled={busy || !state} onClick={() => void change(provider)}>{names[provider]}</button>)}
    </div>
    {state && <>
      <p className="tiny">Next round: <strong>{names[state.provider]}</strong>{state.activeRoundProvider ? ` | Active round: ${names[state.activeRoundProvider]}` : ""}. {state.provider === "mureka" ? "Mureka chooses output length; prompt limit 1,024 characters." : "Stable Audio uses the configured target duration."}</p>
      <p role="status" style={{ marginTop: 12 }}>{reasons[state.state] ?? "Generation is configured. Each request is still checked against credentials, current price and remaining budget."}</p>
      <p className="tiny">Event limit: ${(state.eventBudgetCents / 100).toFixed(2)} | Total limit: ${(state.totalBudgetCents / 100).toFixed(2)}. Switching providers does not authorize spending.</p>
      <details style={{ marginTop: 12 }}><summary>Generation activity ({state.jobs.length})</summary>
        {state.jobs.length === 0 ? <p>No rounds have requested generation yet.</p> : state.jobs.map((job) => <div key={job.id} style={{ borderTop: "1px solid #45473b", padding: "12px 0" }}><strong>{names[job.requested_provider] ?? job.requested_provider}: {job.state}</strong><p>{job.reason ? reasons[job.reason] ?? job.reason.replaceAll("_", " ") : job.model ?? "Waiting for processing"}</p>
          {job.state === "unknown" && <>
            {job.providerRef && <p className="tiny">Saved task: <code>{job.providerRef}</code></p>}
            {typeof job.reservedCents === "number" && <p className="tiny">Existing reservation: ${(job.reservedCents / 100).toFixed(2)}. Checking this task does not create another paid attempt.</p>}
            <button type="button" disabled={busy || !job.reconciliation?.canRequest} onClick={() => void reconcile(job.id)}>Check existing task</button>
            {job.reconciliation?.blockReason && <p className="tiny">{reasons[job.reconciliation.blockReason] ?? job.reconciliation.blockReason.replaceAll("_", " ")}</p>}
          </>}
        </div>)}
      </details>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
