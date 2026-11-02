import { test } from "node:test";
import assert from "node:assert/strict";
import { EventSnapshotFence } from "../apps/web/src/event-snapshot.js";

test("a slower success or error cannot replace a newer accepted snapshot", () => {
  const scope = new EventSnapshotFence();
  scope.activate();
  const older = scope.issue()!,
    newer = scope.issue()!;
  assert.equal(scope.accept(newer), true);
  assert.equal(scope.accept(older), false);
  assert.equal(
    scope.accept(newer),
    false,
    "duplicate completion is not another update",
  );
  assert.equal(scope.accept(scope.issue()!), true);
});
test("leaving an event fences pending responses and callbacks cannot issue new requests", () => {
  const departed = new EventSnapshotFence();
  departed.activate();
  const pending = departed.issue()!;
  departed.deactivate();
  const current = new EventSnapshotFence();
  current.activate();
  assert.equal(departed.accept(pending), false);
  assert.equal(
    current.accept(pending),
    false,
    "equal sequence numbers cannot cross event or role scopes",
  );
  assert.equal(departed.issue(), null);
  assert.equal(current.accept(current.issue()!), true);
});
test("remounting the same event cannot revive an earlier activation's result", () => {
  const scope = new EventSnapshotFence();
  scope.activate();
  const old = scope.issue()!,
    queuedUpdate = scope.stamp();
  scope.deactivate();
  scope.activate();
  assert.equal(scope.accept(old), false);
  assert.equal(
    scope.current(queuedUpdate),
    false,
    "queued state updaters must retain their activation epoch",
  );
  assert.equal(scope.accept(scope.issue()!), true);
});
test("a rejected fetch completion still fences older successes", () => {
  const scope = new EventSnapshotFence();
  scope.activate();
  const oldSuccess = scope.issue()!,
    failure = scope.issue()!;
  assert.equal(scope.accept(failure), true);
  assert.equal(scope.accept(oldSuccess), false);
  scope.deactivate();
  assert.equal(scope.isActive(), false);
});
