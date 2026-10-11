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
    context = useRef<AudioContext | null>(null);
  const [active, setActive] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [takes, setTakes] = useState<Take[]>([]),
    [level, setLevel] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [space, setSpace] = useState<number | null>(null);
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
    let stream: MediaStream | undefined;
    try {
      if (!window.MediaRecorder || !navigator.mediaDevices)
        throw new Error("Microphone recording is unavailable in this browser.");
      await listTakes(eventId);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((x) => MediaRecorder.isTypeSupported(x));
      const media = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const input = stream.getAudioTracks()[0],
        settings = input.getSettings();
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
      await saveTake(take.current);
      writes.current = Promise.resolve();
      pending.current = 0;
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
      media.start(2000);
      recorder.current = media;
      setElapsed(0);
      setActive(true);
      setError("");
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
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
      <button
        disabled={saving}
        className={active ? "danger" : ""}
        onClick={() => (active ? recorder.current?.stop() : void start())}
      >
        {saving
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
