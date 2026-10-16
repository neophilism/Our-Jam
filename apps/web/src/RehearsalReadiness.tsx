import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Readiness = {
  database: string;
  media?: string;
  operator: string;
  generation: string;
  email: string;
};

/**
 * Read-only health signals in the real performer console.
 * A verified storage probe is not a claim that a user's MP3, physical audio
 * outputs, independent phones or funded generation have passed acceptance.
 */
export function RehearsalReadiness() {
  const [state, setState] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const next = await api<Readiness>("/ready");
      setState(next);
    } catch (e) {
      setState(null);
      setError((e as Error).message || "The hosted API is not ready.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="panel" aria-label="Rehearsal readiness" style={{ padding: 20, marginBottom: 20 }}>
      <h3>Rehearsal readiness</h3>
      <p className="tiny muted">Live server checks. A successful startup does not replace a real song upload or a physical-phone and sound-system rehearsal.</p>
      <div aria-live="polite">
        {state ? (
          <ul>
            <li>{state.database === "ready" ? "Database connected" : "Database not ready"}</li>
            <li>
              {state.media === "verified"
                ? "Private media storage read/write verified"
                : state.media === "configured"
                  ? "Private media storage configured, but not verified"
                  : "Private media storage not connected"}
            </li>
            <li>{state.operator === "configured" ? "Performer access configured" : "Performer access not configured"}</li>
            <li>{state.generation === "not_configured" ? "AI generation disabled (zero-spend rehearsal)" : "AI generation configured; verify credits and event limits before use"}</li>
            <li>{state.email === "not_configured" ? "Event email disabled" : "Event email configured; verify approved delivery limits"}</li>
          </ul>
        ) : <p>{busy ? "Checking server…" : "Server readiness has not been verified."}</p>}
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="ghost small" disabled={busy} onClick={() => void refresh()}>
        {busy ? "Checking…" : "Recheck readiness"}
      </button>
    </section>
  );
}
