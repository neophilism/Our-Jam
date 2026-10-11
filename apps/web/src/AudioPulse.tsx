import { useEffect, useRef, useState } from "react";
export function useAudioPulse() {
  const beat = useRef(0),
    stop = useRef<(() => void) | null>(null);
  const [active, setActive] = useState(false),
    [error, setError] = useState("");
  useEffect(() => () => stop.current?.(), []);
  async function toggle() {
    if (stop.current) {
      stop.current();
      stop.current = null;
      setActive(false);
      return;
    }
    let stream: MediaStream | undefined, ctx: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      ctx = new AudioContext();
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const bins = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0,
        average = 0.1;
      const update = () => {
        analyser.getByteFrequencyData(bins);
        const low = Math.max(
            1,
            Math.floor((45 / ctx!.sampleRate) * analyser.fftSize),
          ),
          high = Math.min(
            bins.length,
            Math.ceil((180 / ctx!.sampleRate) * analyser.fftSize),
          );
        let value = 0;
        for (let i = low; i < high; i++) value += bins[i] / 255;
        value /= Math.max(1, high - low);
        average = average * 0.98 + value * 0.02;
        const target = Math.min(2, Math.max(0, value - average * 0.8) * 6);
        beat.current = beat.current * 0.7 + target * 0.3;
        frame = requestAnimationFrame(update);
      };
      update();
      stop.current = () => {
        cancelAnimationFrame(frame);
        stream?.getTracks().forEach((t) => t.stop());
        void ctx?.close();
        beat.current = 0;
      };
      stream.getTracks()[0].onended = () => {
        stop.current?.();
        stop.current = null;
        setActive(false);
      };
      setActive(true);
      setError("");
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setError("Room audio is unavailable: " + (e as Error).message);
    }
  }
  return { beat, active, error, toggle };
}
