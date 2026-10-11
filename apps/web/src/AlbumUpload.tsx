import { useEffect, useRef, useState } from "react";
import { api, type EventState } from "./api";
type Source = { id: string; title: string; played: boolean };
export function AlbumUpload({ data, refresh }: { data: EventState; refresh: () => Promise<void> }) {
  const [sources, setSources] = useState<Source[]>([]), [sourceId, setSourceId] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true), abort = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  useEffect(() => {
    let valid = true;
    Promise.all([api(`/operator/events/${data.event.id}/sources`), api("/operator/album-upload-capabilities")])
      .then(([catalog, capabilities]) => { if (!valid) return; setSources(catalog.sources); setAvailable(capabilities.available); })
      .catch((e) => { if (valid) setError(e.message); });
    return () => { valid = false; };
  }, [data.event.id, data.event.revision]);
  async function upload() {
    const file = input.current?.files?.[0];
    if (!file || !sourceId || busy) return;
    if (file.size > 128 * 1024 * 1024) { setError("Choose a file no larger than 128 MiB."); return; }
    setBusy(true); setError(""); setMessage("Uploading and checking the complete song. This does not contact a music generator.");
    const controller = new AbortController(); abort.current = controller;
    try {
      const catalog = await api(`/operator/events/${data.event.id}/sources`);
      const response = await fetch(`/api/operator/sources/${sourceId}/upload`, {
        method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/octet-stream", "X-Command-Id": crypto.randomUUID(), "X-Event-Revision": String(catalog.revision) },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || "Upload failed; the song was not replaced.");
      if (!mounted.current) return;
      setMessage(`Audio ready: ${Math.ceil(result.durationSeconds)} seconds. The show now uses this private MP3 playback copy.`);
      if (input.current) input.current.value = "";
      await refresh();
    } catch (e) { if (mounted.current) { setMessage(""); setError((e as Error).name === "AbortError" ? "Upload interrupted. Refresh the album before retrying to check whether it completed." : (e as Error).message); } }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section className="panel" aria-labelledby="album-upload-heading" style={{ padding: 20, marginBottom: 20 }}>
    <h3 id="album-upload-heading">Upload album audio</h3>
    <p>Choose a track from this session and upload its MP3 or WAV. The server validates the file, measures its duration, and stores a private 192 kbps MP3 playback copy. Keep your original master: the original upload is not retained.</p>
    {available === false && <p role="status">Private audio storage is not connected yet. Uploads are disabled; no file will be sent.</p>}
    <label style={{ marginTop: 12 }}>Album track<select value={sourceId} disabled={busy} onChange={(e) => setSourceId(e.target.value)}><option value="">Select an unplayed track</option>{sources.map((source) => <option key={source.id} value={source.id} disabled={source.played}>{source.title}{source.played ? " (already played)" : ""}</option>)}</select></label>
    <label style={{ marginTop: 12 }}>MP3 or WAV file<input ref={input} type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" disabled={busy || !available} /></label>
    <p className="tiny">15 seconds to ten minutes; up to 128 MiB. Title and private core prompt stay unchanged. A song cannot be replaced after its first round opens.</p>
    <button type="button" style={{ marginTop: 12 }} disabled={busy || !available || !sourceId || sources.find((source) => source.id === sourceId)?.played} onClick={() => void upload()}>{busy ? "Checking audio..." : "Upload and use this song"}</button>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
