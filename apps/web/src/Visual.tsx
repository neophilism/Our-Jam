import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { Wave } from "./api";
import { useVisualPreferences } from "./VisualPreferences";
const Scene = lazy(() =>
  import("./WaveField").then((module) => ({ default: module.WaveField })),
);
const palette = [
  "#d5fc50",
  "#c7b8ff",
  "#ff805d",
  "#7bd5e7",
  "#ffa1cd",
  "#89dab4",
];
export type VisualOrb = {
  wave: Wave | null;
  x: number;
  y: number;
  size: number;
  color: string;
};
class GraphicsBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function WaveField({
  waves,
  limit = 12,
  stage = false,
  beat,
}: {
  waves: Wave[];
  limit?: number;
  stage?: boolean;
  beat?: RefObject<number>;
}) {
  const field = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.4),
    [failed, setFailed] = useState(false),
    [visible, setVisible] = useState(document.visibilityState !== "hidden"),
    [intersects, setIntersects] = useState(true);
  const preferences = useVisualPreferences();
  const onFailure = useCallback(() => setFailed(true), []);
  useEffect(() => {
    if (!field.current) return;
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (height > 0) setAspect(width / height);
    });
    resize.observe(field.current);
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) =>
            setIntersects(entry.isIntersecting),
          )
        : null;
    observer?.observe(field.current);
    const visibility = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", visibility);
    return () => {
      resize.disconnect();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const shown = waves.slice(0, limit),
    n = shown.length || 1;
  const columns =
      n === 1 ? 1 : Math.min(n, Math.max(1, Math.round(Math.sqrt(n * aspect)))),
    rows = Math.ceil(n / columns);
  const orbs: VisualOrb[] = (shown.length ? shown : [null]).map((wave, i) => ({
    wave,
    x: ((i % columns) + 0.5) / columns,
    y: (Math.floor(i / columns) + 0.5) / rows,
    size:
      ((Math.min(aspect / columns, 1 / rows) * 0.38) / Math.min(aspect, 1)) *
      (wave?.votes && shown[0]?.votes
        ? 0.77 + 0.23 * Math.sqrt(wave.votes / shown[0].votes)
        : 1),
    color:
      palette[
        wave
          ? parseInt(wave.id.slice(0, 2), 16) % palette.length
          : i % palette.length
      ],
  }));
  const fallback = (
    <div className="orb-fallback" aria-hidden="true">
      {orbs.map((o, i) => (
        <i
          key={o.wave?.id ?? i}
          style={{
            left: o.x * 100 + "%",
            top: o.y * 100 + "%",
            width: `${o.size * 200 * Math.min(1, 1 / aspect)}%`,
            background: `radial-gradient(circle at 35% 20%,${o.color},${o.color}55 45%,#111 80%)`,
            boxShadow: `0 0 55px ${o.color}25`,
          }}
        />
      ))}
    </div>
  );
  const still = preferences.still || failed;
  return (
    <div
      ref={field}
      className={"wave-field " + (stage ? "stage-field" : "")}
      data-motion={still ? "still" : "animated"}
      data-mode={
        failed
          ? "fallback"
          : preferences.still
            ? "still"
            : preferences.mode === "economy"
              ? "economy"
              : "full"
      }
      data-rendering={visible && intersects && !still ? "active" : "paused"}
      aria-label={
        shown.length
          ? "Live Sound Waves visualization"
          : "Waiting for the first Sound Wave"
      }
    >
      <div className="field-grid" />
      {still ? (
        fallback
      ) : (
        <GraphicsBoundary fallback={fallback} onFailure={onFailure}>
          <Suspense fallback={fallback}>
            <Scene
              orbs={orbs}
              beat={beat}
              visible={visible && intersects}
              economy={preferences.mode === "economy"}
              onFailure={onFailure}
            />
          </Suspense>
        </GraphicsBoundary>
      )}
      <div className="wave-labels">
        {orbs.map((o, i) => (
          <div
            className="wave-label"
            key={o.wave?.id ?? i}
            style={{
              left: o.x * 100 + "%",
              top: o.y * 100 + "%",
              width: `${85 / columns}%`,
              minWidth: 0,
            }}
          >
            {o.wave ? (
              <>
                <span className="wave-rank">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <strong>{o.wave.text}</strong>
                <small>
                  {o.wave.votes} {o.wave.votes === 1 ? "point" : "points"} ·{" "}
                  {o.wave.name}
                </small>
              </>
            ) : (
              <>
                <span className="wave-rank">MAKE THE FIRST MOVE</span>
                <strong>
                  A little idea.
                  <br />A whole new sound.
                </strong>
              </>
            )}
          </div>
        ))}
      </div>
      {waves.length > shown.length && (
        <div className="wave-overflow">
          +{waves.length - shown.length} more Sound Waves · explore the list on
          your phone
        </div>
      )}
    </div>
  );
}
