// Isolated browser-test server. This entry point is never used by production.
import { testDatabase } from "../tests/database.js";
import { createApp } from "../apps/api/src/app.js";
import { configuredGeneration } from "../apps/api/src/generation-config.js";
import { createEvent, advance } from "../apps/api/src/service.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { claimPlayback, heartbeat } from "../apps/api/src/playback.js";
import { randomUUID } from "node:crypto";
import type { EmailConfig, Mail } from "../apps/api/src/email-config.js";
import { emailTick } from "../apps/api/src/email.js";
const db = await testDatabase();
const slug = "rehearsal-" + Date.now();
const e = await createEvent(db, "our-jam", eventInput.parse({
  title: "The first wave", artistName: "Our Jam Rehearsal", slug, minimumRoundSeconds: 0,
  sources: [
    { title: "After the rain", corePrompt: "Synthetic test fixture: instrumental warm jazz bass", durationSeconds: 900 },
    { title: "Golden hour", corePrompt: "Synthetic test fixture: hip-hop drum groove", durationSeconds: 900 },
  ],
}));
const lease = await claimPlayback(db, "our-jam", e.id);
await advance(db, "our-jam", e.id, randomUUID(), 0, { ...lease, sequence: 1 });
const keepAlive = setInterval(() => void heartbeat(db, "our-jam", e.id, lease), 8000);
const messages: Mail[] = [];
const email: EmailConfig = {
  origin: "http://127.0.0.1:4173", from: "fixture@example.test", key: Buffer.alloc(32, 7),
  webhookSecret: "whsec_" + Buffer.alloc(32, 9).toString("base64"), maxPerDay: 100000,
  send: async (mail) => {
    if (mail.to.some((to) => !to.endsWith("@example.test"))) throw new Error("Test mail requires a reserved address");
    messages.push(mail); return randomUUID();
  },
};
const generation = configuredGeneration(undefined, {
  GENERATION_ENABLED: "1", GENERATION_EVENT_BUDGET_CENTS: "0", GENERATION_TOTAL_BUDGET_CENTS: "0",
});
const app = await createApp(db, {
  origin: "http://127.0.0.1:4173", operatorToken: "browser-test-only-operator-token-123456",
  secureCookies: false, serveWeb: true, email, generation,
  adminToken: "browser-test-only-platform-admin-token-123456789",
});
// Fixture-only endpoints are absent from the production build and public entry point.
app.get("/__test__/email", async () => ({ messages }));
app.post("/__test__/email/tick", async () => {
  await db.query("UPDATE email_dispatch_control SET next_send_at=now()-interval '1 second'");
  await emailTick(db, email); return { ok: true };
});
await app.listen({ host: "127.0.0.1", port: 4173 });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(keepAlive); await app.close(); await db.close(); process.exit(0);
  });
