import { useEffect, useRef, useState } from "react";
import { api, type EventState } from "./api";
const plans = {
  platform: "Platform sponsors",
  ad_free: "Ad-free",
  own_sponsors: "Your own sponsors",
};
type Tier = keyof typeof plans;
const money = (c: number, currency = "usd") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(c / 100);
async function uploadVideo(prefix: string, name: string, file: File) {
  const r = await fetch(
    `/api/${prefix}/sponsor-videos?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/octet-stream" },
      body: file,
    },
  );
  const value = await r.json();
  if (!r.ok) throw new Error(value.message ?? "Video upload failed.");
  return value;
}
function VideoUpload({
  prefix,
  done,
  disabled = false,
}: {
  prefix: string;
  done: () => Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = e.currentTarget,
          d = new FormData(f),
          file = d.get("video") as File;
        if (!file?.size) return;
        setBusy(true);
        setError("");
        try {
          await uploadVideo(prefix, String(d.get("sponsor")), file);
          f.reset();
          await done();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Sponsor name
        <input
          name="sponsor"
          required
          maxLength={100}
          disabled={busy || disabled}
        />
      </label>
      <label>
        Silent video ad (MP4)
        <input
          name="video"
          type="file"
          accept="video/mp4,.mp4"
          required
          disabled={busy || disabled}
        />
      </label>
      <p className="tiny">
        1–60 seconds, up to 64 MiB. Any audio is removed during preparation.
        Uploads stay unpublished until you publish them.
      </p>
      <button disabled={busy || disabled}>
        {busy ? "Preparing silent video…" : "Upload sponsor video"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function EventCommerce({ data }: { data: EventState }) {
  const [enabled, setEnabled] = useState(false),
    [tier, setTier] = useState<Tier>("platform"),
    [state, setState] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[] | null>(null);
  const command = useRef({ hash: "", id: "" });
  async function load() {
    const s = await api(
      `/operator/events/${data.event.id}/commerce?tier=${tier}`,
    );
    setState(s);
  }
  useEffect(() => {
    api("/commerce-capabilities")
      .then(() => setEnabled(true))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let valid = true;
    const read = () =>
      api(`/operator/events/${data.event.id}/commerce?tier=${tier}`)
        .then((s) => {
          if (valid) setState(s);
        })
        .catch((e) => {
          if (valid) setError(e.message);
        });
    void read();
    const t = setInterval(() => {
      if (!document.hidden) void read();
    }, 5000);
    return () => {
      valid = false;
      clearInterval(t);
    };
  }, [enabled, data.event.id, data.event.revision, tier]);
  if (!enabled) return null;
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const q = state?.quote;
  return (
    <section className="panel commerce-panel">
      <span className="eyebrow">ARTIST EVENT ACCESS · FANS ALWAYS FREE</span>
      <h3>Your event plan</h3>
      <p>
        Event pricing uses the combined, verified duration of your uploaded
        setlist, rounded up to the next minute. This purchase covers this event;
        it is not a subscription.
      </p>
      <label htmlFor="event-commerce-plan">Event plan</label>
      <select
        id="event-commerce-plan"
        value={tier}
        disabled={busy}
        onChange={(e) => setTier(e.target.value as Tier)}
      >
        {Object.entries(plans).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      {state && (
        <>
          <p role="status">
            {state.access.paid
              ? `Event access ready · ${plans[state.access.tier as Tier]}`
              : "Event payment required before starting the show."}
          </p>
          {q && (
            <p>
              {q.billableMinutes} setlist minutes ·{" "}
              {money(q.rateCents, q.currency)} per minute · total{" "}
              {money(q.totalCents, q.currency)}
              {q.creditCents > 0
                ? ` · already paid ${money(q.creditCents, q.currency)}`
                : ""}{" "}
              · due {money(q.amountCents, q.currency)}
            </p>
          )}
          {!q?.verified && (
            <p>
              Upload every song first so the price uses its actual audio length.
            </p>
          )}
          {state.selectedPlanPaid ? (
            <button
              disabled={
                busy ||
                data.event.state !== "waiting" ||
                state.access.tier === tier
              }
              onClick={() =>
                void action(() =>
                  api(`/operator/events/${data.event.id}/plan`, "PUT", {
                    tier,
                    expectedRevision: state.policy.revision,
                  }),
                )
              }
            >
              {state.access.tier === tier
                ? "Selected plan is ready"
                : "Use this included plan"}
            </button>
          ) : state.pending ? (
            state.pending.checkout_url ? (
              <a className="button" href={state.pending.checkout_url}>
                Resume existing checkout
              </a>
            ) : (
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const value = await api(
                      `/operator/events/${data.event.id}/checkout`,
                      "POST",
                      {
                        commandId: state.pending.command_id,
                        tier: state.pending.tier,
                        quoteHash: state.pending.quote_hash,
                      },
                    );
                    location.assign(value.url);
                  })
                }
              >
                Resume interrupted checkout
              </button>
            )
          ) : (
            <button
              disabled={
                busy ||
                !q?.verified ||
                !q.rateCents ||
                !state.paymentsConfigured ||
                data.event.state !== "waiting"
              }
              onClick={() =>
                void action(async () => {
                  if (command.current.hash !== q.hash)
                    command.current = { hash: q.hash, id: crypto.randomUUID() };
                  const value = await api(
                    `/operator/events/${data.event.id}/checkout`,
                    "POST",
                    { commandId: command.current.id, tier, quoteHash: q.hash },
                  );
                  location.assign(value.url);
                })
              }
            >
              Pay {q ? money(q.amountCents, q.currency) : "for event"} securely
            </button>
          )}
          {!state.paymentsConfigured && (
            <p>
              Checkout has not been configured. No payment will be collected.
            </p>
          )}
          {state.access.paid && state.access.tier === "own_sponsors" && (
            <div>
              <h4>Your sponsors</h4>
              <VideoUpload prefix="operator" done={load} />
              {state.videos.map((v: any) => (
                <div key={v.id} className="sponsor-video-row">
                  <span>
                    {v.sponsor_name} · {Number(v.duration_seconds).toFixed(1)}s
                  </span>
                  <a
                    href={`/api/operator/sponsor-videos/${v.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview
                  </a>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(() =>
                        api(`/operator/sponsor-videos/${v.id}`, "PATCH", {
                          active: !v.active,
                        }),
                      )
                    }
                  >
                    {v.active ? "Unpublish" : "Publish video"}
                  </button>
                  {v.active && (
                    <label>
                      <input
                        type="checkbox"
                        checked={(
                          selected ?? state.policy.own_video_ids
                        ).includes(v.id)}
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked
                              ? [...(old ?? state.policy.own_video_ids), v.id]
                              : (old ?? state.policy.own_video_ids).filter(
                                  (id: string) => id !== v.id,
                                ),
                          )
                        }
                      />
                      Include in this event
                    </label>
                  )}
                </div>
              ))}
              <button
                disabled={busy || data.event.state !== "waiting"}
                onClick={() =>
                  void action(async () => {
                    await api(
                      `/operator/events/${data.event.id}/sponsors`,
                      "PUT",
                      {
                        expectedRevision: state.policy.revision,
                        videoIds: selected ?? state.policy.own_video_ids,
                      },
                    );
                    setSelected(null);
                  })
                }
              >
                Save event sponsors
              </button>
              <p className="tiny">
                Selection order is playback order. Each round keeps the sponsor
                plan it started with.
              </p>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function CommerceAdmin() {
  const [signedIn, setSignedIn] = useState(false),
    [state, setState] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [videos, setVideos] = useState<string[]>([]),
    [artistKey, setArtistKey] = useState("");
  async function load() {
    const s = await api("/admin/commerce");
    setState(s);
    setVideos(s.settings.platform_video_ids);
    setSignedIn(true);
  }
  useEffect(() => {
    void load().catch(() => {});
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="performer-home">
      <section className="card">
        <span className="eyebrow">PLATFORM ADMINISTRATION</span>
        <h1>Event prices & sponsor videos</h1>
        {!signedIn ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                await api("/admin/login", "POST", { token: f.get("token") });
                await load();
              });
            }}
          >
            <label>
              Platform admin credential
              <input
                name="token"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button disabled={busy}>Sign in as administrator</button>
          </form>
        ) : (
          state && (
            <>
              <button
                className="ghost"
                onClick={() =>
                  void action(async () => {
                    await api("/admin/logout", "POST", {});
                    setSignedIn(false);
                    setState(null);
                    setArtistKey("");
                  })
                }
              >
                Sign out
              </button>
              <form
                key={state.settings.revision}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(async () => {
                    await api("/admin/commerce", "PUT", {
                      expectedRevision: state.settings.revision,
                      currency: f.get("currency"),
                      prices: Object.fromEntries(
                        Object.keys(plans).map((k) => [
                          k,
                          Math.round(Number(f.get(k)) * 100),
                        ]),
                      ),
                      breakSeconds: Number(f.get("breakSeconds")),
                      slotSeconds: Number(f.get("slotSeconds")),
                      platformVideoIds: videos,
                    });
                    await load();
                  });
                }}
              >
                <h2>Per-event plans</h2>
                <label>
                  Currency
                  <select
                    name="currency"
                    defaultValue={state.settings.currency}
                  >
                    <option value="usd">USD</option>
                    <option value="eur">EUR</option>
                    <option value="gbp">GBP</option>
                  </select>
                </label>
                {Object.entries(plans).map(([k, label]) => (
                  <label key={k}>
                    {label} · price per setlist minute
                    <input
                      name={k}
                      type="number"
                      min="0.01"
                      max="1000"
                      step="0.01"
                      required
                      defaultValue={state.settings.prices[k] / 100}
                    />
                  </label>
                ))}
                <h2>Sponsor opening</h2>
                <label>
                  Total sponsor seconds
                  <input
                    name="breakSeconds"
                    type="number"
                    min="0"
                    max="120"
                    defaultValue={state.settings.break_seconds}
                    required
                  />
                </label>
                <label>
                  Seconds per video slot
                  <input
                    name="slotSeconds"
                    type="number"
                    min="1"
                    max="60"
                    defaultValue={state.settings.slot_seconds}
                    required
                  />
                </label>
                <p>
                  For three five-second ads, use a 15-second opening and
                  five-second slots. Ads are silent and play over the music.
                  Short videos loop within their slot; the playlist repeats if
                  needed. Pausing the music pauses the countdown.
                </p>
                {state.videos.map((v: any) => (
                  <div key={v.id}>
                    <label>
                      <input
                        type="checkbox"
                        disabled={!v.active}
                        checked={videos.includes(v.id)}
                        onChange={(e) =>
                          setVideos((old) =>
                            e.target.checked
                              ? [...old, v.id]
                              : old.filter((id) => id !== v.id),
                          )
                        }
                      />
                      {v.sponsor_name}
                      {!v.active ? " · unpublished" : ""}
                    </label>
                  </div>
                ))}
                <p className="tiny">
                  Selection order is playback order. Changes apply to future
                  rounds.
                </p>
                <button disabled={busy}>
                  Publish prices & sponsor settings
                </button>
              </form>
              <h2>Platform video library</h2>
              <VideoUpload
                prefix="admin"
                done={load}
                disabled={!state.storageConfigured}
              />
              {state.videos.map((v: any) => (
                <div key={v.id} className="sponsor-video-row">
                  <span>
                    {v.sponsor_name} · {Number(v.duration_seconds).toFixed(1)}s
                  </span>
                  <a
                    href={`/api/admin/sponsor-videos/${v.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview
                  </a>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api(`/admin/sponsor-videos/${v.id}`, "PATCH", {
                          active: !v.active,
                        });
                        await load();
                      })
                    }
                  >
                    {v.active ? "Unpublish" : "Publish video"}
                  </button>
                </div>
              ))}
              <details>
                <summary>Provision an artist access key</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(async () => {
                      const r = await api("/admin/artists", "POST", {
                        name: f.get("name"),
                      });
                      setArtistKey(r.token);
                    });
                  }}
                >
                  <label>
                    Artist name
                    <input name="name" required maxLength={100} />
                  </label>
                  <button disabled={busy}>Create artist</button>
                </form>
                {artistKey && (
                  <p>
                    Save this private key now: <code>{artistKey}</code>
                  </p>
                )}
              </details>
            </>
          )
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
