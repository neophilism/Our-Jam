import { useEffect, useRef, useState } from "react";
import {
  download,
  exportTake,
  listTakes,
  saveTake,
  storeChunk,
  verifiedChunk,
  type Take,
} from "./recordings";

export function Recorder({
  eventId,
  currentId,
}: {
  eventId: string;
  currentId: string | null;
}) {
  const recorder = useRef<MediaRecorder | null>(null),
    take = useRef<Take | null>(null),
    writes = useRef(Promise.resolve()),
    pending = useRef(0),
    context = useRef<AudioContext | null>(null),
    startingRef = useRef(false);
  const [active, setActive] = useState(false),
    [saving, setSaving] = useState(false),
    [starting, setStarting] = useState(false),
    [error, setError] = useState(""),
    [takes, setTakes] = useState<Take[]>([]),
    [level, setLevel] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [space, setSpace] = useState<number | null>(null);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]),
    [inputId, setInputId] = useState(""),
    [choosing, setChoosing] = useState(false);
  async function chooseInputs() {
    setChoosing(true);
    setError("");
    let permission: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("This browser cannot select a recording input.");
      permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      setInputs(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      permission?.getTracks().forEach((t) => t.stop());
      setChoosing(false);
    }
  }
  const refresh = () =>
    listTakes(eventId)
      .then(setTakes)
      .catch(() =>
        setError("This browser could not open local recording storage."),
      );
  useEffect(() => {
    void refresh();
    return () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      void context.current?.close();
    };
  }, [eventId]);
  useEffect(() => {
    if (take.current && active)
      take.current.timeline.push({
        at: new Date().toISOString(),
        queueItemId: currentId,
      });
  }, [currentId, active]);
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    const timer = setInterval(async () => {
      setElapsed(
        Math.floor(
          (Date.now() - new Date(take.current!.startedAt).getTime()) / 1000,
        ),
      );
      const estimate = await navigator.storage?.estimate();
      if (estimate?.quota) {
        const free = estimate.quota - (estimate.usage ?? 0);
        setSpace(free);
        if (free < 20 * 1024 * 1024) {
          setError(
            "Local storage is almost full. Recording stopped; export the saved chunks.",
          );
          recorder.current?.stop();
        }
      }
    }, 2000);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearInterval(timer);
    };
  }, [active]);
  async function start() {
    if (
      startingRef.current ||
      recorder.current?.state === "recording" ||
      saving
    )
      return;
    startingRef.current = true;
    setStarting(true);
    let stream: MediaStream | undefined;
    let stage = "local storage";
    try {
      if (!window.MediaRecorder || !navigator.mediaDevices)
        throw new Error("Microphone recording is unavailable in this browser.");
      await listTakes(eventId);
      stage = "microphone access";
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(inputId ? { deviceId: { exact: inputId } } : {}),
          channelCount: { ideal: 2 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      stage = "audio encoder";
      const mimeType = [
        "audio/webm",
        "audio/webm;codecs=opus",
        "audio/mp4",
      ].find((x) => MediaRecorder.isTypeSupported(x));
      const media = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const input = stream.getAudioTracks()[0],
        settings = input.getSettings();
      input.addEventListener(
        "ended",
        () => {
          if (media.state === "recording") {
            setError(
              "The recording input disconnected. Export the saved chunks and choose the input again.",
            );
            media.stop();
          }
        },
        { once: true },
      );
      take.current = {
        id: crypto.randomUUID(),
        eventId,
        startedAt: new Date().toISOString(),
        mimeType: media.mimeType,
        status: "recording",
        bytes: 0,
        chunks: 0,
        device: input.label || "Browser microphone",
        sampleRate: settings.sampleRate,
        channels: settings.channelCount,
        timeline: [{ at: new Date().toISOString(), queueItemId: currentId }],
      };
      stage = "saving recording manifest";
      await saveTake(take.current);
      writes.current = Promise.resolve();
      pending.current = 0;
      stage = "microphone input meter";
      const ctx = new AudioContext();
      context.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const meter = setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        setLevel(
          Math.max(...Array.from(buffer, (n) => Math.abs(n - 128))) / 128,
        );
      }, 100);
      const stopInput = () => {
        clearInterval(meter);
        stream?.getTracks().forEach((t) => t.stop());
        void ctx.close();
        setLevel(0);
      };
      let storageFailed = false;
      media.ondataavailable = (e) => {
        if (!e.data.size || storageFailed) return;
        if (++pending.current > 8) {
          setError(
            "Recording storage cannot keep up. Stopping to preserve saved audio.",
          );
          if (media.state === "recording") media.stop();
        }
        writes.current = writes.current
          .then(async () => {
            if (storageFailed) return;
            take.current = await storeChunk(take.current!, e.data);
          })
          .catch(() => {
            storageFailed = true;
            setError(
              "A recording chunk could not be saved. Earlier chunks remain available.",
            );
            if (media.state === "recording") media.stop();
          })
          .finally(() => {
            pending.current--;
          });
      };
      media.onerror = () => {
        setError(
          "Microphone recording was interrupted. Recover the saved chunks below.",
        );
        if (media.state !== "inactive") media.stop();
      };
      media.onstop = () => {
        stopInput();
        setActive(false);
        setSaving(true);
        writes.current = writes.current
          .then(async () => {
            if (take.current) {
              take.current.status = storageFailed ? "interrupted" : "completed";
              await saveTake(take.current);
            }
            await refresh();
          })
          .catch(() =>
            setError(
              "The last recording marker could not be saved. Recover the existing chunks below.",
            ),
          )
          .finally(() => setSaving(false));
      };
      input.onended = () => {
        if (media.state === "recording") media.stop();
      };
      stage = "starting audio encoder";
      media.start(2000);
      recorder.current = media;
      setElapsed(0);
      setActive(true);
      setError("");
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      setError(
        `Could not start ${stage}: ${(e as Error).name} ${(e as Error).message}`,
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }
  return (
    <section className="card recording">
      <span className="eyebrow">CAPTURE THE MOMENT</span>
      <h2>A record of the room.</h2>
      <p>
        Record the browser's selected microphone or connected audio interface.
        Audio stays on this device. Rave wireless microphones require a verified
        recording output.
      </p>
      {active && (
        <>
          <p>
            {take.current?.device} · {Math.floor(elapsed / 60)}:
            {String(elapsed % 60).padStart(2, "0")} ·{" "}
            {take.current?.chunks ?? 0} chunks saved
          </p>
          <meter
            min={0}
            max={1}
            value={level}
            aria-label="Microphone input level"
          />
          {level > 0.94 && (
            <strong className="notice">
              Input is clipping. Lower the source level.
            </strong>
          )}
        </>
      )}
      <div className="player-actions">
        <button
          className="ghost small"
          disabled={active || saving || choosing || starting}
          onClick={() => void chooseInputs()}
        >
          Choose recording input
        </button>
        <div>
          <label htmlFor="recording-input">Recording input</label>
          <select
            id="recording-input"
            value={inputId}
            disabled={active || saving || choosing || starting}
            onChange={(e) => setInputId(e.target.value)}
          >
            <option value="">System default microphone</option>
            {inputs
              .filter((d) => d.deviceId !== "default")
              .map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Audio input " + d.deviceId.slice(0, 6)}
                </option>
              ))}
          </select>
        </div>
      </div>
      <p className="muted">
        Choose the system input or USB interface carrying your microphones. A
        speaker’s playback connection does not automatically expose its karaoke
        microphones to the browser.
      </p>
      <button
        disabled={saving || choosing || starting}
        className={active ? "danger" : ""}
        onClick={() => (active ? recorder.current?.stop() : void start())}
      >
        {starting
          ? "Opening recording input…"
          : saving
            ? "Saving final chunk…"
            : active
              ? "■ Stop recording"
              : "● Record browser microphone"}
      </button>
      {space !== null && (
        <span className="muted">
          {" "}
          {Math.floor(space / 1024 / 1024)} MB local space available
        </span>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <p className="tiny muted">
        Two-second chunks are saved with checksums. Closing the page can lose
        the final unsaved chunk. Export promptly: browsers can evict local
        storage. Interrupted files may need container repair.
      </p>
      {takes.map((t) => (
        <details key={t.id}>
          <summary>
            {new Date(t.startedAt).toLocaleString()} · {t.chunks} chunks ·{" "}
            {t.status === "recording"
              ? "Interrupted / recoverable chunks"
              : t.status}
          </summary>
          <div className="player-actions">
            <button
              className="ghost"
              disabled={!t.chunks}
              onClick={() =>
                void exportTake(t).catch((e) => setError(e.message))
              }
            >
              Export recording
            </button>
            <button
              className="ghost"
              onClick={async () => {
                try {
                  const checksums = [];
                  for (let i = 0; i < t.chunks; i++) {
                    const c = await verifiedChunk(t.id, i);
                    checksums.push({
                      sequence: c.sequence,
                      sha256: c.sha256,
                      at: c.at,
                      bytes: c.blob.size,
                    });
                  }
                  download(
                    new Blob([JSON.stringify({ ...t, checksums }, null, 2)], {
                      type: "application/json",
                    }),
                    `our-jam-${t.id}-manifest.json`,
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save manifest
            </button>
          </div>
          <details>
            <summary>Raw recovery chunks</summary>
            {Array.from({ length: t.chunks }, (_, i) => (
              <button
                key={i}
                className="ghost small"
                onClick={() =>
                  void verifiedChunk(t.id, i)
                    .then((c) =>
                      download(
                        c.blob,
                        `${t.id}-${String(i).padStart(6, "0")}.chunk`,
                      ),
                    )
                    .catch((e) => setError(e.message))
                }
              >
                Chunk {i + 1}
              </button>
            ))}
          </details>
        </details>
      ))}
    </section>
  );
}
