/**
 * Pure, deterministic allocation rules for the OurJam comparison dashboard.
 * Monetary amounts are integer micro-USD (1 USD = 1_000_000 micro-USD).
 * This module does not price cloud resources or imply measured invoices.
 */
export type CostCertainty = "estimated" | "measured" | "reconciled";
export type CostSource = "gpu" | "api" | "storage" | "egress" | "overhead";
export interface RunCost {
  runId: string;
  providerId: string;
  amountMicroUsd: number;
  source: CostSource;
  certainty: CostCertainty;
}
export interface RunOutcome {
  runId: string;
  providerId: string;
  successful: boolean;
  usable: boolean;
}
export interface CostSummary {
  providerId: string;
  runCount: number;
  successes: number;
  usableTracks: number;
  totalMicroUsd: number;
  estimatedMicroUsd: number;
  measuredMicroUsd: number;
  reconciledMicroUsd: number;
  costPerSuccessMicroUsd: number | null;
  costPerUsableMicroUsd: number | null;
  costsComplete: boolean;
}
function nonnegativeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a nonnegative safe integer`);
}
function sumExact(values: number[]): number {
  let total = 0;
  for (const value of values) {
    nonnegativeInteger(value, "cost");
    total += value;
    if (!Number.isSafeInteger(total)) throw new RangeError("Total cost exceeds safe integer range");
  }
  return total;
}
/** Integer pro-rata distribution with stable largest-remainder rounding. */
export function allocateSharedGpuCost(
  sharedMicroUsd: number,
  weights: readonly { runId: string; gpuSeconds: number }[],
): { runId: string; allocatedMicroUsd: number }[] {
  nonnegativeInteger(sharedMicroUsd, "sharedMicroUsd");
  if (!weights.length) {
    if (sharedMicroUsd > 0) throw new RangeError("Shared GPU cost without attributed runs must stay unallocated");
    return [];
  }
  const ids = new Set<string>();
  for (const row of weights) {
    if (!row.runId || ids.has(row.runId)) throw new Error("Run IDs must be distinct and nonempty");
    ids.add(row.runId);
    nonnegativeInteger(row.gpuSeconds, "gpuSeconds");
  }
  const total = sumExact(weights.map(row => row.gpuSeconds));
  if (!total) {
    if (sharedMicroUsd > 0) throw new RangeError("Cannot allocate shared GPU cost without positive GPU time");
    return weights.map(row => ({ runId: row.runId, allocatedMicroUsd: 0 }));
  }
  // Use BigInt to avoid float precision drift on USD-microcent allocations.
  const denominator = BigInt(total);
  const numerator = BigInt(sharedMicroUsd);
  const portions = weights.map(row => {
    const units = numerator * BigInt(row.gpuSeconds);
    return { runId: row.runId, whole: Number(units / denominator), remainder: units % denominator };
  });
  const assigned = sumExact(portions.map(p => p.whole));
  const leftovers = sharedMicroUsd - assigned;
  const priority = [...portions].sort((a,b) =>
    a.remainder === b.remainder ? a.runId.localeCompare(b.runId) : a.remainder > b.remainder ? -1 : 1
  );
  for (let i=0; i<leftovers; i++) priority[i].whole++;
  return portions.map(p => ({runId:p.runId,allocatedMicroUsd:p.whole}));
}
/**
 * Summarize cost without laundering missing metering into $0.
 * Require each completed/failed run to have a cost record or mark incomplete.
 * An invoice or real host billing record is required to use certainty 'reconciled'.
 */
export function summarizeProviderCosts(
  runs: readonly RunOutcome[],
  entries: readonly RunCost[],
): CostSummary[] {
  const known = new Map<string, RunOutcome>();
  for (const run of runs) {
    if (!run.runId || !run.providerId || known.has(run.runId)) throw new Error("Duplicate or invalid run");
    if (run.usable && !run.successful) throw new Error("A failed run cannot be usable");
    known.set(run.runId, run);
  }
  const costs = new Map<string, RunCost[]>();
  for (const entry of entries) {
    nonnegativeInteger(entry.amountMicroUsd,"amountMicroUsd");
    if (!known.has(entry.runId) || known.get(entry.runId)!.providerId !== entry.providerId)
      throw new Error("Unmatched run or provider in cost ledger");
    if (!["estimated","measured","reconciled"].includes(entry.certainty))
      throw new Error("Invalid cost certainty");
    if (!["gpu","api","storage","egress","overhead"].includes(entry.source))
      throw new Error("Invalid cost source");
    costs.set(entry.runId,[...(costs.get(entry.runId) ?? []),entry]);
  }
  const providers = new Map<string, RunOutcome[]>();
  for (const run of runs) providers.set(run.providerId,[...(providers.get(run.providerId) ?? []),run]);
  return [...providers.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([providerId, group]) => {
    const allEntries=group.flatMap(run=>costs.get(run.runId)??[]);
    const successes=group.filter(run=>run.successful).length;
    const usableTracks=group.filter(run=>run.usable).length;
    const totalMicroUsd=sumExact(allEntries.map(e=>e.amountMicroUsd));
    const costsComplete=group.every(run=>costs.has(run.runId));
    const split=(certainty:CostCertainty)=>sumExact(allEntries.filter(e=>e.certainty===certainty).map(e=>e.amountMicroUsd));
    return {
      providerId,runCount:group.length,successes,usableTracks,totalMicroUsd,
      estimatedMicroUsd:split("estimated"),measuredMicroUsd:split("measured"),reconciledMicroUsd:split("reconciled"),
      costPerSuccessMicroUsd:costsComplete&&successes?Math.ceil(totalMicroUsd/successes):null,
      costPerUsableMicroUsd:costsComplete&&usableTracks?Math.ceil(totalMicroUsd/usableTracks):null,
      costsComplete
    };
  });
}
