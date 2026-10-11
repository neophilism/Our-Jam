import { useEffect, useState } from "react";
export type VisualMode = "auto" | "economy" | "still";
let memoryMode: VisualMode | undefined;
const key = "our-jam-visual-mode",
  changed = "our-jam-visual-mode-changed";
function savedMode(): VisualMode {
  if (memoryMode) return memoryMode;
  try {
    const mode = localStorage.getItem(key);
    return mode === "economy" || mode === "still" ? mode : "auto";
  } catch {
    return "auto";
  }
}
export function useVisualPreferences() {
  const [mode, setMode] = useState<VisualMode>(savedMode);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [saveData, setSaveData] = useState(() =>
    Boolean(
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData,
    ),
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: EventTarget & { saveData?: boolean };
      }
    ).connection;
    const sync = (event?: Event) => {
      if (event?.type === "storage") {
        const changedKey = (event as StorageEvent).key;
        if (changedKey && changedKey !== key) return;
        memoryMode = undefined;
      }
      setMode(savedMode());
      setReduced(media.matches);
      setSaveData(Boolean(connection?.saveData));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(changed, sync);
    media.addEventListener("change", sync);
    connection?.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(changed, sync);
      media.removeEventListener("change", sync);
      connection?.removeEventListener("change", sync);
    };
  }, []);
  function select(value: VisualMode) {
    memoryMode = value;
    setMode(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Keep the current page usable when storage is blocked. */
    }
    window.dispatchEvent(new CustomEvent(changed));
  }
  return {
    mode,
    select,
    still: reduced || mode === "still" || (mode === "auto" && saveData),
  };
}
export function VisualPreferences() {
  const { mode, select } = useVisualPreferences();
  return (
    <details className="visual-preferences">
      <summary>Visuals</summary>
      <div>
        <label htmlFor="visual-mode">Sound Wave motion</label>
        <select
          id="visual-mode"
          value={mode}
          onChange={(e) => select(e.target.value as VisualMode)}
        >
          <option value="auto">Match my device</option>
          <option value="economy">Light animation</option>
          <option value="still">Still waves</option>
        </select>
        <p>
          Reduced-motion settings are always respected. Still waves keep voting
          available and avoid loading 3D graphics.
        </p>
      </div>
    </details>
  );
}
