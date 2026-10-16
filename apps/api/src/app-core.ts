import { readPlatformVotePolicy } from "./vote-policy.js";
import { registerPlatformAdmin } from "./platform-admin.js";
import {
  accountStatus,
  createRecoveryKey,
  disableRecovery,
  recoverProfile,
  recoveryInput,
  followStatus,
  followArtist,
  followInput,
  followingFeed,
  artistIdInput,
} from "./accounts.js";
import {
  configureAdmission,
  joinEvent,
  admissionInput,
  joinInput,
} from "./admission.js";
import { controlRelease, releaseControlInput } from "./release-controls.js";
import { moderationQueue, moderate } from "./moderation.js";
import {
  artistProfileInput,
  catalogInput,
  publicArtist,
  editArtist,
  likedTracks,
} from "./catalog.js";
import type { EmailConfig } from "./email-config.js";
import {
  subscriptionInput,
  emailTokenInput,
  subscribe,
  subscriptionStatus,
  verifyEmail,
  unsubscribeEmail,
  emailWebhook,
  emailStats,
} from "./email.js";
import {
  reorderInput,
  settingsInput,
  sourceEditInput,
  reorderQueue,
  updateSettings,
  sources,
  updateSource,
} from "./show-setup.js";
import { leaderboard, releaseCredits } from "./recognition.js";
import Fastify from "fastify";
import { SnapshotReads, RoomStreams } from "./live-traffic.js";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import type { MediaStore } from "../../../packages/providers/src/storage.js";
import type { Database } from "./db.js";
import {
  DomainError,
  digest,
  requireThat,
  mergeIntervals,
  listenedSeconds,
} from "../../../packages/domain/src/index.js";
import {
  allocationInput,
  eventInput,
  id,
  listenInput,
  profileInput,
  releaseInput,
  waveInput,
} from "../../../packages/contracts/src/index.js";
import {
  advance,
  allocate,
  createEvent,
  logEvent,
  ownedEvent,
  snapshot,
  submitWave,
} from "./service.js";

