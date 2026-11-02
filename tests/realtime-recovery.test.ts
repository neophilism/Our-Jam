import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { InjectOptions } from "fastify";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent } from "../apps/api/src/service.js";
import { eventInput } from "../packages/contracts/src/index.js";
import type { Database } from "../apps/api/src/db.js";

function stream(url: string) {
  let count = 0,
    pending = "",
    captured = "";
  const waiters: Array<{ n: number; done: () => void }> = [];
  const client = http.get(url, (response) => {
    assert.equal(response.statusCode, 200);
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      captured += chunk;
      pending += chunk;
      let split: number;
      while ((split = pending.indexOf("\n\n")) >= 0) {
        const message = pending.slice(0, split);
        pending = pending.slice(split + 2);
        if (message.startsWith("event: update\n")) count++;
      }
      for (const waiter of [...waiters]) if (count >= waiter.n) waiter.done();
    });
    response.on("error", () => {});
  });
  let failure: Error | undefined;
  client.on("error", (error) => {
    failure = error;
  });
  return {
    wait(n: number): Promise<void> {
      if (failure) return Promise.reject(failure);
      if (count >= n) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          remove();
          reject(
            failure ??
              new Error("Committed room update did not reach its HTTP stream"),
          );
        }, 5000);
        const remove = () => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
        };
        const waiter = {
          n,
          done() {
            clearTimeout(timer);
            remove();
            resolve();
          },
        };
        waiters.push(waiter);
      });
    },
    text: () => captured,
    close: () => client.destroy(),
  };
}

test(
  "committed audience votes survive API restart and invalidate two independent HTTP instances",
  { timeout: 15000 },
  async (t) => {
    const db = await testDatabase();
    const origin = "http://realtime.our-jam.test";
    const config = {
      origin,
      operatorToken: "isolated-realtime-operator-fixture",
      secureCookies: false,
    };
    const first = await createApp(db, config),
      second = await createApp(db, config);
    let restarted: Awaited<ReturnType<typeof createApp>> | undefined;
    let left: ReturnType<typeof stream> | undefined,
      right: ReturnType<typeof stream> | undefined;
    t.after(async () => {
      left?.close();
      right?.close();
      await first.close();
      await second.close();
      await restarted?.close();
      await db.close();
    });
    const request = (
      app: typeof first,
      method: InjectOptions["method"],
      url: string,
      payload?: InjectOptions["payload"],
      cookie?: string,
    ) =>
      app.inject({
        method,
        url,
        payload,
        headers: { origin, ...(cookie ? { cookie } : {}) },
      });
    const slug = "realtime-" + randomUUID();
    const event = await createEvent(
      db,
      "our-jam",
      eventInput.parse({
        slug,
        title: "Realtime restart",
        artistName: "Fixture artist",
        minimumRoundSeconds: 0,
        sources: [
          {
            title: "Fixture source",
            corePrompt: "PRIVATE_REALTIME_CORE",
            durationSeconds: 180,
          },
        ],
      }),
    );
    const guest = await request(first, "POST", "/api/session", {});
    assert.equal(guest.statusCode, 200);
    const cookie = "oj_guest=" + guest.cookies[0].value;
    assert.equal(
      (await request(first, "POST", `/api/events/${slug}/join`, {}, cookie))
        .statusCode,
      200,
    );
    const login = await request(first, "POST", "/api/operator/login", {
      token: config.operatorToken,
    });
    assert.equal(login.statusCode, 200);
    const op = "oj_operator=" + login.cookies[0].value;
    const lease = await request(
      first,
      "POST",
      `/api/operator/events/${event.id}/playback/claim`,
      {},
      op,
    );
    assert.equal(lease.statusCode, 200, lease.body);
    const started = await request(
      first,
      "POST",
      `/api/operator/events/${event.id}/advance`,
      {
        commandId: randomUUID(),
        expectedRevision: 0,
        playback: { ...lease.json(), sequence: 1 },
      },
      op,
    );
    assert.equal(started.statusCode, 200, started.body);
    const round = started.json().roundId;
    const command = {
      commandId: randomUUID(),
      text: "Durable brass",
      expectedRevision: 0,
    };
    const acknowledged = await request(
      first,
      "POST",
      `/api/rounds/${round}/waves`,
      command,
      cookie,
    );
    assert.equal(acknowledged.statusCode, 200, acknowledged.body);
    await first.close();
    restarted = await createApp(db, config);
    const restored = await request(
      restarted,
      "GET",
      `/api/events/${slug}`,
      undefined,
      cookie,
    );
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json().round.revision, 1);
    assert.equal(
      restored
        .json()
        .round.waves.find((w: any) => w.id === acknowledged.json().waveId).mine,
      1,
    );
    const replay = await request(
      restarted,
      "POST",
      `/api/rounds/${round}/waves`,
      command,
      cookie,
    );
    assert.deepEqual(
      replay.json(),
      acknowledged.json(),
      "a retry after process restart reuses the durable command receipt",
    );
    const urlA = await second.listen({ host: "127.0.0.1", port: 0 });
    const urlB = await restarted.listen({ host: "127.0.0.1", port: 0 });
    left = stream(`${urlA}/api/events/${slug}/stream`);
    right = stream(`${urlB}/api/events/${slug}/stream`);
    await Promise.all([left.wait(2), right.wait(2)]); // Drain the initial counter observation before changing state.
    const changed = await request(
      restarted,
      "PUT",
      `/api/rounds/${round}/allocations`,
      {
        commandId: randomUUID(),
        expectedRevision: 1,
        allocations: { [acknowledged.json().waveId]: 2 },
      },
      cookie,
    );
    assert.equal(changed.statusCode, 200, changed.body);
    await Promise.all([left.wait(3), right.wait(3)]);
    for (const live of [left, right]) {
      assert.equal(live.text().includes("PRIVATE_REALTIME_CORE"), false);
      assert.equal(live.text().includes(cookie), false);
      assert.equal(
        live.text().includes("Durable brass"),
        false,
        "the public stream carries invalidation only",
      );
    }
    const another = await request(
      second,
      "GET",
      `/api/events/${slug}`,
      undefined,
      cookie,
    );
    assert.equal(another.json().round.revision, 2);
    assert.equal(
      another
        .json()
        .round.waves.find((w: any) => w.id === acknowledged.json().waveId).mine,
      2,
    );
    assert.equal(
      (
        await request(
          second,
          "GET",
          `/api/events/missing-${randomUUID()}/stream`,
        )
      ).statusCode,
      404,
    );
  },
);

test("readiness refuses a deployment missing the committed room-counter migration", async (t) => {
  const base = await testDatabase();
  const stale: Database = {
    ...base,
    async query(sql, params) {
      const result = await base.query(sql, params);
      return sql.startsWith("SELECT name FROM schema_migrations WHERE name IN")
        ? {
            rows: result.rows.filter(
              (row) => row.name !== "023_room_change_sequence.sql",
            ),
          }
        : result;
    },
  };
  const app = await createApp(stale, {
    origin: "http://realtime.our-jam.test",
    secureCookies: false,
  });
  t.after(async () => {
    await app.close();
    await base.close();
  });
  const response = await app.inject({ method: "GET", url: "/api/ready" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "schema_not_ready");
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/health" })).statusCode,
    200,
    "liveness remains independent of schema readiness",
  );
});
