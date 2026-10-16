import { randomBytes, randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import {
  digest,
  requireThat,
  DomainError,
} from "../../../packages/domain/src/index.js";
export type IdentityConfig = {
  authUrl: string;
  providers: ("google" | "github" | "vercel")[];
  verify: (token: string) => Promise<JWTPayload>;
};
export function configuredIdentity(
  env: NodeJS.ProcessEnv = process.env,
): IdentityConfig | undefined {
  if (env.IDENTITY_ENABLED !== "1") return;
  const url = new URL(
    z.url().startsWith("https://").parse(env.NEON_AUTH_BASE_URL),
  );
  requireThat(
    !url.username && !url.password && !url.search && !url.hash,
    "invalid_identity_config",
    "Auth URL must be a clean HTTPS branch endpoint.",
  );
  const authUrl = url.href.replace(/\/$/, ""),
    jwksUrl = new URL(
      env.NEON_AUTH_JWKS_URL ?? authUrl + "/.well-known/jwks.json",
    );
  requireThat(
    jwksUrl.origin === url.origin && jwksUrl.protocol === "https:",
    "invalid_identity_config",
    "JWKS must belong to the configured authentication branch.",
  );
  const jwks = createRemoteJWKSet(jwksUrl, {
    timeoutDuration: 5000,
    cooldownDuration: 30000,
  });
  const providers = z
    .array(z.enum(["google", "github", "vercel"]))
    .parse((env.AUTH_SOCIAL_PROVIDERS ?? "google").split(",").filter(Boolean));
  return {
    authUrl,
    providers,
    verify: async (token) =>
      (
        await jwtVerify(token, jwks, {
          issuer: url.origin,
          audience: url.origin,
          algorithms: ["EdDSA"],
          maxTokenAge: "15m",
          requiredClaims: ["sub", "exp", "iat"],
        })
      ).payload,
  };
}
export const identityInput = z.object({
  role: z.enum(["audience", "performer"]),
  linkCurrent: z.boolean().default(true),
});
export async function exchangeIdentity(
  db: Database,
  claims: JWTPayload,
  input: z.infer<typeof identityInput>,
  cookies: { guest?: string; operator?: string },
) {
  requireThat(
    typeof claims.iss === "string" &&
      typeof claims.sub === "string" &&
      claims.sub.length <= 256 &&
      claims.emailVerified === true &&
      claims.banned !== true,
    "identity_unverified",
    "Verify your email before signing in to Our Jam.",
    403,
  );
  requireThat(
    typeof claims.exp === "number" && claims.exp > Date.now() / 1000,
    "identity_expired",
    "Sign in again to continue.",
    401,
  );
  const displayName =
    typeof claims.name === "string"
      ? claims.name.trim().slice(0, 60) || "Listener"
      : "Listener";
  return db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO app_identities(id,issuer,subject) VALUES($1,$2,$3) ON CONFLICT(issuer,subject) DO NOTHING",
      [randomUUID(), claims.iss, claims.sub],
    );
    const identity = (
      await tx.query(
        "SELECT * FROM app_identities WHERE issuer=$1 AND subject=$2 FOR UPDATE",
        [claims.iss, claims.sub],
      )
    ).rows[0];
    const kind = input.role === "performer" ? "operator" : "guest",
      rawCookie = kind === "operator" ? cookies.operator : cookies.guest;
    const current =
      input.linkCurrent &&
      typeof rawCookie === "string" &&
      /^[a-f0-9]{64}$/.test(rawCookie)
        ? (
            await tx.query(
              "SELECT * FROM sessions WHERE token_hash=$1 AND kind=$2 AND expires_at>now()",
              [digest(rawCookie), kind],
            )
          ).rows[0]
        : undefined;
    if (current?.identity_id)
      requireThat(
        current.identity_id === identity.id,
        "identity_link_conflict",
        "Sign out of the other account before linking a different identity.",
        409,
      );
    let participantId = identity.participant_id,
      artistId = identity.artist_id;
    if (kind === "guest" && !participantId) {
      participantId = current?.participant_id ?? randomUUID();
      requireThat(
        !(
          await tx.query(
            "SELECT id FROM app_identities WHERE participant_id=$1 AND id<>$2",
            [participantId, identity.id],
          )
        ).rows.length,
        "identity_link_conflict",
        "This profile is already linked to another sign-in.",
        409,
      );
      if (!current)
        await tx.query(
          "INSERT INTO participants(id,name,anonymous,avatar_seed) VALUES($1,$2,false,$3)",
          [participantId, displayName, randomBytes(8).toString("hex")],
        );
      await tx.query(
        "UPDATE app_identities SET participant_id=$1 WHERE id=$2",
        [participantId, identity.id],
      );
    }
    if (kind === "operator" && !artistId) {
      artistId = current?.artist_id ?? "artist-" + randomUUID();
      requireThat(
        !(
          await tx.query(
            "SELECT id FROM app_identities WHERE artist_id=$1 AND id<>$2",
            [artistId, identity.id],
          )
        ).rows.length,
        "identity_link_conflict",
        "This performer is already linked to another sign-in.",
        409,
      );
      if (!current)
        await tx.query("INSERT INTO artists(id,name) VALUES($1,$2)", [
          artistId,
          displayName,
        ]);
      await tx.query("UPDATE app_identities SET artist_id=$1 WHERE id=$2", [
        artistId,
        identity.id,
      ]);
    }
    const token = randomBytes(32).toString("hex"),
      expiresAt = new Date(
        Math.min(claims.exp! * 1000, Date.now() + 15 * 60 * 1000),
      );
    await tx.query(
      "INSERT INTO sessions(token_hash,participant_id,artist_id,kind,expires_at,identity_id) VALUES($1,$2,$3,$4,$5,$6)",
      [
        digest(token),
        kind === "guest" ? participantId : null,
        kind === "operator" ? artistId : null,
        kind,
        expiresAt,
        identity.id,
      ],
    );
    if (current)
      await tx.query("DELETE FROM sessions WHERE token_hash=$1", [
        current.token_hash,
      ]);
    return {
      token,
      kind,
      expiresAt,
      profileChanged: Boolean(
        current && kind === "guest" && current.participant_id !== participantId,
      ),
    };
  });
}
export async function registerIdentity(
  app: FastifyInstance,
  db: Database,
  origin: string,
  config?: IdentityConfig,
) {
  app.get("/api/identity/config", async () => ({
    enabled: Boolean(config),
    authUrl: config?.authUrl ?? null,
    providers: config?.providers ?? [],
  }));
  if (!config) return;
  app.post(
    "/api/identity/session",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authorization = req.headers.authorization;
      requireThat(
        typeof authorization === "string" &&
          authorization.startsWith("Bearer ") &&
          authorization.length <= 16384,
        "identity_required",
        "Sign in to continue.",
        401,
      );
      let claims: JWTPayload;
      try {
        claims = await config.verify(authorization!.slice(7));
      } catch {
        throw new DomainError(
          "identity_invalid",
          "Sign in again to continue.",
          401,
        );
      }
      const result = await exchangeIdentity(
        db,
        claims,
        identityInput.parse(req.body),
        { guest: req.cookies.oj_guest, operator: req.cookies.oj_operator },
      );
      reply.setCookie(
        result.kind === "guest" ? "oj_guest" : "oj_operator",
        result.token,
        {
          path: "/",
          httpOnly: true,
          secure: origin.startsWith("https:"),
          sameSite: "strict",
          maxAge: Math.max(
            1,
            Math.floor((result.expiresAt.getTime() - Date.now()) / 1000),
          ),
        },
      );
      return {
        ok: true,
        role: result.kind === "guest" ? "audience" : "performer",
        expiresAt: result.expiresAt,
        profileChanged: result.profileChanged,
      };
    },
  );
  app.post("/api/identity/logout", async (req, reply) => {
    for (const name of ["oj_guest", "oj_operator"]) {
      const raw = req.cookies[name];
      if (typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw))
        await db.query("DELETE FROM sessions WHERE token_hash=$1", [
          digest(raw),
        ]);
      reply.clearCookie(name, { path: "/" });
    }
    return { ok: true };
  });
}
