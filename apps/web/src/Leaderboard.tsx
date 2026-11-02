import { PublicAvatar } from "./ProfilePicture";
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
    [error, setError] = useState(""),
    [timezone, setTimezone] = useState("UTC"),
    [visible, setVisible] = useState(true);
  useEffect(() => {
    let active = true;
    api(
      `/artists/${encodeURIComponent(artistId)}/leaderboard?period=${period}&metric=${metric}${scope === "event" && slug ? "&event=" + encodeURIComponent(slug) : ""}`,
    )
      .then((r) => {
        if (active) {
          setEntries(r.entries);
          setTimezone(r.timezone);
          setVisible(r.visible !== false);
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
      <h2>Meet the Sound Wave creators.</h2>
      <p>
        See whose musical ideas made it into released crowd-created tracks.
        Votes from other listeners count toward each contributor's ranking.
      </p>
      <div className="form-grid">
        <label>
          Time period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">All time</option>
            <option value="week">This week ({timezone})</option>
            <option value="month">This month ({timezone})</option>
          </select>
        </label>
        <label>
          Rank by
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="included">Sound Waves included in new tracks</option>
            <option value="support">Votes from other listeners</option>
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
      {!visible && (
        <p className="empty-inline muted">
          The artist has turned off public leaderboards.
        </p>
      )}
      {visible &&
        entries.map((p, i) => (
          <div className="person" key={p.id}>
            <b>{String(i + 1).padStart(2, "0")}</b>
            <PublicAvatar seed={p.avatarSeed} url={p.avatarUrl} />
            <div>
              <strong>{p.name}</strong>
              <small>
                {p.included} {p.included === 1 ? "Sound Wave" : "Sound Waves"}{" "}
                in released tracks · {p.support}{" "}
                {p.support === 1 ? "vote" : "votes"} from other listeners
              </small>
            </div>
          </div>
        ))}
      {visible && !entries.length && !error && (
        <p className="empty-inline muted">
          Contributors appear here when the artist releases a crowd-created
          track.
        </p>
      )}
    </section>
  );
}
