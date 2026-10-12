import type { Database } from "./db.js";
import { generationTick, type GenerationConfig } from "./generation.js";
import { tickRounds } from "./playback.js";

/** Same round/lease invariants as production, with an immutable zero-spend policy. */
export function startLocalLifecycle(
  db: Database,
  generation: GenerationConfig,
  intervalMs = 1000,
) {
  if (generation.eventBudgetCents !== 0 || generation.totalBudgetCents !== 0) {
    throw new Error("The local rehearsal lifecycle requires a hard $0 budget.");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 10) {
    throw new Error("Invalid rehearsal lifecycle interval.");
  }
  let stopped = false;
  let inFlight: Promise<void> | undefined;
  const tick = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = (async () => {
      // Expired controllers pause before more jobs are dispatched. A live
      // controller's expired deadline closes the real round exactly once.
      await tickRounds(db, true);
      await generationTick(db, generation);
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  };
  const timer = setInterval(() => {
    void tick().catch(() => {
      // Database/provider errors can contain private data; never print them.
      console.error("Local lifecycle processing failed; saved data were not discarded.");
    });
  }, intervalMs);
  timer.unref();
  return {
    tick,
    async stop() {
      stopped = true;
      clearInterval(timer);
      // Do not close the database underneath an in-flight transaction.
      await inFlight;
    },
  };
}
