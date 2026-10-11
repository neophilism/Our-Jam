import { useCallback, useEffect, useRef, useState } from "react";
import { api, type EventState } from "./api";

type Lease = { leaseToken: string; epoch: number; sequence: number };
export function ShowPlayer({
  data,
  refresh,
  onError,
  onClaim,
  onRelease,
}: {
  data: EventState;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  onClaim: () => void;
  onRelease: () => void;
}) {
  const lease = useRef<Lease | null>(null),
    audio = useRef<HTMLAudioElement>(null),
    pending = useRef(false);
  const [owned, setOwned] = useState(false),
    [busy, setBusy] = useState(false),
    [auto, setAuto] = useState(true),
    [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0);
  const root = `/operator/events/${data.event.id}`;
  const fail = useCallback(
    (error: unknown) => {
      onError((error as Error).message);
      setOwned(
        false,
      ); /* Local audio is deliberately not stopped on a network failure. */
    },
    [onError],
  );
  async function claim() {
    setBusy(true);
    try {
      lease.current = await api(root + "/playback/claim", "POST", {
        existingToken: lease.current?.leaseToken,
      });
      setOwned(true);
      onClaim();
      onError("");
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!owned) return;
    const timer = setInterval(async () => {
      if (!lease.current) return;
      const renewal = lease.current;
      try {
        await api(root + "/playback/heartbeat", "POST", renewal);
      } catch (e) {
        if (lease.current?.leaseToken === renewal.leaseToken) fail(e);
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [owned, root, fail]);
  const control = useCallback(
    async (action: "advance" | "pause" | "release", pause?: boolean) => {
      if (pending.current || !lease.current || !owned) return false;
      pending.current = true;
      setBusy(true);
      const command = {
        ...lease.current,
        sequence: lease.current.sequence + 1,
      };
      try {
        const result = await api(
          root +
            (action === "advance"
              ? "/advance"
              : action === "release"
                ? "/playback/release"
                : "/playback/pause"),
          "POST",
          action === "advance"
            ? {
                commandId: crypto.randomUUID(),
                expectedRevision: data.event.revision,
                playback: command,
              }
            : { ...command, commandId: crypto.randomUUID(), pause },
        );
        if (action === "release") {
          lease.current = null;
          setOwned(false);
          onRelease();
        } else lease.current = { ...command, sequence: result.sequence };
        onError("");
        await refresh();
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [owned, root, data.event.revision, refresh, onError, onRelease, fail],
  );
  // A new browser-played source starts with voting paused until audio actually starts.
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (
      !owned ||
      !data.current?.audio_url ||
      started.current === data.current.id
    )
      return;
    started.current = data.current.id;
    setPosition(0);
    void audio.current
      ?.play()
      .then(() => control("pause", false))
      .catch(() =>
        onError(
          "Tap Play show audio to allow playback. Voting is paused until audio starts.",
        ),
      );
  }, [data.current?.id, owned, control, onError]);
  async function toggle() {
    if (!owned || busy) return;
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      try {
        await a.play();
        await control("pause", false);
      } catch {
        onError("The show audio could not start.");
      }
    } else {
      a.pause();
      await control("pause", true);
    }
  }
  return (
    <>
      <h2>{data.current?.title ?? "Ready when you are."}</h2>
      {!owned && (
        <div className="playback-claim">
          <p>
            Use one device for the speaker. Other devices can preview and manage
            the queue.
          </p>
          <button disabled={busy} onClick={claim}>
            Use this device for show playback
          </button>
        </div>
      )}
      {owned && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            audio.current?.pause();
            void control("release", true);
          }}
        >
          Release playback control
        </button>
      )}
      {data.current?.audio_url ? (
        <>
          <audio
            ref={audio}
            src={data.current.audio_url}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
            onEnded={() => {
              if (auto && owned) void control("advance");
            }}
            onError={() => {
              void control("pause", true).finally(() =>
                onError(
                  "Show audio could not load. Use your local album backup; check that the round is paused.",
                ),
              );
            }}
          />
          <div className="player-actions">
            <button
              className="ghost"
              disabled={!owned || busy}
              onClick={toggle}
            >
              {playing ? "Pause show audio" : "Play show audio"}
            </button>
            <span className="muted">
              {Math.floor(position / 60)}:
              {String(Math.floor(position % 60)).padStart(2, "0")}
            </span>
          </div>
        </>
      ) : (
        <p className="muted">
          {data.current
            ? "No audio URL is linked. Control your separate album player and pause the round here when needed."
            : "Connect the speaker to this device. Keep headphone previews on another phone."}
        </p>
      )}
      <div className="player-actions">
        <button
          disabled={!owned || busy}
          onClick={() => void control("advance")}
        >
          {data.current
            ? "Next track & close round →"
            : "Start the first round →"}
        </button>
        {!data.current?.audio_url &&
          data.round &&
          ["open", "paused"].includes(data.round.state) && (
            <button
              className="ghost"
              disabled={!owned || busy}
              onClick={() =>
                void control("pause", data.round?.state === "open")
              }
            >
              {data.round.state === "paused"
                ? "Resume the round"
                : "Pause the round"}
            </button>
          )}
        <label className="check">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Advance when this audio ends
        </label>
      </div>
      <p className="tiny muted">
        {owned
          ? "This device controls playback. Pause preserves the remaining voting time."
          : "Playback control is not active on this device."}{" "}
        If contact is lost, voting pauses after 25 seconds. Local audio
        continues.
      </p>
    </>
  );
}
