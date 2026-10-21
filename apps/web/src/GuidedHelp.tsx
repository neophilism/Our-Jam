import { useEffect, useRef, useState } from "react";
import "./guided-help.css";

type Surface = "home" | "audience" | "performer" | "console";
type Step = { selector: string; title: string; description: string };
type Layout = {
  top: number;
  left: number;
  width: number;
  targetTop: number;
  targetLeft: number;
  targetWidth: number;
  targetHeight: number;
};
const guides: Record<Surface, Step[]> = {
  home: [
    {
      selector: "#event-code",
      title: "Enter your event code",
      description:
        "Type the code shown at the concert or shared by the artist. You can also open the event's QR link on your phone.",
    },
    {
      selector: ".join-form button",
      title: "Open the jam",
      description:
        "Select Join the jam to see the music, Sound Waves, and voting for that event. No app download is needed.",
    },
    {
      selector: ".event-list a.event-card",
      title: "Or choose a show",
      description: "Select an event card to open that artist's jam directly.",
    },
  ],
  audience: [
    {
      selector: ".audience .countdown",
      title: "Watch the voting time",
      description:
        "This countdown tells you how long you can suggest Sound Waves and vote for this song. Voting pauses if the artist pauses the music.",
    },
    {
      selector: ".audience .tabs",
      title: "Choose what to explore",
      description:
        "Open Sound Waves to join in, Our tracks to hear the crowd's released music, or The room to see who's taking part.",
    },
    {
      selector: ".audience .join-panel button.full",
      title: "Join to contribute",
      description:
        "Select this button to share your ideas and vote. If the event needs a room code, enter the code announced at the show first.",
    },
    {
      selector: ".audience #wave-input",
      title: "Write a Sound Wave",
      description:
        "Type a musical idea you'd like to hear—such as funky bass guitar or a dreamy string section. One clear phrase is enough.",
    },
    {
      selector: ".audience .wave-form .input-action button",
      title: "Share your idea",
      description:
        "Select this arrow to submit your Sound Wave. It receives one of your votes automatically.",
    },
    {
      selector: ".audience .vote-progress",
      title: "See your available votes",
      description:
        "This bar shows how many votes you still have for the current song. You can change your votes until the round closes.",
    },
    {
      selector: ".audience .vote-controls",
      title: "Vote on Sound Waves",
      description:
        "Select + to vote for a Sound Wave and − to take back a vote. You can choose different musical ideas and change your votes until the song ends.",
    },
    {
      selector: ".audience .tabs button:nth-child(2)",
      title: "Open the crowd's tracks",
      description:
        "Choose Our tracks to listen to new music that the artist has released from earlier rounds.",
    },
    {
      selector: ".audience .listener .reactions",
      title: "Vote for a crowd-created track",
      description:
        "After listening, choose Love this or Not my sound to share your reaction. The artist can use that feedback when choosing what to play.",
    },
  ],
  performer: [
    {
      selector: ".performer .login input[type=password]",
      title: "Sign in as the performer",
      description:
        "Enter your private performer credential here. Only people running the event should have access.",
    },
    {
      selector: ".performer .event-list a.event-card",
      title: "Open an existing show",
      description:
        "Choose one of your saved events to return to its live controls and show settings.",
    },
    {
      selector: ".performer .create-event input[name=title]",
      title: "Name your jam",
      description:
        "Give the event a title your fans will recognize, such as Friday Night Album Jam.",
    },
    {
      selector: ".performer .create-event textarea",
      title: "Describe each song",
      description:
        "Tell OurJam which instruments, rhythm, and style make your song recognizable. This private description helps preserve its identity in new music.",
    },
    {
      selector: ".performer .create-event input[type=file]",
      title: "Upload the music",
      description:
        "Choose an MP3 or WAV directly from your computer. OurJam stores a private playback copy; you don't need to host the audio somewhere else.",
    },
    {
      selector: ".performer .create-event .purchase-editor",
      title: "Add your music links",
      description:
        "Enter the stores or music services where fans can find your album. Choose whether fans see all links or go straight to your preferred provider.",
    },
  ],
  console: [
    {
      selector: ".console .show-player",
      title: "Control the show's audio",
      description:
        "Choose your real audio output and use the player to start or pause playback. Test the speakers and backup before the event.",
    },
    {
      selector: ".console .queue",
      title: "Choose the next track",
      description:
        "Use Next or the up and down controls to reorder tracks waiting to play. The currently playing track keeps going.",
    },
    {
      selector: ".console .moderation-list",
      title: "Review live Sound Waves",
      description:
        "See what fans are suggesting and voting for. Hide an unsuitable idea here if necessary.",
    },
    {
      selector: ".console .track",
      title: "Preview a crowd-created track",
      description:
        "Listen privately to a new track before deciding whether to release it or play it at the event.",
    },
    {
      selector: ".console .show-setup summary",
      title: "Check the show settings",
      description:
        "Open this section to adjust show access, audio, and participation settings before the music starts.",
    },
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
  try {
    return (
      localStorage.getItem("our-jam-tour-v2:invite:" + surface) === "dismissed"
    );
  } catch {
    return false;
  }
}
function seen(surface: Surface | null): boolean {
  if (!surface) return false;
  try {
    return localStorage.getItem("our-jam-tour-v2:" + surface) === "done";
  } catch {
    return false;
  }
}
export function GuidedHelp() {
  const surface = currentSurface();
  const [completed, setCompleted] = useState(() => seen(surface));
  const [invite, setInvite] = useState(
    () => !seen(surface) && !inviteDismissed(surface),
  );
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const current = steps[index];
  const active = Boolean(current);
  const end = () => {
    if (surface) {
      try {
        localStorage.setItem("our-jam-tour-v2:" + surface, "done");
      } catch {
        /* Restricted storage is nonfatal. */
      }
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
      return Boolean(
        element &&
        element.getClientRects().length &&
        element.getBoundingClientRect().height > 0,
      );
    });
    setSteps(
      visible.length
        ? visible
        : [
            {
              selector: "header",
              title: "The screen is still loading",
              description:
                "The tour will point to the real controls once they are visible. Close it and use Replay tour when the screen is ready.",
            },
          ],
    );
    setIndex(0);
    setLayout(null);
    setInvite(false);
  };
  const dismissInvite = () => {
    if (surface) {
      try {
        localStorage.setItem("our-jam-tour-v2:invite:" + surface, "dismissed");
      } catch {
        /* Restricted storage is nonfatal. */
      }
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
      const height = Math.min(
        dialogRef.current?.offsetHeight ?? 240,
        innerHeight - 2 * pad,
      );
      let top = rect.bottom + 14;
      if (top + height > innerHeight - pad) top = rect.top - height - 14;
      if (top < pad || top + height > innerHeight - pad)
        top = Math.max(pad, (innerHeight - height) / 2);
      const left = Math.min(
        Math.max(pad, rect.left),
        Math.max(pad, innerWidth - width - pad),
      );
      const targetTop = Math.max(0, rect.top - 5);
      const targetLeft = Math.max(0, rect.left - 5);
      setLayout({
        top,
        left,
        width,
        targetTop,
        targetLeft,
        targetWidth: Math.max(
          0,
          Math.min(innerWidth - targetLeft, rect.width + 10),
        ),
        targetHeight: Math.max(
          0,
          Math.min(innerHeight - targetTop, rect.height + 10),
        ),
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    schedule();
    addEventListener("scroll", schedule, true);
    addEventListener("resize", schedule);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
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
      if (event.key === "Escape") {
        event.preventDefault();
        end();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])",
        ) ?? [],
      );
      if (!buttons.length) {
        event.preventDefault();
        return;
      }
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [active, index]);
  if (!surface) return null;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="small ghost guided-help-trigger"
        aria-label={completed ? "Replay tour" : "Take a tour"}
        onClick={begin}
      >
        <span aria-hidden="true">?</span>
        <span className="guided-help-trigger-text">
          {completed ? "Replay tour" : "Take a tour"}
        </span>
      </button>
      {invite && !active && (
        <aside
          className="guided-help-invite"
          aria-label="Guided tour invitation"
        >
          <p>
            New to OurJam? See exactly how to join, share a Sound Wave, and
            vote.
          </p>
          <div>
            <button type="button" onClick={begin}>
              Start guided tour
            </button>
            <button type="button" className="ghost" onClick={dismissInvite}>
              Not now
            </button>
          </div>
        </aside>
      )}
      {active && (
        <>
          <div
            className="guided-help-shield"
            aria-hidden="true"
            onClick={end}
          />
          {layout && (
            <div
              className="guided-help-spotlight"
              aria-hidden="true"
              style={{
                top: layout.targetTop,
                left: layout.targetLeft,
                width: layout.targetWidth,
                height: layout.targetHeight,
              }}
            />
          )}
          <div
            ref={dialogRef}
            className="guided-help-card"
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-label="Our Jam guided tutorial"
            aria-describedby="guided-help-description"
            style={
              layout
                ? { top: layout.top, left: layout.left, width: layout.width }
                : undefined
            }
          >
            <div className="guided-help-card-heading">
              <span>
                STEP {index + 1} OF {steps.length}
              </span>
              <button
                type="button"
                className="guided-help-skip"
                aria-label="Skip tutorial"
                onClick={end}
              >
                Skip ×
              </button>
            </div>
            <h2 aria-live="polite">{current.title}</h2>
            <p id="guided-help-description">{current.description}</p>
            <div className="guided-help-progress" aria-hidden="true">
              {steps.map((_, number) => (
                <i key={number} className={number <= index ? "done" : ""} />
              ))}
            </div>
            <div className="guided-help-actions">
              <button
                type="button"
                className="ghost"
                disabled={index === 0}
                onClick={() => {
                  setLayout(null);
                  setIndex((value) => value - 1);
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (index === steps.length - 1) end();
                  else {
                    setLayout(null);
                    setIndex((value) => value + 1);
                  }
                }}
              >
                {index === steps.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
