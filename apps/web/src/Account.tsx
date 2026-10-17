import { useEffect, useState } from "react";
import { api, ensureGuest } from "./api";

export function Account() {
  const [profile, setProfile] = useState<any>(null),
    [status, setStatus] = useState<any>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [key, setKey] = useState(""),
    [savedKey, setSavedKey] = useState(""),
    [acknowledged, setAcknowledged] = useState(false);
  const [name, setName] = useState(""),
    [anonymous, setAnonymous] = useState(true);
  async function refresh() {
    const [session, next] = await Promise.all([
      api("/session"),
      api("/account"),
    ]);
    setProfile(session.profile);
    setStatus(next);
    setName(session.profile?.name ?? "");
    setAnonymous(session.profile?.anonymous ?? true);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function action(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function downloadKey() {
    const blob = new Blob(
      [
        `Our Jam profile recovery key\n\n${key}\n\nKeep this private. Anyone with this key can recover your profile.\nUse it only in the Recovery section of your Our Jam profile page.\n`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "our-jam-recovery-key.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="artist-page account-page">
      <span className="eyebrow">YOUR PART OF THE SOUND</span>
      <h1>Keep the music you helped shape.</h1>
      <p>
        Your profile remembers the Sound Waves you shared, the crowd-created
        tracks you loved, and the artists you follow. Save a recovery key to
        bring your profile to another device.
      </p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!status ? (
        <p>Opening your profile…</p>
      ) : (
        <>
          {profile ? (
            <section className="panel">
              <h2>Your profile</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api("/profile", "PATCH", {
                      name: name || "Anonymous",
                      anonymous,
                    });
                    await refresh();
                    setMessage("Profile saved.");
                  });
                }}
              >
                <label htmlFor="account-name">Display name</label>
                <input
                  id="account-name"
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => setAnonymous(e.target.checked)}
                  />
                  Show my contributions as Anonymous
                </label>
                <button disabled={busy}>Save profile</button>
              </form>
              <p>
                <a href="/library">Your liked tracks and followed artists ↗</a>
              </p>
            </section>
          ) : (
            <section className="panel">
              <h2>Start your music profile</h2>
              <p>
                Already have a recovery key? Restore your existing profile
                below.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await ensureGuest();
                    await refresh();
                  })
                }
              >
                Create a guest profile
              </button>
            </section>
          )}
          {profile && (
            <section className="panel">
              <h2>Protect your profile</h2>
              <p>
                {status.recoveryEnabled
                  ? "Recovery is enabled. Creating a new key replaces your old one."
                  : "Recovery is not set up. If this browser’s session is lost, we cannot reconnect you to this profile without a saved key."}
              </p>
              <p className="muted">
                Treat the key like a password. Anyone who has it can access your
                profile and sign out your other devices. It never unlocks
                performer access.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                I will keep my recovery key somewhere private.
              </label>
              <div className="account-actions">
                <button
                  disabled={busy || !acknowledged}
                  onClick={() =>
                    void action(async () => {
                      const next = await api(
                        "/account/recovery-key",
                        "POST",
                        {},
                      );
                      setKey(next.key);
                      setAcknowledged(false);
                      await refresh();
                    })
                  }
                >
                  {status.recoveryEnabled
                    ? "Replace recovery key"
                    : "Create recovery key"}
                </button>
                {status.recoveryEnabled && (
                  <button
                    className="ghost"
                    disabled={busy || !acknowledged}
                    onClick={() =>
                      void action(async () => {
                        await api("/account/recovery-key", "DELETE");
                        setKey("");
                        setAcknowledged(false);
                        await refresh();
                        setMessage(
                          "Recovery disabled. Your saved key no longer works.",
                        );
                      })
                    }
                  >
                    Disable recovery
                  </button>
                )}
              </div>
              {key && (
                <div className="recovery-key">
                  <label htmlFor="new-recovery-key">
                    Your new recovery key
                  </label>
                  <textarea
                    id="new-recovery-key"
                    readOnly
                    value={key}
                    rows={3}
                    spellCheck={false}
                  />
                  <p className="tiny muted">
                    Save it now. Our Jam cannot show this key again after you
                    leave this page.
                  </p>
                  <div className="account-actions">
                    <button className="ghost" onClick={downloadKey}>
                      Save key file
                    </button>
                    <button
                      className="ghost"
                      onClick={() => {
                        setKey("");
                        setMessage("Key hidden. Keep your saved copy private.");
                      }}
                    >
                      I saved it. Hide key
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          <section className="panel">
            <h2>Recover a profile</h2>
            <p>
              Paste a saved key to recover your profile here. This signs out
              that profile on other devices. Your current browser profile is
              replaced; profiles are not merged.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api("/account/recover", "POST", {
                    key: savedKey.trim(),
                    channel: "web",
                  });
                  setSavedKey("");
                  setKey("");
                  setAcknowledged(false);
                  await refresh();
                  setMessage(
                    "Your profile is back. Your other devices have been signed out.",
                  );
                });
              }}
            >
              <label htmlFor="saved-recovery-key">Saved recovery key</label>
              <input
                id="saved-recovery-key"
                type="password"
                value={savedKey}
                onChange={(e) => setSavedKey(e.target.value)}
                maxLength={100}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                required
              />
              <button disabled={busy || !savedKey.trim()}>
                Recover profile
              </button>
            </form>
          </section>
          {profile && (
            <section className="panel">
              <h2>This device</h2>
              <p>
                Signing out removes this browser’s access. Keep a recovery key
                if you want to return.
              </p>
              <button
                className="ghost"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api("/account/session", "DELETE");
                    setKey("");
                    await refresh();
                    setMessage("Signed out on this device.");
                  })
                }
              >
                Sign out of this profile
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export function FollowArtist({ artistId }: { artistId: string }) {
  const [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/artists/${encodeURIComponent(artistId)}/follow`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [artistId]);
  return (
    <div className="follow-artist">
      <button
        className={data?.following ? "ghost" : ""}
        disabled={busy || !data}
        aria-pressed={Boolean(data?.following)}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await ensureGuest();
            await api(
              `/artists/${encodeURIComponent(artistId)}/follow`,
              "PUT",
              { following: !data.following },
            );
            setData(
              await api(`/artists/${encodeURIComponent(artistId)}/follow`),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {data?.following ? "Following artist" : "Follow artist"}
      </button>
      <span className="muted">
        {data?.followers ?? 0}{" "}
        {data?.followers === 1 ? "follower" : "followers"}
      </span>
      <p className="tiny muted">
        Find this artist’s crowd creations in Your likes. Following does not
        subscribe you to emails.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function FollowingFeed() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/following")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="following-feed">
      <h2>Artists you follow</h2>
      <p>
        <a href="/account">Save or recover your profile ↗</a>
      </p>
      {error && <p className="muted">{error}</p>}
      {data?.artists.length === 0 && (
        <p className="empty">
          Follow an artist from their page to keep their music close.
        </p>
      )}
      <div className="artist-links">
        {data?.artists.map((a: any) => (
          <a
            className="button ghost small"
            key={a.id}
            href={`/artist/${encodeURIComponent(a.id)}`}
          >
            {a.name} ↗
          </a>
        ))}
      </div>
      {data?.tracks.length > 0 && (
        <>
          <h3>Fresh from their crowds</h3>
          <div className="following-tracks">
            {data.tracks.map((r: any) => (
              <a
                className="panel"
                key={r.id}
                href={`/event/${encodeURIComponent(r.slug)}?track=${r.id}`}
              >
                <strong>{r.title}</strong>
                <span className="muted">
                  {r.artist_name} · {r.event_title}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
