export interface SnapshotStamp {
  readonly scope: object;
  readonly epoch: number;
}
export interface SnapshotRequest extends SnapshotStamp {
  readonly order: number;
}

/** One event and privilege scope per instance. Deactivation fences every request,
 * including requests from an earlier StrictMode activation of the same scope. */
export class EventSnapshotFence {
  private readonly scope = {};
  private epoch = 0;
  private issued = 0;
  private applied = 0;
  private active = false;
  activate() {
    this.epoch++;
    this.active = true;
  }
  deactivate() {
    this.active = false;
    this.epoch++;
  }
  isActive() {
    return this.active;
  }
  stamp(): SnapshotStamp {
    return { scope: this.scope, epoch: this.epoch };
  }
  current(stamp: SnapshotStamp) {
    return (
      this.active && stamp.scope === this.scope && stamp.epoch === this.epoch
    );
  }
  issue(): SnapshotRequest | null {
    return this.active ? { ...this.stamp(), order: ++this.issued } : null;
  }
  accept(request: SnapshotRequest) {
    if (!this.current(request) || request.order <= this.applied) return false;
    this.applied = request.order;
    return true;
  }
}
