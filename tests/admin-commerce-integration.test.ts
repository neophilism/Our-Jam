import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { migrate, type Database, type Sql } from "../apps/api/src/db.js";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";

test("one administrator session authorizes voting and sponsor management while performer access remains separate", async (t) => {
  const db = await testDatabase();
  const app = await createApp(db, {
    origin: "http://integration.test",
    secureCookies: false,
    operatorToken: "fixture-performer-credential-long-enough",
    commerce: {
      enabled: true,
      adminToken: "fixture-shared-admin-credential-long-enough",
    },
  });
  t.after(async () => {
    await app.close();
    await db.close();
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    headers: { origin: "http://integration.test" },
    payload: { token: "fixture-shared-admin-credential-long-enough" },
  });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = login.cookies.find((c) => c.name === "oj_platform_admin")!;
  const headers = {
    origin: "http://integration.test",
    cookie: cookie.name + "=" + cookie.value,
  };
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/admin/voting", headers }))
      .statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/admin/commerce", headers }))
      .statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/operator/events", headers }))
      .statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/admin/logout", headers }))
      .statusCode,
    200,
  );
  for (const url of ["/api/admin/voting", "/api/admin/commerce"])
    assert.equal(
      (await app.inject({ method: "GET", url, headers })).statusCode,
      401,
    );
});

test("migration reconciliation upgrades either existing branch history without replacing administrator sessions", async () => {
  const files = (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const baseline of ["main-voting", "commerce-identity"]) {
    const pg = new PGlite();
    const db: Database = {
      query: (sql, params) => pg.query(sql, params),
      transaction: (fn) => pg.transaction((tx) => fn(tx as Sql)),
      close: () => pg.close(),
    };
    try {
      await db.query(
        "CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const oldFiles = files.filter((n) =>
        baseline === "main-voting"
          ? !/event_commerce|identity_signin|native_identity/.test(n)
          : !n.includes("platform_vote_policy"),
      );
      for (const name of oldFiles) {
        for (const sql of (await readFile("db/migrations/" + name, "utf8"))
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean))
          await db.query(sql);
        await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
      }
      const marker = "f".repeat(64);
      await db.query(
        "INSERT INTO platform_admin_sessions(token_hash,expires_at) VALUES($1,now()+interval '1 hour')",
        [marker],
      );
      await migrate(db);
      await migrate(db);
      assert.equal(
        (await db.query("SELECT name FROM schema_migrations")).rows.length,
        files.length,
        baseline,
      );
      assert.equal(
        (
          await db.query(
            "SELECT token_hash FROM platform_admin_sessions WHERE token_hash=$1",
            [marker],
          )
        ).rows.length,
        1,
        baseline,
      );
      assert.equal(
        (await db.query("SELECT mode FROM platform_vote_policy WHERE id=1"))
          .rows[0].mode,
        "fixed",
      );
      assert.equal(
        (await db.query("SELECT count(*) n FROM event_purchases")).rows[0].n,
        0,
      );
    } finally {
      await db.close();
    }
  }
});
