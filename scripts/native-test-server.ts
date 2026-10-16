// CI-only live backend for native UI tests. Never used by production or local user startup.
import { testDatabase } from "../tests/database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { claimPlayback, heartbeat } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { configuredGeneration } from "../apps/api/src/generation-config.js";
import { randomUUID } from "node:crypto";
const db = await testDatabase();
const event = await createEvent(
  db,
  "our-jam",
  eventInput.parse({
    title: "Native integration test",
    artistName: "Isolated CI fixture",
    slug: "native-integration",
    minimumRoundSeconds: 0,
    sources: [
      {
        title: "Test-only source",
        corePrompt: "Private fixture prompt",
        durationSeconds: 1200,
      },
    ],
  }),
);
const lease = await claimPlayback(db, "our-jam", event.id);
await advance(
  db,
  "our-jam",
  event.id,
  randomUUID(),
  0,
  { ...lease, sequence: 1 },
  true,
);
const keepAlive = setInterval(
  () => void heartbeat(db, "our-jam", event.id, lease),
  8000,
);
const generation = configuredGeneration(undefined, {
  GENERATION_ENABLED: "1",
  GENERATION_EVENT_BUDGET_CENTS: "0",
  GENERATION_TOTAL_BUDGET_CENTS: "0",
});
const app = await createApp(db, {
  origin: "http://127.0.0.1:4173",
  secureCookies: false,
  serveWeb: true,
  generation,
});
app.get("/__test__/native-evidence", async () => {
  const row = (
    await db.query(
      "SELECT w.text, COALESCE(sum(a.points),0)::integer points FROM sound_waves w JOIN rounds r ON r.id=w.round_id LEFT JOIN allocations a ON a.wave_id=w.id WHERE r.event_id=$1 AND w.text='Native warm brass' GROUP BY w.id LIMIT 1",
      [event.id],
    )
  ).rows[0];
  return row ?? { text: null, points: 0 };
});
// Isolated loopback-only controls for native sponsor acceptance. Never registered by production.
app.post("/__test__/native-sponsor", async (req, reply) => {
  if (req.headers.origin !== "http://127.0.0.1:4173")
    return reply.code(403).send({ error: "origin" });
  const ended = (req.body as any)?.ended === true;
  const opening = {
    durationSeconds: 15,
    clips: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        sponsorName: "Unavailable test video",
        slotSeconds: 5,
      },
    ],
  };
  await db.query(
    "UPDATE rounds SET settings=jsonb_set(settings,'{sponsorBreak}',$1::jsonb), state=$2,opened_at=now()-($3::integer*interval '1 second'),paused_at=CASE WHEN $2='paused' THEN now() ELSE NULL END,paused_ms=0,deadline_at=now()+interval '15 minutes',revision=revision+1 WHERE event_id=$4 AND state IN ('open','paused')",
    [
      JSON.stringify(opening),
      ended ? "open" : "paused",
      ended ? 16 : 0,
      event.id,
    ],
  );
  return { ok: true };
});
await app.listen({ host: "127.0.0.1", port: 4173 });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(keepAlive);
    await app.close();
    await db.close();
    process.exit(0);
  });
