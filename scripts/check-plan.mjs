import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
// Canonical work-package registry. Historical dependency graph stays validated separately.
const registry = JSON.parse(
  readFileSync(new URL("../registry/prs.json", import.meta.url)),
);
assert.equal(registry.units.length, registry.plannedPrCount);
assert.equal(
  new Set(registry.units.map((p) => p.id)).size,
  registry.plannedPrCount,
);
assert.equal(
  registry.plannedPrCount,
  66,
  "Canonical roadmap contains 54 original plus 12 comparison work packages",
);
const plan = JSON.parse(
  readFileSync(new URL("../backlog.json", import.meta.url)),
);
assert.equal(plan.prs.length, 54, "Approved plan has 54 slices");
const ids = new Set(plan.prs.map((p) => p.id));
assert.equal(ids.size, 54);
const visited = new Set(),
  visiting = new Set();
function visit(id) {
  assert(ids.has(id), `Missing dependency ${id}`);
  if (visited.has(id)) return;
  assert(!visiting.has(id), `Cycle at ${id}`);
  visiting.add(id);
  const p = plan.prs.find((p) => p.id === id);
  for (const dep of p.depends_on) visit(dep);
  visiting.delete(id);
  visited.add(id);
}
for (const id of ids) visit(id);
assert.equal(registry.units.filter((u) => u.origin === "original").length, 54);
const allIds = new Set(registry.units.map((u) => u.id));
for (const unit of registry.units) for (const dependency of unit.dependsOn ?? [])
  assert(allIds.has(dependency), `Missing canonical registry dependency ${dependency}`);
console.log("66 canonical work packages (54 original + 12 comparison); historical dependencies valid and acyclic");
