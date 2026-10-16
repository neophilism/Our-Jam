import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database, Sql } from "./db.js";
import type { MediaStore } from "../../../packages/providers/src/storage.js";
import {
  digest,
  requireThat,
  DomainError,
} from "../../../packages/domain/src/index.js";
import { id } from "../../../packages/contracts/src/index.js";
import { ownedEvent, logEvent } from "./service.js";
import { eventAccess, setlist, type Tier } from "./commerce-policy.js";
import { prepareSponsorVideo, MAX_VIDEO_BYTES } from "./sponsor-media.js";
export type PaymentGateway = {
  checkout(
    purchase: any,
    returnUrl: string,
  ): Promise<{ id: string; url: string; expiresAt: number }>;
  verify(
    body: Buffer,
    signature: string,
  ): { id: string; type: string; livemode: boolean; data: { object: any } };
};
export type CommerceConfig = {
  enabled: boolean;
  adminToken?: string;
  gateway?: PaymentGateway;
  live?: boolean;
};
export function configuredCommerce(
  env: NodeJS.ProcessEnv = process.env,
): CommerceConfig | undefined {
  if (env.COMMERCE_ENABLED !== "1") return;
  const live =
    env.COMMERCE_LIVE_PAYMENTS_ACK === "our-jam-live-charges-approved";
  const key = env.STRIPE_SECRET_KEY,
    secret = env.STRIPE_WEBHOOK_SECRET;
  if (key && !live && !key.startsWith("sk_test_"))
    throw new Error(
      "Use Stripe test keys until live charges are explicitly enabled.",
    );
  const stripe =
    key && secret
      ? new Stripe(key, { maxNetworkRetries: 1, timeout: 15000 })
      : undefined;
  return {
    enabled: true,
    adminToken: env.PLATFORM_ADMIN_TOKEN,
    live,
    gateway: stripe
      ? {
          checkout: async (p, returnUrl) => {
            const s = await stripe.checkout.sessions.create(
              {
                mode: "payment",
                allowed_payment_method_types: ["card"],
                client_reference_id: p.id,
                metadata: { purchaseId: p.id },
                line_items: [
                  {
                    quantity: 1,
                    price_data: {
                      currency: p.currency,
                      unit_amount: p.amount_cents,
                      product_data: {
                        name: `Our Jam event · ${p.tier} · ${Math.ceil(p.setlist_seconds / 60)} setlist minutes`,
                      },
                    },
                  },
                ],
                success_url: returnUrl + "?payment=processing",
                cancel_url: returnUrl + "?payment=cancelled",
                expires_at: Math.floor(Date.now() / 1000) + 1800,
              },
              { idempotencyKey: `our-jam-event-${p.id}` },
            );
            requireThat(
              s.url && new URL(s.url).hostname === "checkout.stripe.com",
              "checkout_unavailable",
              "Payment checkout is unavailable. Retry this same checkout.",
              503,
            );
            return { id: s.id, url: s.url!, expiresAt: s.expires_at };
          },
          verify: (body, signature) =>
            stripe.webhooks.constructEvent(body, signature, secret!),
        }
      : undefined,
  };
}
const tierInput = z.enum(["platform", "ad_free", "own_sponsors"]);
export const pricingInput = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    currency: z.enum(["usd", "eur", "gbp"]),
    prices: z.object({
      platform: z.number().int().positive().max(100000),
      ad_free: z.number().int().positive().max(100000),
      own_sponsors: z.number().int().positive().max(100000),
    }),
    breakSeconds: z.number().int().min(0).max(120),
    slotSeconds: z.number().int().min(1).max(60),
    platformVideoIds: z.array(id).max(24),
  })
  .refine(
    (v) =>
      v.prices.platform < v.prices.ad_free &&
      v.prices.ad_free < v.prices.own_sponsors,
    "Higher plans must have higher per-minute prices.",
  );
