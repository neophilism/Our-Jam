import { useCallback, useEffect, useRef, useState } from "react";
import { api, type EventState } from "./api";

export function useEvent(slug: string, operator = false) {
  const [data, setData] = useState<EventState | null>(null),
    [error, setError] = useState(""),
    [fetchError, setFetchError] = useState(""),
    [streamReady, setStreamReady] = useState(false),
    [fresh, setFresh] = useState(false);
  const issued = useRef(0),
    applied = useRef(0),
    lastSuccess = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++issued.current;
    try {
      const next = await api<EventState>(
        `${operator ? "/operator" : ""}/events/${encodeURIComponent(slug)}`,
      );
      if (request < applied.current) return;
      applied.current = request;
      lastSuccess.current = Date.now();
      setData(next);
      setFetchError("");
      setFresh(navigator.onLine);
    } catch (e) {
      if (request < applied.current) return;
      applied.current = request;
      setFetchError((e as Error).message);
      setFresh(false);
    }
  }, [slug, operator]);
  useEffect(() => {
    void refresh();
    const stream = new EventSource(
      `/api/events/${encodeURIComponent(slug)}/stream`,
    );
    let pending: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      setStreamReady(true);
      if (!pending)
        pending = setTimeout(() => {
          pending = undefined;
          void refresh();
        }, 180);
    };
    stream.addEventListener("update", sync);
    stream.onopen = () => {
      setStreamReady(true);
      void refresh();
    };
    stream.onerror = () => setStreamReady(false);
    const suspend = () => setFresh(false);
    const resume = () => {
      if (document.visibilityState === "visible") {
        setFresh(false);
        void refresh();
      }
    };
    window.addEventListener("offline", suspend);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    const stale = setInterval(() => {
      if (Date.now() - lastSuccess.current > 15000 || !navigator.onLine)
        setFresh(false);
    }, 1000);
    const fallback = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void refresh();
    }, 12000);
    return () => {
      applied.current = ++issued.current;
      stream.close();
      clearInterval(stale);
      clearInterval(fallback);
      clearTimeout(pending);
      window.removeEventListener("offline", suspend);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [slug, refresh]);
  return {
    data,
    error: error || fetchError,
    setError,
    refresh,
    fresh,
    connected: streamReady && fresh,
  };
}
