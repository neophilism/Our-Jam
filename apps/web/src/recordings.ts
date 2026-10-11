export type Take = {
  id: string;
  eventId: string;
  startedAt: string;
  mimeType: string;
  status: "recording" | "completed" | "interrupted";
  bytes: number;
  chunks: number;
  device: string;
  sampleRate?: number;
  channels?: number;
  timeline: { at: string; queueItemId: string | null }[];
};
export type Chunk = {
  takeId: string;
  sequence: number;
  at: string;
  sha256: string;
  blob: Blob;
};
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("our-jam-recordings", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("takes", { keyPath: "id" });
      const chunks = r.result.createObjectStore("chunks", {
        keyPath: ["takeId", "sequence"],
      });
      chunks.createIndex("take", "takeId");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, done: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    run(tx, (value) => (result = value));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Recording storage was interrupted."));
  });
}
export function saveTake(take: Take) {
  return transaction<void>(["takes"], "readwrite", (tx, done) => {
    tx.objectStore("takes").put(take);
    done();
  });
}
export function listTakes(eventId: string) {
  return transaction<Take[]>(["takes"], "readonly", (tx, done) => {
    const r = tx.objectStore("takes").getAll();
    r.onsuccess = () =>
      done(
        (r.result as Take[])
          .filter((t) => t.eventId === eventId)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      );
  });
}
export async function storeChunk(take: Take, blob: Blob) {
  const bytes = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const chunk: Chunk = {
    takeId: take.id,
    sequence: take.chunks,
    at: new Date().toISOString(),
    sha256: Array.from(new Uint8Array(hash), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join(""),
    blob,
  };
  const next = {
    ...take,
    chunks: take.chunks + 1,
    bytes: take.bytes + blob.size,
  };
  await transaction<void>(["takes", "chunks"], "readwrite", (tx, done) => {
    tx.objectStore("chunks").add(chunk);
    tx.objectStore("takes").put(next);
    done();
  });
  return next;
}
export function getChunk(takeId: string, sequence: number) {
  return transaction<Chunk>(["chunks"], "readonly", (tx, done) => {
    const r = tx.objectStore("chunks").get([takeId, sequence]);
    r.onsuccess = () => done(r.result);
  });
}
export async function verifiedChunk(takeId: string, sequence: number) {
  const chunk = await getChunk(takeId, sequence);
  if (!chunk)
    throw new Error(
      "A recording chunk is missing. Keep the remaining chunks for recovery.",
    );
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await chunk.blob.arrayBuffer()),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== chunk.sha256)
    throw new Error(
      "Recording checksum mismatch. Keep the raw chunks for recovery.",
    );
  return chunk;
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportTake(take: Take) {
  const extension = take.mimeType.includes("mp4") ? "m4a" : "webm";
  const name = `our-jam-${take.id}.${extension}`;
  const picker = (window as any).showSaveFilePicker;
  if (picker) {
    const handle = await picker({ suggestedName: name });
    const writer = await handle.createWritable();
    try {
      for (let i = 0; i < take.chunks; i++)
        await writer.write((await verifiedChunk(take.id, i)).blob);
      await writer.close();
    } catch (e) {
      await writer.abort();
      throw e;
    }
    return;
  }
  if (take.bytes > 256 * 1024 * 1024)
    throw new Error(
      "This recording is too large for an in-memory download. Use a desktop browser with streaming file saves, or save the raw chunks below.",
    );
  const parts: Blob[] = [];
  for (let i = 0; i < take.chunks; i++)
    parts.push((await verifiedChunk(take.id, i)).blob);
  download(new Blob(parts, { type: take.mimeType }), name);
}
