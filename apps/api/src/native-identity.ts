import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database, Sql } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";
const challenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const verifier = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);
const requestId = z.string().uuid();
async function mobileSession(tx: Sql, authorization: unknown) {
  const raw =
    typeof authorization === "string"
      ? /^Bearer (ojm_[a-f0-9]{64})$/.exec(authorization)?.[1]
      : undefined;
  requireThat(raw, "sign_in_required", "Join from the Our Jam app first.", 401);
  const session = (
    await tx.query(
      "SELECT token_hash FROM sessions WHERE token_hash=$1 AND kind='guest' AND expires_at>now()",
      [digest(raw)],
    )
  ).rows[0];
  requireThat(
    session,
    "sign_in_required",
    "This device session has expired.",
    401,
  );
  return session;
}
export async function registerNativeIdentity(
  app: FastifyInstance,
  db: Database,
  origin: string,
) {
  app.post(
    "/api/identity/native/start",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const input = z.object({ challenge }).strict().parse(req.body);
      const session = await mobileSession(db, req.headers.authorization),
        id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.query(
          "DELETE FROM native_identity_handoffs WHERE expires_at<now()",
        );
        await tx.query(
          "INSERT INTO native_identity_handoffs(id,initiating_token_hash,challenge) VALUES($1,$2,$3)",
          [id, session.token_hash, input.challenge],
        );
      });
      return {
        requestId: id,
        signInUrl: origin + "/signin?role=audience&native=" + id,
      };
    },
  );
  app.post("/api/identity/native/approve", async (req) => {
    const { requestId: id } = z.object({ requestId }).strict().parse(req.body);
    const raw = req.cookies.oj_guest;
    requireThat(
      typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw),
      "sign_in_required",
      "Sign in to your account first.",
      401,
    );
    return db.transaction(async (tx) => {
      const s = (
        await tx.query(
          "SELECT s.participant_id,s.identity_id FROM sessions s JOIN app_identities i ON i.id=s.identity_id AND i.participant_id=s.participant_id WHERE s.token_hash=$1 AND s.kind='guest' AND s.expires_at>now()",
          [digest(raw)],
        )
      ).rows[0];
      requireThat(
        s,
        "sign_in_required",
        "Use a verified audience account to continue.",
        401,
      );
      const pending = (
        await tx.query(
          "SELECT * FROM native_identity_handoffs WHERE id=$1 AND expires_at>now() FOR UPDATE",
          [id],
        )
      ).rows[0];
      requireThat(
        pending && !pending.code_hash && !pending.consumed_at,
        "handoff_unavailable",
        "This app sign-in link expired or was already approved. Start again from the app.",
        409,
      );
      const code = randomBytes(32).toString("hex");
      await tx.query(
        "UPDATE native_identity_handoffs SET code_hash=$1,participant_id=$2,identity_id=$3 WHERE id=$4",
        [digest(code), s.participant_id, s.identity_id, id],
      );
      return {
        callback:
          "com.neophilism.ourjam://signin?request=" + id + "&code=" + code,
      };
    });
  });
  app.post("/api/identity/native/redeem", async (req) => {
    const input = z
      .object({ requestId, code: z.string().regex(/^[a-f0-9]{64}$/), verifier })
      .strict()
      .parse(req.body);
    return db.transaction(async (tx) => {
      const device = await mobileSession(tx, req.headers.authorization);
      const pending = (
        await tx.query(
          "SELECT * FROM native_identity_handoffs WHERE id=$1 AND expires_at>now() FOR UPDATE",
          [input.requestId],
        )
      ).rows[0];
      const proof = createHash("sha256")
        .update(input.verifier)
        .digest("base64url");
      requireThat(
        pending &&
          !pending.consumed_at &&
          pending.initiating_token_hash === device.token_hash &&
          pending.code_hash === digest(input.code) &&
          pending.challenge === proof &&
          pending.participant_id &&
          pending.identity_id,
        "handoff_unavailable",
        "App sign-in could not be verified. Start again from this device.",
        409,
      );
      const token = "ojm_" + randomBytes(32).toString("hex");
      await tx.query(
        "INSERT INTO sessions(token_hash,participant_id,kind,expires_at,identity_id,identity_family) VALUES($1,$2,'guest',now()+interval '30 days',$3,$4)",
        [
          digest(token),
          pending.participant_id,
          pending.identity_id,
          randomUUID(),
        ],
      );
      await tx.query(
        "UPDATE native_identity_handoffs SET consumed_at=now(),code_hash=NULL WHERE id=$1",
        [input.requestId],
      );
      // The app revokes its old device credential only after Keychain saves the
      // replacement. A storage failure must not discard its existing profile.
      return { token };
    });
  });
}
