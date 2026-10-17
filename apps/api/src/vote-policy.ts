import { z } from "zod";
import type { Database, Sql } from "./db.js";
import { requireThat } from "../../../packages/domain/src/index.js";

const bounded = z.number().int().min(1).max(1000);
export const platformVoteInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("fixed"), fixedVotes: bounded }),
  z.object({ mode: z.literal("artist"), minVotes: bounded, maxVotes: bounded })
    .refine(v => v.minVotes <= v.maxVotes, { path: ["maxVotes"], message: "The maximum must be at least the minimum." }),
]);
export const adminVoteUpdateInput = z.object({
  commandId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  policy: platformVoteInput,
});
export type PlatformVotePolicy = z.infer<typeof platformVoteInput>;
export type VotePolicyRow = PlatformVotePolicy & { revision: number };
export async function readPlatformVotePolicy(db: Sql, lock = false): Promise<VotePolicyRow> {
  const row = (await db.query("SELECT mode,fixed_votes,min_votes,max_votes,revision FROM platform_vote_policy WHERE id=1" + (lock ? " FOR SHARE" : ""))).rows[0];
  requireThat(row, "vote_configuration_missing", "The voting settings are not available.", 503);
  return row.mode === "fixed"
    ? { mode: "fixed", fixedVotes: row.fixed_votes, revision: row.revision }
    : { mode: "artist", minVotes: row.min_votes, maxVotes: row.max_votes, revision: row.revision };
}
export function resolveVoteLimit(policy: PlatformVotePolicy, requested: number | undefined | null) {
  if (policy.mode === "fixed") return policy.fixedVotes;
  if (requested == null) return policy.minVotes;
  requireThat(Number.isSafeInteger(requested) && requested >= policy.minVotes && requested <= policy.maxVotes,
    "vote_limit_out_of_range", `Choose a number of votes between ${policy.minVotes} and ${policy.maxVotes}.`);
  return requested;
}
// Previously scheduled shows are clamped to a newly narrowed range for their NEXT round.
// Previously opened rounds keep their independent, immutable settings.
export function effectiveVoteLimit(policy: PlatformVotePolicy, configured: number | undefined | null) {
  if (policy.mode === "fixed") return policy.fixedVotes;
  if (!Number.isSafeInteger(configured)) return policy.minVotes;
  return Math.min(policy.maxVotes, Math.max(policy.minVotes, configured!));
}
export async function changePlatformVotePolicy(db: Database, input: z.infer<typeof adminVoteUpdateInput>) {
  return db.transaction(async tx => {
    const row = (await tx.query("SELECT mode,fixed_votes,min_votes,max_votes,revision FROM platform_vote_policy WHERE id=1 FOR UPDATE")).rows[0];
    requireThat(row, "vote_configuration_missing", "Voting settings have not been initialized.", 503);
    // The command is idempotent, but never allows a stale writer to change the policy.
    const { replay, remember } = await import("./service.js");
    const command = await replay(tx, "platform-admin", input.commandId, { type:"platform.votes.update", ...input });
    if (command.response) return command.response;
    requireThat(row.revision === input.expectedRevision, "revision_conflict",
      "These voting settings changed. Reload them before saving.", 409);
    const policy = input.policy;
    await tx.query("UPDATE platform_vote_policy SET mode=$1,fixed_votes=$2,min_votes=$3,max_votes=$4,revision=revision+1,updated_at=now() WHERE id=1",
      [policy.mode, policy.mode==="fixed" ? policy.fixedVotes : row.fixed_votes, policy.mode==="artist" ? policy.minVotes : row.min_votes, policy.mode==="artist" ? policy.maxVotes : row.max_votes]);
    const result = await readPlatformVotePolicy(tx);
    await tx.query("INSERT INTO platform_policy_audit(action,previous_policy,updated_policy) VALUES('platform.votes.update',$1,$2)",
      [JSON.stringify(row),JSON.stringify(result)]);
    await remember(tx,"platform-admin",input.commandId,command.hash,result);
    return result;
  });
}
