import { useState } from "react";
import { api, type EventState } from "./api";

export function AdmissionSettings({
  data,
  refresh,
}: {
  data: EventState;
  refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<{
      mode: string;
      limit: number;
      revision: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = Boolean(data.round);
  const load = () =>
    setDraft({
      mode: data.admission.mode,
      limit: data.admission.limit,
      revision: data.event.revision,
    });
  return (
    <section className="card" aria-label="Audience admission">
      <span className="eyebrow">WHO GETS A VOTE</span>
      <h2>Room access & capacity</h2>
      <p>
        {data.admission.mode === "open"
          ? "Remote voting is open to everyone with the event link."
          : data.admission.codeConfigured
            ? "Contributors need the room code. Listening stays open to everyone."
            : "Set a room code to admit contributors. Until then, guests can join as listeners."}
      </p>
      <p className="muted">
        {data.admission.contributors} of {data.admission.limit} contributor
        places filled. These are guest identities, not verified unique people.
      </p>
      <button className="ghost small" disabled={busy} onClick={load}>
        {draft ? "Reload admission fields" : "Edit audience admission"}
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <form
          key={draft.revision}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api(
                `/operator/events/${data.event.id}/admission`,
                "PATCH",
                {
                  commandId: crypto.randomUUID(),
                  expectedRevision: draft.revision,
                  mode: draft.mode,
                  limit: draft.limit,
                  ...(form.get("roomCode")
                    ? { roomCode: form.get("roomCode") }
                    : {}),
                },
              );
              setDraft(null);
              await refresh();
            } catch (e) {
              setError((e as Error).message);
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <div>
              <label htmlFor="admission-mode">Voting access</label>
              <select
                id="admission-mode"
                value={draft.mode}
                disabled={locked || busy}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
              >
                <option value="room_code">
                  People with the show’s room code
                </option>
                <option value="open">Everyone, including remote fans</option>
              </select>
            </div>
            <label htmlFor="contributor-limit">
              Contributor capacity
              <input
                id="contributor-limit"
                type="number"
                min={1}
                max={100}
                required
                disabled={locked || busy}
                value={draft.limit}
                onChange={(e) =>
                  setDraft({ ...draft, limit: Number(e.target.value) })
                }
              />
            </label>
            <label htmlFor="new-room-code">
              {data.admission.codeConfigured
                ? "Replace room code (optional)"
                : "Set room code"}
              <input
                id="new-room-code"
                name="roomCode"
                autoComplete="off"
                placeholder="8–24 letters or numbers"
                maxLength={40}
                disabled={busy}
                required={
                  draft.mode === "room_code" && !data.admission.codeConfigured
                }
              />
            </label>
          </div>
          <p className="tiny muted">
            Tell the audience the code in the room. It is stored as a salted
            hash and cannot be shown again here. Replacing it affects new
            arrivals; already admitted contributors keep their votes. A code can
            be shared and does not prove location. Voting access and capacity
            are fixed after the first round starts.
          </p>
          <button disabled={busy}>Save audience admission</button>
        </form>
      )}
    </section>
  );
}
