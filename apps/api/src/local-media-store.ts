import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { MediaStore } from "../../../packages/providers/src/storage.js";
import { requireThat } from "../../../packages/domain/src/index.js";
const keyPattern = /^(albums|generated)\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{32,64}\.mp3$/;
async function usedBytes(directory: string): Promise<number> {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += await usedBytes(item);
    else if (entry.isFile()) bytes += (await stat(item)).size;
  }
  return bytes;
}
/** Explicit single-Mac storage; never selected by the hosted production entry point. */
export async function localMediaStore(root: string, origin: string, secret: string): Promise<{ store: MediaStore; register: (app: FastifyInstance) => void }> {
  const base = new URL(origin);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1") throw new Error("Local media is restricted to this Mac's loopback origin.");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const signature = (key: string, until: number, download: boolean) => createHmac("sha256", secret).update(JSON.stringify([key, until, download])).digest("hex");
  const store: MediaStore = {
    async put(key, bytes, sha) {
      requireThat(keyPattern.test(key), "invalid_media_key", "Invalid private media identity.");
      requireThat(bytes.length <= 32 * 1024 * 1024 && createHash("sha256").update(bytes).digest("hex") === sha, "invalid_media", "Audio integrity verification failed.");
      const destination = path.join(root, key);
      try { if (createHash("sha256").update(await readFile(destination)).digest("hex") === sha) return; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      requireThat((await usedBytes(root)) + bytes.length <= 1024 * 1024 * 1024, "local_storage_full", "The local audio limit is 1 GiB. Back up and manage old sessions before adding more files.", 507);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      const temporary = destination + "." + randomUUID() + ".tmp";
      try {
        await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
        await rename(temporary, destination);
      } finally { await rm(temporary, { force: true }); }
      const saved = await readFile(destination);
      requireThat(createHash("sha256").update(saved).digest("hex") === sha, "invalid_media", "Stored audio failed its integrity check.");
    },
    async url(key, download) {
      requireThat(keyPattern.test(key), "invalid_media_key", "Invalid private media identity.");
      const until = Math.floor(Date.now() / 1000) + 600;
      // Each validated segment is shorter than the router's parameter limit.
      return `${origin}/local-media/${key}?until=${until}&download=${download ? "1" : "0"}&sig=${signature(key, until, download)}`;
    },
  };
  return { store, register(app) {
    app.get("/local-media/:namespace/:eventId/:sourceId/:file", async (req, reply) => {
      const query = req.query as Record<string, string>;
      const params = req.params as Record<string, string>;
      const key = [params.namespace, params.eventId, params.sourceId, params.file].join("/");
      const until = Number(query.until), now = Math.floor(Date.now() / 1000), download = query.download === "1";
      const supplied = Buffer.from(query.sig ?? "", "hex"), expected = Buffer.from(signature(key, until, download), "hex");
      requireThat(keyPattern.test(key) && Number.isSafeInteger(until) && until >= now && until <= now + 900 && supplied.length === expected.length && timingSafeEqual(supplied, expected), "private_media", "This private audio link is invalid or expired.", 403);
      const file = path.join(root, key);
      const info = await stat(file);
      reply.header("Cache-Control", "private, no-store").header("Accept-Ranges", "bytes").type("audio/mpeg");
      if (download) reply.header("Content-Disposition", 'attachment; filename="our-jam.mp3"');
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = Number(match?.[1]), end = match?.[2] ? Number(match[2]) : info.size - 1;
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= info.size) return reply.code(416).header("Content-Range", `bytes */${info.size}`).send();
        return reply.code(206).header("Content-Length", end - start + 1).header("Content-Range", `bytes ${start}-${end}/${info.size}`).send(createReadStream(file, { start, end }));
      }
      return reply.header("Content-Length", info.size).send(createReadStream(file));
    });
  } };
}
