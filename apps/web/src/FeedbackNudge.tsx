import { useEffect, useState } from "react";
import { api, ensureGuest, type Release } from "./api";
type Nudge = {
  id: string;
  title: string;
  slug: string;
  state: "pending" | "done";
};
const key = "our-jam-feedback";
function load(): Nudge[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (i) =>
              i &&
              typeof i.id === "string" &&
              /^[a-f0-9-]{36}$/.test(i.id) &&
              typeof i.title === "string" &&
              typeof i.slug === "string" &&
              ["pending", "done"].includes(i.state),
          )
          .slice(-100)
      : [];
  } catch {
    return [];
  }
}
function save(items: Nudge[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(-100)));
  } catch {}
  window.dispatchEvent(new Event("our-jam-feedback"));
}
export function rememberFeedback(release: Release) {
  const items = load();
  if (items.some((i) => i.id === release.id)) return;
  save([
    ...items,
    {
      id: release.id,
      title: release.title,
      slug: location.pathname.split("/")[2] ?? "",
      state: "pending",
    },
  ]);
}
export function resolveFeedback(id: string) {
  save(load().map((i) => (i.id === id ? { ...i, state: "done" } : i)));
}
export function listenerPresence(id: string | null) {
  window.dispatchEvent(new CustomEvent("our-jam-listener", { detail: id }));
}
export function FeedbackNudge() {
  const [items, setItems] = useState<Nudge[]>(load),
    [active, setActive] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const update = () => setItems(load()),
      playing = (e: Event) => setActive((e as CustomEvent).detail);
    window.addEventListener("our-jam-feedback", update);
    window.addEventListener("our-jam-listener", playing);
    return () => {
      window.removeEventListener("our-jam-feedback", update);
      window.removeEventListener("our-jam-listener", playing);
    };
  }, []);
  const item = items.find((i) => i.state === "pending" && i.id !== active);
  if (!item) return null;
  async function rate(value: number) {
    try {
      await ensureGuest();
      await api(`/releases/${item!.id}/reaction`, "PUT", { value });
      resolveFeedback(item!.id);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <aside className="feedback-nudge" aria-label="Track feedback">
      <small>YOU HEARD THE ROOM'S CREATION</small>
      <strong>How did “{item.title}” feel?</strong>
      <div>
        <button onClick={() => void rate(1)}>♡ Love it</button>
        <button className="ghost" onClick={() => void rate(-1)}>
          Not my sound
        </button>
        <button
          className="text-button"
          onClick={() => resolveFeedback(item.id)}
        >
          Dismiss
        </button>
      </div>
      <a href={`/event/${encodeURIComponent(item.slug)}?track=${item.id}`}>
        Listen again & leave a comment ↗
      </a>
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
