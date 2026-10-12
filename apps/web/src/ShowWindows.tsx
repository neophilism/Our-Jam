import type { EventState } from "./api";

/** Launches the existing live display; never creates a second event or preview. */
export function ShowWindows({ data }: { data: EventState }) {
  const origin = location.origin;
  const slug = data.event.slug;
  const displayUrl = `${origin}/screen/${encodeURIComponent(slug)}`;
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
  return (
    <section className="panel" aria-labelledby="show-windows-heading" style={{ padding: 20, marginBottom: 20 }}>
      <h3 id="show-windows-heading">Your app and venue screen</h3>
      <p>Use this server and event code in the native app. The monitor window shows this same live event.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, margin: "14px 0" }}>
        <label>Native app server<input readOnly value={origin} onFocus={(e) => e.currentTarget.select()} /></label>
        <label>Native app event code<input readOnly value={slug} onFocus={(e) => e.currentTarget.select()} /></label>
      </div>
      <button type="button" onClick={() => {
        window.open(displayUrl, "_blank", "popup,noopener,noreferrer,width=1440,height=900");
      }}>Open monitor window</button>
      <p className="tiny" style={{ marginTop: 10 }}>
        Drag the new window onto your external display and use the browser's full-screen control.
        Browser settings may open a tab or block a popup. <a href={displayUrl} target="_blank" rel="noopener noreferrer">Open the same public-screen link</a> in that case.
      </p>
      {local && <p className="tiny" role="note">This is a same-Mac rehearsal. The native iOS Simulator can reach this address, but other phones cannot use a localhost QR code. A reachable HTTPS deployment is needed for a crowd on separate devices.</p>}
    </section>
  );
}
