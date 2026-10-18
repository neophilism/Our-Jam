/** Native vote-policy compatibility with the authoritative event snapshot. */
export type VoteSnapshot = {
  event: { settings: { voteMode?: "single" | "weighted"; votesPerListener?: number } };
  round: { voteMode?: "single" | "weighted"; voteLimit?: number } | null;
};
export function voteRules(state: VoteSnapshot | null) {
  const mode = state?.round?.voteMode ?? state?.event.settings.voteMode ?? "weighted";
  const candidate = state?.round?.voteLimit ??
    (mode === "single" ? state?.event.settings.votesPerListener : 5) ?? 5;
  const voteLimit = Number.isSafeInteger(candidate) && candidate > 0 && candidate <= 1000
    ? candidate : 5;
  return { voteLimit, singleVote: mode === "single" };
}
export function canAddVote(mine: number, used: number, voteLimit: number, singleVote: boolean) {
  return used < voteLimit && (!singleVote || mine === 0);
}
