import { useEffect, useRef, useState } from "react";
import type { EventState } from "./api";
import {
  albumCopies,
  saveAlbumCopy,
  removeAlbumCopy,
  verifiedAlbumCopy,
  type AlbumCopyInfo,
} from "./album-cache";
type Source = { id: string; title: string; duration: number };
export function AlbumBackup({
  data,
  active,
  onBegin,
  onEnd,
}: {
  data: EventState;
  active: boolean;
  onBegin: (sourceId: string) => void;
  onEnd: () => void;
}) {
  const [copies, setCopies] = useState<AlbumCopyInfo[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [current, setCurrent] = useState<Source | null>(null),
    [auto, setAuto] = useState(true),
    [persistent, setPersistent] = useState("");
  const audio = useRef<HTMLAudioElement>(null),
    url = useRef<string | null>(null),
    sequence = useRef<Source[]>([]),
    operation = useRef(0);
  const sources: Source[] = Array.from(
    new Map(
      (data.queue ?? [])
        .filter((q) => q.source_id && q.state !== "removed")
        .map((q) => [
          q.source_id,
          {
            id: q.source_id,
            title: q.title,
            duration: Number(q.duration_seconds),
          },
        ]),
    ).values(),
  );
  async function refresh() {
    setCopies(await albumCopies(data.event.id));
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    return () => {
      operation.current++;
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, [data.event.id]);
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
  async function play(source: Source, replaceSequence = true) {
    const attempt = ++operation.current;
    setBusy(true);
    setError("");
    try {
      const copy = await verifiedAlbumCopy(data.event.id, source.id);
      if (attempt !== operation.current) return;
      if (replaceSequence) sequence.current = sources;
      onBegin(source.id);
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(copy.blob);
      setCurrent(source);
      audio.current!.src = url.current;
      try {
        await audio.current!.play();
      } catch {
        setError("Tap Play in the backup player to allow local audio.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function stop() {
    operation.current++;
    audio.current?.pause();
    audio.current?.removeAttribute("src");
    audio.current?.load();
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setCurrent(null);
    onEnd();
  }
  return (
    <section className="card album-backup" aria-label="Local album backup">
      <span className="eyebrow">KEEP THE SHOW MOVING</span>
      <h2>Your local album backup.</h2>
      <p>
        Choose original files from this device before the show. Copies stay in
        this browser. Keep this page open: reloading while offline cannot reopen
        the console yet.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {active && (
        <p className="notice" role="status">
          LOCAL BACKUP MODE · Live control is released and audience rounds pause
          when the server receives the release or the controller lease expires.
          Backup playback does not submit generations or advance the online
          queue.
        </p>
      )}
      <audio
        ref={audio}
        controls
        aria-label="Local backup audio"
        onEnded={() => {
          if (auto && current) {
            const i = sequence.current.findIndex((s) => s.id === current.id),
              next = sequence.current[i + 1];
            if (next) void play(next, false);
          }
        }}
      />
      {current && (
        <p>
          <strong>Backup playing: {current.title}</strong>
        </p>
      )}
      <div className="player-actions">
        <label className="check">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Continue through the prepared album order
        </label>
        {active && (
          <button className="ghost" onClick={stop}>
            Stop backup & return to live controls
          </button>
        )}
      </div>
      <button
        className="ghost small"
        onClick={async () => {
          try {
            const ok = await navigator.storage?.persist?.();
            setPersistent(
              ok
                ? "This browser granted persistent storage. Keep your original files too."
                : "Persistent storage was not granted. The browser may remove these copies.",
            );
          } catch {
            setPersistent("Persistent storage is unavailable in this browser.");
          }
        }}
      >
        Request persistent local storage
      </button>
      {persistent && (
        <p className="muted" role="status">
          {persistent}
        </p>
      )}
      <div className="backup-list">
        {sources.map((source) => {
          const copy = copies.find((c) => c.sourceId === source.id);
          return (
            <div className="backup-track" key={source.id}>
              <h3>{source.title}</h3>
              <label>
                Local file for {source.title}
                <input
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
                  disabled={busy || active}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    setError("");
                    try {
                      await saveAlbumCopy(data.event.id, source.id, file);
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
              <p className="muted">
                {copy
                  ? `${copy.name} · ${copy.duration.toFixed(1)}s · ${(copy.bytes / 1024 / 1024).toFixed(1)} MB saved`
                  : "No local copy yet"}
              </p>
              {copy && Math.abs(copy.duration - source.duration) > 2 && (
                <p className="notice">
                  File duration differs from the album setup. Check that this is
                  the intended file.
                </p>
              )}
              <div className="player-actions">
                <button
                  className="ghost small"
                  disabled={busy || !copy}
                  onClick={() => void play(source)}
                >
                  Play backup: {source.title}
                </button>
                {copy && (
                  <button
                    className="text-button"
                    disabled={busy || active}
                    onClick={async () => {
                      try {
                        await removeAlbumCopy(data.event.id, source.id);
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Remove local copy
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
