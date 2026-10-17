import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";
import { adminVoteUpdateInput, changePlatformVotePolicy, readPlatformVotePolicy } from "./vote-policy.js";

/** Shared read-only admin-session check; compare lab never uses performer or guest authority. */
export async function requirePlatformAdmin(db: Database, req: { cookies?: Record<string, unknown> }, required = true) {
  const raw = req.cookies?.oj_platform_admin;
  let valid = false;
  if (typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw)) {
    const found = (await db.query("SELECT token_hash FROM platform_admin_sessions WHERE token_hash=$1 AND expires_at>now()", [digest(raw)])).rows[0];
    valid = Boolean(found);
  }
  if (required) requireThat(valid, "admin_sign_in_required", "Sign in as the platform administrator.", 401);
  return valid;
}

export function registerPlatformAdmin(
  app: FastifyInstance,
  db: Database,
  config: { adminToken?: string; secureCookies: boolean },
) {
  const cookieName = "oj_platform_admin";
  const adminSession = (req: any, required = true) => requirePlatformAdmin(db, req, required);
  app.get("/api/admin/session", async (req) => ({ admin: await adminSession(req, false), configured: Boolean(config.adminToken?.length && config.adminToken.length >= 32) }));
  app.post("/api/admin/login", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute", keyGenerator: (req: any) => "platform-admin-login:" + req.ip } },
  }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(1).max(256) }).parse(req.body);
    requireThat(config.adminToken && config.adminToken.length >= 32,
      "admin_unconfigured", "Platform administrator sign-in has not been configured.", 503);
    requireThat(timingSafeEqual(Buffer.from(digest(token)), Buffer.from(digest(config.adminToken))),
      "invalid_credentials", "Invalid administrator credential.", 401);
    const raw = randomBytes(32).toString("hex");
    await db.query("INSERT INTO platform_admin_sessions(token_hash,expires_at) VALUES($1,now()+interval '6 hours')", [digest(raw)]);
    reply.setCookie(cookieName, raw, { path: "/", httpOnly: true, secure: config.secureCookies, sameSite: "strict", maxAge: 21600 });
    return { ok: true };
  });
  app.post("/api/admin/logout", async (req, reply) => {
    const raw = req.cookies[cookieName];
    if (typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw))
      await db.query("DELETE FROM platform_admin_sessions WHERE token_hash=$1", [digest(raw)]);
    reply.clearCookie(cookieName,{ path: "/" });
    return { ok: true };
  });
  app.get("/api/admin/voting", async req => {
    await adminSession(req);
    return readPlatformVotePolicy(db);
  });
  app.patch("/api/admin/voting", async req => {
    await adminSession(req);
    return changePlatformVotePolicy(db, adminVoteUpdateInput.parse(req.body));
  });
}
