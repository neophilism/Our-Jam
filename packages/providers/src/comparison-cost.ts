/** 
 * All amounts are integer micro-USD (1 USD = 1,000,000 micro-USD).
 * Estimates and provider invoices must NEVER be silently conflated.
 * This module is pure and does not initiate usage or touch a live payment API.
 */
export type CostCertainty = "estimated" | "invoiced" | "reconciled" | "unknown";
export type CostLine = {
  id: string;
  category: "api" | "gpu" | "storage" | "egress" | "overhead" | "adjustment";
  amountMicroUsd: number | null;
  certainty: CostCertainty;
};
export type RunWeight = { runId: string; busyGpuSeconds: number };
export type GpuAllocation = {
  totalMicroUsd: number | null;
  allocated: { runId: string; amountMicroUsd: number | null }[];
  unallocatedMicroUsd: number | null;
  certainty: CostCertainty;
};

function positiveInt(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value > 0;
}
function nonnegativeFinite(value: number) {
  return Number.isFinite(value) && value >= 0;
}
function safeMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid micro-USD amount.");
  return value;
}

/** Billable GPU-seconds include startup, model loading, idle and failed jobs; not only useful inference. */
export function allocateGpuInvoice(args: {
  rateMicroUsdPerHour: number | null;
  billedSeconds: number;
  jobs: readonly RunWeight[];
  certainty: Exclude<CostCertainty, "unknown"> | "unknown";
}): GpuAllocation {
  const { rateMicroUsdPerHour, billedSeconds, jobs, certainty } = args;
  if (!nonnegativeFinite(billedSeconds) || jobs.some(job => !nonnegativeFinite(job.busyGpuSeconds)) ||
      new Set(jobs.map(job => job.runId)).size !== jobs.length || jobs.some(job => !job.runId))
    throw new Error("Invalid GPU allocation weights.");
  if (rateMicroUsdPerHour !== null && !positiveInt(rateMicroUsdPerHour))
    throw new Error("GPU rate must be a positive integer amount, or null when unknown.");
  if (rateMicroUsdPerHour === null || certainty === "unknown")
    return { totalMicroUsd: null, allocated: jobs.map(job => ({ runId:job.runId, amountMicroUsd:null })), unallocatedMicroUsd:null, certainty:"unknown" };
  const total = safeMoney(Math.ceil(rateMicroUsdPerHour * billedSeconds / 3600));
  const active = jobs.reduce((sum, job) => sum + job.busyGpuSeconds, 0);
  // No inference ran? All billed idle, still a real cost, never assign to a fictional run.
  if (active === 0)
    return { totalMicroUsd: total, allocated: jobs.map(job => ({ runId: job.runId, amountMicroUsd:0 })), unallocatedMicroUsd:total, certainty };
  let distributed = 0;
  const allocated = jobs.map((job, index) => {
    const amount = index === jobs.length - 1
      ? total - distributed
      : Math.floor(total * job.busyGpuSeconds / active);
    distributed += amount;
    return { runId: job.runId, amountMicroUsd: safeMoney(amount) };
  });
  return { totalMicroUsd: total, allocated, unallocatedMicroUsd: total - distributed, certainty };
}

/** Null means unmeasured; 0 is reserved for a measured, provably free item. */
export function summarizeCost(lines: readonly CostLine[]) {
  const ids = new Set<string>();
  let microUsd = 0;
  let estimated = false;
  let missing = false;
  for (const line of lines) {
    if (!line.id || ids.has(line.id)) throw new Error("Cost-event IDs must be unique.");
    ids.add(line.id);
    if (line.amountMicroUsd === null || line.certainty === "unknown") { missing = true; continue; }
    safeMoney(line.amountMicroUsd);
    microUsd = safeMoney(microUsd + line.amountMicroUsd);
    if (line.certainty === "estimated") estimated = true;
  }
  return {
    knownMicroUsd: lines.length && ids.size === lines.length && !missing ? microUsd : (lines.some(x => x.amountMicroUsd !== null && x.certainty !== "unknown") ? microUsd : null),
    complete: lines.length > 0 && !missing,
    estimated,
    hasUnmeasuredCharges: missing || lines.length === 0,
    evidenceCount: lines.length,
  };
}

export function costPerUsableSong(microUsd: number | null, usableCount: number): number | null {
  if (!Number.isSafeInteger(usableCount) || usableCount < 0) throw new Error("Invalid usable-track count.");
  if (microUsd === null || usableCount === 0) return null;
  return Math.ceil(safeMoney(microUsd) / usableCount);
}
export function formatCost(microUsd: number | null): string {
  return microUsd === null ? "Unknown" : "$" + (safeMoney(microUsd) / 1_000_000).toFixed(4);
}
