import { useEffect, useRef, useState } from "react";
import "./guided-help.css";

type Surface = "home" | "audience" | "performer" | "console";
type Step = { selector: string; title: string; description: string };
type Layout = { top: number; left: number; width: number; targetTop: number; targetLeft: number; targetWidth: number; targetHeight: number };
const guides: Record<Surface, Step[]> = {
  home: [
    { selector: ".join-form", title: "Join the jam", description: "Enter the event code shown at the venue or use its QR link. You can take part in your browser without installing an app." },
    { selector: ".how", title: "Help shape the music", description: "Listen to the artist, add a Sound Wave, and use your five points to support ideas. The artist can then release the crowd's new track." },
    { selector: ".event-list", title: "Find your room", description: "Choose an event here or enter its code above. Return to hear and download tracks when the artist publishes them." },
  ],
  audience: [
    { selector: ".audience .event-heading", title: "The music playing now", description: "This tells you what the artist is performing. Watch the time left to submit ideas and move votes for this round." },
    { selector: ".audience .tabs", title: "Explore the room", description: "Sound Waves is where you contribute. Our tracks has released music, and The room shows the people behind the sound." },
    { selector: ".audience .vote-panel", title: "Your five points", description: "Join the collaboration to receive five points per album track. Put them behind musical ideas you want the crowd and artist to hear." },
    { selector: ".audience .join-panel, .audience .wave-form", title: "Make a Sound Wave", description: "Join first if prompted. Then type a short idea, such as smoky jazz trumpet. Making your own Sound Wave uses one point." },
    { selector: ".audience .wave-list, .audience .crowd-scene", title: "Support other ideas", description: "Use plus and minus on the wave list to move points between ideas while the round is open. Nothing is submitted on your behalf." },
    { selector: ".audience .tabs button:nth-child(2)", title: "Hear the results", description: "Choose Our tracks to listen privately or download tracks after the artist publishes them. Joining never turns on phone audio automatically." },
  ],
  performer: [
    { selector: ".performer .login", title: "Private performer access", description: "Enter your performer credential to manage your show. Never share this private access with the audience." },
    { selector: ".performer .event-list", title: "Open a prepared show", description: "Select a session to control playback, crowd participation, audio and publishing, or open the public audience view separately." },
    { selector: ".performer .create-event", title: "Create your show", description: "Set an event code and title, add your own album tracks and private core prompts, and choose who may contribute before inviting fans." },
  ],
  console: [
    { selector: ".console .event-heading", title: "Your live show", description: "See the current event, participation and time remaining. Open the crowd display or audience view separately using the links above." },
    { selector: ".console .show-player", title: "Control real playback", description: "Choose your actual show output and operate the player here. Check your hardware and backup before the audience arrives." },
    { selector: ".console .queue", title: "Choose what comes next", description: "Rearrange upcoming album and crowd tracks in the queue without interrupting the track that is playing now." },
    { selector: ".console .console-grid > section:nth-child(2)", title: "Watch the crowd", description: "See ideas and their support as fans participate. Hide unsuitable contributions without sharing performer access." },
    { selector: ".console .track, .console .job-detail", title: "Preview before release", description: "Review crowd generations and privately preview audio. Publishing or adding music to the queue always requires a real action, not a tutorial step." },
    { selector: ".console .show-setup", title: "Check show settings", description: "Review track timing, admission and show settings before going live. This tour only explains controls and never changes them." },
  ],
};
function currentSurface(): Surface | null {
  const parts = location.pathname.split("/").filter(Boolean);
  if (!parts.length) return "home";
  if (parts[0] === "event" && parts[1]) return "audience";
  if (parts[0] === "performer") return parts[1] ? "console" : "performer";
  return null;
}
function inviteDismissed(surface: Surface | null): boolean {
  if (!surface) return true;
  try { return localStorage.getItem("our-jam-tour-v1:invite:" + surface) === "dismissed"; }
  catch { return false; }
}
function seen(surface: Surface | null): boolean {
  if (!surface) return false;
  try { return localStorage.getItem("our-jam-tour-v1:" + surface) === "done"; }
  catch { return false; }
}
export function GuidedHelp() {
  const surface = currentSurface();
  const [completed, setCompleted] = useState(() => seen(surface));
  const [invite, setInvite] = useState(() => !seen(surface) && !inviteDismissed(surface));
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const current = steps[index];
  const active = Boolean(current);
  const end = () => {
    if (surface) {
      try { localStorage.setItem("our-jam-tour-v1:" + surface, "done"); }
      catch { /* Restricted storage is nonfatal. */ }
    }
    setCompleted(true);
    setInvite(false);
    setSteps([]);
    setIndex(0);
    setLayout(null);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const begin = () => {
    if (!surface) return;
    const visible = guides[surface].filter((step) => {
      const element = document.querySelector<HTMLElement>(step.selector);
      return Boolean(element && element.getClientRects().length && element.getBoundingClientRect().height > 0);
    });
    setSteps(visible.length ? visible : [{
      selector: "header",
      title: "The screen is still loading",
      description: "The tour will point to the real controls once they are visible. Close it and use Replay tour when the screen is ready.",
    }]);
    setIndex(0);
    setLayout(null);
    setInvite(false);
  };
  const dismissInvite = () => {
    if (surface) {
      try { localStorage.setItem("our-jam-tour-v1:invite:" + surface, "dismissed"); }
      catch { /* Restricted storage is nonfatal. */ }
    }
    setInvite(false);
  };
  useEffect(() => {
    if (!current) return;
    const element = document.querySelector<HTMLElement>(current.selector);
    element?.scrollIntoView({ block: "center", behavior: "auto" });
    let frame = 0;
    const measure = () => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const pad = 16;
      const width = Math.min(370, innerWidth - 2 * pad);
      const height = Math.min(dialogRef.current?.offsetHeight ?? 240, innerHeight - 2 * pad);
      let top = rect.bottom + 14;
      if (top + height > innerHeight - pad) top = rect.top - height - 14;
      if (top < pad || top + height > innerHeight - pad)
        top = Math.max(pad, (innerHeight - height) / 2);
      const left = Math.min(Math.max(pad, rect.left), Math.max(pad, innerWidth - width - pad));
      const targetTop = Math.max(0, rect.top - 5);
      const targetLeft = Math.max(0, rect.left - 5);
      setLayout({
        top, left, width, targetTop, targetLeft,
        targetWidth: Math.max(0, Math.min(innerWidth - targetLeft, rect.width + 10)),
        targetHeight: Math.max(0, Math.min(innerHeight - targetTop, rect.height + 10)),
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    schedule();
    addEventListener("scroll", schedule, true);
    addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(element ?? document.body);
    if (dialogRef.current) observer?.observe(dialogRef.current);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule, true);
      removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [current]);
  useEffect(() => {
    if (!active) return;
    dialogRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); end(); return; }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [active, index]);
  if (!surface) return null;
  return (
    <>
      <button ref={buttonRef} type="button" className="small ghost guided-help-trigger"
        aria-label={completed ? "Replay tour" : "Take a tour"} onClick={begin}>
        <span aria-hidden="true">?</span>
        <span className="guided-help-trigger-text">{completed ? "Replay tour" : "Take a tour"}</span>
      </button>
      {invite && !active && (
        <aside className="guided-help-invite" aria-label="Guided tour invitation">
          <p>New to OurJam? We'll show you what each control does.</p>
          <div>
            <button type="button" onClick={begin}>Start guided tour</button>
            <button type="button" className="ghost" onClick={dismissInvite}>Not now</button>
          </div>
        </aside>
      )}
      {active && (
        <>
          <div className="guided-help-shield" aria-hidden="true" onClick={end} />
          {layout && <div className="guided-help-spotlight" aria-hidden="true" style={{
            top: layout.targetTop, left: layout.targetLeft,
            width: layout.targetWidth, height: layout.targetHeight,
          }} />}
          <div ref={dialogRef} className="guided-help-card" role="dialog"
            tabIndex={-1} aria-modal="true" aria-label="Our Jam guided tutorial"
            aria-describedby="guided-help-description"
            style={layout ? { top: layout.top, left: layout.left, width: layout.width } : undefined}>
            <div className="guided-help-card-heading">
              <span>STEP {index + 1} OF {steps.length}</span>
              <button type="button" className="guided-help-skip" aria-label="Skip tutorial" onClick={end}>Skip ×</button>
            </div>
            <h2 aria-live="polite">{current.title}</h2>
            <p id="guided-help-description">{current.description}</p>
            <div className="guided-help-progress" aria-hidden="true">
              {steps.map((_, number) => <i key={number} className={number <= index ? "done" : ""} />)}
            </div>
            <div className="guided-help-actions">
              <button type="button" className="ghost" disabled={index === 0}
                onClick={() => { setLayout(null); setIndex((value) => value - 1); }}>Back</button>
              <button type="button" onClick={() => {
                if (index === steps.length - 1) end();
                else { setLayout(null); setIndex((value) => value + 1); }
              }}>{index === steps.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
