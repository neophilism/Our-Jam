import { useEffect, useRef, useState } from "react";
import { api, ensureGuest } from "./api";
export function PublicAvatar({
  seed = "music",
  url,
}: {
  seed?: string;
  url?: string | null;
}) {
  if (url && /^\/api\/avatars\/[a-f0-9]{64}$/.test(url))
    return (
      <img
        className="avatar"
        src={url}
        alt=""
        aria-hidden="true"
        width={44}
        height={44}
        style={{ objectFit: "cover", borderRadius: "50%" }}
      />
    );
  return (
    <span className="avatar" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i
          key={i}
          style={{
            height:
              7 +
              ((seed || "music").charCodeAt(i % (seed || "music").length) % 18),
          }}
        />
      ))}
    </span>
  );
}
export function ProfilePicture() {
  const [revision, setRevision] = useState<number | null>(null),
    [image, setImage] = useState(""),
    [consent, setConsent] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    fileRevision = useRef(0);
  useEffect(() => {
    const generation = ++epoch.current;
    ensureGuest()
      .then(() => api("/session"))
      .then((value) => {
        if (generation === epoch.current)
          setRevision(value.profile.avatar_revision);
      })
      .catch((e) => {
        if (generation === epoch.current) setError(e.message);
      });
    return () => {
      epoch.current++;
    };
  }, []);
  const prepare = async (file?: File) => {
    const generation = epoch.current,
      selectedFile = ++fileRevision.current;
    setError("");
    setStatus("");
    setConsent(false);
    setImage("");
    if (!file) return;
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error(
          "Choose a PNG, JPEG or WebP picture smaller than 5 MB.",
        );
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Picture editing is not available in this browser.");
        const side = Math.min(bitmap.width, bitmap.height);
        context.drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          128,
          128,
        );
        if (
          generation === epoch.current &&
          selectedFile === fileRevision.current
        )
          setImage(canvas.toDataURL("image/png"));
      } finally {
        bitmap.close();
      }
    } catch (e) {
      if (generation === epoch.current && selectedFile === fileRevision.current)
        setError((e as Error).message);
    }
  };
  const save = async (remove = false) => {
    if (revision === null) return;
    fileRevision.current++;
    const generation = epoch.current;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await api(
        "/profile/avatar",
        remove ? "DELETE" : "PUT",
        remove
          ? { expectedRevision: revision }
          : {
              png: image.split(",")[1],
              publicUseConsent: consent,
              expectedRevision: revision,
            },
      );
      if (generation !== epoch.current) return;
      setRevision(result.revision);
      setImage("");
      setConsent(false);
      setStatus(
        remove
          ? "Profile picture removed. Your musical avatar is back."
          : result.avatarUrl
            ? "Public profile picture saved."
            : "Picture saved. Anonymous keeps it hidden.",
      );
    } catch (e) {
      if (generation === epoch.current) {
        setError((e as Error).message);
        try {
          const value = await api("/session");
          if (generation === epoch.current)
            setRevision(value.profile.avatar_revision);
        } catch {}
      }
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  };
  return (
    <section aria-label="Profile picture">
      <h3>Your picture, optionally</h3>
      <p className="tiny muted">
        Your musical avatar works without a photo. A photo is public with your
        name; choosing Anonymous hides it. Location and camera metadata are
        removed.
      </p>
      <label>
        Choose profile picture
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => void prepare(e.target.files?.[0])}
        />
      </label>
      {image && (
        <>
          <img
            src={image}
            width={80}
            height={80}
            alt="New profile picture preview"
          />
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I have permission to use this picture on my public profile.
          </label>
          <button
            type="button"
            disabled={!consent || busy || revision === null}
            onClick={() => void save()}
          >
            Save profile picture
          </button>
        </>
      )}
      <button
        type="button"
        className="ghost small"
        disabled={busy || revision === null}
        onClick={() => void save(true)}
      >
        Use my musical avatar
      </button>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
