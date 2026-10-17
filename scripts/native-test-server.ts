import { fixtureIdentityToken } from "../tests/fixtures/identity-token.js";
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
  identity: {
    authUrl: "http://127.0.0.1:4173/__test__/auth",
    providers: ["google"],
    verify: async (token) => {
      if (token !== fixtureIdentityToken)
        throw Error("Invalid native fixture identity");
      return {
        iss: "http://127.0.0.1:4173",
        sub: "native-test-account",
        emailVerified: true,
        name: "Native account fan",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      };
    },
  },
});
// Bounded CI diagnostics: route names/status only, never handoff query values,
// identity tokens, credentials or request bodies. Not registered in production.
app.addHook("onResponse", async (req, reply) => {
  if (req.url.startsWith("/api/identity/") || req.url.startsWith("/__test__/auth/") || req.url.startsWith("/signin"))
    console.log(JSON.stringify({ route: req.routeOptions.url, status: reply.statusCode }));
});
// Controlled provider fixture for actual ASWebAuthenticationSession UI tests;
// no email, password, external OAuth provider or real account is contacted.
app.get("/__test__/auth/get-session", async (_req, reply) => {
  reply.header("set-auth-jwt", fixtureIdentityToken);
  return {
    user: {
      id: "native-test-account",
      email: "native@example.test",
      name: "Native account fan",
      emailVerified: true,
    },
    session: {
      id: "native-test-session",
      userId: "native-test-account",
      token: fixtureIdentityToken,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    },
  };
});
app.get("/__test__/auth/token", async () => ({ token: fixtureIdentityToken }));
app.get("/__test__/native-account-evidence", async () => ({
  completed: (await db.query("SELECT count(*)::integer completed FROM native_identity_handoffs WHERE consumed_at IS NOT NULL")).rows[0].completed,
}));
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
    "UPDATE rounds SET settings=jsonb_set(settings,'{sponsorBreak}',$1::jsonb), state=$2,opened_at=now()-($3::integer*interval '1 second'),paused_at=CASE WHEN $2='paused' THEN now() ELSE NULL END,paused_ms=0,deadline_at=now()+interval '15 minutes' WHERE event_id=$4 AND state IN ('open','paused')",
    [
      JSON.stringify(opening),
      ended ? "open" : "paused",
      ended ? 16 : 0,
      event.id,
    ],
  );
  await db.query("UPDATE events SET revision=revision+1 WHERE id=$1", [
    event.id,
  ]);
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
