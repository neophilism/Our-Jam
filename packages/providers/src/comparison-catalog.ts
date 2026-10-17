/** Fixed platform-side comparison provider catalog; no client-defined URL or untrusted model IDs. */
export const COMPARISON_ENGINES = [
  { id: "mureka", label: "Mureka API", execution: "paid_api", rights: "commercial_approval_required", output: "instrumental", checkpoint: "mureka-9.5" },
  { id: "stability", label: "Stable Audio 3 API", execution: "paid_api", rights: "commercial_approval_required", output: "instrumental", checkpoint: "stable-audio-3" },
  { id: "ace_step", label: "ACE-Step XL-SFT + 4B LM", execution: "self_hosted", rights: "checkpoint_review_required", output: "instrumental", checkpoint: "acestep-v15-xl-sft" },
  { id: "heartmula", label: "HeartMuLa 3B (Happy New Year)", execution: "self_hosted", rights: "checkpoint_review_required", output: "instrumental", checkpoint: "HeartMuLa-oss-3B-happy-new-year" },
  { id: "stable_audio_open", label: "Stable Audio 3 Medium (open weights)", execution: "self_hosted", rights: "community_license_eligibility_required", output: "instrumental", checkpoint: "stable-audio-3-medium" },
  { id: "musicgen", label: "MusicGen Large (research only)", execution: "self_hosted", rights: "noncommercial_only", output: "instrumental", checkpoint: "facebook/musicgen-large" },
] as const;
export type ComparisonEngineId = (typeof COMPARISON_ENGINES)[number]["id"];
export type ComparisonEngine = (typeof COMPARISON_ENGINES)[number];
export const COMPARISON_ENGINE_IDS: readonly ComparisonEngineId[] = COMPARISON_ENGINES.map((engine) => engine.id);
export function uniqueComparisonSelection(selection: readonly string[]): ComparisonEngineId[] {
  if (!Array.isArray(selection) || selection.length === 0 || selection.length > COMPARISON_ENGINES.length)
    throw new Error("Select between one and six comparison providers.");
  if (new Set(selection).size !== selection.length || selection.some((id) => !COMPARISON_ENGINE_IDS.includes(id as ComparisonEngineId)))
    throw new Error("Unknown or duplicate comparison provider.");
  return selection as ComparisonEngineId[];
}
export function isCommercialComparisonAllowed(id: ComparisonEngineId): boolean {
  return id !== "musicgen";
}
