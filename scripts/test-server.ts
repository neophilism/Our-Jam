// Isolated browser-test server. This entry point is never used by production.
import { testDatabase } from "../tests/database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { claimPlayback, heartbeat } from "../apps/api/src/playback.js";
import { randomUUID } from "node:crypto";
const db = await testDatabase();
const slug = "rehearsal-" + Date.now();
const e = await createEvent(
  db,
  "our-jam",
  eventInput.parse({
    title: "The first wave",
    artistName: "Our Jam Rehearsal",
    slug,
    minimumRoundSeconds: 0,
    sources: [
      {
        title: "After the rain",
        corePrompt: "Synthetic test fixture: instrumental warm jazz bass",
        durationSeconds: 900,
      },
      {
        title: "Golden hour",
        corePrompt: "Synthetic test fixture: hip-hop drum groove",
        durationSeconds: 900,
      },
    ],
  }),
);
const lease = await claimPlayback(db, "our-jam", e.id);
await advance(db, "our-jam", e.id, randomUUID(), 0, { ...lease, sequence: 1 });
const keepAlive = setInterval(
  () => void heartbeat(db, "our-jam", e.id, lease),
  8000,
);
const app = await createApp(db, {
  origin: "http://127.0.0.1:4173",
  operatorToken: "browser-test-only-operator-token-123456",
  secureCookies: false,
  serveWeb: true,
});
await app.listen({ host: "127.0.0.1", port: 4173 });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(keepAlive);
    await app.close();
    await db.close();
    process.exit(0);
  });
