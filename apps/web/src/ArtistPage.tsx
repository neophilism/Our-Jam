import { useEffect, useState } from "react";
import { api } from "./api";
import { Leaderboard } from "./Leaderboard";

export function ArtistPage({ id }: { id: string }) {
  const [data, setData] = useState<any>(null),
    [state, setState] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(`/artists/${encodeURIComponent(id)}?state=${state}`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, state]);
  async function more() {
    if (data.nextOffset === null) return;
    setBusy(true);
    try {
      const next = await api(
        `/artists/${encodeURIComponent(id)}?state=${state}&offset=${data.nextOffset}`,
      );
      setData((old: any) => ({
        ...next,
        events: [
          ...old.events,
          ...next.events.filter(
            (e: any) => !old.events.some((v: any) => v.id === e.id),
          ),
        ],
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="artist-page">
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p>Finding the music…</p>
      ) : (
        <>
          <section className="artist-hero">
            <div>
              <span className="eyebrow">THE ARTIST. THE CROWD. THE MUSIC.</span>
              <h1>{data.artist.name}</h1>
              <p>
                {data.artist.bio ||
                  "Every show starts with a signature sound and becomes something we make together."}
              </p>
              <div className="artist-links">
                {data.artist.links.map((l: any) => (
                  <a
                    className="button ghost small"
                    key={l.label + l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {l.label} ↗
                  </a>
                ))}
              </div>
            </div>
            <div className="artist-wave" aria-hidden="true">
              {[24, 42, 68, 90, 64, 100, 74, 40, 60, 25].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
          </section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">KEEP COMING BACK</span>
              <h2>Every room leaves a record.</h2>
            </div>
            <a className="button ghost small" href="/library">
              Your liked tracks ↗
            </a>
          </div>
          <p className="muted">
            Listen from anywhere, explore earlier shows, and keep the free
            tracks. {data.participation}
          </p>
          <nav className="tabs" aria-label="Filter artist sessions">
            {[
              ["all", "All sessions"],
              ["live", "Live now"],
              ["ended", "Archives"],
              ["waiting", "Upcoming"],
            ].map(([value, label]) => (
              <button
                key={value}
                disabled={busy}
                className={state === value ? "active" : ""}
                onClick={() => setState(value)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="archive-grid">
            {data.events.map((event: any) => (
              <article className="card archive-event" key={event.id}>
                <span className="eyebrow">
                  {event.state === "ended"
                    ? "IN THE ARCHIVE"
                    : event.state === "live"
                      ? "LIVE NOW"
                      : "COMING TOGETHER"}
                </span>
                <h3>{event.title}</h3>
                <p>
                  {event.artist_name} · {event.releases} free{" "}
                  {event.releases === 1 ? "track" : "tracks"}
                </p>
                <a
                  className="button"
                  href={`/event/${encodeURIComponent(event.slug)}?listen=1`}
                >
                  Listen & explore ↗
                </a>
                {event.purchase_url && (
                  <a
                    className="text-button"
                    href={event.purchase_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Buy the original album ↗
                  </a>
                )}
              </article>
            ))}
          </div>
          {!data.events.length && (
            <p className="empty">No sessions in this view yet.</p>
          )}
          {data.nextOffset !== null && (
            <button
              className="ghost"
              disabled={busy}
              onClick={() => void more()}
            >
              More sessions
            </button>
          )}
          <Leaderboard artistId={id} />
        </>
      )}
    </main>
  );
}
export function LikedLibrary() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await api("/library"));
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  return (
    <main className="artist-page">
      <span className="eyebrow">YOUR PART OF THE SOUND</span>
      <h1>The tracks you love.</h1>
      <p>
        Likes from this browser’s guest profile stay here. A cleared or expired
        guest session won’t recover this collection yet; download your favorites
        to keep them.
      </p>
      {error && (
        <p role="alert" className="notice">
          {error} <a href="/">Find an event</a>
        </p>
      )}
      {data?.tracks.map((track: any) => (
        <article className="track" key={track.id}>
          <div className="track-info">
            <h2>{track.title}</h2>
            <p>
              <a href={`/artist/${encodeURIComponent(track.artist_id)}`}>
                {track.artist_name}
              </a>{" "}
              · {track.event_title}
            </p>
          </div>
          <a
            className="button"
            href={`/event/${encodeURIComponent(track.slug)}?track=${track.id}`}
          >
            Open track ↗
          </a>
          <a
            className="button ghost"
            href={track.download_url}
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            Download ↓
          </a>
          <button
            className="text-button"
            disabled={busy}
            aria-label={`Remove ${track.title} from likes`}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/releases/${track.id}/reaction`, "PUT", {
                  value: 0,
                });
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Unlike
          </button>
        </article>
      ))}
      {data?.tracks.length === 0 && (
        <p className="empty">
          Like a crowd creation after listening, and it will appear here.
        </p>
      )}
      {data?.nextOffset !== null && data && (
        <button
          className="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await api(`/library?offset=${data.nextOffset}`);
              setData((old: any) => ({
                ...next,
                tracks: [
                  ...old.tracks,
                  ...next.tracks.filter(
                    (r: any) => !old.tracks.some((v: any) => v.id === r.id),
                  ),
                ],
              }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          More liked tracks
        </button>
      )}
    </main>
  );
}
export function ArtistEditor() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function load() {
    setData(await api("/operator/artist"));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  return (
    <details className="card artist-editor">
      <summary>Your public artist page</summary>
      <p>
        Your artist page collects your sessions and music links. Individual
        events keep their own displayed artist names.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {saved && <p role="status">Artist page saved.</p>}
      {data && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSaved(false);
            try {
              await api("/operator/artist", "PATCH", {
                commandId: crypto.randomUUID(),
                expectedRevision: data.profile_revision,
                name: data.name,
                bio: data.bio,
                links: data.links,
              });
              await load();
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Artist page name
            <input
              required
              maxLength={100}
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
            />
          </label>
          <label>
            About your music
            <textarea
              maxLength={1200}
              rows={4}
              value={data.bio}
              onChange={(e) => setData({ ...data, bio: e.target.value })}
            />
          </label>
          {data.links.map((link: any, i: number) => (
            <fieldset className="form-grid" key={i}>
              <legend>Music link {i + 1}</legend>
              <label>
                Link label
                <input
                  required
                  maxLength={40}
                  value={link.label}
                  onChange={(e) =>
                    setData({
                      ...data,
                      links: data.links.map((l: any, j: number) =>
                        j === i ? { ...l, label: e.target.value } : l,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Link URL
                <input
                  type="url"
                  required
                  value={link.url}
                  onChange={(e) =>
                    setData({
                      ...data,
                      links: data.links.map((l: any, j: number) =>
                        j === i ? { ...l, url: e.target.value } : l,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setData({
                    ...data,
                    links: data.links.filter((_: any, j: number) => j !== i),
                  })
                }
              >
                Remove music link
              </button>
            </fieldset>
          ))}
          <div className="artist-links">
            <button
              type="button"
              className="ghost small"
              disabled={busy || data.links.length >= 6}
              onClick={() =>
                setData({
                  ...data,
                  links: [...data.links, { label: "", url: "" }],
                })
              }
            >
              Add music link
            </button>
            <button disabled={busy}>Save artist page</button>
            <button
              type="button"
              disabled={busy}
              className="text-button"
              onClick={() => void load().catch((e) => setError(e.message))}
            >
              Reload artist fields
            </button>
            <a
              className="text-button"
              href={`/artist/${encodeURIComponent(data.id)}`}
              target="_blank"
              rel="noopener"
            >
              View artist page ↗
            </a>
          </div>
        </form>
      )}
    </details>
  );
}
