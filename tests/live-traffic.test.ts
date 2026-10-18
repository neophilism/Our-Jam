import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SnapshotReads, RoomStreams } from "../apps/api/src/live-traffic.js";
import { publicOrigin } from "../apps/api/src/runtime-config.js";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";
import type { Database } from "../apps/api/src/db.js";

test("snapshot reads coalesce in flight, isolate identities, bound work and recover after failure", async () => {
  const reads = new SnapshotReads(1, 2);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  const one = reads.run("room:alice", async () => {
    calls++;
    await barrier;
    return { ballot: "alice" };
  });
  const same = reads.run("room:alice", async () => {
    throw new Error("duplicate read");
  });
  const other = reads.run("room:bob", async () => {
    calls++;
    return { ballot: "bob" };
  });
  assert.equal(one, same);
  assert.deepEqual(reads.stats, { active: 1, waiting: 1, pending: 2 });
  await assert.rejects(
    reads.run("another-room", async () => null),
    { code: "room_busy", status: 503 },
  );
  release();
  assert.deepEqual(await one, { ballot: "alice" });
  assert.deepEqual(await other, { ballot: "bob" });
  assert.equal(calls, 2);
  await assert.rejects(
    reads.run("room:alice", async () => {
      throw new Error("database failure");
    }),
  );
  assert.equal(
    await reads.run("room:alice", async () => "new committed state"),
    "new committed state",
  );
  assert.deepEqual(reads.stats, { active: 0, waiting: 0, pending: 0 });
});

test("snapshot wait expires without executing abandoned work or leaking queue slots", async () => {
  const reads = new SnapshotReads(1, 2, 15);
  let release!: () => void;
  const running = reads.run(
    "active",
    () => new Promise<void>((resolve) => (release = resolve)),
  );
  let executed = false;
  await assert.rejects(
    reads.run("waiting", async () => {
      executed = true;
    }),
    { status: 503 },
  );
  assert.equal(executed, false);
  assert.deepEqual(reads.stats, { active: 1, waiting: 0, pending: 1 });
  release();
  await running;
  assert.equal(await reads.run("waiting", async () => 1), 1);
});

test("slow or closed event streams disconnect while room and process caps recover", () => {
  const rooms = new RoomStreams(2, 3);
  const create = (writable = true) => ({
    messages: [] as string[],
    closed: false,
    write(text: string) {
      this.messages.push(text);
      return writable;
    },
    destroy() {
      this.closed = true;
    },
    end() {
      this.closed = true;
    },
  });
  const fast = create(),
    slow = create(false),
    other = create();
  const remove = rooms.add("one", fast);
  const duplicateRemoval = rooms.add("one", fast);
  assert.equal(rooms.stats.connections, 1, "duplicate writer registration must not inflate capacity");
  rooms.add("one", slow);
  assert.throws(() => rooms.add("one", create()), { code: "stream_limit" });
  rooms.add("two", other);
  assert.throws(() => rooms.add("three", create()), { code: "stream_limit" });
  rooms.update("one");
  assert.equal(slow.closed, true);
  assert.equal(other.messages.length, 0);
  assert.equal(rooms.stats.connections, 2);
  rooms.add("three", create());
  remove();
  duplicateRemoval();
  remove();
  assert.equal(rooms.stats.connections, 2, "duplicate cleanup does not release unrelated writers");
  rooms.reconnect();
  assert.match(other.messages[0], /reconnect/);
  rooms.close();
  assert.equal(other.closed, true);
  assert.deepEqual(rooms.stats, { rooms: 0, connections: 0 });
});

