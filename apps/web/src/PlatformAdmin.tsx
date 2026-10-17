import { useEffect, useState } from "react";
import { api } from "./api";
import "./platform-admin.css";
type AdminVoteState =
  | { mode: "fixed"; fixedVotes: number; revision: number }
  | { mode: "artist"; minVotes: number; maxVotes: number; revision: number };
export function PlatformAdmin() {
  const [signed, setSigned] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [credential, setCredential] = useState("");
  const [policy, setPolicy] = useState<AdminVoteState | null>(null);
  const [mode, setMode] = useState<"fixed" | "artist">("fixed");
  const [fixed, setFixed] = useState(5);
  const [lower, setLower] = useState(3);
  const [upper, setUpper] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function load() {
    const current = await api<AdminVoteState>("/admin/voting");
    setPolicy(current);
    setMode(current.mode);
    if (current.mode === "fixed") setFixed(current.fixedVotes);
    else {
      setLower(current.minVotes);
      setUpper(current.maxVotes);
    }
  }
  useEffect(() => {
    let live = true;
    api<{ admin: boolean; configured: boolean }>("/admin/session")
      .then(async (res) => {
        if (!live) return;
        setConfigured(res.configured);
        setSigned(res.admin);
        if (res.admin) await load();
      })
      .catch((e) => {
        if (live) {
          setSigned(false);
          setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/admin/login", "POST", { token: credential });
      setCredential("");
      await load();
      setSigned(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!policy) return;
    if (mode === "artist" && lower > upper) {
      setError("The highest allowance must be at least the lowest.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const update =
        mode === "fixed"
          ? { mode: "fixed" as const, fixedVotes: fixed }
          : { mode: "artist" as const, minVotes: lower, maxVotes: upper };
      await api("/admin/voting", "PATCH", {
        commandId: crypto.randomUUID(),
        expectedRevision: policy.revision,
        policy: update,
      });
      await load();
      setSaved(
        "Voting settings saved. Each future song will use the updated policy; rounds already underway keep their original vote limits.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-admin">
      <span className="eyebrow">PLATFORM ADMINISTRATION</span>
      <h1>Sound Wave voting</h1>
      <p>
        Choose how many votes listeners receive for each song, across every
        artist account. The artist cannot exceed the limits you set.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {signed === null ? (
        <p>Checking administrator access…</p>
      ) : !signed ? (
        <form
          className="card admin-vote-panel"
          onSubmit={(e) => void signIn(e)}
        >
          <h2>Administrator sign-in</h2>
          {!configured && (
            <p role="alert">
              Platform administrator access needs a PLATFORM_ADMIN_TOKEN (or
              legacy ADMIN_TOKEN) configured on the server.
            </p>
          )}
          <label>
            Administrator credential
            <input
              type="password"
              autoComplete="current-password"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              required
              disabled={busy || !configured}
            />
          </label>
          <button disabled={busy || !configured}>
            Sign in to platform settings
          </button>
        </form>
      ) : (
        <>
          <form
            className="card admin-vote-panel"
            onSubmit={(e) => void save(e)}
          >
            <h2>Voting allowance for all artists</h2>
            <fieldset>
              <legend>Who sets the number of votes?</legend>
              <label>
                <input
                  type="radio"
                  name="vote-control"
                  checked={mode === "fixed"}
                  onChange={() => setMode("fixed")}
                />{" "}
                Platform chooses one fixed number for every artist
              </label>
              <label>
                <input
                  type="radio"
                  name="vote-control"
                  checked={mode === "artist"}
                  onChange={() => setMode("artist")}
                />{" "}
                Artist chooses within a range I approve
              </label>
            </fieldset>
            {mode === "fixed" ? (
              <label>
                Votes per listener per song
                <input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  required
                  value={fixed}
                  onChange={(e) => setFixed(Number(e.target.value))}
                />
              </label>
            ) : (
              <div className="admin-vote-range">
                <label>
                  Minimum artist choice
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    required
                    value={lower}
                    onChange={(e) => setLower(Number(e.target.value))}
                  />
                </label>
                <label>
                  Maximum artist choice
                  <input
                    type="number"
                    min={lower}
                    max={1000}
                    step={1}
                    required
                    value={upper}
                    onChange={(e) => setUpper(Number(e.target.value))}
                  />
                </label>
                <p className="muted">
                  Artists can select a number anywhere in this range for their
                  shows. For example, set 3–20 to let each artist choose 3, 5,
                  10, 20, or any whole number between.
                </p>
              </div>
            )}
            <p className="muted">
              Each Sound Wave a listener submits uses one vote. A listener can
              vote once per Sound Wave. The number of available ideas also
              limits how many votes can actually be cast.
            </p>
            <button disabled={busy}>
              {busy ? "Saving settings…" : "Save voting policy"}
            </button>
            {saved && <p role="status">{saved}</p>}
          </form>
          <button
            className="ghost small"
            type="button"
            onClick={async () => {
              setError("");
              await api("/admin/logout", "POST", {});
              setSigned(false);
              setPolicy(null);
            }}
          >
            Sign out of admin
          </button>
        </>
      )}
    </main>
  );
}
