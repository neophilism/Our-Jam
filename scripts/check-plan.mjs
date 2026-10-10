import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const plan = JSON.parse(readFileSync(new URL('../backlog.json', import.meta.url)));
assert.equal(plan.prs.length, 54, 'Approved plan has 54 slices');
const ids = new Set(plan.prs.map(p => p.id));
assert.equal(ids.size, 54);
const visited = new Set(), visiting = new Set();
function visit(id) {
  assert(ids.has(id), `Missing dependency ${id}`);
  if (visited.has(id)) return;
  assert(!visiting.has(id), `Cycle at ${id}`);
  visiting.add(id);
  const p = plan.prs.find(p => p.id === id);
  for (const dep of p.depends_on) visit(dep);
  visiting.delete(id); visited.add(id);
}
for (const id of ids) visit(id);
console.log('54 plan slices, unique IDs, valid dependencies, no cycles');