export async function quoteEvent(db: Sql, eventId: string, tier: Tier) {
  const catalog = await setlist(db, eventId);
  const settings = (
    await db.query("SELECT * FROM commerce_settings WHERE singleton=true")
  ).rows[0];
  const paid = (
    await db.query(
      "SELECT amount_cents FROM event_purchases WHERE event_id=$1 AND state='paid' AND currency=$2",
      [eventId, settings.currency],
    )
  ).rows.reduce((n, p) => n + Number(p.amount_cents), 0);
  const rate = Number(settings.prices[tier]),
    total = Math.ceil(catalog.seconds / 60) * rate;
  const quote = {
    eventId,
    tier,
    setlistSeconds: catalog.seconds,
    verified: catalog.verified,
    billableMinutes: Math.ceil(catalog.seconds / 60),
    rateCents: rate,
    currency: settings.currency,
    totalCents: total,
    creditCents: paid,
    amountCents: Math.max(0, total - paid),
    pricingRevision: settings.revision,
  };
  return { ...quote, hash: digest(JSON.stringify(quote)) };
}
export async function beginCheckout(
  db: Database,
  artistId: string,
  eventId: string,
  input: { commandId: string; tier: Tier; quoteHash: string },
  gateway: PaymentGateway,
  origin: string,
) {
  const purchase = await db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, artistId, true);
    const prior = (
      await tx.query(
        "SELECT * FROM event_purchases WHERE artist_id=$1 AND command_id=$2",
        [artistId, input.commandId],
      )
    ).rows[0];
    if (prior) {
      requireThat(
        prior.event_id === eventId &&
          prior.tier === input.tier &&
          prior.quote_hash === input.quoteHash,
        "command_conflict",
        "Use a new command for a different checkout.",
        409,
      );
      return prior;
    }
    requireThat(
      event.state === "waiting",
      "event_started",
      "Buy access before starting this event.",
      409,
    );
    await tx.query(
      "SELECT singleton FROM commerce_settings WHERE singleton=true FOR UPDATE",
    );
    const q = await quoteEvent(tx, eventId, input.tier);
    requireThat(
      q.verified,
      "setlist_unverified",
      "Upload every track before purchasing; pricing uses verified audio length.",
      409,
    );
    requireThat(
      q.rateCents > 0 && q.totalCents > 0,
      "pricing_unavailable",
      "The administrator has not published event prices.",
      503,
    );
    requireThat(
      q.hash === input.quoteHash,
      "quote_changed",
      "The setlist or price changed. Review the updated quote before paying.",
      409,
    );
    const access = await eventAccess(tx, eventId, input.tier);
    requireThat(
      !access.paid,
      "already_paid",
      "This event already has access to that plan.",
      409,
    );
    requireThat(
      q.amountCents > 0,
      "upgrade_review_required",
      "This change needs administrator review; no duplicate charge was created.",
      409,
    );
    requireThat(
      !(
        await tx.query(
          "SELECT id FROM event_purchases WHERE event_id=$1 AND state='pending'",
          [eventId],
        )
      ).rows.length,
      "checkout_pending",
      "An existing checkout is pending. Resume it or wait for its verified expiration.",
      409,
    );
    const p = (
      await tx.query(
        "INSERT INTO event_purchases(id,event_id,artist_id,command_id,quote_hash,tier,setlist_seconds,amount_cents,required_paid_cents,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [
          randomUUID(),
          eventId,
          artistId,
          input.commandId,
          q.hash,
          input.tier,
          q.setlistSeconds,
          q.amountCents,
          q.totalCents,
          q.currency,
        ],
      )
    ).rows[0];
    return p;
  });
  requireThat(
    purchase.state === "pending",
    "checkout_finished",
    "This checkout has completed or expired. Refresh its status.",
    409,
  );
  if (purchase.checkout_url)
    return { url: purchase.checkout_url, purchaseId: purchase.id };
  const slug = (await ownedEvent(db, eventId, artistId)).slug;
  const s = await gateway.checkout(purchase, origin + "/performer/" + slug);
  await db.query(
    "UPDATE event_purchases SET session_id=$1,checkout_url=$2,expires_at=$3 WHERE id=$4 AND state='pending'",
    [s.id, s.url, new Date(s.expiresAt * 1000), purchase.id],
  );
  return { url: s.url, purchaseId: purchase.id };
}
export async function applyPaymentEvent(
  db: Database,
  event: { id: string; type: string; livemode: boolean; data: { object: any } },
  live = false,
) {
  requireThat(
    event.livemode === live,
    "payment_mode_mismatch",
    "Payment mode does not match this server.",
    400,
  );
  const o = event.data.object;
  return db.transaction(async (tx) => {
    const receipt = await tx.query(
      "INSERT INTO payment_receipts(provider_event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING provider_event_id",
      [event.id],
    );
    if (!receipt.rows.length) return { ok: true };
    if (["charge.refunded", "charge.dispute.created"].includes(event.type)) {
      const intent =
        typeof o.payment_intent === "string"
          ? o.payment_intent
          : o.payment_intent?.id;
      if (intent) {
        const row = (
          await tx.query(
            "SELECT event_id FROM event_purchases WHERE payment_intent=$1",
            [intent],
          )
        ).rows[0];
        if (row)
          await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [
            row.event_id,
          ]);
        await tx.query(
          "INSERT INTO payment_intent_states(payment_intent,revoked) VALUES($1,true) ON CONFLICT(payment_intent) DO UPDATE SET revoked=true",
          [intent],
        );
        await tx.query(
          "UPDATE event_purchases SET state='revoked' WHERE payment_intent=$1",
          [intent],
        );
      }
      return { ok: true };
    }
    if (
      ![
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.expired",
      ].includes(event.type)
    )
      return { ok: true };
    const purchaseId = id.safeParse(o.metadata?.purchaseId);
    if (!purchaseId.success) return { ok: true };
    const row = (
      await tx.query("SELECT event_id FROM event_purchases WHERE id=$1", [
        purchaseId.data,
      ])
    ).rows[0];
    requireThat(
      row,
      "payment_not_found",
      "Payment reference is not recognized.",
      409,
    );
    await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [
      row.event_id,
    ]);
    const p = (
      await tx.query("SELECT * FROM event_purchases WHERE id=$1 FOR UPDATE", [
        purchaseId.data,
      ])
    ).rows[0];
    requireThat(
      p.session_id === o.id && o.client_reference_id === p.id,
      "payment_session_mismatch",
      "Payment session is not recognized.",
      409,
    );
    if (event.type === "checkout.session.expired") {
      await tx.query(
        "UPDATE event_purchases SET state='expired' WHERE id=$1 AND state='pending'",
        [p.id],
      );
      return { ok: true };
    }
    if (o.payment_status !== "paid") return { ok: true };
    requireThat(
      o.mode === "payment" &&
        o.amount_total === p.amount_cents &&
        o.currency === p.currency,
      "payment_amount_mismatch",
      "Payment does not match the saved quote.",
      400,
    );
    const intent =
      typeof o.payment_intent === "string"
        ? o.payment_intent
        : o.payment_intent?.id;
    requireThat(
      typeof intent === "string",
      "payment_intent_missing",
      "A verified payment intent is required.",
      400,
    );
    await tx.query(
      "INSERT INTO payment_intent_states(payment_intent) VALUES($1) ON CONFLICT DO NOTHING",
      [intent],
    );
    const revoked = (
      await tx.query(
        "SELECT revoked FROM payment_intent_states WHERE payment_intent=$1 FOR UPDATE",
        [intent],
      )
    ).rows[0].revoked;
    if (p.state !== "revoked")
      await tx.query(
        "UPDATE event_purchases SET state=$1,paid_at=COALESCE(paid_at,now()),payment_intent=$2 WHERE id=$3",
        [revoked ? "revoked" : "paid", intent, p.id],
      );
    if (!revoked) {
      await tx.query(
        "INSERT INTO event_commerce(event_id,tier) VALUES($1,$2) ON CONFLICT(event_id) DO UPDATE SET tier=CASE WHEN event_commerce.tier='own_sponsors' THEN 'own_sponsors' WHEN event_commerce.tier='ad_free' AND EXCLUDED.tier='platform' THEN 'ad_free' ELSE EXCLUDED.tier END,revision=event_commerce.revision+1",
        [p.event_id, p.tier],
      );
      await logEvent(tx, p.event_id, "commerce.paid");
    }
    return { ok: true };
  });
}
export async function registerCommerce(
  app: FastifyInstance,
  db: Database,
  origin: string,
  config: CommerceConfig,
  store?: MediaStore,
) {
  if (!config.enabled) return;
  async function artist(req: any) {
    const token = req.cookies.oj_operator;
    requireThat(
      typeof token === "string" && /^[a-f0-9]{64}$/.test(token),
      "sign_in_required",
      "Sign in as an artist.",
      401,
    );
    const s = (
      await db.query(
        "SELECT artist_id FROM sessions WHERE token_hash=$1 AND kind='operator' AND expires_at>now()",
        [digest(token)],
      )
    ).rows[0];
    requireThat(s, "sign_in_required", "Sign in as an artist.", 401);
    return s.artist_id as string;
  }
  async function admin(req: any) {
    const token = req.cookies.oj_platform_admin;
    requireThat(
      typeof token === "string" && /^[a-f0-9]{64}$/.test(token),
      "admin_required",
      "Sign in as the platform administrator.",
      401,
    );
    requireThat(
      (
        await db.query(
          "SELECT token_hash FROM platform_admin_sessions WHERE token_hash=$1 AND expires_at>now()",
          [digest(token)],
        )
      ).rows.length,
      "admin_required",
      "Sign in as the platform administrator.",
      401,
    );
  }
  app.get("/api/commerce-capabilities", async () => ({
    enabled: true,
    paymentsConfigured: Boolean(config.gateway),
    mode: config.live ? "live" : "test",
  }));
  app.post(
    "/api/admin/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { token } = z
        .object({ token: z.string().min(32).max(256) })
        .parse(req.body);
      requireThat(
        config.adminToken &&
          Buffer.byteLength(token) === Buffer.byteLength(config.adminToken) &&
          timingSafeEqual(Buffer.from(token), Buffer.from(config.adminToken)),
        "invalid_admin",
        "Invalid administrator credential.",
        401,
      );
      const raw = randomBytes(32).toString("hex");
      await db.query(
        "INSERT INTO platform_admin_sessions(token_hash,expires_at) VALUES($1,now()+interval '2 hours')",
        [digest(raw)],
      );
      reply.setCookie("oj_platform_admin", raw, {
        path: "/",
        httpOnly: true,
        secure: origin.startsWith("https:"),
        sameSite: "strict",
        maxAge: 7200,
      });
      return { ok: true };
    },
  );
  app.post("/api/admin/logout", async (req, reply) => {
    await admin(req);
    await db.query("DELETE FROM platform_admin_sessions WHERE token_hash=$1", [
      digest(req.cookies.oj_platform_admin!),
    ]);
    reply.clearCookie("oj_platform_admin", { path: "/" });
    return { ok: true };
  });
  app.get("/api/admin/commerce", async (req) => {
    await admin(req);
    return {
      settings: (
        await db.query("SELECT * FROM commerce_settings WHERE singleton=true")
      ).rows[0],
      videos: (
        await db.query(
          "SELECT id,sponsor_name,duration_seconds,active FROM sponsor_videos WHERE owner_artist_id IS NULL ORDER BY created_at DESC",
        )
      ).rows,
      storageConfigured: Boolean(store),
      paymentsConfigured: Boolean(config.gateway),
    };
  });
  app.put("/api/admin/commerce", async (req) => {
    await admin(req);
    const v = pricingInput.parse(req.body);
    return db.transaction(async (tx) => {
      const s = (
        await tx.query(
          "SELECT * FROM commerce_settings WHERE singleton=true FOR UPDATE",
        )
      ).rows[0];
      requireThat(
        s.revision === v.expectedRevision,
        "revision_conflict",
        "Reload settings before saving.",
        409,
      );
      const videos = (
        await tx.query(
          "SELECT id FROM sponsor_videos WHERE id=ANY($1::uuid[]) AND owner_artist_id IS NULL AND active=true",
          [v.platformVideoIds],
        )
      ).rows;
      requireThat(
        new Set(v.platformVideoIds).size === v.platformVideoIds.length &&
          videos.length === v.platformVideoIds.length,
        "invalid_sponsor_video",
        "Select distinct published platform sponsor videos.",
        409,
      );
      await tx.query(
        "UPDATE commerce_settings SET currency=$1,prices=$2,break_seconds=$3,slot_seconds=$4,platform_video_ids=$5,revision=revision+1 WHERE singleton=true",
        [
          v.currency,
          JSON.stringify(v.prices),
          v.breakSeconds,
          v.slotSeconds,
          JSON.stringify(v.platformVideoIds),
        ],
      );
      return { ok: true };
    });
  });
  app.post("/api/admin/artists", async (req) => {
    await admin(req);
    const v = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(req.body);
    const artistId = "artist-" + randomUUID(),
      token = randomBytes(32).toString("hex");
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO artists(id,name,bio) VALUES($1,$2,'')", [
        artistId,
        v.name,
      ]);
      await tx.query(
        "INSERT INTO artist_access_keys(token_hash,artist_id) VALUES($1,$2)",
        [digest(token), artistId],
      );
    });
    return { artistId, token };
  });
  app.get("/api/operator/events/:id/commerce", async (req) => {
    const who = await artist(req),
      eventId = id.parse((req.params as any).id);
    await ownedEvent(db, eventId, who);
    const tier = tierInput.parse((req.query as any).tier ?? "platform");
    const access = await eventAccess(db, eventId);
    return {
      quote: await quoteEvent(db, eventId, tier),
      access: {
        paid: access.paid,
        tier: access.tier,
        verified: access.verified,
        seconds: access.seconds,
      },
      policy: access.policy ?? {
        tier: "platform",
        own_video_ids: [],
        revision: 0,
      },
      pending:
        (
          await db.query(
            "SELECT id,checkout_url,expires_at,tier FROM event_purchases WHERE event_id=$1 AND state='pending'",
            [eventId],
          )
        ).rows[0] ?? null,
      videos: (
        await db.query(
          "SELECT id,sponsor_name,duration_seconds,active FROM sponsor_videos WHERE owner_artist_id=$1 ORDER BY created_at DESC",
          [who],
        )
      ).rows,
      paymentsConfigured: Boolean(config.gateway),
    };
  });
  app.post("/api/operator/events/:id/checkout", async (req) => {
    requireThat(
      config.gateway,
      "payments_unavailable",
      "Stripe checkout is not configured.",
      503,
    );
    return beginCheckout(
      db,
      await artist(req),
      id.parse((req.params as any).id),
      z
        .object({
          commandId: id,
          tier: tierInput,
          quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(req.body),
      config.gateway!,
      origin,
    );
  });
  app.put("/api/operator/events/:id/sponsors", async (req) => {
    const who = await artist(req),
      eventId = id.parse((req.params as any).id),
      v = z
        .object({
          expectedRevision: z.number().int().nonnegative(),
          videoIds: z.array(id).max(24),
        })
        .parse(req.body);
    return db.transaction(async (tx) => {
      const event = await ownedEvent(tx, eventId, who, true);
      requireThat(
        event.state === "waiting",
        "event_started",
        "Choose sponsors before starting the show.",
        409,
      );
      const access = await eventAccess(tx, eventId);
      requireThat(
        access.paid && access.tier === "own_sponsors",
        "own_sponsors_required",
        "Own sponsors require the highest paid plan.",
        403,
      );
      requireThat(
        (access.policy?.revision ?? 0) === v.expectedRevision,
        "revision_conflict",
        "Reload sponsor choices.",
        409,
      );
      const valid = (
        await tx.query(
          "SELECT id FROM sponsor_videos WHERE id=ANY($1::uuid[]) AND owner_artist_id=$2 AND active=true",
          [v.videoIds, who],
        )
      ).rows;
      requireThat(
        valid.length === v.videoIds.length &&
          new Set(v.videoIds).size === v.videoIds.length,
        "invalid_sponsor_video",
        "Choose your own published sponsor videos.",
        409,
      );
      await tx.query(
        "UPDATE event_commerce SET own_video_ids=$1,revision=revision+1 WHERE event_id=$2",
        [JSON.stringify(v.videoIds), eventId],
      );
      return { ok: true };
    });
  });
  for (const prefix of ["/api/admin", "/api/operator"]) {
    const isAdmin = prefix.endsWith("admin");
    await app.register(async (scope) => {
      scope.addContentTypeParser(
        "application/octet-stream",
        { parseAs: "buffer" },
        (_req, body, done) => done(null, body),
      );
      let active = false;
      scope.post(
        prefix + "/sponsor-videos",
        {
          bodyLimit: MAX_VIDEO_BYTES,
          onRequest: async (req) => {
            if (isAdmin) await admin(req);
            else {
              const who = await artist(req);
              requireThat(
                (
                  await db.query(
                    "SELECT id FROM event_purchases WHERE artist_id=$1 AND tier='own_sponsors' AND state='paid' LIMIT 1",
                    [who],
                  )
                ).rows.length,
                "own_sponsors_required",
                "Your own sponsor uploads require the highest paid plan.",
                403,
              );
            }
            requireThat(
              store,
              "storage_unavailable",
              "Private video storage is not configured.",
              503,
            );
            requireThat(
              !active,
              "upload_busy",
              "Another video is being prepared. Try again shortly.",
              429,
            );
          },
        },
        async (req) => {
          const owner = isAdmin ? null : await artist(req),
            name = z
              .string()
              .trim()
              .min(1)
              .max(100)
              .parse((req.query as any).name);
          active = true;
          try {
            const media = await prepareSponsorVideo(req.body as Buffer),
              sha = createHash("sha256").update(media.bytes).digest("hex"),
              videoId = randomUUID(),
              key = `sponsors/${videoId}/${sha}.mp4`;
            await store!.put(key, media.bytes, sha);
            await db.query(
              "INSERT INTO sponsor_videos(id,owner_artist_id,sponsor_name,object_key,sha256,duration_seconds) VALUES($1,$2,$3,$4,$5,$6)",
              [videoId, owner, name, key, sha, media.durationSeconds],
            );
            return {
              id: videoId,
              durationSeconds: media.durationSeconds,
              active: false,
            };
          } catch (e) {
            if (e instanceof DomainError) throw e;
            throw new DomainError(
              "invalid_video",
              "The MP4 could not be decoded and prepared. No ad was published.",
              400,
            );
          } finally {
            active = false;
          }
        },
      );
    });
    app.get(prefix + "/sponsor-videos/:id/preview", async (req, reply) => {
      const owner = isAdmin ? (await admin(req), null) : await artist(req);
      requireThat(
        store,
        "storage_unavailable",
        "Private storage is unavailable.",
        503,
      );
      const v = (
        await db.query(
          "SELECT object_key FROM sponsor_videos WHERE id=$1 AND owner_artist_id IS NOT DISTINCT FROM $2::text",
          [id.parse((req.params as any).id), owner],
        )
      ).rows[0];
      requireThat(v, "not_found", "Sponsor video not found.", 404);
      return reply
        .header("Cache-Control", "private, no-store")
        .header("Referrer-Policy", "no-referrer")
        .redirect(await store!.url(v.object_key, false));
    });
    app.patch(prefix + "/sponsor-videos/:id", async (req) => {
      const owner = isAdmin ? (await admin(req), null) : await artist(req);
      const v = z.object({ active: z.boolean() }).parse(req.body);
      const changed = await db.query(
        "UPDATE sponsor_videos SET active=$1 WHERE id=$2 AND owner_artist_id IS NOT DISTINCT FROM $3::text RETURNING id",
        [v.active, id.parse((req.params as any).id), owner],
      );
      requireThat(
        changed.rows.length,
        "not_found",
        "Sponsor video not found.",
        404,
      );
      return { ok: true };
    });
  }
  app.get("/api/sponsor-videos/:id", async (req, reply) => {
    requireThat(store, "not_found", "Video is unavailable.", 404);
    const v = (
      await db.query(
        "SELECT object_key FROM sponsor_videos WHERE id=$1 AND active=true",
        [id.parse((req.params as any).id)],
      )
    ).rows[0];
    requireThat(v, "not_found", "Video is unavailable.", 404);
    return reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer")
      .redirect(await store!.url(v.object_key, false));
  });
  await app.register(async (scope) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );
    scope.post("/api/webhooks/stripe", { bodyLimit: 262144 }, async (req) => {
      requireThat(
        config.gateway,
        "payments_unavailable",
        "Payment webhook is not configured.",
        503,
      );
      let event;
      try {
        event = config.gateway!.verify(
          req.body as Buffer,
          z.string().parse(req.headers["stripe-signature"]),
        );
      } catch {
        throw new DomainError(
          "invalid_signature",
          "Invalid payment signature.",
          400,
        );
      }
      return applyPaymentEvent(db, event, config.live);
    });
  });
}
