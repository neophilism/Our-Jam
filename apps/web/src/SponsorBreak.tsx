import { useEffect, useRef, useState } from "react";
import type { EventState } from "./api";
export function sponsorRemaining(data: EventState, elapsedSinceSnapshot = 0) {
  const b = data.round?.sponsorBreak;
  return b
    ? Math.max(
        0,
        b.durationSeconds * 1000 -
          b.elapsedMs -
          (b.paused ? 0 : elapsedSinceSnapshot),
      )
    : 0;
}
export function SponsorBreak({ data }: { data: EventState }) {
  const [now, setNow] = useState(Date.now()),
    [failed, setFailed] = useState(false),
    video = useRef<HTMLVideoElement>(null);
  const stamp = useRef({ server: data.serverTime, received: Date.now() });
  if (stamp.current.server !== data.serverTime)
    stamp.current = { server: data.serverTime, received: Date.now() };
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const b = data.round?.sponsorBreak,
    delta = Math.max(0, now - stamp.current.received),
    remaining = sponsorRemaining(data, delta);
  const elapsed = b ? b.elapsedMs + (b.paused ? 0 : delta) : 0,
    clips = b?.clips ?? [],
    cycle = clips.reduce((n, c) => n + c.slotSeconds * 1000, 0);
  const position = cycle ? elapsed % cycle : 0;
  let edge = 0,
    offset = 0;
  const clip = clips.find((c) => {
    const start = edge;
    edge += c.slotSeconds * 1000;
    if (position >= start && position < edge) {
      offset = position - start;
      return true;
    }
    return false;
  });
  const slotKey = clip
    ? `${clip.id}-${Math.floor(elapsed / (cycle || 1))}`
    : "";
  useEffect(() => {
    setFailed(false);
  }, [slotKey]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    if (b?.paused) v.pause();
    else void v.play().catch(() => setFailed(true));
  }, [slotKey, b?.paused]);
  if (
    !b ||
    remaining <= 0 ||
    !["open", "paused"].includes(data.round?.state ?? "")
  )
    return null;
  return (
    <section className="sponsor-break" aria-label="Sponsor video break">
      {clip && !failed && (
        <video
          key={slotKey}
          ref={video}
          src={`/api/sponsor-videos/${clip.id}`}
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          aria-label={`Silent sponsor video: ${clip.sponsorName}`}
          onError={() => setFailed(true)}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            v.muted = true;
            v.defaultMuted = true;
            if (Number.isFinite(v.duration) && v.duration > 0)
              v.currentTime = (offset / 1000) % v.duration;
            if (b.paused) v.pause();
            else void v.play().catch(() => setFailed(true));
          }}
        />
      )}
      <div className="sponsor-countdown">
        <span className="eyebrow">
          {clip ? `SPONSORED BY ${clip.sponsorName}` : "THE NEXT ROUND"}
        </span>
        <h2>Our Jam begins in {Math.ceil(remaining / 1000)}s</h2>
        <p>
          {b.paused
            ? "Countdown paused with the music."
            : "The music continues. Get your next Sound Wave ready."}
        </p>
        {failed && <p>Video unavailable. The countdown continues.</p>}
      </div>
    </section>
  );
}
