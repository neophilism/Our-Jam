import { useEffect, useState } from "react";
import { api } from "./api";
type Settings = { timezone: string; visible: boolean; revision: number };
export function RecognitionSettings() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<Settings>("/operator/recognition-settings")
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="card">
      <h2>Creator recognition</h2>
      <p>
        Choose how your public leaderboards appear. Published track credits
        remain available separately; listeners control their own anonymity.
      </p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {settings && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSaved(false);
            try {
              setSettings(
                await api<Settings>("/operator/recognition-settings", "PUT", {
                  timezone: settings.timezone,
                  visible: settings.visible,
                  expectedRevision: settings.revision,
                }),
              );
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
              try {
                setSettings(
                  await api<Settings>("/operator/recognition-settings"),
                );
              } catch {}
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Leaderboard time zone
            <input
              required
              list="recognition-timezones"
              value={settings.timezone}
              disabled={busy}
              onChange={(e) => {
                setSettings({ ...settings, timezone: e.target.value });
                setSaved(false);
              }}
            />
          </label>
          <datalist id="recognition-timezones">
            {["UTC", ...Intl.supportedValuesOf("timeZone")].map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <p className="tiny muted">
            Weeks begin on Monday in this time zone; months follow the local
            calendar.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.visible}
              disabled={busy}
              onChange={(e) => {
                setSettings({ ...settings, visible: e.target.checked });
                setSaved(false);
              }}
            />
            Show public creator leaderboards
          </label>
          <button disabled={busy}>
            {busy ? "Saving…" : "Save recognition settings"}
          </button>
          {saved && <p role="status">Recognition settings saved.</p>}
        </form>
      )}
    </section>
  );
}
