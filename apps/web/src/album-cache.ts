export type AlbumCopy = {
  eventId: string;
  sourceId: string;
  name: string;
  sha256: string;
  duration: number;
  bytes: number;
  blob: Blob;
};
export type AlbumCopyInfo = Omit<AlbumCopy, "blob">;
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return (connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("our-jam-album-backup", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("files", {
        keyPath: ["eventId", "sourceId"],
      });
      store.createIndex("event", "eventId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      connection = undefined;
      reject(request.error);
    };
  }));
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (result: T) => void) => void,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Local album storage was interrupted."));
    run(tx.objectStore("files"), (value) => (result = value));
  });
}
async function hash(blob: Blob) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
function duration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob),
      audio = new Audio();
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const seconds = audio.duration;
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(seconds);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "This browser could not inspect the file within ten seconds.",
          ),
        ),
      10000,
    );
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      finish(
        Number.isFinite(audio.duration) &&
          audio.duration > 0 &&
          audio.duration <= 1200
          ? undefined
          : new Error("Choose a fixed-length audio file up to twenty minutes."),
      );
    audio.onerror = () =>
      finish(new Error("This browser cannot read that audio file."));
    audio.src = url;
  });
}
export async function saveAlbumCopy(
  eventId: string,
  sourceId: string,
  file: File,
) {
  if (!file.size || file.size > 100 * 1024 * 1024)
    throw new Error("Choose an audio file between 1 byte and 100 MB.");
  const estimate = await navigator.storage?.estimate();
  if (
    estimate?.quota &&
    estimate.quota - (estimate.usage ?? 0) < file.size + 20 * 1024 * 1024
  )
    throw new Error(
      "Not enough local space. Export recordings or remove old backup copies first.",
    );
  const seconds = await duration(file),
    sha256 = await hash(file);
  const copy: AlbumCopy = {
    eventId,
    sourceId,
    name: file.name,
    sha256,
    duration: seconds,
    bytes: file.size,
    blob: file,
  };
  await transaction<void>("readwrite", (store, done) => {
    store.put(copy);
    done();
  });
}
export function albumCopies(eventId: string) {
  return transaction<AlbumCopyInfo[]>("readonly", (store, done) => {
    const request = store.index("event").getAll(eventId);
    request.onsuccess = () =>
      done((request.result as AlbumCopy[]).map(({ blob, ...info }) => info));
  });
}
export function removeAlbumCopy(eventId: string, sourceId: string) {
  return transaction<void>("readwrite", (store, done) => {
    store.delete([eventId, sourceId]);
    done();
  });
}
export async function verifiedAlbumCopy(eventId: string, sourceId: string) {
  const copy = await transaction<AlbumCopy | undefined>(
    "readonly",
    (store, done) => {
      const request = store.get([eventId, sourceId]);
      request.onsuccess = () => done(request.result);
    },
  );
  if (!copy) throw new Error("Choose a local file for this track first.");
  if ((await hash(copy.blob)) !== copy.sha256)
    throw new Error(
      "Backup checksum mismatch. Replace this copy from your original file.",
    );
  return copy;
}