test("100 arriving phones behind one address get independent participation budgets", async (t) => {
  const base = await testDatabase();
  let authReads = 0;
  const db: Database = {
    ...base,
    query(sql, params) {
      if (sql.startsWith("SELECT * FROM sessions")) authReads++;
      return base.query(sql, params);
    },
  };
  const origin = "http://traffic.our-jam.test",
    token = "test-only-traffic-operator-credential";
  const app = await createApp(db, {
    origin,
    operatorToken: token,
    secureCookies: false,
  });
  app.get("/asset.js", () => "public asset");
  t.after(async () => {
    await app.close();
    await base.close();
  });
  const request = (method: any, url: string, payload?: any, cookie?: string) =>
    app.inject({
      method,
      url,
      payload,
      headers: { origin, ...(cookie ? { cookie } : {}) },
      remoteAddress: "192.0.2.10",
    });
  const cookies: string[] = [];
  for (let i = 0; i < 100; i++) {
    assert.equal((await request("GET", "/api/session")).statusCode, 200);
    const r = await request("POST", "/api/session", {});
    assert.equal(r.statusCode, 200, r.body);
    cookies.push("oj_guest=" + r.cookies[0].value);
    assert.equal((await request("GET", "/api/session")).statusCode, 200);
  }
  const signIn = await request("POST", "/api/operator/login", { token });
  assert.equal(signIn.statusCode, 200);
  const op = "oj_operator=" + signIn.cookies[0].value;
  const slug = "crowd-" + randomUUID();
  const event = await request(
    "POST",
    "/api/operator/events",
    {
      title: "Crowd rehearsal",
      artistName: "Artist",
      slug,
      sources: [
        {
          title: "Track",
          corePrompt: "PRIVATE_CROWD_PROMPT",
          durationSeconds: 180,
        },
      ],
    },
    op,
  );
  assert.equal(event.statusCode, 200, event.body);
  const joined = await Promise.all(
    cookies.map((cookie) =>
      request("POST", `/api/events/${slug}/join`, {}, cookie),
    ),
  );
  for (const r of joined) assert.equal(r.statusCode, 200, r.body);
  const snapshots = await Promise.all(
    cookies.map((cookie) =>
      request("GET", `/api/events/${slug}`, undefined, cookie),
    ),
  );
  for (const r of snapshots) {
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().joined, true);
    assert.equal(r.json().canContribute, true);
    assert.ok(!r.body.includes("PRIVATE_CROWD_PROMPT"));
  }
  const before = authReads;
  await request("GET", "/api/session", undefined, cookies[0]);
  assert.equal(
    authReads - before,
    1,
    "limiter and guest handler share only this request's lookup",
  );
  await request("GET", "/asset.js", undefined, cookies[0]);
  assert.equal(
    authReads - before,
    1,
    "assets do not touch the session database",
  );
  for (let i = 0; i < 20; i++)
    assert.equal((await request("POST", "/api/session", {})).statusCode, 200);
  assert.equal((await request("POST", "/api/session", {})).statusCode, 429);
  assert.equal((await request("GET", "/api/health")).statusCode, 200);
  assert.equal((await request("GET", "/asset.js")).statusCode, 200);
  // Faked credentials do not acquire a new authenticated budget.
  for (let i = 0; i < 180; i++)
    assert.equal(
      (
        await request(
          "PATCH",
          "/api/profile",
          { name: "x", anonymous: true },
          "oj_guest=" + i.toString(16).padStart(64, "0"),
        )
      ).statusCode,
      401,
    );
  assert.equal(
    (
      await request(
        "PATCH",
        "/api/profile",
        { name: "x", anonymous: true },
        "oj_guest=" + "f".repeat(64),
      )
    ).statusCode,
    429,
  );
  assert.equal(
    (
      await request(
        "PATCH",
        "/api/profile",
        { name: "My name", anonymous: false },
        cookies[0],
      )
    ).statusCode,
    200,
  );
  for (let i = 0; i < 7; i++)
    assert.equal(
      (await request("POST", "/api/operator/login", { token: "wrong" }))
        .statusCode,
      401,
    );
  assert.equal(
    (await request("POST", "/api/operator/login", { token })).statusCode,
    429,
  );
  assert.equal(
    (await request("GET", "/api/operator/traffic", undefined, cookies[0]))
      .statusCode,
    401,
  );
  assert.deepEqual(
    (await request("GET", "/api/operator/traffic", undefined, op)).json(),
    {
      snapshots: { active: 0, waiting: 0, pending: 0 },
      streams: { rooms: 0, connections: 0 },
    },
  );
});

test("production origin uses only explicit config or Render's verified environment value", () => {
  assert.equal(publicOrigin({}), "http://localhost:5173");
  assert.equal(
    publicOrigin({
      NODE_ENV: "production",
      RENDER: "true",
      RENDER_EXTERNAL_URL: "https://our-jam.onrender.com",
    }),
    "https://our-jam.onrender.com",
  );
  assert.equal(
    publicOrigin({
      NODE_ENV: "production",
      RENDER: "true",
      RENDER_EXTERNAL_URL: "https://our-jam.onrender.com",
      PUBLIC_ORIGIN: "https://ourjam.example",
    }),
    "https://ourjam.example",
  );
  for (const origin of [
    "",
    "http://insecure.example",
    "https://example.com/path",
    "https://user:secret@example.com",
    "https://example.com/",
    "file:///tmp/app",
  ]) {
    assert.throws(() =>
      publicOrigin({ NODE_ENV: "production", PUBLIC_ORIGIN: origin }),
    );
  }
  assert.throws(() =>
    publicOrigin({
      NODE_ENV: "production",
      RENDER_EXTERNAL_URL: "https://untrusted.example",
    }),
  );
});
