import { useEffect, useRef, useState } from "react";
import type { Release } from "./api";
export function ReleaseNotice({
  releases,
  open,
}: {
  releases: Release[];
  open: () => void;
}) {
  const seen = useRef(new Set(releases.map((r) => r.id))),
    [fresh, setFresh] = useState<Release[]>([]);
  useEffect(() => {
    const added = releases.filter((r) => !seen.current.has(r.id));
    for (const r of releases) seen.current.add(r.id);
    setFresh((old) =>
      [...added, ...old].filter((r) =>
        releases.some((current) => current.id === r.id),
      ),
    );
  }, [releases]);
  if (!fresh.length) return null;
  return (
    <aside className="notice release-notice" role="status">
      <div>
        <strong>
          {fresh.length === 1 ? fresh[0].title : `${fresh.length} new tracks`}{" "}
          just dropped.
        </strong>
        <p>Your room’s music is ready to listen to and download.</p>
      </div>
      <button
        className="small"
        onClick={() => {
          setFresh([]);
          open();
        }}
      >
        Hear the new music
      </button>
      <button
        className="text-button"
        aria-label="Dismiss release notification"
        onClick={() => setFresh([])}
      >
        Dismiss
      </button>
    </aside>
  );
}
