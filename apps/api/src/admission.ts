import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";
import { id } from "../../../packages/contracts/src/index.js";
import { logEvent, ownedEvent, replay, remember } from "./service.js";

const code = z
  .string()
  .max(40)
  .transform((s) => s.toUpperCase().replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9]{8,24}$/,
        "Use 8–24 letters or numbers for the room code.",
      ),
  );
export const joinInput = z.object({ roomCode: code.optional() });
export const admissionInput = z.object({
  commandId: id,
  expectedRevision: z.number().int().nonnegative(),
  mode: z.enum(["open", "room_code"]),
  limit: z.number().int().min(1).max(100),
  roomCode: code.optional(),
});
export async function configureAdmission(
  db: Database,
  artistId: string,
  eventId: string,
  input: z.infer<typeof admissionInput>,
) {
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, artistId, true);
    const cached = await replay(tx, "operator:" + artistId, input.commandId, {
      type: "admission.configure",
      eventId,
      ...input,
    });
    if (cached.response) return cached.response;
    requireThat(
      event.revision === input.expectedRevision,
      "revision_conflict",
      "The show changed. Reload admission settings before saving.",
      409,
    );
    const started = (
      await tx.query("SELECT 1 FROM rounds WHERE event_id=$1 LIMIT 1", [
        eventId,
      ])
    ).rows.length;
    requireThat(
      !started ||
        (input.mode === (event.settings.admissionMode ?? "open") &&
          input.limit === (event.settings.participantLimit ?? 100)),
      "admission_locked",
      "Voting access and capacity are fixed after the first round starts. You can still replace the room code for new arrivals.",
      409,
    );
    requireThat(
      input.mode !== "room_code" || input.roomCode || event.room_code_hash,
      "room_code_required",
      "Set a room code before enabling room-code voting.",
      400,
    );
    const count = (
      await tx.query(
        "SELECT count(*)::integer n FROM event_members WHERE event_id=$1 AND ($2::boolean OR venue_admitted)",
        [eventId, input.mode === "open"],
      )
    ).rows[0].n;
    requireThat(
      input.limit >= count,
      "capacity_below_members",
      "Capacity cannot be lower than the contributors already admitted under this voting policy.",
      409,
    );
    const salt = input.roomCode
      ? randomBytes(16).toString("hex")
      : event.room_code_salt;
    const hash = input.roomCode
      ? digest(eventId + ":" + salt + ":" + input.roomCode)
      : event.room_code_hash;
    await tx.query(
      "UPDATE events SET settings=$1,room_code_hash=$2,room_code_salt=$3 WHERE id=$4",
      [
        JSON.stringify({
          ...event.settings,
          admissionMode: input.mode,
          participantLimit: input.limit,
        }),
        hash,
        salt,
        eventId,
      ],
    );
    await tx.query(
      "INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2::uuid,'admission.configured',$2::text)",
      [artistId, eventId],
    );
    await logEvent(tx, eventId, "setup.changed");
    const result = { ok: true };
    await remember(
      tx,
      "operator:" + artistId,
      input.commandId,
      cached.hash,
      result,
    );
    return result;
  });
}

export async function joinEvent(
  db: Database,
  slug: string,
  participantId: string,
  input: z.infer<typeof joinInput>,
) {
  return db.transaction(async (tx) => {
    const event = (
      await tx.query("SELECT * FROM events WHERE slug=$1 FOR UPDATE", [slug])
    ).rows[0];
    requireThat(event, "not_found", "Event not found.", 404);
    const member = (
      await tx.query(
        "SELECT * FROM event_members WHERE event_id=$1 AND participant_id=$2",
        [event.id, participantId],
      )
    ).rows[0];
    const restricted = event.settings.admissionMode === "room_code";
    let venue = member?.venue_admitted ?? false;
    if (restricted && input.roomCode && !venue) {
      const hash = digest(
        event.id + ":" + (event.room_code_salt ?? "") + ":" + input.roomCode,
      );
      requireThat(
        event.room_code_hash &&
          timingSafeEqual(Buffer.from(hash), Buffer.from(event.room_code_hash)),
        "room_code_invalid",
        "That room code did not match. Ask the artist for the current code, or keep listening.",
        403,
      );
      venue = true;
    }
    const canContribute = !restricted || venue;
    if (canContribute && !(member && (!restricted || member.venue_admitted))) {
      const count = (
        await tx.query(
          "SELECT count(*)::integer n FROM event_members WHERE event_id=$1 AND ($2::boolean OR venue_admitted)",
          [event.id, !restricted],
        )
      ).rows[0].n;
      requireThat(
        count < (event.settings.participantLimit ?? 100),
        "event_full",
        "The contributor places are full. Free listening, downloads and feedback are still open.",
        409,
      );
    }
    await tx.query(
      "INSERT INTO event_members(event_id,participant_id,venue_admitted) VALUES($1,$2,$3) ON CONFLICT(event_id,participant_id) DO UPDATE SET venue_admitted=event_members.venue_admitted OR excluded.venue_admitted",
      [event.id, participantId, venue],
    );
    if (!member || venue !== member.venue_admitted)
      await logEvent(tx, event.id, "participant.joined");
    return { ok: true, canContribute };
  });
}
