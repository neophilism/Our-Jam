import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../apps/api/src/db.js";
import type { Database, Sql } from "../apps/api/src/db.js";
async function fixture(t: any) {
  const directory = await mkdtemp(join(tmpdir(), "ourjam-migrations-")),
    pg = new PGlite();
  const db: Database = {
    query: (sql, params) => pg.query(sql, params),
    transaction: (fn) => pg.transaction((tx) => fn(tx as Sql)),
    close: () => pg.close(),
  };
  t.after(async () => {
    await pg.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    db,
    directory,
    file: (name: string, text: string) =>
      writeFile(join(directory, name), text),
  };
}
test("changed or removed applied migration bytes fail before any new schema change", async (t) => {
  const f = await fixture(t);
  await f.file(
    "001_fixture.sql",
    "CREATE TABLE fixture(id integer PRIMARY KEY);",
  );
  await migrate(f.db, f.directory);
  await migrate(f.db, f.directory);
  const row = (await f.db.query("SELECT * FROM schema_migrations")).rows[0];
  assert.match(row.content_sha256, /^[a-f0-9]{64}$/);
  assert.equal(row.checksum_origin, "applied");
  await f.file(
    "001_fixture.sql",
    "CREATE TABLE fixture(id integer PRIMARY KEY); -- changed bytes",
  );
  await f.file("002_future.sql", "CREATE TABLE must_not_exist(id integer);");
  await assert.rejects(
    migrate(f.db, f.directory),
    /checksum changed: 001_fixture.sql/,
  );
  assert.equal(
    (await f.db.query("SELECT to_regclass('must_not_exist') AS value")).rows[0]
      .value,
    null,
  );
  await unlink(join(f.directory, "001_fixture.sql"));
  await assert.rejects(migrate(f.db, f.directory), /source is missing/);
});
test("a failed migration rolls back effects and ledger, then a corrected unapplied file can run once", async (t) => {
  const f = await fixture(t);
  await f.file(
    "001_fixture.sql",
    "CREATE TABLE fixture(id integer PRIMARY KEY);",
  );
  await migrate(f.db, f.directory);
  await f.file(
    "002_failure.sql",
    "INSERT INTO fixture VALUES(1); INSERT INTO missing_table VALUES(2);",
  );
  await assert.rejects(migrate(f.db, f.directory));
  assert.equal((await f.db.query("SELECT * FROM fixture")).rows.length, 0);
  assert.equal(
    (await f.db.query("SELECT * FROM schema_migrations")).rows.length,
    1,
  );
  await f.file("002_failure.sql", "INSERT INTO fixture VALUES(1);");
  await migrate(f.db, f.directory);
  await migrate(f.db, f.directory);
  assert.equal((await f.db.query("SELECT * FROM fixture")).rows.length, 1);
  assert.equal(
    (await f.db.query("SELECT * FROM schema_migrations")).rows.length,
    2,
  );
});
test("legacy filename-only ledgers remain explicit observations and are fenced after baselining", async (t) => {
  const f = await fixture(t);
  await f.file("001_legacy.sql", "CREATE TABLE legacy_fixture(id integer);");
  await f.db.query(
    "CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await f.db.query("CREATE TABLE legacy_fixture(id integer)");
  await f.db.query(
    "INSERT INTO schema_migrations(name) VALUES('001_legacy.sql')",
  );
  await migrate(f.db, f.directory);
  const record = (await f.db.query("SELECT * FROM schema_migrations")).rows[0];
  assert.equal(record.checksum_origin, "legacy_observation");
  assert.match(record.content_sha256, /^[a-f0-9]{64}$/);
  await f.file("001_legacy.sql", "DROP TABLE legacy_fixture;");
  await assert.rejects(migrate(f.db, f.directory), /checksum changed/);
  assert.notEqual(
    (await f.db.query("SELECT to_regclass('legacy_fixture') AS value")).rows[0]
      .value,
    null,
  );
});