import { claimPlayback, heartbeat, pausePlayback } from "./playback.js";
const playbackInput = z.object({
  leaseToken: z.string().regex(/^[a-f0-9]{64}$/),
  epoch: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
});
export type AppConfig = {
  origin: string;
  operatorToken?: string;
  adminToken?: string;
  secureCookies: boolean;
  providerReady?: boolean;
  serveWeb?: boolean;
  mediaStore?: MediaStore;
  mediaVerified?: boolean;
  email?: EmailConfig;
};
// Native guest credentials are deliberately distinguishable from browser and
// performer sessions. Native requests still supply the configured Origin.
function mobileToken(req: any): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== "string") return undefined;
  return /^Bearer (ojm_[a-f0-9]{64})$/.exec(header)?.[1];
}
export async function createApp(db: Database, config: AppConfig) {
  const app = Fastify({ logger: false, bodyLimit: 65536, trustProxy: false });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", "https:", "blob:"],
        fontSrc: ["'self'"],
        baseUri: ["'none'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  // Request-local reuse only: revocation is checked again on every request.
  const validatedSessions = new WeakMap<
    object,
    Map<string, Promise<Record<string, any> | null>>
  >();
  function lookupSession(req: object, raw: string | undefined) {
    if (!raw || !/^(ojm_)?[a-f0-9]{64}$/.test(raw))
      return Promise.resolve(null);
    let entries = validatedSessions.get(req);
    if (!entries) validatedSessions.set(req, (entries = new Map()));
    let result = entries.get(raw);
    if (!result) {
      result = db
        .query(
          "SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>now()",
          [digest(raw)],
        )
        .then(({ rows }) => rows[0] ?? null);
      entries.set(raw, result);
    }
    return result;
  }
  await app.register(rateLimit, {
    // 100 anonymous listeners at one update/second, plus initial page reads.
    max: (_req, key) => (key.startsWith("read:ip:") ? 7200 : 180),
    timeWindow: "1 minute",
    allowList: (req) => !req.url.startsWith("/api/"),
    keyGenerator: async (req) => {
      if (!req.url.startsWith("/api/")) return "static";
      const operator = req.routeOptions.url?.startsWith("/api/operator/");
      const raw = operator
        ? req.cookies.oj_operator
        : req.headers.authorization !== undefined
          ? mobileToken(req)
          : req.cookies.oj_guest;
      const valid = await lookupSession(req, raw);
      const family = ["GET", "HEAD"].includes(req.method) ? "read:" : "write:";
      return family + (valid ? "session:" + valid.token_hash : "ip:" + req.ip);
    },
  });
  const snapshotReads = new SnapshotReads();
  const roomStreams = new RoomStreams();
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !(req.method === "POST" && req.url === "/api/webhooks/email")
    )
      requireThat(
        req.headers.origin === config.origin,
        "origin_required",
        "Open Our Jam from its configured address.",
        403,
      );
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof DomainError)
      return reply
        .code(error.status)
        .send({ error: error.code, message: error.message });
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: "invalid_request",
        message: error.issues[0]?.message ?? "Check the submitted fields.",
      });
    const e = error as { code?: string; statusCode?: number };
    if (e.code === "23505")
      return reply.code(409).send({
        error: "conflict",
        message: "That entry already exists. Refresh and try again.",
      });
    if (e.code === "22P02")
      return reply
        .code(400)
        .send({ error: "invalid_id", message: "Invalid identifier." });
    if (e.statusCode === 429)
      return reply.code(429).send({
        error: "rate_limit",
        message: "Give the room a moment, then try again.",
      });
    console.error(
      JSON.stringify({
        event: "request_failed",
        requestId: req.id,
        code: e.code ?? "unexpected",
      }),
    );
    return reply.code(500).send({
      error: "server_error",
      message: "Your request could not be completed. Refresh before retrying.",
    });
  });
  function session(
    req: any,
    kind: "guest" | "operator",
  ): Promise<Record<string, any>>;
  function session(
    req: any,
    kind: "guest" | "operator",
    required: false,
  ): Promise<Record<string, any> | null>;
  async function session(
    req: any,
    kind: "guest" | "operator",
    required = true,
  ) {
    const raw =
      kind === "guest" && req.headers.authorization !== undefined
        ? mobileToken(req)
        : req.cookies[kind === "guest" ? "oj_guest" : "oj_operator"];
    const candidate = await lookupSession(req, raw);
    const s = candidate?.kind === kind ? candidate : null;
    if (required)
      requireThat(
        s,
        "sign_in_required",
        kind === "guest"
          ? "Join to participate."
          : "Sign in to the performer console.",
        401,
      );
    return s;
  }
  function setSession(reply: any, name: string, token: string, maxAge: number) {
    reply.setCookie(name, token, {
      path: "/",
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "strict",
      maxAge,
    });
  }
  app.get("/api/health", { config: { rateLimit: false } }, async () => ({
    status: "ok",
    application: "Our Jam",
    version: "0.1.0",
    commit: process.env.RENDER_GIT_COMMIT ?? "local",
  }));
  app.get("/api/ready", async () => {
    const rows = (
      await db.query(
        "SELECT name FROM schema_migrations WHERE name IN ('001_core.sql','002_playback.sql','003_generation.sql','004_release_email.sql','005_artist_profiles.sql','006_release_controls.sql','007_audience_admission.sql','008_profile_recovery.sql','009_platform_vote_policy.sql')",
      )
    ).rows;
    requireThat(
      rows.length === 9,
      "schema_not_ready",
      "Required database migrations have not been applied.",
      503,
    );
    return {
      database: "ready",
      media: config.mediaVerified ? "verified" : config.mediaStore ? "configured" : "not_configured",
      generation: config.providerReady ? "configured" : "not_configured",
      operator: config.operatorToken ? "configured" : "not_configured",
      email: config.email ? "configured" : "not_configured",
    };
  });
  app.get("/api/events/:id/subscription", async (req) => {
    const s = await session(req, "guest", false);
    return {
      available: Boolean(config.email),
      ...(s
        ? await subscriptionStatus(
            db,
            id.parse((req.params as any).id),
            s.participant_id,
          )
        : { state: "none" }),
    };
  });
  app.post(
    "/api/events/:id/subscription",
    {
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 hour",
        },
      },
    },
    async (req) => {
      const s = await session(req, "guest");
      requireThat(
        config.email,
        "email_unavailable",
        "Release emails aren't available yet. You can still listen and download here.",
        503,
      );
      return subscribe(
        db,
        config.email,
        id.parse((req.params as any).id),
        s.participant_id,
        subscriptionInput.parse(req.body),
      );
    },
  );
  app.delete("/api/events/:id/subscription", async (req) => {
    const s = await session(req, "guest");
    return unsubscribeEmail(db, {
      eventId: id.parse((req.params as any).id),
      participantId: s.participant_id,
    });
  });
  app.post("/api/email/verify", async (req) =>
    verifyEmail(db, emailTokenInput.parse(req.body).token),
  );
  app.post("/api/email/unsubscribe", async (req) =>
    unsubscribeEmail(db, emailTokenInput.parse(req.body)),
  );
  app.get("/api/operator/events/:id/email", async (req) => {
    const s = await session(req, "operator");
    return {
      available: Boolean(config.email),
      ...(await emailStats(db, s.artist_id, id.parse((req.params as any).id))),
    };
  });
  await app.register(async (webhookApp) => {
    webhookApp.removeContentTypeParser("application/json");
    webhookApp.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_req, body, done) => done(null, body),
    );
    webhookApp.post("/api/webhooks/email", async (req) => {
      requireThat(config.email, "email_unavailable", "Email is disabled.", 503);
      const headers = z
        .object({
          "svix-id": z.string().max(200),
          "svix-timestamp": z.string().max(30),
          "svix-signature": z.string().max(2000),
        })
        .parse(req.headers);
      return emailWebhook(
        db,
        config.email,
        z.string().parse(req.body),
        headers,
      );
    });
  });
  app.get("/api/artists/:id/leaderboard", async (req) => {
    const params = z
      .object({ id: z.string().min(1).max(100) })
      .parse(req.params);
    const q = z
      .object({
        period: z.enum(["all", "week", "month"]).default("all"),
        metric: z.enum(["included", "support"]).default("included"),
        event: z.string().max(60).optional(),
      })
      .parse(req.query);
    return leaderboard(db, params.id, q.period, q.metric, q.event);
  });
  app.get("/api/artists/:id", async (req) =>
    publicArtist(
      db,
      z
        .string()
        .min(1)
        .max(100)
        .parse((req.params as any).id),
      catalogInput.parse(req.query),
    ),
  );
  app.get("/api/operator/artist", async (req) => {
    const s = await session(req, "operator");
    return (
      await publicArtist(db, s.artist_id, catalogInput.parse({ limit: 1 }))
    ).artist;
  });
  app.patch("/api/operator/artist", async (req) => {
    const s = await session(req, "operator");
    return editArtist(db, s.artist_id, artistProfileInput.parse(req.body));
  });
  app.get("/api/library", async (req) => {
    const s = await session(req, "guest");
    return likedTracks(db, s.participant_id, catalogInput.parse(req.query));
  });
  app.get("/api/releases/:id/credits", async (req) =>
    releaseCredits(db, id.parse((req.params as any).id)),
  );
  app.get("/api/events", async () => ({
    events: (
      await db.query(
        "SELECT id,slug,title,artist_name,state FROM events ORDER BY created_at DESC LIMIT 50",
      )
    ).rows,
  }));
  app.get("/api/session", async (req) => {
    const s = await session(req, "guest", false);
    const op = await session(req, "operator", false);
    const p = s
      ? (
          await db.query(
            "SELECT id,name,anonymous,avatar_seed FROM participants WHERE id=$1",
            [s.participant_id],
          )
        ).rows[0]
      : null;
    return { profile: p, operator: Boolean(op) };
  });
  const bootstrapLimit = {
    config: {
      rateLimit: {
        max: 120,
        timeWindow: "1 minute",
        keyGenerator: (req: any) => "bootstrap:" + req.ip,
      },
    },
  };
  app.post("/api/session", bootstrapLimit, async (req, reply) => {
    const existing = await session(req, "guest", false);
    if (existing) return { participantId: existing.participant_id };
    const participantId = randomUUID(),
      token = randomBytes(32).toString("hex");
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO participants(id,avatar_seed) VALUES($1,$2)", [
        participantId,
        randomBytes(8).toString("hex"),
      ]);
      await tx.query(
        "INSERT INTO sessions(token_hash,participant_id,kind,expires_at) VALUES($1,$2,'guest',now()+interval '30 days')",
        [digest(token), participantId],
      );
    });
    setSession(reply, "oj_guest", token, 30 * 86400);
    return { participantId };
  });
  app.post("/api/mobile/session", bootstrapLimit, async (req) => {
    const existing = mobileToken(req) ? await session(req, "guest") : null;
    if (existing)
      return {
        token: mobileToken(req),
        participantId: existing.participant_id,
      };
    requireThat(
      !req.headers.authorization,
      "invalid_credentials",
      "The mobile session is not valid.",
      401,
    );
    const participantId = randomUUID(),
      token = "ojm_" + randomBytes(32).toString("hex");
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO participants(id,avatar_seed) VALUES($1,$2)", [
        participantId,
        randomBytes(8).toString("hex"),
      ]);
      await tx.query(
        "INSERT INTO sessions(token_hash,participant_id,kind,expires_at) VALUES($1,$2,'guest',now()+interval '30 days')",
        [digest(token), participantId],
      );
    });
    return { token, participantId };
  });
  app.delete("/api/mobile/session", async (req) => {
    requireThat(
      mobileToken(req),
      "sign_in_required",
      "No mobile session is active.",
      401,
    );
    const s = await session(req, "guest");
    await db.query(
      "DELETE FROM sessions WHERE token_hash=$1 AND kind='guest'",
      [s.token_hash],
    );
    return { ok: true };
  });
  app.get("/api/account", async (req) => {
    const s = await session(req, "guest", false);
    return s
      ? accountStatus(db, s.participant_id)
      : { recoveryEnabled: false, sessions: 0 };
  });
  app.post(
    "/api/account/recovery-key",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const s = await session(req, "guest");
      return createRecoveryKey(db, s.participant_id, s.token_hash);
    },
  );
  app.delete("/api/account/recovery-key", async (req) => {
    const s = await session(req, "guest");
    return disableRecovery(db, s.participant_id, s.token_hash);
  });
  app.post(
    "/api/account/recover",
    {
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 minute",
          keyGenerator: (req: any) => req.ip,
        },
      },
    },
    async (req, reply) => {
      const input = recoveryInput.parse(req.body);
      const result = await recoverProfile(db, input);
      if (input.channel === "web") {
        setSession(reply, "oj_guest", result.token, 30 * 86400);
        return { participantId: result.participantId };
      }
      return result;
    },
  );
  app.delete("/api/account/session", async (req, reply) => {
    const s = await session(req, "guest", false);
    if (s)
      await db.query(
        "DELETE FROM sessions WHERE token_hash=$1 AND kind='guest'",
        [s.token_hash],
      );
    reply.clearCookie("oj_guest", {
      path: "/",
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "strict",
    });
    return { ok: true };
  });
  app.get("/api/artists/:id/follow", async (req) => {
    const s = await session(req, "guest", false);
    return followStatus(
      db,
      artistIdInput.parse((req.params as any).id),
      s?.participant_id,
    );
  });
  app.put("/api/artists/:id/follow", async (req) => {
    const s = await session(req, "guest");
    return followArtist(
      db,
      s.participant_id,
      artistIdInput.parse((req.params as any).id),
      followInput.parse(req.body).following,
    );
  });
  app.get("/api/following", async (req) => {
    const s = await session(req, "guest");
    return followingFeed(db, s.participant_id);
  });
  app.patch("/api/profile", async (req) => {
    const s = await session(req, "guest");
    const input = profileInput.parse(req.body);
    requireThat(
      !/[<>\p{C}]/u.test(input.name),
      "invalid_name",
      "Use a plain display name.",
    );
    await db.query("UPDATE participants SET name=$1,anonymous=$2 WHERE id=$3", [
      input.name,
      input.anonymous,
      s.participant_id,
    ]);
    return { ok: true };
  });
  app.post(
    "/api/operator/login",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute",
          keyGenerator: (req: any) => req.ip,
        },
      },
    },
    async (req, reply) => {
      const { token } = z
        .object({ token: z.string().min(1).max(256) })
        .parse(req.body);
      requireThat(
        config.operatorToken && config.operatorToken.length >= 32,
        "operator_unconfigured",
        "Performer access has not been configured.",
        503,
      );
      requireThat(
        timingSafeEqual(
          Buffer.from(digest(token)),
          Buffer.from(digest(config.operatorToken)),
        ),
        "invalid_credentials",
        "Invalid performer credential.",
        401,
      );
      const raw = randomBytes(32).toString("hex");
      await db.query(
        "INSERT INTO sessions(token_hash,artist_id,kind,expires_at) VALUES($1,'our-jam','operator',now()+interval '12 hours')",
        [digest(raw)],
      );
      setSession(reply, "oj_operator", raw, 43200);
      return { ok: true };
    },
  );
  app.post("/api/operator/logout", async (req, reply) => {
    const raw = req.cookies.oj_operator;
    if (raw)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [digest(raw)]);
    reply.clearCookie("oj_operator", { path: "/" });
    return { ok: true };
  });
  registerPlatformAdmin(app, db, {adminToken:config.adminToken, secureCookies:config.secureCookies});
  app.post("/api/operator/events", async (req) => {
    const op = await session(req, "operator");
    const input = eventInput.parse(req.body);
    requireThat(input.voteMode !== "weighted", "legacy_voting_unavailable",
      "New shows use one vote per Sound Wave. Older weighted voting is available only for existing legacy events.");
    return createEvent(db, op.artist_id, { ...input, voteMode: "single" });
  });
  app.get("/api/operator/vote-policy", async (req) => {
    await session(req, "operator");
    return readPlatformVotePolicy(db);
  });
  app.get("/api/operator/events", async (req) => {
    const op = await session(req, "operator");
    return {
      events: (
        await db.query(
          "SELECT id,slug,title,artist_name,state FROM events WHERE artist_id=$1 ORDER BY created_at DESC,id LIMIT 100",
          [op.artist_id],
        )
      ).rows,
    };
  });
  app.get("/api/events/:slug", async (req) => {
    const { slug } = req.params as { slug: string };
    const guest = await session(req, "guest", false);
    return snapshotReads.run(
      JSON.stringify([slug, guest?.participant_id ?? null]),
      () =>
        db.transaction(async (tx) => {
          await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
          return snapshot(tx, slug, guest?.participant_id);
        }),
    );
  });
  app.get("/api/operator/events/:slug", async (req) => {
    const { slug } = req.params as { slug: string };
    const op = await session(req, "operator");
    return db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      return snapshot(tx, slug, undefined, op.artist_id);
    });
  });
  app.put("/api/operator/events/:id/queue", async (req) => {
    const op = await session(req, "operator");
    return reorderQueue(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      reorderInput.parse(req.body),
    );
  });
  app.patch("/api/operator/events/:id/settings", async (req) => {
    const op = await session(req, "operator");
    return updateSettings(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      settingsInput.parse(req.body),
    );
  });
  app.get("/api/operator/events/:id/sources", async (req) => {
    const op = await session(req, "operator");
    return sources(db, op.artist_id, id.parse((req.params as any).id));
  });
  app.patch("/api/operator/sources/:id", async (req) => {
    const op = await session(req, "operator");
    return updateSource(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      sourceEditInput.parse(req.body),
    );
  });
  app.patch("/api/operator/events/:id/admission", async (req) => {
    const op = await session(req, "operator");
    return configureAdmission(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      admissionInput.parse(req.body),
    );
  });
  app.post(
    "/api/events/:slug/join",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req) => {
      const s = await session(req, "guest");
      return joinEvent(
        db,
        (req.params as { slug: string }).slug,
        s.participant_id,
        joinInput.parse(req.body ?? {}),
      );
    },
  );
  app.put("/api/rounds/:id/allocations", async (req) => {
    const s = await session(req, "guest");
    return allocate(
      db,
      { participantId: s.participant_id },
      id.parse((req.params as any).id),
      allocationInput.parse(req.body),
    );
  });
  app.post("/api/rounds/:id/waves", async (req) => {
    const s = await session(req, "guest");
    return submitWave(
      db,
      { participantId: s.participant_id },
      id.parse((req.params as any).id),
      waveInput.parse(req.body),
    );
  });
  app.post("/api/operator/events/:id/playback/claim", async (req) => {
    const op = await session(req, "operator");
    const body = z
      .object({
        existingToken: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .parse(req.body);
    return claimPlayback(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      body.existingToken,
    );
  });
  app.post("/api/operator/events/:id/playback/heartbeat", async (req) => {
    const op = await session(req, "operator");
    return heartbeat(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      playbackInput.parse(req.body),
    );
  });
  app.post("/api/operator/events/:id/playback/release", async (req) => {
    const op = await session(req, "operator");
    const body = playbackInput.extend({ commandId: id }).parse(req.body);
    return pausePlayback(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      body,
      true,
      body.commandId,
      true,
    );
  });
  app.post("/api/operator/events/:id/playback/pause", async (req) => {
    const op = await session(req, "operator");
    const body = playbackInput
      .extend({ pause: z.boolean(), commandId: id })
      .parse(req.body);
    return pausePlayback(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      body,
      body.pause,
      body.commandId,
    );
  });
  app.post("/api/operator/events/:id/advance", async (req) => {
    const op = await session(req, "operator");
    const body = z
      .object({
        commandId: id,
        expectedRevision: z.number().int().nonnegative(),
        playback: playbackInput,
      })
      .parse(req.body);
    return advance(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      body.commandId,
      body.expectedRevision,
      body.playback,
      config.providerReady,
    );
  });
  app.post("/api/operator/events/:id/play-next", async (req) => {
    const op = await session(req, "operator");
    const eventId = id.parse((req.params as any).id);
    const body = z
      .object({
        releaseId: id,
        expectedRevision: z.number().int().nonnegative(),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      const event = await ownedEvent(tx, eventId, op.artist_id, true);
      requireThat(
        event.revision === body.expectedRevision,
        "revision_conflict",
        "The queue changed. Refresh before inserting.",
        409,
      );
      const release = (
        await tx.query(
          "SELECT id FROM releases WHERE id=$1 AND event_id=$2 AND NOT hidden AND published_at IS NOT NULL",
          [body.releaseId, eventId],
        )
      ).rows[0];
      requireThat(release, "not_found", "Released track not found.", 404);
      const position = (
        await tx.query(
          "SELECT COALESCE(min(position),0)-1 n FROM queue_items WHERE event_id=$1 AND state='queued'",
          [eventId],
        )
      ).rows[0].n;
      const queueId = randomUUID();
      await tx.query(
        "INSERT INTO queue_items(id,event_id,release_id,position) VALUES($1,$2,$3,$4)",
        [queueId, eventId, release.id, position],
      );
      await logEvent(tx, eventId, "queue.changed");
      return { id: queueId };
    });
  });
  app.delete("/api/operator/queue/:id", async (req) => {
    const op = await session(req, "operator");
    const queueId = id.parse((req.params as any).id);
    return db.transaction(async (tx) => {
      const q = (
        await tx.query("SELECT event_id FROM queue_items WHERE id=$1", [
          queueId,
        ])
      ).rows[0];
      requireThat(q, "not_found", "Queue item not found.", 404);
      await ownedEvent(tx, q.event_id, op.artist_id, true);
      const changed = await tx.query(
        "UPDATE queue_items SET state='removed' WHERE id=$1 AND state='queued' RETURNING id",
        [queueId],
      );
      requireThat(
        changed.rows.length,
        "already_playing",
        "Only a queued track can be removed.",
        409,
      );
      await logEvent(tx, q.event_id, "queue.changed");
      return { ok: true };
    });
  });
  app.post("/api/operator/waves/:id/hide", async (req) => {
    const op = await session(req, "operator");
    const waveId = id.parse((req.params as any).id);
    return db.transaction(async (tx) => {
      const found = (
        await tx.query(
          "SELECT w.round_id,r.event_id FROM sound_waves w JOIN rounds r ON r.id=w.round_id WHERE w.id=$1",
          [waveId],
        )
      ).rows[0];
      requireThat(found, "not_found", "Wave not found.", 404);
      await ownedEvent(tx, found.event_id, op.artist_id, true);
      const r = (
        await tx.query("SELECT state FROM rounds WHERE id=$1 FOR UPDATE", [
          found.round_id,
        ])
      ).rows[0];
      requireThat(
        r.state === "open",
        "round_closed",
        "Closed snapshots cannot be edited.",
        409,
      );
      await tx.query(
        "UPDATE ballots SET revision=revision+1 WHERE round_id=$1 AND participant_id IN (SELECT participant_id FROM allocations WHERE wave_id=$2)",
        [found.round_id, waveId],
      );
      await tx.query("DELETE FROM allocations WHERE wave_id=$1", [waveId]);
      await tx.query("UPDATE sound_waves SET moderated=true WHERE id=$1", [
        waveId,
      ]);
      await tx.query(
        "INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2,$3,$4)",
        [op.artist_id, found.event_id, "wave.hidden", waveId],
      );
      await logEvent(tx, found.event_id, "wave.hidden");
      return { ok: true };
    });
  });
  app.get("/api/operator/events/:id/moderation", async (req) => {
    const op = await session(req, "operator");
    return moderationQueue(db, op.artist_id, id.parse((req.params as any).id));
  });
  for (const kind of ["comment", "release"] as const)
    app.post(`/api/operator/${kind}s/:id/moderate`, async (req) => {
      const op = await session(req, "operator");
      const body = z.object({ hidden: z.boolean() }).parse(req.body);
      return moderate(
        db,
        op.artist_id,
        kind,
        id.parse((req.params as any).id),
        body.hidden,
      );
    });
  app.get("/api/operator/jobs/:id", async (req) => {
    const op = await session(req, "operator");
    const job = (
      await db.query("SELECT * FROM generation_jobs WHERE id=$1", [
        id.parse((req.params as any).id),
      ])
    ).rows[0];
    requireThat(job, "not_found", "Generation not found.", 404);
    await ownedEvent(db, job.event_id, op.artist_id);
    return {
      id: job.id,
      state: job.state,
      reason: job.reason,
      prompt: job.prompt,
      promptHash: job.prompt_hash,
      snapshot: job.snapshot,
      provider: job.provider,
      model: job.model,
      attempts: job.attempts,
      reservedCents: job.reserved_cents,
    };
  });
  app.post("/api/operator/jobs/:id/control", async (req) => {
    const op = await session(req, "operator");
    return controlRelease(
      db,
      op.artist_id,
      id.parse((req.params as any).id),
      releaseControlInput.parse(req.body),
    );
  });
  app.get("/api/operator/releases/:id/audio", async (req, reply) => {
    const op = await session(req, "operator");
    const release = (
      await db.query(
        "SELECT r.* FROM releases r JOIN events e ON e.id=r.event_id WHERE r.id=$1 AND e.artist_id=$2 AND NOT r.hidden",
        [id.parse((req.params as any).id), op.artist_id],
      )
    ).rows[0];
    requireThat(release, "not_found", "Track not found.", 404);
    if (release.asset_key) {
      requireThat(
        config.mediaStore,
        "media_unavailable",
        "This media file is not available.",
        503,
      );
      return reply.redirect(
        await config.mediaStore.url(release.asset_key, false),
      );
    }
    return reply.redirect(release.audio_url);
  });
  app.post("/api/operator/jobs/:id/asset", async (req) => {
    const op = await session(req, "operator");
    const jobId = id.parse((req.params as any).id);
    const input = releaseInput.parse(req.body);
    return db.transaction(async (tx) => {
      const j = (
        await tx.query("SELECT event_id FROM generation_jobs WHERE id=$1", [
          jobId,
        ])
      ).rows[0];
      requireThat(j, "not_found", "Generation not found.", 404);
      const event = await ownedEvent(tx, j.event_id, op.artist_id, true);
      const job = (
        await tx.query("SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE", [
          jobId,
        ])
      ).rows[0];
      requireThat(
        job.state === "blocked" || job.state === "failed",
        "invalid_job_state",
        "Only an unresolved generation can receive a manually verified asset.",
        409,
      );
      requireThat(
        job.reason === "provider_not_configured" || job.state === "failed",
        "ineligible_generation",
        "This round was ineligible for generation.",
        409,
      );
      const releaseId = randomUUID();
      const publish =
        !job.release_held &&
        (event.state === "ended" || job.release_mode === "immediate");
      await tx.query(
        "INSERT INTO releases(id,event_id,job_id,title,audio_url,download_url,duration_seconds,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          releaseId,
          j.event_id,
          job.id,
          input.title,
          input.audioUrl,
          input.downloadUrl,
          input.durationSeconds,
          publish ? new Date() : null,
        ],
      );
      await tx.query(
        "UPDATE generation_jobs SET state=$1,reason='artist_supplied_asset',updated_at=now() WHERE id=$2",
        [publish ? "published" : "ready", job.id],
      );
      await tx.query(
        "INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2,$3,$4)",
        [op.artist_id, j.event_id, "release.asset_verified", releaseId],
      );
      await logEvent(
        tx,
        j.event_id,
        publish ? "releases.published" : "release.ready",
        { ids: [releaseId] },
      );
      return { id: releaseId };
    });
  });
  async function publicRelease(releaseId: string) {
    const r = (
      await db.query(
        "SELECT * FROM releases WHERE id=$1 AND published_at IS NOT NULL AND NOT hidden",
        [releaseId],
      )
    ).rows[0];
    requireThat(r, "not_found", "Track not found.", 404);
    return r;
  }
  for (const download of [false, true])
    app.get(
      "/api/releases/:id/" + (download ? "download" : "audio"),
      async (req, reply) => {
        const release = await publicRelease(id.parse((req.params as any).id));
        requireThat(
          release.asset_key && config.mediaStore,
          "media_unavailable",
          "This media file is not available.",
          503,
        );
        return reply.redirect(
          await config.mediaStore.url(release.asset_key, download),
        );
      },
    );
  app.put("/api/releases/:id/reaction", async (req) => {
    const s = await session(req, "guest");
    const release = await publicRelease(id.parse((req.params as any).id));
    const { value } = z
      .object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) })
      .parse(req.body);
    await db.transaction(async (tx) => {
      if (value === 0)
        await tx.query(
          "DELETE FROM reactions WHERE release_id=$1 AND participant_id=$2",
          [release.id, s.participant_id],
        );
      else
        await tx.query(
          "INSERT INTO reactions(release_id,participant_id,value) VALUES($1,$2,$3) ON CONFLICT(release_id,participant_id) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
          [release.id, s.participant_id, value],
        );
      await logEvent(tx, release.event_id, "reaction.changed");
    });
    return { ok: true };
  });
  app.get("/api/releases/:id/comments", async (req) => {
    const release = await publicRelease(id.parse((req.params as any).id));
    return {
      comments: (
        await db.query(
          "SELECT c.id,c.body,c.created_at,CASE WHEN p.anonymous THEN 'Anonymous' ELSE p.name END name FROM comments c JOIN participants p ON p.id=c.participant_id WHERE c.release_id=$1 AND NOT c.hidden ORDER BY c.created_at DESC LIMIT 100",
          [release.id],
        )
      ).rows,
    };
  });
  app.post(
    "/api/releases/:id/comments",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const s = await session(req, "guest");
      const release = await publicRelease(id.parse((req.params as any).id));
      const { body } = z
        .object({ body: z.string().trim().min(1).max(500) })
        .parse(req.body);
      requireThat(
        !/[<>\p{C}]/u.test(body),
        "invalid_comment",
        "Use plain text.",
      );
      const commentId = randomUUID();
      await db.query(
        "INSERT INTO comments(id,release_id,participant_id,body) VALUES($1,$2,$3,$4)",
        [commentId, release.id, s.participant_id, body],
      );
      return { id: commentId };
    },
  );
  app.delete("/api/comments/:id", async (req) => {
    const s = await session(req, "guest");
    const commentId = id.parse((req.params as any).id);
    await db.transaction(async (tx) => {
      const own = await tx.query(
        "SELECT id FROM comments WHERE id=$1 AND participant_id=$2 FOR UPDATE",
        [commentId, s.participant_id],
      );
      if (!own.rows.length) return;
      // Author removal is final; a moderator must not be able to restore it.
      await tx.query("DELETE FROM reports WHERE comment_id=$1", [commentId]);
      await tx.query("DELETE FROM comments WHERE id=$1", [commentId]);
    });
    return { ok: true };
  });
  app.post("/api/comments/:id/report", async (req) => {
    const s = await session(req, "guest");
    const commentId = id.parse((req.params as any).id);
    const { reason } = z
      .object({ reason: z.string().trim().min(1).max(200) })
      .parse(req.body);
    const c = (
      await db.query(
        "SELECT c.id FROM comments c JOIN releases r ON r.id=c.release_id WHERE c.id=$1 AND NOT c.hidden AND r.published_at IS NOT NULL AND NOT r.hidden",
        [commentId],
      )
    ).rows[0];
    requireThat(c, "not_found", "Comment not found.", 404);
    await db.query(
      "INSERT INTO reports(id,comment_id,participant_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT(comment_id,participant_id) DO NOTHING",
      [randomUUID(), commentId, s.participant_id, reason],
    );
    return { ok: true };
  });
  app.post("/api/releases/:id/listen", async (req) => {
    const s = await session(req, "guest");
    const r = await publicRelease(id.parse((req.params as any).id));
    const input = listenInput.parse(req.body);
    return db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO listening(release_id,participant_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [r.id, s.participant_id],
      );
      const old = (
        await tx.query(
          "SELECT * FROM listening WHERE release_id=$1 AND participant_id=$2 FOR UPDATE",
          [r.id, s.participant_id],
        )
      ).rows[0];
      const intervals = mergeIntervals(
        [...old.intervals, ...input.intervals],
        Number(r.duration_seconds),
      );
      const seconds = listenedSeconds(intervals, Number(r.duration_seconds));
      requireThat(
        intervals.length <= 500,
        "too_many_intervals",
        "Listening history is full.",
      );
      await tx.query(
        "UPDATE listening SET intervals=$1,seconds=$2,qualified=$3,completed=$4,updated_at=now() WHERE release_id=$5 AND participant_id=$6",
        [
          JSON.stringify(intervals),
          seconds,
          seconds >= Math.min(30, Number(r.duration_seconds) / 2),
          seconds >= Number(r.duration_seconds) * 0.95,
          r.id,
          s.participant_id,
        ],
      );
      return {
        seconds,
        feedbackEligible: seconds > Number(r.duration_seconds) / 2,
      };
    });
  });
  app.get("/api/operator/traffic", async (req) => {
    await session(req, "operator");
    return { snapshots: snapshotReads.stats, streams: roomStreams.stats };
  });
  let lastSequence = 0;
  let polling = false;
  const poll = setInterval(async () => {
    if (polling || !roomStreams.stats.connections) return;
    polling = true;
    try {
      const entries = (
        await db.query(
          "SELECT sequence,event_id FROM event_log WHERE sequence>$1 ORDER BY sequence LIMIT 2000",
          [lastSequence],
        )
      ).rows;
      const affected = new Set(entries.map((e) => e.event_id));
      for (const entry of entries) lastSequence = Number(entry.sequence);
      for (const eventId of affected) roomStreams.update(eventId);
    } catch {
      roomStreams.reconnect();
    } finally {
      polling = false;
    }
  }, 1000);
  poll.unref();
  app.get("/api/events/:slug/stream", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const e = (await db.query("SELECT id FROM events WHERE slug=$1", [slug]))
      .rows[0];
    requireThat(e, "not_found", "Event not found.", 404);
    const removeStream = roomStreams.add(e.id, reply.raw);
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    });
    roomStreams.send(e.id, reply.raw, "event: update\ndata: {}\n\n");
    const heartbeat = setInterval(
      () => roomStreams.send(e.id, reply.raw, ": heartbeat\n\n"),
      15000,
    );
    heartbeat.unref();
    reply.raw.on("close", () => {
      clearInterval(heartbeat);
      removeStream();
    });
  });
  app.addHook("onClose", async () => {
    clearInterval(poll);
    roomStreams.close();
  });
  if (config.serveWeb && existsSync(path.resolve("dist/web/index.html"))) {
    await app.register(fastifyStatic, {
      root: path.resolve("dist/web"),
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "not_found" })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
