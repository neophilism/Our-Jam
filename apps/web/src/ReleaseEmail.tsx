import { useEffect, useState } from "react";
import { api } from "./api";

export function ReleaseEmail({
  eventId,
  joined,
}: {
  eventId: string;
  joined: boolean;
}) {
  const [status, setStatus] = useState<{
      available: boolean;
      state: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const path = `/events/${eventId}/subscription`;
  async function refresh() {
    setStatus(await api(path));
  }
  useEffect(() => {
    void refresh().catch(() => {});
  }, [eventId, joined]);
  if (!joined || !status?.available) return null;
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card release-email"
      aria-label="Release email preferences"
    >
      <span className="eyebrow">TAKE THE MUSIC WITH YOU</span>
      <h2>This room, in your inbox.</h2>
      <p>
        Choose free-release emails for this event. We’ll confirm your address
        first. No artist marketing, and you can unsubscribe anytime.
      </p>
      {message && <p role="status">{message}</p>}
      {status.state === "verified" ? (
        <>
          <p>Your address is confirmed for this event’s new releases.</p>
          <button
            className="ghost small"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await api(path, "DELETE");
                setMessage("Release emails stopped.");
              })
            }
          >
            Stop release emails
          </button>
        </>
      ) : (
        <>
          {status.state === "pending" && (
            <p className="muted">
              Confirmation requested. Check your inbox, or wait an hour before
              requesting another link.
            </p>
          )}
          {status.state === "suppressed" ? (
            <p>
              Email delivery has stopped for this address. Your tracks are still
              available here.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fields = new FormData(form);
                void action(async () => {
                  await api(path, "POST", {
                    email: fields.get("email"),
                    consent: fields.get("consent") === "on",
                  });
                  form.reset();
                  setMessage(
                    "If this address can receive emails, a confirmation will arrive shortly. Confirm it to get future releases.",
                  );
                });
              }}
            >
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  maxLength={254}
                  required
                  autoComplete="email"
                />
              </label>
              <label className="check">
                <input type="checkbox" name="consent" required />
                Email me this event’s free releases.
              </label>
              <button disabled={busy}>Send confirmation</button>
            </form>
          )}
          {status.state === "pending" && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api(path, "DELETE");
                  setMessage("Request cancelled.");
                })
              }
            >
              Cancel email request
            </button>
          )}
        </>
      )}
    </section>
  );
}
export function EmailAction({ kind }: { kind: "verify" | "unsubscribe" }) {
  // Fragments are not sent to the server. Clear the address bar before any
  // request, and require a gesture so link-preview crawlers cannot opt in.
  const [token] = useState(() => {
    const value = location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
    return value;
  });
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [message, setMessage] = useState(""),
    [slug, setSlug] = useState("");
  return (
    <main className="loading">
      <section className="card">
        <a href="/" className="eyebrow">
          OUR JAM
        </a>
        <h1>
          {kind === "verify" ? "Keep the music coming." : "Stop event emails."}
        </h1>
        <p>
          {kind === "verify"
            ? "Confirm that you want this event’s new music in your inbox. This does not sign you up for artist marketing."
            : "Stop release emails for the event linked in this message. Listening and downloads stay free."}
        </p>
        {message && <p role="status">{message}</p>}
        {!done && (
          <button
            disabled={busy || !/^[a-f0-9]{64}$/.test(token)}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                const result = await api(`/email/${kind}`, "POST", { token });
                setDone(true);
                setSlug(result.slug ?? "");
                setMessage(
                  kind === "verify"
                    ? "You’re confirmed. Future releases from this event will arrive by email."
                    : "Release emails for this event have stopped.",
                );
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {kind === "verify"
              ? "Confirm release emails"
              : "Unsubscribe from this event"}
          </button>
        )}
        {!token && <p>Open the full link from your email to continue.</p>}
        {slug && (
          <p>
            <a
              className="button ghost"
              href={`/event/${encodeURIComponent(slug)}`}
            >
              Back to the music
            </a>
          </p>
        )}
      </section>
    </main>
  );
}
export function EmailStatus({ eventId }: { eventId: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    const refresh = () =>
      void api(`/operator/events/${eventId}/email`)
        .then(setData)
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [eventId]);
  if (!data) return null;
  return (
    <section className="card">
      <span className="eyebrow">RELEASE EMAILS</span>
      <h2>Keep the room connected.</h2>
      {!data.available ? (
        <p>Release emails are not enabled for this show.</p>
      ) : (
        <>
          <p>
            {data.subscriptions.find((s: any) => s.state === "verified")
              ?.count ?? 0}{" "}
            confirmed subscriptions
          </p>
          <p>
            {data.deliveries
              .map((s: any) => `${s.count} ${s.state}`)
              .join(" · ") || "No emails queued yet."}
          </p>
          <p className="muted">
            Accepted means the email provider received it; inbox delivery can
            take longer. Unknown deliveries need review before any resend.
          </p>
        </>
      )}
    </section>
  );
}
