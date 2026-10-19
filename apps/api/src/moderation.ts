import type { Database } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";
import { ownedEvent, logEvent } from "./service.js";
export async function moderationQueue(
  db: Database,
  artistId: string,
  eventId: string,
) {
  await ownedEvent(db, eventId, artistId);
  return {
    waves: (
      await db.query(
        `SELECT w.id,w.text,w.moderated,w.created_at,r.id AS round_id
         FROM sound_waves w JOIN rounds r ON r.id=w.round_id
         WHERE r.event_id=$1 AND r.state IN ('open','paused')
         ORDER BY w.created_at DESC,w.id LIMIT 100`,
        [eventId],
      )
    ).rows,
    comments: (
      await db.query(
        `SELECT c.id,c.body,c.hidden,c.created_at,r.title,
 (SELECT jsonb_agg(x.reason ORDER BY x.created_at) FROM reports x WHERE x.comment_id=c.id) reports
 FROM comments c JOIN releases r ON r.id=c.release_id WHERE r.event_id=$1 AND (c.hidden OR EXISTS(SELECT 1 FROM reports x WHERE x.comment_id=c.id)) ORDER BY c.created_at DESC LIMIT 100`,
        [eventId],
      )
    ).rows,
    releases: (
      await db.query(
        "SELECT id,title,hidden,published_at FROM releases WHERE event_id=$1 ORDER BY published_at DESC NULLS FIRST,id LIMIT 100",
        [eventId],
      )
    ).rows,
  };
}
export async function moderate(
  db: Database,
  artistId: string,
  kind: "comment" | "release",
  subjectId: string,
  hidden: boolean,
) {
  return db.transaction(async (tx) => {
    const record = (
      await tx.query(
        kind === "comment"
          ? "SELECT r.event_id FROM comments c JOIN releases r ON r.id=c.release_id WHERE c.id=$1"
          : "SELECT event_id FROM releases WHERE id=$1",
        [subjectId],
      )
    ).rows[0];
    requireThat(record, "not_found", "Entry not found.", 404);
    await ownedEvent(tx, record.event_id, artistId, true);
    // An author may delete a comment after the ownership lookup but before
    // the update. Do not record a successful moderation of a missing item.
    const updated = await tx.query(
      kind === "comment"
        ? "UPDATE comments SET hidden=$1 WHERE id=$2 RETURNING id"
        : "UPDATE releases SET hidden=$1 WHERE id=$2 RETURNING id",
      [hidden, subjectId],
    );
    requireThat(updated.rows.length === 1, "not_found", "Entry not found.", 404);
    await tx.query(
      "INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2,$3,$4)",
      [
        artistId,
        record.event_id,
        `${kind}.${hidden ? "hidden" : "restored"}`,
        subjectId,
      ],
    );
    await logEvent(tx, record.event_id, "moderation.changed");
    return { ok: true };
  });
}
