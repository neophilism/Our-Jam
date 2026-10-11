import { lazy, Suspense, type RefObject } from "react";
import type { Wave } from "./api";
const Scene = lazy(() =>
  import("./WaveField").then((module) => ({ default: module.WaveField })),
);
export function WaveField(props: {
  waves: Wave[];
  limit?: number;
  stage?: boolean;
  beat?: RefObject<number>;
}) {
  return (
    <Suspense
      fallback={
        <div
          className={
            "wave-field visual-loading " + (props.stage ? "stage-field" : "")
          }
          aria-label="Loading Sound Waves visualization"
        >
          <span className="live-dot" />
          <p>Bringing the room's sound to life…</p>
        </div>
      }
    >
      <Scene {...props} />
    </Suspense>
  );
}
