import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Database, Sql } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";

export const recoveryInput = z.object({
  key: z
    .string()
    .trim()
    .regex(/^ojr_[a-f0-9]{64}$/, "Paste your complete recovery key."),
  channel: z.enum(["web", "mobile"]).default("web"),
});
export const followInput = z.object({ following: z.boolean() });
export const artistIdInput = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);

async function lockProfile(tx: Sql, participantId: string) {
  const p = (
    await tx.query("SELECT id FROM participants WHERE id=$1 FOR UPDATE", [
      participantId,
    ])
  ).rows[0];
  requireThat(p, "sign_in_required", "Join to keep your profile.", 401);
}
async function stillSignedIn(
  tx: Sql,
  participantId: string,
  sessionHash: string,
) {
  const active = (
    await tx.query(
      "SELECT token_hash FROM sessions WHERE token_hash=$1 AND participant_id=$2 AND kind='guest' AND expires_at>now()",
      [sessionHash, participantId],
    )
  ).rows[0];
  requireThat(
    active,
    "sign_in_required",
    "Sign in again before changing recovery.",
    401,
  );
}
export async function accountStatus(db: Database, participantId: string) {
  const recovery = (
    await db.query(
      "SELECT created_at,last_used_at FROM participant_recovery WHERE participant_id=$1",
      [participantId],
    )
  ).rows[0];
  const sessions = (
    await db.query(
      "SELECT count(*)::integer n FROM sessions WHERE participant_id=$1 AND kind='guest' AND expires_at>now()",
      [participantId],
    )
  ).rows[0].n;
  return {
    recoveryEnabled: Boolean(recovery),
    createdAt: recovery?.created_at ?? null,
    lastUsedAt: recovery?.last_used_at ?? null,
    sessions,
  };
}
export async function createRecoveryKey(
  db: Database,
  participantId: string,
  sessionHash: string,
) {
  return db.transaction(async (tx) => {
    await lockProfile(tx, participantId);
    await stillSignedIn(tx, participantId, sessionHash);
    const key = "ojr_" + randomBytes(32).toString("hex");
    await tx.query(
      "INSERT INTO participant_recovery(participant_id,key_hash) VALUES($1,$2) ON CONFLICT(participant_id) DO UPDATE SET key_hash=excluded.key_hash,created_at=now(),last_used_at=NULL",
      [participantId, digest(key)],
    );
    return { key };
  });
}
export async function disableRecovery(
  db: Database,
  participantId: string,
  sessionHash: string,
) {
  return db.transaction(async (tx) => {
    await lockProfile(tx, participantId);
    await stillSignedIn(tx, participantId, sessionHash);
    await tx.query("DELETE FROM participant_recovery WHERE participant_id=$1", [
      participantId,
    ]);
    return { ok: true };
  });
}
export async function recoverProfile(
  db: Database,
  input: z.infer<typeof recoveryInput>,
) {
  const hash = digest(input.key);
  return db.transaction(async (tx) => {
    const found = (
      await tx.query(
        "SELECT participant_id FROM participant_recovery WHERE key_hash=$1",
        [hash],
      )
    ).rows[0];
    requireThat(
      found,
      "invalid_recovery",
      "That recovery key is not valid. Check your saved copy.",
      401,
    );
    await lockProfile(tx, found.participant_id);
    // Rotation can commit while we wait for the participant lock. Re-read the key.
    const current = (
      await tx.query(
        "SELECT participant_id FROM participant_recovery WHERE participant_id=$1 AND key_hash=$2",
        [found.participant_id, hash],
      )
    ).rows[0];
    requireThat(
      current,
      "invalid_recovery",
      "That recovery key is not valid. Check your saved copy.",
      401,
    );
    const token =
      (input.channel === "mobile" ? "ojm_" : "") +
      randomBytes(32).toString("hex");
    await tx.query(
      "DELETE FROM sessions WHERE participant_id=$1 AND kind='guest'",
      [found.participant_id],
    );
    await tx.query(
      "INSERT INTO sessions(token_hash,participant_id,kind,expires_at) VALUES($1,$2,'guest',now()+interval '30 days')",
      [digest(token), found.participant_id],
    );
    await tx.query(
      "UPDATE participant_recovery SET last_used_at=now() WHERE participant_id=$1",
      [found.participant_id],
    );
    return { participantId: found.participant_id, token };
  });
}
export async function followStatus(
  db: Database,
  artistId: string,
  participantId?: string,
) {
  const artist = (
    await db.query("SELECT id FROM artists WHERE id=$1", [artistId])
  ).rows[0];
  requireThat(artist, "not_found", "Artist not found.", 404);
  const count = (
    await db.query(
      "SELECT count(*)::integer followers,coalesce(bool_or(participant_id=$2),false) following FROM artist_follows WHERE artist_id=$1",
      [artistId, participantId ?? null],
    )
  ).rows[0];
  return count;
}
export async function followArtist(
  db: Database,
  participantId: string,
  artistId: string,
  following: boolean,
) {
  return db.transaction(async (tx) => {
    await lockProfile(tx, participantId);
    const artist = (
      await tx.query("SELECT id FROM artists WHERE id=$1", [artistId])
    ).rows[0];
    requireThat(artist, "not_found", "Artist not found.", 404);
    if (!following) {
      await tx.query(
        "DELETE FROM artist_follows WHERE participant_id=$1 AND artist_id=$2",
        [participantId, artistId],
      );
    } else {
      const existing = (
        await tx.query(
          "SELECT artist_id FROM artist_follows WHERE participant_id=$1 AND artist_id=$2",
          [participantId, artistId],
        )
      ).rows[0];
      if (!existing) {
        const count = (
          await tx.query(
            "SELECT count(*)::integer n FROM artist_follows WHERE participant_id=$1",
            [participantId],
          )
        ).rows[0].n;
        requireThat(
          count < 250,
          "follow_limit",
          "You can follow up to 250 artists. Unfollow one to add another.",
          409,
        );
        await tx.query(
          "INSERT INTO artist_follows(participant_id,artist_id) VALUES($1,$2)",
          [participantId, artistId],
        );
      }
    }
    return { following };
  });
}
export async function followingFeed(db: Database, participantId: string) {
  return db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const artists = (
      await tx.query(
        "SELECT a.id,a.name,a.bio FROM artist_follows f JOIN artists a ON a.id=f.artist_id WHERE f.participant_id=$1 ORDER BY f.created_at DESC,a.id LIMIT 250",
        [participantId],
      )
    ).rows;
    const tracks = (
      await tx.query(
        `SELECT r.id,r.title,r.published_at,e.artist_id,e.artist_name,e.slug,e.title event_title
      FROM artist_follows f JOIN events e ON e.artist_id=f.artist_id JOIN releases r ON r.event_id=e.id
      WHERE f.participant_id=$1 AND r.published_at IS NOT NULL AND NOT r.hidden
      ORDER BY r.published_at DESC,r.id LIMIT 24`,
        [participantId],
      )
    ).rows;
    return { artists, tracks };
  });
}
