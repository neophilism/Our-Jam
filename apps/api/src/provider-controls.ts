import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "./db.js";
import type { GenerationConfig } from "./generation.js";
import { ownedEvent, replay, remember, logEvent } from "./service.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";
import { id } from "../../../packages/contracts/src/index.js";
export const providerInput = z.object({ provider: z.enum(["stability", "mureka"]), commandId: id, expectedRevision: z.number().int().nonnegative() });
export async function setGenerationProvider(db: Database, artistId: string, eventId: string, input: z.infer<typeof providerInput>) {
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, artistId, true);
    const cached = await replay(tx, "operator:" + artistId, input.commandId, { type: "generation.provider", eventId, ...input });
    if (cached.response) return cached.response;
    requireThat(event.revision === input.expectedRevision, "revision_conflict", "The show changed. Refresh before switching providers.", 409);
    await tx.query("UPDATE events SET settings=jsonb_set(settings,'{generationProvider}',to_jsonb($1::text)) WHERE id=$2", [input.provider, eventId]);
    await tx.query("INSERT INTO audit_log(artist_id,event_id,action,subject_id) VALUES($1,$2,'generation.provider',$3)", [artistId, eventId, input.provider]);
    await logEvent(tx, eventId, "setup.changed");
    const result = { ok: true, provider: input.provider, appliesTo: "next_round" };
    await remember(tx, "operator:" + artistId, input.commandId, cached.hash, result);
    return result;
  });
}
export function registerGenerationControls(app: FastifyInstance, db: Database, generation?: GenerationConfig) {
  async function artist(req: any): Promise<string> {
    const token = req.cookies.oj_operator;
    requireThat(typeof token === "string" && /^[a-f0-9]{64}$/.test(token), "sign_in_required", "Sign in to the performer console.", 401);
    const row = (await db.query("SELECT artist_id FROM sessions WHERE token_hash=$1 AND kind='operator' AND expires_at>now()", [digest(token)])).rows[0];
    requireThat(row?.artist_id, "sign_in_required", "Sign in to the performer console.", 401);
    return row.artist_id;
  }
  app.get("/api/operator/events/:id/generation-provider", async (req) => {
    const artistId = await artist(req); const eventId = id.parse((req.params as any).id);
    const event = await ownedEvent(db, eventId, artistId);
    const current = (await db.query("SELECT settings->>'generationProvider' provider FROM rounds WHERE event_id=$1 AND state IN ('open','paused') ORDER BY opened_at DESC LIMIT 1", [eventId])).rows[0];
    const zero = generation && (generation.totalBudgetCents === 0 || generation.eventBudgetCents === 0);
    return {
      provider: event.settings.generationProvider ?? "stability", revision: event.revision,
      activeRoundProvider: current ? current.provider ?? "stability" : null,
      state: zero ? "approved_budget_zero" : generation ? "configured" : "provider_not_configured",
      eventBudgetCents: generation?.eventBudgetCents ?? 0, totalBudgetCents: generation?.totalBudgetCents ?? 0,
      providers: ["stability", "mureka"].map((name) => ({ name, keyConfigured: Boolean(generation?.providers?.[name as "stability" | "mureka"]) })),
      jobs: (await db.query("SELECT j.id,j.state,j.reason,j.provider,j.model,j.created_at,COALESCE(r.settings->>'generationProvider','stability') requested_provider FROM generation_jobs j JOIN rounds r ON r.id=j.round_id WHERE j.event_id=$1 ORDER BY j.created_at DESC LIMIT 20", [eventId])).rows,
    };
  });
  app.patch("/api/operator/events/:id/generation-provider", async (req) =>
    setGenerationProvider(db, await artist(req), id.parse((req.params as any).id), providerInput.parse(req.body)));
}
