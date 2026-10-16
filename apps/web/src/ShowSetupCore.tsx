import { measureTrackDuration } from "./track-duration";
import { PurchaseEditor } from "./PurchaseLinks";
import type {
  PurchaseLink,
  PurchaseMode,
} from "../../../packages/contracts/src/purchase-providers";
import { useEffect, useRef, useState } from "react";
import { api, type EventState } from "./api";

export function ShowSetup({
  data,
  refresh,
}: {
  data: EventState;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [album, setAlbum] = useState<any[] | null>(null),
    [settings, setSettings] = useState<EventState["event"] | null>(null),
    [purchaseLinks, setPurchaseLinks] = useState<PurchaseLink[]>([]),
    [purchaseMode, setPurchaseMode] = useState<PurchaseMode>("menu"),
    [preferredPurchaseProvider, setPreferredPurchaseProvider] = useState(""),
    [checks, setChecks] = useState<Record<string, string>>({});
  const checking = useRef<AbortController | null>(null),
    inputRevision = useRef(data.event.revision);
  useEffect(() => {
    checking.current?.abort();
    checking.current = null;
    setChecks({});
    return () => {
      checking.current?.abort();
    };
  }, [data.event.revision]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function loadAlbum() {
    const value = await api(`/operator/events/${data.event.id}/sources`);
    inputRevision.current = value.revision;
    setAlbum(value.sources);
  }
  async function checkAudio() {
    checking.current?.abort();
    const controller = new AbortController();
    checking.current = controller;
    const queue = (data.queue ?? []).filter(
      (q) => q.state === "queued" || q.state === "playing",
    );
    setChecks({});
    let index = 0;
    async function next() {
      while (index < queue.length && !controller.signal.aborted) {
        const item = queue[index++];
        setChecks((old) => ({ ...old, [item.id]: "Checking…" }));
        const result = !item.audio_url
          ? "External player — no linked file"
          : await metadata(
              item.audio_url,
              Number(item.duration_seconds),
              controller.signal,
            );
        if (!controller.signal.aborted)
          setChecks((old) => ({ ...old, [item.id]: result }));
      }
    }
    await Promise.all([next(), next(), next()]);
  }
  return (
    <section className="card show-setup">
      <span className="eyebrow">PREPARE THE ROOM</span>
      <h2>Show setup & audio check</h2>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <details
        onToggle={(e) => {
          if (e.currentTarget.open && !settings) {
            setSettings(structuredClone(data.event));
            setPurchaseLinks(
              (data.event.purchaseLinks as PurchaseLink[]) ??
                (data.event.purchaseUrl
                  ? [{ provider: "other", url: data.event.purchaseUrl }]
                  : []),
            );
            setPurchaseMode(data.event.purchaseMode ?? "menu");
            setPreferredPurchaseProvider(
              data.event.preferredPurchaseProvider ?? "",
            );
          }
        }}
      >
        <summary>Event, screen & participation settings</summary>
        <p className="muted">
          Screen size and album links update immediately. Generation limits,
          release timing and participation time apply to newly opened rounds; an
          active round keeps its original rules.
        </p>
        <button
          className="ghost small"
          disabled={busy}
          onClick={() => {
            setSettings(structuredClone(data.event));
            setPurchaseLinks(
              (data.event.purchaseLinks as PurchaseLink[]) ??
                (data.event.purchaseUrl
                  ? [{ provider: "other", url: data.event.purchaseUrl }]
                  : []),
            );
            setPurchaseMode(data.event.purchaseMode ?? "menu");
            setPreferredPurchaseProvider(
              data.event.preferredPurchaseProvider ?? "",
            );
          }}
        >
          Reload settings fields
        </button>
        {settings && (
          <form
            key={settings.revision}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void action(async () => {
                await api(
                  `/operator/events/${data.event.id}/settings`,
                  "PATCH",
                  {
                    commandId: crypto.randomUUID(),
                    expectedRevision: settings.revision,
                    title: form.get("title"),
                    artistName: form.get("artistName"),
                    purchaseUrl: null,
                    purchaseLinks,
                    purchaseMode,
                    preferredPurchaseProvider:
                      purchaseMode === "direct"
                        ? preferredPurchaseProvider
                        : null,
                    releaseMode: form.get("releaseMode"),
                    ...Object.fromEntries(
                      [
                        "screenLimit",
                        "minimumRoundSeconds",
                        "maxWaves",
                        "maxGenerations",
                      ].map((k) => [k, Number(form.get(k))]),
                    ),
                  },
                );
                setSettings(null);
              });
            }}
          >
            <div className="form-grid">
              <label>
                Event title
                <input
                  name="title"
                  defaultValue={settings.title}
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Artist name
                <input
                  name="artistName"
                  defaultValue={settings.artistName}
                  required
                  maxLength={100}
                />
              </label>
              <div>
                <label htmlFor="release-mode">Crowd release timing</label>
                <select
                  id="release-mode"
                  name="releaseMode"
                  defaultValue={settings.settings.releaseMode ?? "boundary"}
                >
                  <option value="boundary">
                    Together at the next track boundary
                  </option>
                  <option value="immediate">
                    As soon as the audio is ready
                  </option>
                  <option value="review">Hold for my approval</option>
                </select>
              </div>
              <PurchaseEditor
                links={purchaseLinks}
                onChange={setPurchaseLinks}
                disabled={busy}
                mode={purchaseMode}
                onModeChange={setPurchaseMode}
                preferredProvider={preferredPurchaseProvider}
                onPreferredChange={setPreferredPurchaseProvider}
              />
              {(
                [
                  ["screenLimit", "Waves visible on screen", 4, 60],
                  [
                    "minimumRoundSeconds",
                    "Minimum participation seconds",
                    0,
                    300,
                  ],
                  ["maxWaves", "Maximum Sound Waves in a generation", 1, 12],
                  [
                    "maxGenerations",
                    "Maximum generations for this event",
                    0,
                    100,
                  ],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    name={key}
                    type="number"
                    min={min}
                    max={max}
                    step={1}
                    required
                    defaultValue={settings.settings[key]}
                  />
                </label>
              ))}
            </div>
            <button disabled={busy}>Save show settings</button>
          </form>
        )}
      </details>
      <details
        onToggle={(e) => {
          if (e.currentTarget.open && !album) void action(loadAlbum);
        }}
      >
        <summary>Album files & private signature prompts</summary>
        <p className="muted">
          You can edit a track until its first round starts. Earlier rounds and
          signature prompts remain fixed.
        </p>
        <button
          className="ghost small"
          disabled={busy}
          onClick={() => void action(loadAlbum)}
        >
          Reload album fields
        </button>
        {album?.map((s, i) => (
          <form
            key={s.id}
            className="source-form"
            onSubmit={(e) => {
              e.preventDefault();
              const source = album[i];
              void action(async () => {
                await api(`/operator/sources/${source.id}`, "PATCH", {
                  commandId: crypto.randomUUID(),
                  expectedRevision: inputRevision.current,
                  title: source.title,
                  corePrompt: source.core_prompt,
                  audioUrl: source.audio_url || undefined,
                  durationSeconds:
                    source.audio_url &&
                    !new URL(
                      source.audio_url,
                      location.origin,
                    ).pathname.startsWith("/api/operator/sources/")
                      ? await measureTrackDuration(source.audio_url, 15)
                      : Number(source.duration_seconds),
                });
                setAlbum(null);
              });
            }}
          >
            <h3>
              {s.title}
              {s.played ? " · already played" : ""}
            </h3>
            {(
              [
                ["title", "Track title"],
                ["audio_url", "Track audio URL (HTTPS)"],
                ["core_prompt", "Private signature prompt"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                {key === "core_prompt" ? (
                  <textarea
                    disabled={s.played || busy}
                    maxLength={3000}
                    required
                    rows={3}
                    value={s[key]}
                    onChange={(e) =>
                      setAlbum((a) =>
                        a!.map((v, j) =>
                          j === i ? { ...v, [key]: e.target.value } : v,
                        ),
                      )
                    }
                  />
                ) : (
                  <input
                    disabled={s.played || busy}
                    required={key !== "audio_url"}
                    type={key === "audio_url" ? "url" : "text"}
                    value={s[key] ?? ""}
                    onChange={(e) =>
                      setAlbum((a) =>
                        a!.map((v, j) =>
                          j === i ? { ...v, [key]: e.target.value } : v,
                        ),
                      )
                    }
                  />
                )}
              </label>
            ))}
            <p className="tiny">
              Duration:{" "}
              {s.audio_url
                ? `${s.duration_seconds} seconds · measured from audio when saved or uploaded`
                : "Waiting for audio upload; upload before opening this track’s round."}
            </p>
            <button disabled={s.played || busy}>Save album track</button>
          </form>
        ))}
      </details>
      <div className="section-heading">
        <h3>Check linked audio</h3>
        <button className="ghost small" onClick={() => void checkAudio()}>
          Check this device’s audio links
        </button>
      </div>
      <p className="muted">
        Loads metadata without playing sound. This checks file access and
        timing, not full-file decoding, offline availability or speaker routing.
      </p>
      <ul className="audio-checks">
        {data.queue
          ?.filter((q) => q.state === "queued" || q.state === "playing")
          .map((q) => (
            <li key={q.id}>
              <strong>{q.title}</strong>
              <span>{checks[q.id] ?? "Not checked on this device"}</span>
            </li>
          ))}
      </ul>
    </section>
  );
}
function metadata(
  url: string,
  expected: number,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let done = false;
    const finish = (result: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      resolve(result);
    };
    const aborted = () => finish("Cancelled");
    const timer = setTimeout(
      () => finish("Could not load within 10 seconds"),
      10000,
    );
    audio.preload = "metadata";
    audio.onerror = () =>
      finish("Could not load — check the link or file format");
    audio.onloadedmetadata = () =>
      finish(
        !Number.isFinite(audio.duration)
          ? "Unknown duration — use a fixed-length file"
          : Math.abs(audio.duration - expected) > 2
            ? `Duration mismatch: file ${audio.duration.toFixed(1)}s / round ${expected}s`
            : `Metadata OK · ${audio.duration.toFixed(1)}s`,
      );
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    else audio.src = url;
  });
}
