import { useEffect, useState } from "react";
import { api } from "./api";
export function Leaderboard({
  artistId,
  slug,
}: {
  artistId: string;
  slug?: string;
}) {
  const [period, setPeriod] = useState("all"),
    [metric, setMetric] = useState("included"),
    [scope, setScope] = useState("artist"),
    [entries, setEntries] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(
      `/artists/${encodeURIComponent(artistId)}/leaderboard?period=${period}&metric=${metric}${scope === "event" && slug ? "&event=" + encodeURIComponent(slug) : ""}`,
    )
      .then((r) => {
        if (active) {
          setEntries(r.entries);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [artistId, slug, period, metric, scope]);
  return (
    <section className="leaderboard card">
      <span className="eyebrow">THE IDEAS THAT BECAME MUSIC</span>
      <h2>Your mark on the sound.</h2>
      <p>
        Credit settles when a track is released. Support counts final points
        from other people.
      </p>
      <div className="form-grid">
        <label>
          Time period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">All time</option>
            <option value="week">This week (UTC)</option>
            <option value="month">This month (UTC)</option>
          </select>
        </label>
        <label>
          Rank by
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="included">Waves in released tracks</option>
            <option value="support">Support from others</option>
          </select>
        </label>
        <label>
          Collection
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="artist">All this artist's shows</option>
            {slug && <option value="event">This show</option>}
          </select>
        </label>
      </div>
      {error && <p className="notice">{error}</p>}
      {entries.map((p, i) => (
        <div className="person" key={p.id}>
          <b>{String(i + 1).padStart(2, "0")}</b>
          <span className="avatar" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((n) => (
              <i
                key={n}
                style={{ height: 8 + (p.avatarSeed.charCodeAt(n) % 18) }}
              />
            ))}
          </span>
          <div>
            <strong>{p.name}</strong>
            <small>
              {p.included} waves included · {p.support} points from others
            </small>
          </div>
        </div>
      ))}
      {!entries.length && !error && (
        <p className="empty-inline muted">
          The first released crowd track will put its contributors on the board.
        </p>
      )}
    </section>
  );
}
