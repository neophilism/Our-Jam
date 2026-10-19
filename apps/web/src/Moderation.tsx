import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
export function Moderation({ eventId }: { eventId: string }) {
  const [data, setData] = useState<{ waves: any[]; comments: any[]; releases: any[] } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setData(await api(`/operator/events/${eventId}/moderation`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [eventId]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function toggle(kind: string, id: string, hidden: boolean) {
    setBusy(true);
    try {
      await api(`/operator/${kind}/${id}/moderate`, "POST", { hidden });
      setError("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function hideWave(id: string) {
    setBusy(true);
    try {
      await api(`/operator/waves/${id}/hide`, "POST", {});
      setError("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card moderation">
      <span className="eyebrow">LOOK AFTER THE ROOM</span>
      <h2>Community review</h2>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <h3>Live Sound Waves</h3>
      <p className="tiny muted">Hiding a phrase removes its votes and returns them to listeners
        for reallocation while the round is open.</p>
      {data?.waves.map((wave) => (
        <article className="review-item" key={wave.id}>
          <strong>{wave.text}</strong>
          {wave.moderated ? <span>Hidden</span> : (
            <button className="ghost small" disabled={busy}
              onClick={() => void hideWave(wave.id)}>Hide Sound Wave</button>
          )}
        </article>
      ))}
      {data && !data.waves.length && <p className="muted">No Sound Waves in the live round.</p>}
      <h3>Reported & hidden comments</h3>
      {data?.comments.map((c) => (
        <article className="review-item" key={c.id}>
          <strong>{c.title}</strong>
          <p>{c.body}</p>
          {c.reports?.map((reason: string, i: number) => (
            <small key={i}>Report: {reason}</small>
          ))}
          <button
            className="ghost small"
            disabled={busy}
            onClick={() => void toggle("comments", c.id, !c.hidden)}
          >
            {c.hidden ? "Restore comment" : "Hide comment"}
          </button>
        </article>
      ))}
      {data && !data.comments.length && (
        <p className="muted">No comments need review.</p>
      )}
      <details>
        <summary>Release visibility</summary>
        <p className="tiny muted">
          Hiding removes a track from the public collection and leaderboard.
          Existing downloads cannot be recalled; issued listening links may work
          for up to five minutes.
        </p>
        {data?.releases.map((r) => (
          <div className="review-item" key={r.id}>
            <strong>{r.title}</strong>
            <span>
              {r.hidden
                ? "Hidden"
                : r.published_at
                  ? "Public"
                  : "Awaiting boundary"}
            </span>
            <button
              className="ghost small"
              disabled={busy}
              onClick={() => void toggle("releases", r.id, !r.hidden)}
            >
              {r.hidden ? "Restore release" : "Hide release"}
            </button>
          </div>
        ))}
      </details>
    </section>
  );
}
