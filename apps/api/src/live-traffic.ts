import { DomainError } from "../../../packages/domain/src/index.js";

/** Coalesce only simultaneous identical reads. No completed or private data cache. */
export class SnapshotReads {
  private active = 0;
  private waiting: Array<() => void> = [];
  private pending = new Map<string, Promise<unknown>>();
  constructor(
    private concurrency = 4,
    private capacity = 200,
    private waitMs = 2500,
  ) {}
  get stats() {
    return {
      active: this.active,
      waiting: this.waiting.length,
      pending: this.pending.size,
    };
  }
  run<T>(key: string, read: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    if (this.pending.size >= this.capacity)
      return Promise.reject(
        new DomainError(
          "room_busy",
          "The room is busy. Reconnecting shortly.",
          503,
        ),
      );
    const result = this.execute(read).finally(() => this.pending.delete(key));
    this.pending.set(key, result);
    return result;
  }
  private async execute<T>(read: () => Promise<T>) {
    if (this.active >= this.concurrency)
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          const index = this.waiting.indexOf(ready);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(
            new DomainError(
              "room_busy",
              "The room is busy. Reconnecting shortly.",
              503,
            ),
          );
        }, this.waitMs);
        this.waiting.push(ready);
      });
    else this.active++;
    try {
      return await read();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

export type StreamWriter = {
  write(chunk: string): boolean;
  destroy(): unknown;
  end(): unknown;
};

/** An invalidation stream, never a queue of private snapshots or audio. */
export class RoomStreams {
  private rooms = new Map<string, Set<StreamWriter>>();
  private total = 0;
  constructor(
    private perRoom = 1000,
    private maximum = 2000,
  ) {}
  get stats() {
    return { rooms: this.rooms.size, connections: this.total };
  }
  add(room: string, stream: StreamWriter) {
    let streams = this.rooms.get(room);
    if ((streams?.size ?? 0) >= this.perRoom || this.total >= this.maximum)
      throw new DomainError(
        "stream_limit",
        "Event connection limit reached. Reconnecting shortly.",
        503,
      );
    if (!streams) this.rooms.set(room, (streams = new Set()));
    streams.add(stream);
    this.total++;
    return () => this.remove(room, stream);
  }
  private remove(room: string, stream: StreamWriter) {
    const streams = this.rooms.get(room);
    if (streams?.delete(stream)) this.total--;
    if (!streams?.size) this.rooms.delete(room);
  }
  send(room: string, stream: StreamWriter, text: string) {
    try {
      if (stream.write(text)) return;
    } catch {
      /* A closed socket is recovered by the client's snapshot refresh. */
    }
    this.remove(room, stream);
    stream.destroy();
  }
  update(room: string) {
    for (const stream of this.rooms.get(room) ?? [])
      this.send(room, stream, "event: update\ndata: {}\n\n");
  }
  reconnect() {
    for (const [room, streams] of this.rooms)
      for (const stream of streams)
        this.send(room, stream, "event: reconnect\ndata: {}\n\n");
  }
  close() {
    for (const streams of this.rooms.values())
      for (const stream of streams) stream.end();
    this.rooms.clear();
    this.total = 0;
  }
}
