import { PurchaseEditor, PurchaseChoices, PurchaseLanding } from "./PurchaseLinks";
import { preferredPurchaseUrl, type PurchaseLink, type PurchaseMode } from "../../../packages/contracts/src/purchase-providers";
import "./purchase-links.css";
import {
  AudioRouting,
  useAudioRouting,
  HeadphonePreview,
} from "./AudioRouting";
import { Account } from "./Account";
import { VisualPreferences } from "./VisualPreferences";
import { AdmissionSettings } from "./AdmissionSettings";
import { PlatformAdmin } from "./PlatformAdmin";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import {
  api,
  ensureGuest,
  type EventState,
  type Release,
  type Wave,
} from "./api";
import { WaveField } from "./Visual";
import "./style.css";
import { Moderation } from "./Moderation";
import { Leaderboard } from "./Leaderboard";
import { useAudioPulse } from "./AudioPulse";
import {
  FeedbackNudge,
  rememberFeedback,
  resolveFeedback,
  listenerPresence,
} from "./FeedbackNudge";
import { ShowPlayer } from "./ShowPlayer";
import { ShowSetup } from "./ShowSetup";
import { RehearsalReadiness } from "./RehearsalReadiness";
import { useEvent } from "./useEvent";
import { ArtistPage, ArtistEditor, LikedLibrary } from "./ArtistPage";
import { ReleaseEmail, EmailAction, EmailStatus } from "./ReleaseEmail";
import { ReleaseNotice } from "./ReleaseNotice";
import { Recorder } from "./Recorder";
import { AlbumBackup } from "./AlbumBackup";
import { GuidedHelp } from "./GuidedHelp";

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      {[12, 22, 31, 22, 12].map((h, i) => (
        <i key={i} style={{ height: h }} />
      ))}
    </span>
  );
}
function Brand() {
  return (
    <a className="brand" href="/" aria-label="Our Jam home">
      <Mark />
      our jam
    </a>
  );
}
function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header>
      <Brand />
      <div className="header-right">
        {children ?? (
          <>
            <a className="small text-button" href="/library">
              Your likes
            </a>
            <a className="button small ghost" href="/performer">
              Performer ↗
            </a>
          </>
        )}
        <GuidedHelp />
        <VisualPreferences />
      </div>
    </header>
  );
}
function Notice({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="notice">
      {error}
    </div>
  ) : null;
}
function QR({ url, label }: { url: string; label: string }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: { dark: "#151612", light: "#ffffff" },
    })
      .then(setImage)
      .catch(() => setImage(""));
  }, [url]);
  return (
    <a className="qr" href={url}>
      {image && <img src={image} alt={`${label} QR code`} />}
      <strong>{label}</strong>
    </a>
  );
}
function Avatar({ seed = "music" }: { seed?: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i
          key={i}
          style={{ height: 7 + (seed.charCodeAt(i % seed.length) % 18) }}
        />
      ))}
    </span>
  );
}
function Home() {
  const [events, setEvents] = useState<any[]>([]),
    [code, setCode] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api("/events")
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <Header />
      <main className="home">
        <div className="eyebrow">
          <span className="live-dot" /> A NEW WAY TO BE PART OF THE MUSIC
        </div>
        <section className="hero">
          <div className="hero-copy">
            <h1>
              Jam with the music
              <br />
              <em>you love.</em>
            </h1>
            <p>
              Hear a song. Imagine a new direction. Add your own
              musical idea—a Sound Wave—and vote for the ideas you want to hear.
              Together, shape what the music becomes next.
            </p>
            <form
              className="join-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim())
                  location.href =
                    "/event/" + encodeURIComponent(code.trim().toLowerCase());
              }}
            >
              <label className="sr-only" htmlFor="event-code">
                Event code
              </label>
              <input
                id="event-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter an event code"
                required
              />
              <button>Join the jam ↗</button>
            </form>
            <div className="tiny muted">
              No instrument needed. No app to download. Just bring an idea.
            </div>
          </div>
          <div className="hero-art">
            <WaveField waves={[]} />
            <span className="art-caption">
              ONE ROOM. A THOUSAND POSSIBILITIES.
            </span>
          </div>
        </section>
        <section className="ourjam-explainer" aria-labelledby="what-is-ourjam">
          <span className="eyebrow">WHAT IS OURJAM?</span>
          <h2 id="what-is-ourjam">The song you know. A sound no one has heard.</h2>
          <p>
            OurJam lets you jam with an artist's <strong>music itself</strong>.
            While a song plays, everyone listening can share a musical idea
            in the same creative space. We call each idea a <strong>Sound Wave</strong>:
            a new beat, an unexpected instrument, a different groove, or a whole new mood.
          </p>
          <p>
            Add your Sound Wave and vote for the ideas you love. When the song
            ends, the most popular Sound Waves can guide our music-generation
            technology in creating a new track inspired by the music you just heard.
            Listen to the crowd's creation in OurJam, vote for your favorite new tracks,
            and discover what happens when an artist brings one into the live mix.
          </p>
          <p className="explainer-invitation">
            You don't need to be a musician. You just need to hear a possibility.
          </p>
        </section>
        <section className="how" aria-label="How OurJam works">
          <div>
            <b>01</b>
            <h3>Listen. Imagine.</h3>
            <p>Hear the song the artist is playing. What would you love to add?</p>
          </div>
          <div>
            <b>02</b>
            <h3>Share a Sound Wave.</h3>
            <p>Suggest a rhythm, instrument, or mood. Vote on the crowd's ideas.</p>
          </div>
          <div>
            <b>03</b>
            <h3>Hear what happens next.</h3>
            <p>
              Play the new tracks inspired by the crowd's favorite ideas.
              Vote for the ones you'd love to hear again.
            </p>
          </div>
        </section>
        <section className="event-list">
          <div className="section-heading">
            <h2>Find your room</h2>
            <span className="muted">Live jams, upcoming shows, and music created together</span>
          </div>
          <Notice error={error} />
          {events.length ? (
            events.map((e) => (
              <a className="event-card" href={"/event/" + e.slug} key={e.id}>
                <div>
                  <span className="eyebrow">
                    {e.state === "live"
                      ? "● LIVE NOW"
                      : e.state === "ended"
                        ? "EVENT COLLECTION"
                        : "UP NEXT"}
                  </span>
                  <h3>{e.title}</h3>
                  <p>{e.artist_name}</p>
                </div>
                <span className="big-arrow">↗</span>
              </a>
            ))
          ) : (
            <div className="empty">
              <h3>Ready when your favorite artist is.</h3>
              <p>Scan the QR code at a show or enter an event code to start jamming with the music.</p>
            </div>
          )}
        </section>
      </main>
      <footer>
        OUR JAM <span>Listen. Imagine. Make something new together.</span>
        <a href="/performer">Start a session ↗</a>
      </footer>
    </>
  );
}
function Profile({ close }: { close: () => void }) {
  const [name, setName] = useState(""),
    [anonymous, setAnonymous] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    ensureGuest()
      .then(() => api("/session"))
      .then((r) => {
        setName(r.profile.name === "Anonymous" ? "" : r.profile.name);
        setAnonymous(r.profile.anonymous);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <button
          className="close ghost"
          onClick={close}
          aria-label="Close profile"
        >
          ×
        </button>
        <span className="eyebrow">YOUR PLACE IN THE ROOM</span>
        <h2 id="profile-title">Make your mark.</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/profile", "PATCH", {
                name: name || "Anonymous",
                anonymous,
              });
              close();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Your display name
            <input
              autoFocus
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should the crowd call you?"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            Show my contributions as Anonymous
          </label>
          <Notice error={error} />
          <button className="full">Save profile</button>
        </form>
        <p className="tiny muted">
          Your musical avatar is created automatically. Guest profiles stay with
          this browser. <a href="/account">Save or recover your profile ↗</a>
        </p>
      </section>
    </div>
  );
}
function useServerNow(serverTime?: string) {
  const [elapsed, setElapsed] = useState(0);
  const anchor = useRef(performance.now());
  useEffect(() => {
    anchor.current = performance.now();
    setElapsed(0);
    const t = setInterval(
      () => setElapsed(performance.now() - anchor.current),
      500,
    );
    return () => clearInterval(t);
  }, [serverTime]);
  return (serverTime ? new Date(serverTime).getTime() : Date.now()) + elapsed;
}
function Countdown({ data }: { data: EventState }) {
  const now = useServerNow(data.serverTime);
  const r = data.round;
  const seconds = r
    ? Math.max(
        0,
        Math.ceil(
          (r.state === "paused"
            ? (r.remainingMs ?? 0)
            : new Date(r.deadlineAt).getTime() - now) / 1000,
        ),
      )
    : 0;
  const running = r && ["open", "paused"].includes(r.state);
  return (
    <span className="countdown">
      {running
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : "—:—"}
      <small>
        {r?.state === "paused"
          ? "VOTING PAUSED"
          : r?.state === "open"
            ? "TIME LEFT TO VOTE"
            : "ROUND CLOSED"}
      </small>
    </span>
  );
}
function Audience({ slug }: { slug: string }) {
  const { data, error, setError, refresh, connected, fresh } = useEvent(slug);
  const [tab, setTab] = useState(
      new URLSearchParams(location.search).has("track") ||
        new URLSearchParams(location.search).has("listen")
        ? "tracks"
        : "waves",
    ),
    [text, setText] = useState(""),
    [editingWaveId, setEditingWaveId] = useState<string | null>(null),
    [editingWaveText, setEditingWaveText] = useState(""),
    [busy, setBusy] = useState(false),
    [profile, setProfile] = useState(false),
    [moveFrom, setMoveFrom] = useState(""),
    [roomCode, setRoomCode] = useState("");
  const now = useServerNow(data?.serverTime);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  if (!data)
    return (
      <>
        <Header />
        <main className="loading">
          <h2>Finding your room…</h2>
          <Notice error={error} />
        </main>
      </>
    );
  const round = data.round;
  const waves = round?.waves ?? [];
  const used = waves.reduce((n, w) => n + w.mine, 0);
  const voteLimit = round?.voteLimit ??
    (data.event.settings.voteMode === "single" ? data.event.settings.votesPerListener ?? 5 : 5);
  const singleVote = (round?.voteMode ?? data.event.settings.voteMode) === "single";
  const votesLeft = Math.max(0, voteLimit - used);
  const open =
    fresh &&
    round?.state === "open" &&
    new Date(round.deadlineAt).getTime() > now;
  const vote = (wave: Wave, delta: number) =>
    action(async () => {
      if (!round) return;
      const allocations = Object.fromEntries(
        waves.filter((w) => w.mine > 0).map((w) => [w.id, w.mine]),
      );
      const n = (allocations[wave.id] ?? 0) + delta;
      if (n > 0) allocations[wave.id] = n;
      else delete allocations[wave.id];
      await api(`/rounds/${round.id}/allocations`, "PUT", {
        commandId: crypto.randomUUID(),
        expectedRevision: round.revision,
        allocations,
      });
    });
  return (
    <>
      <Header>
        <span className={"connection " + (connected ? "online" : "")}>
          {connected ? "Live connection" : "Reconnecting"}
        </span>
        <button className="small ghost" onClick={() => setProfile(true)}>
          Your profile
        </button>
      </Header>
      <main className="audience">
        <div className="event-heading">
          <div>
            <div className="eyebrow">
              <a href={`/artist/${encodeURIComponent(data.event.artistId)}`}>
                {data.event.artistName}
              </a>{" "}
              /{" "}
              {data.event.state === "live"
                ? "LIVE CO-CREATION"
                : "OUR JAM SESSION"}
            </div>
            <h1>{data.event.title}</h1>
            <p>
              {data.current ? (
                <>
                  Now playing <strong>{data.current.title}</strong>
                </>
              ) : (
                "The next song is waiting. When it starts, you can help shape what comes after."
              )}
            </p>
          </div>
          <Countdown data={data} />
        </div>
        <p className="audience-intro">
          You're not just listening to this song—you're helping imagine its next version.
          Share a musical idea (a Sound Wave), or vote for the ideas you want to hear.
        </p>
        <nav className="tabs" aria-label="Event sections">
          {[
            ["waves", "Sound Waves"],
            ["tracks", `Our tracks · ${data.releases.length}`],
            ["people", "The room"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          <span>{data.people} joined</span>
        </nav>
        <Notice error={error} />
        <p className="muted admission-rule" role="status">
          {data.admission.mode === "open"
            ? "Anyone with the event link can share Sound Waves and vote."
            : "To share Sound Waves or vote, enter the show’s room code. Listening is open to everyone."}
          {` ${data.admission.contributors} / ${data.admission.limit} contributor places filled.`}
        </p>
        {!fresh && (
          <p className="notice" role="status">
            The room is reconnecting. Voting resumes when its current state
            arrives.
          </p>
        )}
        {tab === "waves" && (
          <div className="collaboration">
            <section className="crowd-scene">
              <div className="scene-bar">
                <span>
                  <i className="live-dot" /> THE SOUND WE'RE SHAPING
                </span>
                <span>{waves.length} waves</span>
              </div>
              <WaveField
                waves={waves}
                limit={matchMedia("(max-width: 650px)").matches ? 4 : 9}
              />
              <div className="scene-footer">
                {open
                  ? "These are the ideas people are voting for. The top Sound Waves can help shape the next track."
                  : round?.state === "paused"
                    ? "The music is paused. Your votes are saved."
                    : data.event.state === "waiting"
                      ? "The artist will open the first round when the music starts."
                      : "Voting for this song is closed. Follow along for the next round."}
              </div>
            </section>
            <aside className="vote-panel">
              <div className="section-heading">
                <h2>Vote on Sound Waves</h2>
                <span className="point-count">
                  {votesLeft}
                  <small>VOTES LEFT</small>
                </span>
              </div>
              <div className="vote-progress" role="progressbar"
                aria-label={`${votesLeft} of ${voteLimit} votes remaining`}
                aria-valuemin={0} aria-valuemax={voteLimit} aria-valuenow={votesLeft}>
                <span style={{ width: `${(votesLeft / voteLimit) * 100}%` }} />
              </div>
              <p className="tiny muted vote-explanation">
                {singleVote
                  ? "Tap + to vote for a Sound Wave and − to take it back. You can vote for different ideas, once each, until the song ends."
                  : "Tap + to vote for an idea and − to take one back. You can vote more than once for an idea in this older show."}
              </p>
              {!data.canContribute ? (
                <div className="join-panel">
                  <h3>
                    Your ideas belong
                    <br />
                    in the music.
                  </h3>
                  <p>
                    {data.admission.mode === "room_code"
                      ? "Enter the room code announced by the artist to suggest Sound Waves and vote on other ideas."
                      : "Join the room to share a musical idea and vote for the Sound Waves you want to hear."}
                  </p>
                  {data.admission.mode === "room_code" && (
                    <label htmlFor="room-code">
                      Room code
                      <input
                        id="room-code"
                        value={roomCode}
                        autoComplete="off"
                        maxLength={40}
                        onChange={(e) => setRoomCode(e.target.value)}
                      />
                    </label>
                  )}
                  <button
                    className="full"
                    disabled={
                      busy ||
                      !fresh ||
                      (data.admission.mode === "room_code" && !roomCode.trim())
                    }
                    onClick={() =>
                      action(async () => {
                        await ensureGuest();
                        await api(
                          `/events/${slug}/join`,
                          "POST",
                          roomCode.trim() ? { roomCode } : {},
                        );
                        setRoomCode("");
                      })
                    }
                  >
                    {data.admission.mode === "room_code"
                      ? "Join and vote ↗"
                      : "I'm in. Let's make music ↗"}
                  </button>
                  {!data.joined && data.admission.mode === "room_code" && (
                    <button
                      className="ghost full"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          await ensureGuest();
                          await api(`/events/${slug}/join`, "POST", {});
                          setTab("tracks");
                        })
                      }
                    >
                      Join as a listener
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setTab("tracks")}
                  >
                    Listen to the free tracks
                  </button>
                </div>
              ) : (
                <>
                  <form
                    className="wave-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        if (!round) return;
                        await api(`/rounds/${round.id}/waves`, "POST", {
                          commandId: crypto.randomUUID(),
                          expectedRevision: round.revision,
                          text,
                          ...(used >= voteLimit ? { moveFrom } : {}),
                        });
                        setText("");
                        setMoveFrom("");
                      });
                    }}
                  >
                    <label htmlFor="wave-input">
                      What would you add to this song?
                    </label>
                    <div className="input-action">
                      <input
                        id="wave-input"
                        maxLength={48}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={!open || busy}
                        placeholder="e.g. smoky jazz trumpet"
                      />
                      <button
                        disabled={
                          !open ||
                          busy ||
                          text.trim().length < 2 ||
                          (used >= voteLimit && !moveFrom)
                        }
                        aria-label="Contribute Sound Wave"
                      >
                        ↑
                      </button>
                    </div>
                    {used >= voteLimit && (
                      <label>
                        Move one vote from
                        <select
                          value={moveFrom}
                          onChange={(e) => setMoveFrom(e.target.value)}
                          required
                        >
                          <option value="">Choose a Sound Wave</option>
                          {waves
                            .filter((w) => w.mine && (!singleVote || !w.own))
                            .map((w) => (
                              <option value={w.id} key={w.id}>
                                {w.text}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <p className="tiny muted">
                      Suggest an instrument, rhythm, style, or mood. Each Sound Wave you submit uses one vote; use the rest to vote for other listeners' ideas.
                    </p>
                    {!!round?.waveExclusions?.length && (
                      <p className="tiny muted">
                        Please avoid these artist exclusions: {round.waveExclusions.join(", ")}.
                      </p>
                    )}
                  </form>
                  <div className="wave-list">
                    {waves.map((w, i) => (
                      <div
                        className={"wave-row " + (w.mine ? "supported" : "")}
                        key={w.id}
                      >
                        <span className="rank">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="wave-description">
                          <strong>
                            {w.text}
                            {w.own && <i className="yours">YOURS</i>}
                          </strong>
                          <small>
                            {w.votes} {w.votes === 1 ? "vote" : "votes"} · {w.supporters} {w.supporters === 1 ? "listener" : "listeners"}
                          </small>
                        </div>
                        {w.own && open && w.supporters === (w.mine > 0 ? 1 : 0) && (
                          <div className="wave-edit">
                            {editingWaveId === w.id ? (
                              <form onSubmit={(e) => {
                                e.preventDefault();
                                void action(async () => {
                                  await api(`/rounds/${round!.id}/waves/${w.id}`, "PATCH", {
                                    commandId: crypto.randomUUID(),
                                    expectedRevision: round!.revision,
                                    text: editingWaveText,
                                  });
                                  setEditingWaveId(null);
                                });
                              }}>
                                <label>
                                  Edit your Sound Wave
                                  <input value={editingWaveText} maxLength={48}
                                    onChange={(e) => setEditingWaveText(e.target.value)}
                                    disabled={busy} />
                                </label>
                                <button disabled={busy || editingWaveText.trim().length < 2}>Save</button>
                                <button type="button" className="ghost" onClick={() => setEditingWaveId(null)}>Cancel</button>
                              </form>
                            ) : (
                              <button type="button" className="ghost small"
                                onClick={() => { setEditingWaveId(w.id); setEditingWaveText(w.text); }}>
                                Edit phrase
                              </button>
                            )}
                          </div>
                        )}
                        <div className="vote-controls">
                          <button
                            className="ghost"
                            aria-label={`Take back a vote from ${w.text}`}
                            disabled={!open || !w.mine || (singleVote && w.own) || busy}
                            onClick={() => vote(w, -1)}
                          >
                            −
                          </button>
                          <b>{w.mine || "·"}</b>
                          <button
                            aria-label={`Vote for ${w.text}`}
                            disabled={!open || used >= voteLimit || (singleVote && w.mine > 0) || busy}
                            onClick={() => vote(w, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                    {!waves.length && (
                      <p className="muted empty-inline">
                        No Sound Waves yet. Be the first to suggest a musical idea.
                      </p>
                    )}
                  </div>
                </>
              )}
            </aside>
          </div>
        )}
        <ReleaseNotice releases={data.releases} open={() => setTab("tracks")} />
        {tab === "tracks" && <Tracks data={data} refresh={refresh} />}
        {tab === "people" && (
          <section className="people">
            <h2>Meet the people shaping this song.</h2>
            <p>
              See who's suggesting Sound Waves, which ideas are getting
              votes, and whose ideas became new music.
            </p>
            {waves.slice(0, 10).map((w, i) => (
              <div className="person" key={w.id}>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <Avatar seed={w.avatarSeed} />
                <div>
                  <strong>{w.name}</strong>
                  <small>{w.text}</small>
                </div>
                <span>{w.votes} {w.votes === 1 ? "vote" : "votes"}</span>
              </div>
            ))}
            {!waves.length && (
              <div className="empty">
                Your crowd's first contributions will appear here.
              </div>
            )}
            <Leaderboard artistId={data.event.artistId} slug={slug} />
          </section>
        )}
        <ReleaseEmail eventId={data.event.id} joined={data.joined} />
        <div className="support-artist">
          <div>
            <span className="eyebrow">IT STARTED WITH THE ALBUM</span>
            <strong>Find the artist's original album.</strong>
          </div>
          {(data.event.purchaseLinks?.length || data.event.purchaseUrl) ? <PurchaseChoices links={data.event.purchaseLinks?.length ? data.event.purchaseLinks as PurchaseLink[] : [{provider:"other", url:data.event.purchaseUrl!}]} label="Get the album" mode={data.event.purchaseMode} preferredProvider={data.event.preferredPurchaseProvider} /> : <span className="muted">Album links coming soon</span>}
        </div>
      </main>
      {profile && (
        <Profile
          close={() => {
            setProfile(false);
            void refresh();
          }}
        />
      )}
    </>
  );
}
function Tracks({
  data,
  refresh,
}: {
  data: EventState;
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Release | null>(
    () =>
      data.releases.find(
        (r) => r.id === new URLSearchParams(location.search).get("track"),
      ) ?? null,
  );
  return (
    <section className="tracks">
      <div className="section-heading">
        <div>
          <span className="eyebrow">INSPIRED BY YOU. MADE TOGETHER.</span>
          <h2>Listen to the tracks your crowd created.</h2>
        </div>
        <span className="muted">Listen, download, and vote for your favorites</span>
      </div>
      {data.releases.map((r, i) => (
        <article className="track" key={r.id}>
          <div className="track-art">
            <Mark />
          </div>
          <div className="track-info">
            <small>
              OUR JAM / {String(data.releases.length - i).padStart(2, "0")}
            </small>
            <h3>{r.title}</h3>
            <p>
              {r.plays} plays · {r.likes} likes
            </p>
          </div>
          <button onClick={() => setSelected(r)}>
            {selected?.id === r.id ? "Listening" : "Listen"} ▷
          </button>
          <a
            className="button ghost"
            href={r.download_url}
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            Download ↓
          </a>
        </article>
      ))}
      {!data.releases.length && (
        <div className="empty">
          <span className="empty-symbol">♫</span>
          <h3>No new tracks just yet.</h3>
          <p>
            When a crowd-created track is ready and the artist releases it,
            <br />
            you can listen here, download it, and tell the artist what you think.
          </p>
        </div>
      )}
      {data.jobs.filter((j) => !["published", "ready"].includes(j.state))
        .length > 0 && (
        <div className="jobs">
          <h3>From wave to track</h3>
          {data.jobs
            .filter((j) => !["published", "ready"].includes(j.state))
            .map((j, i) => (
              <div key={j.id}>
                <span>Round {data.jobs.length - i}</span>
                <span>
                  {j.state === "blocked"
                    ? j.reason === "provider_not_configured"
                      ? "Waiting for the artist’s generator setup"
                      : "Round saved · generation not eligible"
                    : j.state === "cancelled"
                      ? "The artist cancelled this generation"
                      : ["failed", "unknown"].includes(j.state)
                        ? "Generation needs attention"
                        : "Creating the next sound…"}
                </span>
              </div>
            ))}
        </div>
      )}
      {selected && (
        <Listener
          key={selected.id}
          release={selected}
          onClose={() => setSelected(null)}
          refresh={refresh}
        />
      )}
    </section>
  );
}
function Listener({
  release,
  onClose,
  refresh,
}: {
  release: Release;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const audio = useRef<HTMLAudioElement>(null),
    intervals = useRef<[number, number][]>([]),
    last = useRef<{ p: number; t: number } | null>(null);
  const [error, setError] = useState(""),
    [eligible, setEligible] = useState(false),
    [comments, setComments] = useState<any[]>([]),
    [credits, setCredits] = useState<any[]>([]),
    [comment, setComment] = useState("");
  const send = useCallback(async () => {
    if (!intervals.current.length) return;
    try {
      await ensureGuest();
      const result = await api(`/releases/${release.id}/listen`, "POST", {
        intervals: intervals.current.slice(-120),
      });
      setEligible(result.feedbackEligible);
      if (result.feedbackEligible) rememberFeedback(release);
    } catch {}
  }, [release.id]);
  useEffect(() => {
    listenerPresence(release.id);
    void api(`/releases/${release.id}/credits`)
      .then((r) => setCredits(r.credits))
      .catch((e) => setError(e.message));
    void api(`/releases/${release.id}/comments`)
      .then((r) => setComments(r.comments))
      .catch((e) => setError(e.message));
    const timer = setInterval(() => {
      void send();
      void api(`/releases/${release.id}/comments`)
        .then((r) => setComments(r.comments))
        .catch(() => {});
    }, 10000);
    return () => {
      clearInterval(timer);
      listenerPresence(null);
      void send();
    };
  }, [release.id, send]);
  const react = async (value: number) => {
    try {
      await ensureGuest();
      await api(`/releases/${release.id}/reaction`, "PUT", { value });
      setEligible(false);
      resolveFeedback(release.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="listener">
      <div className="section-heading">
        <h3>{release.title}</h3>
        <button
          className="ghost small"
          onClick={() => {
            void send();
            onClose();
          }}
        >
          Close ×
        </button>
      </div>
      <audio
        ref={audio}
        controls
        src={release.audio_url}
        onError={() =>
          setError("This audio could not be loaded. Try the download link.")
        }
        onSeeking={() => (last.current = null)}
        onPause={() => {
          last.current = null;
          void send();
        }}
        onEnded={() => {
          void send();
        }}
        onTimeUpdate={() => {
          const a = audio.current;
          if (!a || a.paused) return;
          const now = performance.now();
          if (
            last.current &&
            a.currentTime > last.current.p &&
            a.currentTime - last.current.p <=
              Math.min(3, ((now - last.current.t) / 1000) * 1.6)
          ) {
            intervals.current.push([last.current.p, a.currentTime]);
            if (intervals.current.length > 120) {
              const merged: [number, number][] = [];
              for (const p of intervals.current) {
                const end = merged.at(-1);
                if (end && p[0] <= end[1] + 0.05)
                  end[1] = Math.max(end[1], p[1]);
                else merged.push([...p]);
              }
              intervals.current = merged;
            }
          }
          last.current = { p: a.currentTime, t: now };
        }}
      />
      <p className={eligible ? "feedback-prompt" : "muted"}>
        {eligible
          ? "Love this new track? Vote for the songs you want to hear again."
          : "Listen to this crowd-created track. Vote for the ones you want to hear again."}
      </p>
      <div className="reactions">
        <button onClick={() => react(1)}>♡ Love this</button>
        <button className="ghost" onClick={() => react(-1)}>
          Not my sound
        </button>
        <button className="ghost" onClick={() => react(0)}>
          Clear rating
        </button>
      </div>
      <Notice error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await ensureGuest();
            await api(`/releases/${release.id}/comments`, "POST", {
              body: comment,
            });
            setComment("");
            setComments(
              (await api(`/releases/${release.id}/comments`)).comments,
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label htmlFor="comment">Leave a note for the artist</label>
        <div className="input-action">
          <input
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            placeholder="That bass needs to be in the next set…"
          />
          <button disabled={!comment.trim()}>Send</button>
        </div>
      </form>
      {credits.length > 0 && (
        <details className="credits">
          <summary>Made together · {credits.length} Sound Waves</summary>
          {credits.map((c, i) => (
            <p key={i}>
              <strong>{c.text}</strong> · {c.name} · {c.points} {c.points === 1 ? "vote" : "votes"}
            </p>
          ))}
        </details>
      )}
      <div className="comments">
        {comments.map((c) => (
          <div key={c.id}>
            <strong>{c.name}</strong>
            <p>{c.body}</p>
            <button
              className="text-button"
              onClick={async () => {
                const reason = window.prompt("What should the artist review?");
                if (reason) {
                  await ensureGuest();
                  await api(`/comments/${c.id}/report`, "POST", { reason });
                  setError("Report sent to the artist.");
                }
              }}
            >
              Report
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
function Screen({ slug }: { slug: string }) {
  const { data, error, connected } = useEvent(slug);
  const pulse = useAudioPulse();
  if (!data)
    return (
      <main className="loading">
        <Brand />
        <Notice error={error || pulse.error} />
      </main>
    );
  return (
    <div className="stage">
      <Header>
        <span className="eyebrow">
          {connected ? "● LIVE" : "RECONNECTING"} / {data.people} IN THE ROOM
        </span>
        <button
          className="ghost small"
          aria-pressed={pulse.active}
          title="Use this display’s microphone for local animation. Audio is not recorded or uploaded."
          onClick={() => void pulse.toggle()}
        >
          {pulse.active ? "Stop room audio" : "React to room audio"}
        </button>
      </Header>
      <div className="stage-heading">
        <div>
          <span className="eyebrow">{data.event.artistName} PRESENTS</span>
          <h1>{data.current?.title ?? data.event.title}</h1>
          <p>What would you add to this song?</p>
        </div>
        <Countdown data={data} />
      </div>
      <WaveField
        stage
        beat={pulse.beat}
        waves={data.round?.waves ?? []}
        limit={data.event.settings.screenLimit}
      />
      <div className="stage-bottom">
        <div>
          <h2>Your phone is part of the instrument.</h2>
          <p>
            Imagine a new sound. Share your Sound Wave. Vote on the crowd’s ideas.
          </p>
        </div>
        <div className="qr-pair">
          <QR
            url={location.origin + "/event/" + slug}
            label="FREE · JOIN & DOWNLOAD"
          />
          {(data.event.purchaseLinks?.length || data.event.purchaseUrl) && (
            <QR url={preferredPurchaseUrl(data.event.purchaseLinks as PurchaseLink[] ?? (data.event.purchaseUrl ? [{ provider: "other", url: data.event.purchaseUrl }] : []), data.event.purchaseMode, data.event.preferredPurchaseProvider) ?? location.origin + "/buy/" + encodeURIComponent(slug)} label="GET THE ALBUM" />
          )}
        </div>
      </div>
      <Notice error={error || pulse.error} />
    </div>
  );
}
function Performer({ slug }: { slug?: string }) {
  const [signed, setSigned] = useState<boolean | null>(null),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    api("/session")
      .then((r) => setSigned(r.operator))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!signed) return;
    api("/operator/events")
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e.message));
  }, [signed]);
  if (signed && slug) return <Console slug={slug} />;
  return (
    <>
      <Header />
      <main className="performer">
        <span className="eyebrow">THE ARTIST'S SIDE OF THE ROOM</span>
        <h1>
          Make it <em>our night.</em>
        </h1>
        <Notice error={error} />
        {signed === false ? (
          <form
            className="login card"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/operator/login", "POST", { token });
                setToken("");
                setSigned(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <h2>Performer access</h2>
            <p>Your private console controls the music and the room.</p>
            <label>
              Performer credential
              <input
                type="password"
                autoComplete="current-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </label>
            <button>Open my console ↗</button>
          </form>
        ) : signed ? (
          <>
            <RehearsalReadiness />
            <div className="event-list">
              {events.map((e) => (
                <a
                  className="event-card"
                  key={e.id}
                  href={"/performer/" + e.slug}
                >
                  <div>
                    <h3>{e.title}</h3>
                    <p>{e.state}</p>
                  </div>
                  <b>Open console ↗</b>
                </a>
              ))}
            </div>
            <ArtistEditor />
            <CreateEvent />
          </>
        ) : (
          <p>Checking performer access…</p>
        )}
      </main>
    </>
  );
}
function CreateEvent() {
  const [platformVotes, setPlatformVotes] = useState<{mode:"fixed";fixedVotes:number}|{mode:"artist";minVotes:number;maxVotes:number}|null>(null);
  const [requestedVotes,setRequestedVotes] = useState(5);
  useEffect(() => {
    let live=true;
    api("/operator/vote-policy").then(policy=>{if(live){setPlatformVotes(policy);setRequestedVotes(policy.mode === "fixed" ? policy.fixedVotes : policy.minVotes);}}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  }, []);
  const [purchaseLinks, setPurchaseLinks] = useState<PurchaseLink[]>([]);
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>("menu");
  const [preferredPurchaseProvider, setPreferredPurchaseProvider] = useState("");
  const [sources, setSources] = useState([
      { title: "", corePrompt: "", file: null as File | null },
    ]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [storageReady, setStorageReady] = useState<boolean | null>(null),
    [saved, setSaved] = useState<{ id: string; slug: string } | null>(null),
    [uploadMessage, setUploadMessage] = useState("");
  useEffect(() => { let alive = true; api("/operator/album-upload-capabilities").then(r => { if (alive) setStorageReady(Boolean(r.available)); }).catch(() => { if (alive) setStorageReady(false); }); return () => { alive = false; }; }, []);
  return (
    <form
      className="create-event card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const form = new FormData(e.currentTarget);
        try {
          if (storageReady !== true || sources.some(s => !s.file)) throw new Error("Choose an MP3 or WAV for every track. Private album storage must be ready.");
          if (sources.some(s => !s.file || !/\.(mp3|wav)$/i.test(s.file.name) || s.file.size < 128 || s.file.size > 128 * 1024 * 1024)) throw new Error("Choose MP3/WAV files no larger than 128 MiB before creating a session.");
          const created: { id: string; slug: string } = saved ?? await api<{ id: string; slug: string }>("/operator/events", "POST", {
            title: form.get("title"),
            artistName: form.get("artistName"),
            slug: form.get("slug"),
            purchaseLinks,
            voteMode: "single",
            votesPerListener: platformVotes?.mode === "fixed" ? platformVotes.fixedVotes : requestedVotes,
            purchaseMode,
            preferredPurchaseProvider: purchaseMode === "direct" ? preferredPurchaseProvider : undefined,
            screenLimit: Number(form.get("screenLimit")),
            admissionMode: form.get("admissionMode"),
            sources: sources.map((s) => ({ title: s.title, corePrompt: s.corePrompt, durationSeconds: 180 })),
          });
          setSaved(created);
          const catalog = await api("/operator/events/" + created.id + "/sources");
          if (catalog.sources.length !== sources.length) throw new Error("Saved album track count changed; inspect the session before retrying.");
          for (let i = 0; i < sources.length; i++) {
            const current = await api("/operator/events/" + created.id + "/sources");
            if (current.sources.length !== sources.length) throw new Error("The album changed while uploading. Refresh and inspect it before retrying.");
            if (current.sources[i].audio_url) continue;
            const file = sources[i].file!;
            if (!/\.(mp3|wav)$/i.test(file.name) || file.size < 128 || file.size > 128 * 1024 * 1024) throw new Error("Choose MP3/WAV files no larger than 128 MiB.");
            setUploadMessage("Uploading and validating track " + (i + 1) + " of " + sources.length);
            const response = await fetch("/api/operator/sources/" + current.sources[i].id + "/upload", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/octet-stream", "X-Command-Id": crypto.randomUUID(), "X-Event-Revision": String(current.revision) }, body: file });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || result.error || "Audio upload failed.");
          }
          location.href = "/performer/" + created.slug;
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="eyebrow">INVITE YOUR FANS INTO THE MUSIC</span>
      <h2>Create a jam around your songs.</h2>
      <p className="muted">
        Add the songs you'll play, describe the musical identity you want to preserve,
        and share the event code with your fans. You can upload MP3 or WAV files
        right here—no outside hosting needed.
      </p>
      {storageReady === false && <p role="alert" className="notice">Private album storage is not available. New sessions are disabled until it is configured.</p>}
      <div className="form-grid">
        <label>
          Event title
          <input
            name="title"
            required
            placeholder="e.g. Friday Night Album Jam"
            maxLength={120}
          />
        </label>
        <label>
          Artist name
          <input name="artistName" required maxLength={100} />
        </label>
        <label>
          Event code
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            minLength={3}
            maxLength={60}
            placeholder="your-album-release"
          />
        </label>

        <div>
          <label htmlFor="new-admission-mode">Who can contribute?</label>
          <select
            id="new-admission-mode"
            name="admissionMode"
            defaultValue="room_code"
          >
            <option value="room_code">People with the show’s room code</option>
            <option value="open">Everyone, including remote fans</option>
          </select>
          <p className="tiny muted">
            Set the room code in the console before inviting contributors.
            Listening and downloads stay open.
          </p>
        </div>
        <label>
          Sound Waves visible on the big screen
          <select name="screenLimit" defaultValue="16">
            {[8, 12, 16, 24, 40, 60].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      {platformVotes?.mode === "artist" ? <label className="vote-cap-setting">
        How many votes can each fan cast per song?
        <input name="votesPerListener" type="number" required min={platformVotes.minVotes} max={platformVotes.maxVotes}
          value={requestedVotes} onChange={e => setRequestedVotes(Number(e.target.value))}/>
        <span className="tiny muted">Choose from {platformVotes.minVotes} to {platformVotes.maxVotes} votes. Each Sound Wave a fan submits uses one vote; fans can vote once per idea.</span>
      </label> : <p className="tiny muted vote-cap-setting">
        {platformVotes?.mode === "fixed" ? `Each listener gets ${platformVotes.fixedVotes} votes per song, set by the platform.` : "Loading the platform's voting rules…"}
      </p>}
      <PurchaseEditor links={purchaseLinks} onChange={setPurchaseLinks} disabled={busy} mode={purchaseMode} onModeChange={setPurchaseMode} preferredProvider={preferredPurchaseProvider} onPreferredChange={setPreferredPurchaseProvider}/>
      <div className="section-heading">
        <h3>The album, in order</h3>
        <span className="muted">Set up the songs fans will help reimagine.</span>
      </div>
      {sources.map((source, i) => (
        <fieldset className="source-form" key={i}>
          <legend>TRACK {String(i + 1).padStart(2, "0")}</legend>
          <label>Track title<input required maxLength={120} disabled={busy} value={source.title} onChange={(e) => setSources(list => list.map((s,j) => j === i ? { ...s, title: e.target.value } : s))}/></label>
          <label>Describe this song's signature sound<textarea required rows={3} maxLength={3000} disabled={busy} value={source.corePrompt} onChange={(e) => setSources(list => list.map((s,j) => j === i ? { ...s, corePrompt: e.target.value } : s))}/></label>
          <label>Upload track (MP3 or WAV)<input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" required disabled={busy} onChange={(e) => setSources(list => list.map((s,j) => j === i ? { ...s, file: e.target.files?.[0] ?? null } : s))}/></label>
          <p className="tiny muted">
            Describe the instruments, rhythm, style, and mood that make this song
            recognizable. Only you can see this description. File limit: 15 seconds
            to 10 minutes, up to 128 MiB; duration is detected automatically.
          </p>
        </fieldset>
      ))}
      <button
        type="button"
        className="ghost"
        disabled={busy || !!saved}
        onClick={() =>
          setSources((s) => [
            ...s,
            { title: "", corePrompt: "", file: null as File | null },
          ])
        }
      >
        + Add album track
      </button>
      <Notice error={error} />
      {uploadMessage && <p role="status">{uploadMessage}</p>}
      {saved && <p role="status">Your session was saved. Retry remaining uploads here, or <a href={"/performer/" + saved.slug}>open it in the performer console</a>.</p>}
      <button disabled={busy || storageReady !== true || !platformVotes}>
        {busy ? "Uploading your album…" : saved ? "Retry remaining uploads ↗" : "Create and upload album ↗"}
      </button>
    </form>
  );
}
function Console({ slug }: { slug: string }) {
  const { data, error, setError, refresh } = useEvent(slug, true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [mainOutput, setMainOutput] = useState(false);
  const [backupSource, setBackupSource] = useState<string | null>(null);
  const stopForBackup = useRef<((reason?: string) => void) | null>(null);
  const stopBackupForOutput = useRef<(() => void) | null>(null);
  const routes = useAudioRouting(
    () => setPreview(null),
    () => {
      stopForBackup.current?.(
        "The show output disappeared. Live control was released; the round pauses when the release arrives or its lease expires.",
      );
      stopBackupForOutput.current?.();
      setBackupSource(null);
    },
  );
  const showActive = mainOutput || Boolean(backupSource);
  const previewBlocked = showActive && !routes.canPreviewWithShow;
  useEffect(() => {
    if (previewBlocked) setPreview(null);
  }, [previewBlocked]);
  const beat = useRef(0);
  const queued = data?.queue?.filter((q) => q.state === "queued") ?? [];
  function move(id: string, to: number) {
    const ids = queued.map((q) => q.id),
      from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || !data) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    void action(() =>
      api(`/operator/events/${data.event.id}/queue`, "PUT", {
        commandId: crypto.randomUUID(),
        expectedRevision: data.event.revision,
        queueIds: ids,
      }),
    );
  }
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  if (!data)
    return (
      <>
        <Header />
        <Notice error={error} />
      </>
    );
  return (
    <>
      <Header>
        <a
          className="button ghost small"
          href={"/screen/" + slug}
          target="_blank"
          rel="noopener"
        >
          Open crowd display ↗
        </a>
        <a
          className="button ghost small"
          href={"/event/" + slug}
          target="_blank"
          rel="noopener"
        >
          Audience view ↗
        </a>
      </Header>
      <main className="console">
        <div className="event-heading">
          <div>
            <span className="eyebrow">PERFORMER CONSOLE</span>
            <h1>{data.event.title}</h1>
            <p>
              {data.people} joined · {data.round?.waves.length ?? 0} active
              Sound Waves
            </p>
          </div>
          <Countdown data={data} />
        </div>
        <Notice error={error} />
        <RehearsalReadiness />
        <AudioRouting routing={routes} showActive={showActive} />
        <div className="console-grid">
          <section className="card show-player">
            <span className="eyebrow">TO THE SPEAKER</span>
            <ShowPlayer
              output={routes.main?.deviceId ?? ""}
              disabled={Boolean(backupSource) || routes.mainUnavailable}
              stopForBackup={stopForBackup}
              data={data}
              refresh={refresh}
              onError={setError}
              onRelease={() => setMainOutput(false)}
              onClaim={() => {
                setMainOutput(true);
                setPreview(null);
              }}
            />
            <h3>Up next</h3>
            <ol className="queue">
              {queued.map((q, index) => (
                <li key={q.id}>
                  <span>
                    {q.title}
                    <small>
                      {q.release_id ? "Crowd creation" : "Album track"}
                    </small>
                  </span>
                  <div className="queue-actions">
                    <button
                      className="ghost small"
                      disabled={busy || index === 0}
                      aria-label={`Move ${q.title} next`}
                      onClick={() => move(q.id, 0)}
                    >
                      Next
                    </button>
                    <button
                      className="ghost small"
                      disabled={busy || index === 0}
                      aria-label={`Move ${q.title} up`}
                      onClick={() => move(q.id, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      className="ghost small"
                      disabled={busy || index === queued.length - 1}
                      aria-label={`Move ${q.title} down`}
                      onClick={() => move(q.id, index + 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="ghost small"
                      disabled={busy}
                      onClick={() =>
                        action(() =>
                          api(`/operator/queue/${q.id}`, "DELETE", {}),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="card">
            <div className="section-heading">
              <h2>Sound Waves fans are voting for</h2>
              <span>
                {data.round?.waves.reduce((n, w) => n + w.votes, 0) ?? 0} votes
              </span>
            </div>
            <WaveField waves={data.round?.waves ?? []} limit={6} beat={beat} />
            <div className="moderation-list">
              {data.round?.waves.map((w) => (
                <div key={w.id}>
                  <span>
                    {w.text} <small>{w.votes} votes</small>
                  </span>
                  <button
                    className="text-button"
                    disabled={busy || data.round?.state !== "open"}
                    onClick={() =>
                      action(() =>
                        api(`/operator/waves/${w.id}/hide`, "POST", {}),
                      )
                    }
                  >
                    Hide idea & return votes
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">LISTEN. FEEL IT. BRING IT IN.</span>
              <h2>Crowd creations</h2>
            </div>
            <span className="muted">
              Private previews do not count as plays.
            </span>
          </div>
          {data.releases.map((r) => (
            <article className="track" key={r.id}>
              <div className="track-art">
                <Mark />
              </div>
              <div className="track-info">
                <h3>{r.title}</h3>
                <p>
                  {r.plays} plays · {r.likes} likes · {r.dislikes ?? 0} dislikes
                </p>
              </div>
              <button
                className="ghost"
                disabled={previewBlocked}
                title={
                  previewBlocked
                    ? "Use another headphone device or test separate outputs above."
                    : undefined
                }
                onClick={() =>
                  setPreview(
                    preview === `/api/operator/releases/${r.id}/audio`
                      ? null
                      : `/api/operator/releases/${r.id}/audio`,
                  )
                }
              >
                Headphone preview ▷
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(() =>
                    api(`/operator/events/${data.event.id}/play-next`, "POST", {
                      releaseId: r.id,
                      expectedRevision: data.event.revision,
                    }),
                  )
                }
              >
                Play next ↗
              </button>
            </article>
          ))}
          {preview && (
            <div className="private-preview">
              <strong>Private preview — use headphones</strong>
              <HeadphonePreview
                src={preview}
                output={routes.preview?.deviceId ?? ""}
                onError={setError}
              />
            </div>
          )}
          {!data.releases.length && (
            <p className="muted">
              Released crowd tracks and their real listening activity appear
              here.
            </p>
          )}
          {data.jobs.map((j) => (
            <details className="job-detail" key={j.id}>
              <summary>
                Generation {j.id.slice(0, 8)} · {j.state.replaceAll("_", " ")}
                {j.reason && ` · ${j.reason.replaceAll("_", " ")}`}
              </summary>
              {!["published", "cancelled"].includes(j.state) && (
                <div className="release-controls">
                  <p className="muted">
                    {j.release_held
                      ? "On hold. This result will stay private until you approve it."
                      : "Automatic release is enabled for this round."}
                    {j.reserved_cents
                      ? ` · ${j.reserved_cents} cents reserved`
                      : ""}
                  </p>
                  <div className="player-actions">
                    <button
                      className="ghost small"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          api(`/operator/jobs/${j.id}/control`, "POST", {
                            commandId: crypto.randomUUID(),
                            action: j.release_held ? "allow" : "hold",
                          }),
                        )
                      }
                    >
                      {j.release_held
                        ? "Allow automatic release"
                        : "Hold publication"}
                    </button>
                    {j.release_id &&
                      !j.release_hidden &&
                      j.state === "ready" && (
                        <>
                          <button
                            className="ghost small"
                            disabled={previewBlocked}
                            onClick={() =>
                              setPreview(
                                `/api/operator/releases/${j.release_id}/audio`,
                              )
                            }
                          >
                            Preview unreleased track ▷
                          </button>
                          <button
                            className="small"
                            disabled={busy}
                            onClick={() =>
                              void action(() =>
                                api(`/operator/jobs/${j.id}/control`, "POST", {
                                  commandId: crypto.randomUUID(),
                                  action: "publish",
                                }),
                              )
                            }
                          >
                            Publish to everyone now
                          </button>
                        </>
                      )}
                    {["queued", "blocked"].includes(j.state) &&
                      !j.attempts &&
                      !j.reserved_cents &&
                      !j.release_id && (
                        <button
                          className="ghost small"
                          disabled={busy}
                          onClick={() =>
                            void action(() =>
                              api(`/operator/jobs/${j.id}/control`, "POST", {
                                commandId: crypto.randomUUID(),
                                action: "cancel",
                              }),
                            )
                          }
                        >
                          Cancel unsent generation
                        </button>
                      )}
                  </div>
                  {["submitting", "unknown"].includes(j.state) && (
                    <p className="tiny muted">
                      Provider work may already be underway. Holding publication
                      does not cancel the request or refund its budget.
                    </p>
                  )}
                </div>
              )}
              <button
                className="ghost small"
                onClick={() =>
                  void action(async () => {
                    const job = await api(`/operator/jobs/${j.id}`);
                    await navigator.clipboard.writeText(job.prompt);
                  })
                }
              >
                Copy this round's generation prompt
              </button>
              {j.state === "blocked" &&
                j.reason === "provider_not_configured" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void action(() =>
                        api(`/operator/jobs/${j.id}/asset`, "POST", {
                          title: form.get("title"),
                          audioUrl: form.get("audio"),
                          downloadUrl: form.get("download"),
                          durationSeconds: Number(form.get("duration")),
                          rightsConfirmed: true,
                        }),
                      );
                    }}
                  >
                    <p>
                      Attach a verified track you generated from this round.
                      This is labeled as artist supplied; automatic generation
                      is not configured.
                    </p>
                    <div className="form-grid">
                      <label>
                        Track title
                        <input name="title" required />
                      </label>
                      <label>
                        Audio URL
                        <input name="audio" type="url" required />
                      </label>
                      <label>
                        Download URL
                        <input name="download" type="url" required />
                      </label>
                      <label>
                        Duration (seconds)
                        <input
                          name="duration"
                          type="number"
                          min="1"
                          max="1200"
                          required
                        />
                      </label>
                    </div>
                    <label className="check">
                      <input type="checkbox" required />I verified this track
                      and have permission to offer it as a free download.
                    </label>
                    <button>Prepare for release</button>
                  </form>
                )}
            </details>
          ))}
        </section>
        <AdmissionSettings data={data} refresh={refresh} />
        <ShowSetup data={data} refresh={refresh} />
        <AlbumBackup
          outputAvailable={!routes.mainUnavailable}
          stopForOutput={stopBackupForOutput}
          output={routes.main?.deviceId ?? ""}
          data={data}
          active={Boolean(backupSource)}
          onBegin={(source) => {
            stopForBackup.current?.();
            setPreview(null);
            setBackupSource(source);
          }}
          onEnd={() => setBackupSource(null)}
        />
        <EmailStatus eventId={data.event.id} />
        <Moderation eventId={data.event.id} />
        <Recorder
          eventId={data.event.id}
          currentId={
            backupSource
              ? `local-backup:${backupSource}`
              : (data.current?.id ?? null)
          }
        />

        <p className="tiny muted">
          Keep a local album backup and a separate recording running for a live
          event. This build still needs hardware and venue rehearsal.
        </p>
      </main>
    </>
  );
}
const segments = location.pathname.split("/").filter(Boolean);
let screen: React.ReactNode;
if (segments[0] === "event" && segments[1])
  screen = <Audience slug={decodeURIComponent(segments[1])} />;
else if (segments[0] === "screen" && segments[1])
  screen = <Screen slug={decodeURIComponent(segments[1])} />;
else if (segments[0] === "buy" && segments[1]) screen = <PurchaseLanding slug={decodeURIComponent(segments[1])} />;
else if (segments[0] === "admin") screen = <><Header /><PlatformAdmin /></>;
else if (segments[0] === "performer")
  screen = (
    <Performer
      slug={segments[1] ? decodeURIComponent(segments[1]) : undefined}
    />
  );
else if (
  segments[0] === "email" &&
  (segments[1] === "verify" || segments[1] === "unsubscribe")
)
  screen = <EmailAction kind={segments[1]} />;
else if (segments[0] === "artist" && segments[1])
  screen = (
    <>
      <Header />
      <ArtistPage id={decodeURIComponent(segments[1])} />
    </>
  );
else if (segments[0] === "account")
  screen = (
    <>
      <Header />
      <Account />
    </>
  );
else if (segments[0] === "library")
  screen = (
    <>
      <Header />
      <LikedLibrary />
    </>
  );
else screen = <Home />;
createRoot(document.getElementById("root")!).render(
  <>
    {screen}
    {segments[0] === "event" && <FeedbackNudge />}
  </>,
);
