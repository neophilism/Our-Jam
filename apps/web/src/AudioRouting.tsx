import { useEffect, useRef, useState } from "react";

type Output = { deviceId: string; label: string };
type OutputMediaDevices = MediaDevices & {
  selectAudioOutput?: () => Promise<MediaDeviceInfo>;
};
export async function applyAudioOutput(
  audio: HTMLMediaElement,
  deviceId: string,
) {
  if (!deviceId && !audio.sinkId) return;
  if (typeof audio.setSinkId !== "function")
    throw new Error(
      "This browser cannot select an audio output. Use a separate headphone device.",
    );
  await audio.setSinkId(deviceId);
}
function explicit(device?: Output) {
  return Boolean(
    device && !["", "default", "communications"].includes(device.deviceId),
  );
}
function toneBlob() {
  const rate = 16000,
    samples = rate / 2,
    bytes = new ArrayBuffer(44 + samples * 2),
    view = new DataView(bytes);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++)
    view.setInt16(
      44 + i * 2,
      Math.sin((2 * Math.PI * 440 * i) / rate) *
        5000 *
        Math.sin((Math.PI * i) / samples),
      true,
    );
  return new Blob([bytes], { type: "audio/wav" });
}
export function useAudioRouting(onChange: () => void, onMainLost: () => void) {
  const [main, setMain] = useState<Output>(),
    [preview, setPreview] = useState<Output>();
  const [mainUnavailable, setMainUnavailable] = useState(false);
  const [devices, setDevices] = useState<Output[]>([]),
    [confirmed, setConfirmed] = useState(false);
  const [tested, setTested] = useState({ main: false, preview: false }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const epoch = useRef(0),
    mainRef = useRef(main),
    callbacks = useRef({ onChange, onMainLost }),
    testAudio = useRef<HTMLAudioElement | null>(null);
  mainRef.current = main;
  callbacks.current = { onChange, onMainLost };
  const supported = typeof HTMLMediaElement.prototype.setSinkId === "function";
  const separate =
    explicit(main) && explicit(preview) && main!.deviceId !== preview!.deviceId;
  function invalidate() {
    epoch.current++;
    setConfirmed(false);
    setTested({ main: false, preview: false });
    testAudio.current?.pause();
    callbacks.current.onChange();
  }
  async function refreshDevices() {
    const found = await navigator.mediaDevices.enumerateDevices();
    const outputs = found
      .filter((d) => d.kind === "audiooutput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || "Permitted audio output",
      }));
    setDevices(outputs);
    return outputs;
  }
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media) return;
    let active = true;
    const changed = async () => {
      invalidate();
      try {
        const outputs = await refreshDevices();
        if (!active) return;
        if (
          explicit(mainRef.current) &&
          !outputs.some((d) => d.deviceId === mainRef.current?.deviceId)
        ) {
          setMainUnavailable(true);
          callbacks.current.onMainLost();
          setError(
            "The selected show output disappeared. Playback control was released. Reconnect the output and choose it again before resuming.",
          );
        }
      } catch {
        if (active) {
          if (explicit(mainRef.current)) {
            setMainUnavailable(true);
            callbacks.current.onMainLost();
          }
          setError(
            "Audio outputs could not be checked. Reselect your devices before previewing.",
          );
        }
      }
    };
    void refreshDevices().catch(() => {});
    media.addEventListener("devicechange", changed);
    return () => {
      active = false;
      epoch.current++;
      testAudio.current?.pause();
      media.removeEventListener("devicechange", changed);
    };
  }, []);
  async function select(role: "main" | "preview", output?: Output) {
    invalidate();
    setBusy(true);
    setError("");
    const operation = epoch.current;
    try {
      if (output) {
        const probe = document.createElement("audio");
        await applyAudioOutput(probe, output.deviceId);
      }
      if (operation !== epoch.current) return;
      (role === "main" ? setMain : setPreview)(output);
      if (role === "main") setMainUnavailable(false);
    } catch {
      setError(
        "That audio output could not be selected. Check permission and connection; no fallback output was chosen.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function choose(role: "main" | "preview") {
    const media = navigator.mediaDevices as OutputMediaDevices;
    if (!media?.selectAudioOutput) return;
    try {
      const output = await media.selectAudioOutput();
      await select(role, output);
      await refreshDevices();
    } catch {
      setError(
        "Output selection was cancelled or denied. Your previous selection remains.",
      );
    }
  }
  async function allowList() {
    setBusy(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await refreshDevices();
    } catch {
      setError(
        "Audio device permission was not granted. You can use another phone for headphone previews.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function test(role: "main" | "preview") {
    const device = role === "main" ? main : preview;
    if (!explicit(device)) return;
    setBusy(true);
    setError("");
    const operation = epoch.current,
      url = URL.createObjectURL(toneBlob()),
      audio = new Audio(url);
    testAudio.current = audio;
    audio.volume = 0.25;
    try {
      await applyAudioOutput(audio, device!.deviceId);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Output test timed out."));
        }, 4000);
        const cleanup = () => {
          clearTimeout(timer);
          audio.onended = null;
          audio.onerror = null;
        };
        audio.onended = () => {
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error("Output test failed."));
        };
        void audio.play().catch((e) => {
          cleanup();
          reject(e);
        });
      });
      if (operation === epoch.current)
        setTested((old) => ({ ...old, [role]: true }));
    } catch {
      if (operation === epoch.current)
        setError(
          "The test sound could not play. Reselect the output and test again.",
        );
    } finally {
      audio.pause();
      URL.revokeObjectURL(url);
      testAudio.current = null;
      setBusy(false);
    }
  }
  return {
    main,
    mainUnavailable,
    preview,
    devices,
    confirmed,
    setConfirmed,
    tested,
    busy,
    error,
    supported,
    separate,
    canPreviewWithShow: Boolean(
      separate && confirmed && tested.main && tested.preview,
    ),
    select,
    choose,
    allowList,
    refreshDevices,
    test,
  };
}
export function AudioRouting({
  routing: r,
  showActive,
}: {
  routing: ReturnType<typeof useAudioRouting>;
  showActive: boolean;
}) {
  const chooser =
    typeof (navigator.mediaDevices as OutputMediaDevices | undefined)
      ?.selectAudioOutput === "function";
  return (
    <details className="card audio-routing">
      <summary>Speaker & headphone outputs</summary>
      <p>
        Keep the show on your speaker and cue crowd creations in headphones.
        Device choices apply only to this tab and reset when you reload.
      </p>
      {!r.supported ? (
        <p className="notice">
          This browser cannot route audio to separate outputs. Use the show
          device for the speaker and a second phone or laptop with headphones
          for previews.
        </p>
      ) : (
        <>
          <p className="tiny muted">
            If devices are missing, allow the device list. This briefly asks for
            microphone permission to reveal permitted outputs, then immediately
            stops the microphone without recording.
          </p>
          <button
            className="ghost small"
            disabled={r.busy}
            onClick={() => void r.allowList()}
          >
            Allow audio device list
          </button>
          {(["main", "preview"] as const).map((role) => {
            const selected = r[role],
              locked = r.busy || (role === "main" && showActive);
            const options = [...r.devices];
            if (
              selected &&
              !options.some((d) => d.deviceId === selected.deviceId)
            )
              options.push(selected);
            return (
              <div className="output-choice" key={role}>
                <label htmlFor={`output-${role}`}>
                  {role === "main" ? "Show output" : "Headphone preview output"}
                </label>
                <select
                  id={`output-${role}`}
                  value={selected?.deviceId ?? ""}
                  disabled={locked}
                  onChange={(e) =>
                    void r.select(
                      role,
                      options.find((d) => d.deviceId === e.target.value),
                    )
                  }
                >
                  <option value="">
                    System default (separate device only for previews)
                  </option>
                  {options
                    .filter(
                      (d) =>
                        !["", "default", "communications"].includes(d.deviceId),
                    )
                    .map((d) => (
                      <option value={d.deviceId} key={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                </select>
                <div className="player-actions">
                  {chooser && (
                    <button
                      className="ghost small"
                      disabled={locked}
                      onClick={() => void r.choose(role)}
                    >
                      Choose {role === "main" ? "show" : "headphone"} device
                    </button>
                  )}
                  <button
                    className="ghost small"
                    disabled={locked || !explicit(selected)}
                    onClick={() => void r.test(role)}
                  >
                    Test {role === "main" ? "show" : "preview"} output
                  </button>
                  {r.tested[role] && (
                    <span className="tiny">Test sound played</span>
                  )}
                </div>
              </div>
            );
          })}
          {showActive && (
            <p className="tiny muted">
              Release show control and stop local backup playback before
              changing the show output.
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={r.confirmed}
              disabled={
                !r.separate || !r.tested.main || !r.tested.preview || r.busy
              }
              onChange={(e) => r.setConfirmed(e.target.checked)}
            />
            I heard the show test only through the speaker and the preview test
            only in my headphones.
          </label>
          <p className="tiny muted">
            Different device names do not prove isolation. Check your actual
            cables, interface and mixer. Same-device cueing stays locked until
            both outputs have been tested and confirmed.
          </p>
          {r.canPreviewWithShow && (
            <p role="status">Separate-output cueing enabled for this tab.</p>
          )}
        </>
      )}
      {r.error && (
        <p role="alert" className="notice">
          {r.error}
        </p>
      )}
    </details>
  );
}
export function HeadphonePreview({
  src,
  output,
  onError,
}: {
  src: string;
  output: string;
  onError: (message: string) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null),
    [ready, setReady] = useState(false);
  const report = useRef(onError);
  report.current = onError;
  useEffect(() => {
    let active = true;
    const element = audio.current!;
    setReady(false);
    element.pause();
    element.muted = true;
    void applyAudioOutput(element, output)
      .then(() => {
        if (!active) return;
        element.muted = false;
        setReady(true);
        void element.play().catch((error: Error) => {
          if (active)
            report.current(
              error.name === "NotAllowedError"
                ? "Tap the preview player to start listening in your headphones."
                : "Preview audio could not load. Check the track and headphone output.",
            );
        });
      })
      .catch(() => {
        if (active)
          report.current(
            "The headphone output is unavailable. Preview stopped; no default-output fallback was used.",
          );
      });
    return () => {
      active = false;
      element.pause();
      element.muted = true;
    };
  }, [src, output]);
  return (
    <audio
      ref={audio}
      src={src}
      controls={ready}
      preload="metadata"
      aria-label="Headphone preview audio"
    />
  );
}
