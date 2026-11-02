import { z } from "zod";
import type { Database, Sql } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";

export const recognitionSettingsInput = z
  .object({
    timezone: z.string().min(1).max(80),
    visible: z.boolean(),
    expectedRevision: z.number().int().nonnegative().max(2147483646),
  })
  .strict();
export async function recognitionSettings(db: Sql, artistId: string) {
  const row = (
    await db.query(
      "SELECT leaderboard_timezone,leaderboard_visible,recognition_revision FROM artists WHERE id=$1",
      [artistId],
    )
  ).rows[0];
  requireThat(row, "not_found", "Artist not found.", 404);
  return {
    timezone: row.leaderboard_timezone,
    visible: row.leaderboard_visible,
    revision: row.recognition_revision,
  };
}
export async function updateRecognitionSettings(
  db: Database,
  artistId: string,
  input: z.infer<typeof recognitionSettingsInput>,
) {
  // The session supplies artistId. The body cannot select another artist.
  let timezone: string;
  try {
    timezone = new Intl.DateTimeFormat("en", {
      timeZone: input.timezone,
    }).resolvedOptions().timeZone;
  } catch {
    requireThat(false, "invalid_timezone", "Choose a valid time zone.", 400);
  }
  return db.transaction(async (tx) => {
    const supported = (
      await tx.query("SELECT name FROM pg_timezone_names WHERE name=$1", [
        timezone,
      ])
    ).rows[0];
    requireThat(
      supported,
      "invalid_timezone",
      "This time zone is not supported by the database.",
      400,
    );
    const row = (
      await tx.query(
        "UPDATE artists SET leaderboard_timezone=$1,leaderboard_visible=$2,recognition_revision=recognition_revision+1 WHERE id=$3 AND recognition_revision=$4 RETURNING recognition_revision",
        [timezone, input.visible, artistId, input.expectedRevision],
      )
    ).rows[0];
    requireThat(
      row,
      "revision_conflict",
      "Recognition settings changed. Refresh before saving.",
      409,
    );
    return {
      timezone,
      visible: input.visible,
      revision: row.recognition_revision,
    };
  });
}
