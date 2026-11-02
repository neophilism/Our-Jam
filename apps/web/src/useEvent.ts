import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type EventState } from "./api";
import { EventSnapshotFence } from "./event-snapshot";

interface EventView {
  data: EventState | null;
  error: string;
  fetchError: string;
  streamReady: boolean;
  fresh: boolean;
}
const emptyView = (): EventView => ({
  data: null,
  error: "",
  fetchError: "",
  streamReady: false,
  fresh: false,
});

export function useEvent(slug: string, operator = false) {
  // Scope identity changes before effects run: never flash the previous view.
  const scope = useMemo(
    () => ({ fence: new EventSnapshotFence(), lastSuccess: 0 }),
    [slug, operator],
  );
  const [state, setState] = useState<{ scope: typeof scope; view: EventView }>(
    () => ({ scope, view: emptyView() }),
  );
  const update = useCallback(
    (patch: Partial<EventView>) => {
      if (!scope.fence.isActive()) return;
      const stamp = scope.fence.stamp();
      setState((current) =>
        scope.fence.current(stamp)
          ? {
              scope,
              view: {
                ...(current.scope === scope ? current.view : emptyView()),
                ...patch,
              },
            }
          : current,
      );
    },
    [scope],
  );
  const refresh = useCallback(async () => {
    const request = scope.fence.issue();
    if (!request) return;
    try {
      const next = await api<EventState>(
        (operator ? "/operator" : "") + "/events/" + encodeURIComponent(slug),
      );
      if (!scope.fence.accept(request)) return;
      scope.lastSuccess = Date.now();
      update({ data: next, fetchError: "", fresh: navigator.onLine });
    } catch (e) {
      if (!scope.fence.accept(request)) return;
      update({ fetchError: (e as Error).message, fresh: false });
    }
  }, [slug, operator, scope, update]);
  useEffect(() => {
    scope.fence.activate();
    scope.lastSuccess = 0;
    update(emptyView());
    void refresh();
    const stream = new EventSource(
      "/api/events/" + encodeURIComponent(slug) + "/stream",
    );
    let pending: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      update({ streamReady: true });
      if (!pending)
        pending = setTimeout(() => {
          pending = undefined;
          void refresh();
        }, 180);
    };
    stream.addEventListener("update", sync);
    stream.addEventListener("reconnect", () => {
      update({ fresh: false });
      void refresh();
    });
    stream.onopen = () => update({ streamReady: true });
    stream.onerror = () => update({ streamReady: false });
    const suspend = () => update({ fresh: false });
    const resume = () => {
      if (document.visibilityState === "visible") {
        update({ fresh: false });
        void refresh();
      }
    };
    window.addEventListener("offline", suspend);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    const stale = setInterval(() => {
      if (Date.now() - scope.lastSuccess > 15000 || !navigator.onLine)
        update({ fresh: false });
    }, 1000);
    const fallback = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void refresh();
    }, 12000);
    return () => {
      scope.fence.deactivate();
      stream.close();
      clearInterval(stale);
      clearInterval(fallback);
      clearTimeout(pending);
      window.removeEventListener("offline", suspend);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [slug, refresh, scope, update]);
  const view = state.scope === scope ? state.view : emptyView();
  const setError = useCallback((error: string) => update({ error }), [update]);
  return {
    data: view.data,
    error: view.error || view.fetchError,
    setError,
    refresh,
    fresh: view.fresh,
    connected: view.streamReady && view.fresh,
  };
}
