import { test } from "node:test";
import assert from "node:assert/strict";
import http, { type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent } from "../apps/api/src/service.js";
import { eventInput } from "../packages/contracts/src/index.js";

function until<T>(promise: Promise<T>, phase: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Graceful shutdown stalled at: " + phase)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

test("shutdown ends a real live audience stream before onClose without aborting ordinary requests", async (t) => {
  const db = await testDatabase();
  const slug = "shutdown-" + randomUUID();
  await createEvent(db, "our-jam", eventInput.parse({ slug, title: "Shutdown test", artistName: "Isolated CI", sources: [{ title: "Source", corePrompt: "Private test core", durationSeconds: 180 }] }));
  const app = await createApp(db, { origin: "http://127.0.0.1", secureCookies: false });
  let allowRequest!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => { allowRequest = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  app.get("/__test__/held-request", async () => { entered(); await gate; return { completed: true }; });
  let stream: IncomingMessage | undefined;
  let client: http.ClientRequest | undefined;
  t.after(async () => {
    allowRequest(); stream?.destroy(); client?.destroy();
    app.server.closeAllConnections();
    await app.close(); await db.close();
  });
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  const opened = await until(new Promise<IncomingMessage>((resolve, reject) => {
    client = http.get(origin + "/api/events/" + slug + "/stream", (response) => {
      response.once("data", () => resolve(response));
      response.on("error", reject);
    });
    client.on("error", reject);
  }), "opening the stream");
  stream = opened;
  opened.resume();
  assert.equal(opened.statusCode, 200);
  assert.match(String(opened.headers["content-type"]), /text\/event-stream/);
  const ended = new Promise<void>((resolve, reject) => { opened.once("end", resolve); opened.once("error", reject); });
  const pending = fetch(origin + "/__test__/held-request", { headers: { Connection: "close" } }).then((r) => r.json());
  await until(started, "starting the ordinary request");
  let closed = false;
  const closing = app.close().then(() => { closed = true; });
  await until(ended, "ending the SSE response");
  assert.equal(closed, false, "ordinary in-flight requests must still be allowed to complete");
  allowRequest();
  assert.deepEqual(await until(pending, "finishing the ordinary request"), { completed: true });
  await until(closing, "closing the HTTP server");
  assert.equal(closed, true);
});
