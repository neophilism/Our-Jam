// CI-only live backend for native UI tests. Never used by production or local user startup.
import { testDatabase } from "../tests/database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { claimPlayback, heartbeat } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { configuredGeneration } from "../apps/api/src/generation-config.js";
import { randomUUID } from "node:crypto";
const db = await testDatabase();
const event = await createEvent(db, "our-jam", eventInput.parse({ title: "Native integration test", artistName: "Isolated CI fixture", slug: "native-integration", minimumRoundSeconds: 0, sources: [{ title: "Test-only source", corePrompt: "Private fixture prompt", durationSeconds: 1200 }] }));
const lease = await claimPlayback(db, "our-jam", event.id);
await advance(db, "our-jam", event.id, randomUUID(), 0, { ...lease, sequence: 1 }, true);
const keepAlive = setInterval(() => void heartbeat(db, "our-jam", event.id, lease), 8000);
const generation = configuredGeneration(undefined, { GENERATION_ENABLED: "1", GENERATION_EVENT_BUDGET_CENTS: "0", GENERATION_TOTAL_BUDGET_CENTS: "0" });
const app = await createApp(db, { origin: "http://127.0.0.1:4173", secureCookies: false, serveWeb: true, generation });
app.get("/__test__/native-evidence", async () => {
  const row = (await db.query("SELECT w.text, COALESCE(sum(a.points),0)::integer points FROM sound_waves w JOIN rounds r ON r.id=w.round_id LEFT JOIN allocations a ON a.wave_id=w.id WHERE r.event_id=$1 AND w.text='Native warm brass' GROUP BY w.id LIMIT 1", [event.id])).rows[0];
  return row ?? { text: null, points: 0 };
});
await app.listen({ host: "127.0.0.1", port: 4173 });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { clearInterval(keepAlive); await app.close(); await db.close(); process.exit(0); });
