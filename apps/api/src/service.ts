import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database, Sql } from "./db.js";
import {
  compilePrompt,
  digest,
  normalizeWave,
  rankWaves,
  requireThat,
  validateAllocations,
  type RankedWave,
} from "../../../packages/domain/src/index.js";
import {
  eventInput,
  waveInput,
  allocationInput,
} from "../../../packages/contracts/src/index.js";

import { verifyLease, type PlaybackCommand } from "./lease.js";

export type Actor = { participantId: string };
export async function logEvent(
  tx: Sql,
  eventId: string,
  type: string,
  payload: unknown = {},
) {
  if (["playback.advanced", "queue.changed"].includes(type))
    await tx.query("UPDATE events SET revision=revision+1 WHERE id=$1", [
      eventId,
    ]);
  await tx.query(
    "INSERT INTO event_log(event_id,type,payload) VALUES($1,$2,$3)",
    [eventId, type, JSON.stringify(payload)],
  );
}
export async function ownedEvent(
  tx: Sql,
  id: string,
  artistId: string,
  lock = false,
) {
  const event = (
    await tx.query(
      "SELECT * FROM events WHERE id=$1 AND artist_id=$2" +
        (lock ? " FOR UPDATE" : ""),
      [id, artistId],
    )
  ).rows[0];
  requireThat(event, "not_found", "Event not found.", 404);
  return event;
}
async function lockedRound(tx: Sql, id: string, actor: Actor) {
  const parent = (
    await tx.query("SELECT event_id FROM rounds WHERE id=$1", [id])
  ).rows[0];
  requireThat(parent, "not_found", "Round not found.", 404);
  await tx.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [
    parent.event_id,
  ]);
  const r = (
    await tx.query(
      "SELECT *,clock_timestamp() AS server_time FROM rounds WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  requireThat(r, "not_found", "Round not found.", 404);
  const member = (
    await tx.query(
      "SELECT 1 FROM event_members WHERE event_id=$1 AND participant_id=$2",
      [r.event_id, actor.participantId],
    )
  ).rows[0];
  requireThat(
    member,
    "join_required",
    "Join this event before contributing.",
    403,
  );
  const lease = (
    await tx.query("SELECT expires_at FROM playback_leases WHERE event_id=$1", [
      r.event_id,
    ])
  ).rows[0];
  r.controllerAlive =
    lease && new Date(lease.expires_at) > new Date(r.server_time);
  return r;
}
function open(r: Record<string, any>) {
  requireThat(
    r.state === "open" &&
      r.controllerAlive &&
      new Date(r.deadline_at) > new Date(r.server_time),
    "round_closed",
    "This round has closed. Your points were not changed.",
    409,
  );
}
export async function replay(
  tx: Sql,
  actor: string,
  commandId: string,
  request: unknown,
) {
  const hash = digest(JSON.stringify(request));
  const row = (
    await tx.query(
      "SELECT * FROM idempotency WHERE actor_id=$1 AND command_id=$2",
      [actor, commandId],
    )
  ).rows[0];
  if (row)
    requireThat(
      row.request_hash === hash,
      "command_reused",
      "A command ID cannot be reused for a different action.",
      409,
    );
  return { hash, response: row?.response };
}
export async function remember(
  tx: Sql,
  actor: string,
  commandId: string,
  hash: string,
  response: unknown,
) {
  await tx.query(
    "INSERT INTO idempotency(actor_id,command_id,request_hash,response) VALUES($1,$2,$3,$4)",
    [actor, commandId, hash, JSON.stringify(response)],
  );
}
async function ballot(
  tx: Sql,
  roundId: string,
  participantId: string,
  revision: number,
) {
  await tx.query(
    "INSERT INTO ballots(round_id,participant_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [roundId, participantId],
  );
  const row = (
    await tx.query(
      "SELECT revision FROM ballots WHERE round_id=$1 AND participant_id=$2 FOR UPDATE",
      [roundId, participantId],
    )
  ).rows[0];
  requireThat(
    row.revision === revision,
    "revision_conflict",
    "Your points changed in another tab. Refresh and try again.",
    409,
  );
  return row;
}
async function saveAllocation(
  tx: Sql,
  roundId: string,
  participantId: string,
  allocation: Record<string, number>,
) {
  validateAllocations(allocation);
  for (const waveId of Object.keys(allocation)) {
    const wave = (
      await tx.query(
        "SELECT id FROM sound_waves WHERE round_id=$1 AND id=$2 AND NOT moderated",
        [roundId, waveId],
      )
    ).rows[0];
    requireThat(
      wave,
      "invalid_wave",
      "That Sound Wave is not available in this round.",
    );
  }
  await tx.query(
    "DELETE FROM allocations WHERE round_id=$1 AND participant_id=$2",
    [roundId, participantId],
  );
  for (const [waveId, points] of Object.entries(allocation))
    await tx.query(
      "INSERT INTO allocations(round_id,participant_id,wave_id,points) VALUES($1,$2,$3,$4)",
      [roundId, participantId, waveId, points],
    );
  await tx.query(
    "UPDATE ballots SET revision=revision+1 WHERE round_id=$1 AND participant_id=$2",
    [roundId, participantId],
  );
}
export async function ranked(
  tx: Sql,
  roundId: string,
  seed: string,
  participantId?: string,
): Promise<RankedWave[]> {
  const rows = (
    await tx.query(
      `SELECT w.*,p.name,p.anonymous,p.avatar_seed,
    COALESCE(sum(a.points),0)::integer votes,count(a.participant_id)::integer supporters,
    COALESCE(sum(a.points) FILTER(WHERE a.participant_id=$2),0)::integer mine,
    COALESCE(sum(a.points) FILTER(WHERE a.participant_id<>w.author_id),0)::integer other_points
    FROM sound_waves w JOIN participants p ON p.id=w.author_id
    LEFT JOIN allocations a ON a.wave_id=w.id AND a.round_id=w.round_id
    WHERE w.round_id=$1 AND NOT w.moderated GROUP BY w.id,p.id`,
      [roundId, participantId ?? null],
    )
  ).rows;
  return rankWaves(
    rows.map((w) => ({
      id: w.id,
      text: w.text,
      votes: w.votes,
      supporters: w.supporters,
      authorId: w.author_id,
      createdAt: new Date(w.created_at).toISOString(),
      mine: w.mine,
      name: w.anonymous ? "Anonymous" : w.name,
      avatarSeed: w.avatar_seed,
      otherPoints: w.other_points,
    })),
    seed,
  );
}
export async function allocate(
  db: Database,
  actor: Actor,
  roundId: string,
  input: z.infer<typeof allocationInput>,
) {
  return db.transaction(async (tx) => {
    const r = await lockedRound(tx, roundId, actor);
    const cache = await replay(tx, actor.participantId, input.commandId, {
      type: "allocate",
      roundId,
      ...input,
    });
    if (cache.response) return cache.response;
    open(r);
    await ballot(tx, roundId, actor.participantId, input.expectedRevision);
    await saveAllocation(tx, roundId, actor.participantId, input.allocations);
    const result = { revision: input.expectedRevision + 1 };
    await remember(
      tx,
      actor.participantId,
      input.commandId,
      cache.hash,
      result,
    );
    await logEvent(tx, r.event_id, "votes.changed");
    return result;
  });
}
export async function submitWave(
  db: Database,
  actor: Actor,
  roundId: string,
  input: z.infer<typeof waveInput>,
) {
  const text = normalizeWave(input.text);
  return db.transaction(async (tx) => {
    const r = await lockedRound(tx, roundId, actor);
    const cache = await replay(tx, actor.participantId, input.commandId, {
      type: "wave",
      roundId,
      ...input,
    });
    if (cache.response) return cache.response;
    open(r);
    await ballot(tx, roundId, actor.participantId, input.expectedRevision);
    const allocation: Record<string, number> = {};
    for (const row of (
      await tx.query(
        "SELECT wave_id,points FROM allocations WHERE round_id=$1 AND participant_id=$2",
        [roundId, actor.participantId],
      )
    ).rows)
      allocation[row.wave_id] = row.points;
    if (input.moveFrom) {
      requireThat(
        allocation[input.moveFrom] > 0,
        "invalid_transfer",
        "Choose a point you currently hold.",
      );
      if (--allocation[input.moveFrom] === 0) delete allocation[input.moveFrom];
    }
    requireThat(
      Object.values(allocation).reduce((a, b) => a + b, 0) < 5,
      "vote_budget_exceeded",
      "Move one of your five points to contribute a new Sound Wave.",
    );
    let wave = (
      await tx.query(
        "SELECT * FROM sound_waves WHERE round_id=$1 AND normalized=$2",
        [roundId, text.normalized],
      )
    ).rows[0];
    if (wave)
      requireThat(
        !wave.moderated,
        "moderated_wave",
        "That Sound Wave is unavailable.",
      );
    if (!wave) {
      const own = (
        await tx.query(
          "SELECT w.id FROM sound_waves w JOIN allocations a ON a.wave_id=w.id WHERE w.round_id=$1 AND w.author_id=$2 AND NOT w.moderated LIMIT 1",
          [roundId, actor.participantId],
        )
      ).rows[0];
      requireThat(
        !own,
        "active_wave_exists",
        "You already have a supported Sound Wave in this round.",
      );
      const count = (
        await tx.query(
          "SELECT count(*)::integer n FROM sound_waves WHERE round_id=$1",
          [roundId],
        )
      ).rows[0].n;
      requireThat(
        count < 1000,
        "round_capacity",
        "This round has reached its contribution limit.",
        409,
      );
      wave = { id: randomUUID() };
      await tx.query(
        "INSERT INTO sound_waves(id,round_id,author_id,text,normalized) VALUES($1,$2,$3,$4,$5)",
        [wave.id, roundId, actor.participantId, text.text, text.normalized],
      );
    }
    allocation[wave.id] = (allocation[wave.id] ?? 0) + 1;
    await saveAllocation(tx, roundId, actor.participantId, allocation);
    const result = { revision: input.expectedRevision + 1, waveId: wave.id };
    await remember(
      tx,
      actor.participantId,
      input.commandId,
      cache.hash,
      result,
    );
    await logEvent(tx, r.event_id, "wave.contributed");
    return result;
  });
}
export async function createEvent(
  db: Database,
  artistId: string,
  input: z.infer<typeof eventInput>,
) {
  return db.transaction(async (tx) => {
    const eventId = randomUUID();
    const settings = {
      screenLimit: input.screenLimit,
      minimumRoundSeconds: input.minimumRoundSeconds,
      maxWaves: input.maxWaves,
      maxGenerations: input.maxGenerations,
      promptLimit: 3500,
    };
    await tx.query(
      "INSERT INTO events(id,artist_id,slug,title,artist_name,purchase_url,settings) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        eventId,
        artistId,
        input.slug,
        input.title,
        input.artistName,
        input.purchaseUrl ?? null,
        JSON.stringify(settings),
      ],
    );
    for (const [index, source] of input.sources.entries()) {
      compilePrompt(source.corePrompt, [], settings.promptLimit);
      const id = randomUUID();
      await tx.query(
        "INSERT INTO source_tracks(id,event_id,title,core_prompt,audio_url,duration_seconds,ordinal) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          eventId,
          source.title,
          source.corePrompt,
          source.audioUrl ?? null,
          source.durationSeconds,
          index,
        ],
      );
      await tx.query(
        "INSERT INTO queue_items(id,event_id,source_id,position) VALUES($1,$2,$3,$4)",
        [randomUUID(), eventId, id, index],
      );
    }
    await logEvent(tx, eventId, "event.created");
    return { id: eventId, slug: input.slug };
  });
}
export async function closeRound(
  tx: Sql,
  r: Record<string, any>,
  providerReady = false,
) {
  if (!["open", "paused"].includes(r.state)) return;
  const waves = await ranked(tx, r.id, r.seed);
  const compiled = compilePrompt(
    r.core_prompt,
    waves,
    r.settings.promptLimit,
    r.settings.maxWaves,
  );
  const now = (await tx.query("SELECT clock_timestamp() time")).rows[0].time;
  const cutoff =
    r.state === "paused"
      ? new Date(r.paused_at).getTime()
      : Math.min(new Date(now).getTime(), new Date(r.deadline_at).getTime());
  const elapsed =
    Math.max(
      0,
      cutoff - new Date(r.opened_at).getTime() - Number(r.paused_ms ?? 0),
    ) / 1000;
  const count = (
    await tx.query(
      "SELECT count(*)::integer n FROM generation_jobs WHERE event_id=$1",
      [r.event_id],
    )
  ).rows[0].n;
  let reason: string | null = !providerReady ? "provider_not_configured" : null;
  if (!compiled.selected.length) reason = "no_supported_waves";
  if (elapsed < r.settings.minimumRoundSeconds)
    reason = "participation_window_too_short";
  if (count >= r.settings.maxGenerations) reason = "event_generation_limit";
  await tx.query(
    "UPDATE rounds SET state='closed',closed_at=now() WHERE id=$1",
    [r.id],
  );
  // Even blocked work retains the exact final snapshot; no paid request occurs here.
  await tx.query(
    "INSERT INTO generation_jobs(id,event_id,round_id,state,reason,snapshot,prompt,prompt_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(round_id) DO NOTHING",
    [
      randomUUID(),
      r.event_id,
      r.id,
      reason ? "blocked" : "queued",
      reason,
      JSON.stringify({
        waves,
        selected: compiled.selected,
        seed: r.seed,
        seedCommitment: r.seed_commitment,
      }),
      compiled.prompt,
      compiled.hash,
    ],
  );
  await logEvent(tx, r.event_id, "round.closed");
}
export async function advance(
  db: Database,
  artistId: string,
  eventId: string,
  commandId: string,
  expectedRevision: number,
  command: PlaybackCommand,
  providerReady = false,
) {
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, artistId, true);
    const cache = await replay(tx, "operator:" + artistId, commandId, {
      type: "advance",
      command,
      eventId,
      expectedRevision,
    });
    if (cache.response) return cache.response;
    await verifyLease(tx, eventId, command);
    requireThat(
      event.revision === expectedRevision,
      "revision_conflict",
      "The queue changed. Refresh before advancing.",
      409,
    );
    const current = (
      await tx.query(
        "SELECT * FROM rounds WHERE event_id=$1 AND state IN ('open','paused') FOR UPDATE",
        [eventId],
      )
    ).rows[0];
    if (current) await closeRound(tx, current, providerReady);
    // Ready outputs from earlier rounds publish at the same boundary.
    const ready = (
      await tx.query(
        "UPDATE releases SET published_at=now() WHERE event_id=$1 AND published_at IS NULL AND NOT hidden RETURNING id,job_id",
        [eventId],
      )
    ).rows;
    for (const release of ready)
      await tx.query(
        "UPDATE generation_jobs SET state='published',updated_at=now() WHERE id=$1",
        [release.job_id],
      );
    if (ready.length)
      await logEvent(tx, eventId, "releases.published", {
        ids: ready.map((r) => r.id),
      });
    await tx.query(
      "UPDATE queue_items SET state='played' WHERE event_id=$1 AND state='playing'",
      [eventId],
    );
    const next = (
      await tx.query(
        "SELECT * FROM queue_items WHERE event_id=$1 AND state='queued' ORDER BY position,id LIMIT 1 FOR UPDATE",
        [eventId],
      )
    ).rows[0];
    let roundId: string | null = null;
    if (next) {
      await tx.query("UPDATE queue_items SET state='playing' WHERE id=$1", [
        next.id,
      ]);
      if (next.source_id) {
        const source = (
          await tx.query("SELECT * FROM source_tracks WHERE id=$1", [
            next.source_id,
          ])
        ).rows[0];
        roundId = randomUUID();
        const seed = randomBytes(32).toString("hex");
        await tx.query(
          "INSERT INTO rounds(id,event_id,source_id,deadline_at,seed,seed_commitment,core_prompt,settings) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            roundId,
            eventId,
            source.id,
            new Date(Date.now() + source.duration_seconds * 1000),
            seed,
            digest(seed),
            source.core_prompt,
            JSON.stringify(event.settings),
          ],
        );
      }
      if (next.source_id && roundId) {
        const source = (
          await tx.query(
            "SELECT audio_url,duration_seconds FROM source_tracks WHERE id=$1",
            [next.source_id],
          )
        ).rows[0];
        if (source.audio_url)
          await tx.query(
            "UPDATE rounds SET state='paused',paused_at=now(),remaining_ms=$1,pause_reason='awaiting_audio' WHERE id=$2",
            [source.duration_seconds * 1000, roundId],
          );
      }
      await tx.query("UPDATE events SET state='live' WHERE id=$1", [eventId]);
    } else
      await tx.query("UPDATE events SET state='ended' WHERE id=$1", [eventId]);
    await logEvent(tx, eventId, "playback.advanced");
    const result = {
      roundId,
      queueItemId: next?.id ?? null,
      sequence: command.sequence,
    };
    await remember(tx, "operator:" + artistId, commandId, cache.hash, result);
    return result;
  });
}
export async function snapshot(
  db: Sql,
  slug: string,
  participantId?: string,
  artistId?: string,
) {
  const event = (await db.query("SELECT * FROM events WHERE slug=$1", [slug]))
    .rows[0];
  requireThat(event, "not_found", "This event was not found.", 404);
  const isOperator = artistId === event.artist_id;
  const round = (
    await db.query(
      "SELECT r.*,s.title source_title FROM rounds r JOIN source_tracks s ON s.id=r.source_id WHERE r.event_id=$1 ORDER BY r.opened_at DESC LIMIT 1",
      [event.id],
    )
  ).rows[0];
  const waves = round
    ? await ranked(db, round.id, round.seed, participantId)
    : [];
  const revision =
    round && participantId
      ? ((
          await db.query(
            "SELECT revision FROM ballots WHERE round_id=$1 AND participant_id=$2",
            [round.id, participantId],
          )
        ).rows[0]?.revision ?? 0)
      : 0;
  const current = (
    await db.query(
      "SELECT q.id,COALESCE(s.title,r.title) title,COALESCE(s.audio_url,r.audio_url) audio_url,COALESCE(s.duration_seconds,r.duration_seconds) duration_seconds FROM queue_items q LEFT JOIN source_tracks s ON s.id=q.source_id LEFT JOIN releases r ON r.id=q.release_id WHERE q.event_id=$1 AND q.state='playing'",
      [event.id],
    )
  ).rows[0];
  const releases = (
    await db.query(
      `SELECT r.id,r.title,r.audio_url,r.download_url,r.duration_seconds,r.published_at,
    (SELECT count(*)::integer FROM reactions x WHERE x.release_id=r.id AND value=1) likes,
    (SELECT count(*)::integer FROM listening l WHERE l.release_id=r.id AND qualified) plays,
    (SELECT value FROM reactions x WHERE x.release_id=r.id AND participant_id=$2) reaction,
    (SELECT count(*)::integer FROM reactions x WHERE x.release_id=r.id AND value=-1) dislikes
    FROM releases r WHERE r.event_id=$1 AND NOT r.hidden AND r.published_at IS NOT NULL ORDER BY r.published_at DESC`,
      [event.id, participantId ?? null],
    )
  ).rows;
  const jobs = (
    await db.query(
      "SELECT id,round_id,state,reason,created_at FROM generation_jobs WHERE event_id=$1 ORDER BY created_at DESC",
      [event.id],
    )
  ).rows;
  const people = (
    await db.query(
      "SELECT count(*)::integer n FROM event_members WHERE event_id=$1",
      [event.id],
    )
  ).rows[0].n;
  const joined = participantId
    ? Boolean(
        (
          await db.query(
            "SELECT 1 FROM event_members WHERE event_id=$1 AND participant_id=$2",
            [event.id, participantId],
          )
        ).rows[0],
      )
    : false;
  const publicRound = round
    ? {
        id: round.id,
        sourceTitle: round.source_title,
        state: round.state,
        openedAt: round.opened_at,
        deadlineAt: round.deadline_at,
        remainingMs: round.remaining_ms,
        pauseReason: round.pause_reason,
        seedCommitment: round.seed_commitment,
        ...(round.state === "closed" ? { seed: round.seed } : {}),
        revision,
        waves: waves.map((w) => ({
          ...w,
          own: w.authorId === participantId,
          authorId: digest(event.id + ":" + w.authorId),
        })),
      }
    : null;
  const queue = isOperator
    ? (
        await db.query(
          `SELECT q.*,COALESCE(s.title,r.title) title,COALESCE(s.audio_url,r.audio_url) audio_url,COALESCE(s.duration_seconds,r.duration_seconds) duration_seconds FROM queue_items q LEFT JOIN source_tracks s ON s.id=q.source_id LEFT JOIN releases r ON r.id=q.release_id WHERE q.event_id=$1 ORDER BY q.position,q.id`,
          [event.id],
        )
      ).rows
    : undefined;
  return {
    serverTime: new Date().toISOString(),
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      artistName: event.artist_name,
      purchaseUrl: event.purchase_url,
      state: event.state,
      settings: event.settings,
      revision: event.revision,
    },
    round: publicRound,
    current: current ?? null,
    releases: releases.map((r) =>
      isOperator
        ? r
        : Object.fromEntries(
            Object.entries(r).filter(([k]) => k !== "dislikes"),
          ),
    ),
    jobs,
    people,
    joined,
    queue,
    isOperator,
  };
}
