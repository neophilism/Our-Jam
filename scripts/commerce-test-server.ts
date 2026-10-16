// Loopback-only integration fixture. Never imported by the production entry point.
import { testDatabase } from "../tests/database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent } from "../apps/api/src/service.js";
import { eventInput } from "../packages/contracts/src/index.js";
import {
  quoteEvent,
  beginCheckout,
  applyPaymentEvent,
  type PaymentGateway,
} from "../apps/api/src/commerce.js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const origin = "http://127.0.0.1:4174",
  db = await testDatabase(),
  objects = new Map<string, Uint8Array>();
const dir = await mkdtemp(path.join(tmpdir(), "ourjam-feature-browser-")),
  file = path.join(dir, "fixture.mp4");
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=blue:s=320x180:d=2",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  file,
]);
const video = await readFile(file);
await rm(dir, { recursive: true, force: true });
const gateway: PaymentGateway = {
  checkout: async (p) => ({
    id: "cs_" + p.id,
    url: "https://checkout.stripe.com/test/" + p.id,
    expiresAt: Math.floor(Date.now() / 1000) + 1800,
  }),
  verify: () => {
    throw Error("Fixture has no signed live callbacks");
  },
};
const app = await createApp(db, {
  origin,
  operatorToken: "browser-test-only-operator-token-123456",
  secureCookies: false,
  serveWeb: true,
  commerce: {
    enabled: true,
    adminToken: "browser-test-only-admin-token-12345678",
    gateway,
  },
  identity: {
    authUrl: "https://auth.example.test/neondb/auth",
    providers: ["google", "github"],
    verify: async (token) => {
      if (token !== "fixture-valid") throw Error("invalid fixture token");
      return {
        iss: "https://auth.example.test",
        sub: "browser-identity",
        name: "Fixture account",
        emailVerified: true,
        banned: false,
        exp: Math.floor(Date.now() / 1000) + 900,
      };
    },
  },
  mediaStore: {
    put: async (key, bytes) => {
      objects.set(key, bytes);
    },
    url: async (key) => origin + "/__test__/media/" + encodeURIComponent(key),
  },
});
app.get("/__test__/media/:key", async (req, reply) =>
  reply
    .type("video/mp4")
    .send(Buffer.from(objects.get((req.params as any).key) ?? video)),
);
app.get("/__test__/video", async (_req, reply) =>
  reply.type("video/mp4").send(video),
);
app.post("/__test__/event", async (req) => {
  const body = req.body as any;
  const slug = "feature-" + randomUUID();
  const event = await createEvent(
    db,
    "our-jam",
    eventInput.parse({
      title: "Feature browser test",
      artistName: "Fixture artist",
      slug,
      minimumRoundSeconds: 0,
      sources: [
        {
          title: "Fixture song",
          corePrompt: "Private fixture core",
          durationSeconds: 121,
        },
      ],
    }),
  );
  await db.query(
    "UPDATE source_tracks SET duration_verified=true WHERE event_id=$1",
    [event.id],
  );
  await db.query(
    "UPDATE commerce_settings SET prices=$1,break_seconds=20,slot_seconds=5",
    [JSON.stringify({ platform: 100, ad_free: 200, own_sponsors: 300 })],
  );
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const id = randomUUID();
    ids.push(id);
    await db.query(
      "INSERT INTO sponsor_videos(id,sponsor_name,object_key,sha256,duration_seconds,active) VALUES($1,$2,$3,'fixture',2,true)",
      [id, `Fixture sponsor ${i + 1}`, `fixture-${id}`],
    );
  }
  await db.query("UPDATE commerce_settings SET platform_video_ids=$1", [
    JSON.stringify(ids),
  ]);
  if (body?.paid) {
    const tier = body.tier ?? "platform",
      q = await quoteEvent(db, event.id, tier),
      r = await beginCheckout(
        db,
        "our-jam",
        event.id,
        { commandId: randomUUID(), tier, quoteHash: q.hash },
        gateway,
        origin,
      );
    const p = (
      await db.query("SELECT * FROM event_purchases WHERE id=$1", [
        r.purchaseId,
      ])
    ).rows[0];
    await applyPaymentEvent(db, {
      id: "evt_" + randomUUID(),
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: p.session_id,
          client_reference_id: p.id,
          metadata: { purchaseId: p.id },
          mode: "payment",
          payment_status: "paid",
          amount_total: p.amount_cents,
          currency: p.currency,
          payment_intent: "pi_" + p.id,
        },
      },
    });
  }
  return event;
});
app.post("/__test__/elapsed", async (req) => {
  const { eventId } = req.body as any;
  await db.query(
    "UPDATE rounds SET opened_at=opened_at-interval '25 seconds' WHERE event_id=$1",
    [eventId],
  );
  return { ok: true };
});
await app.listen({ host: "127.0.0.1", port: 4174 });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
