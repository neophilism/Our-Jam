import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Database, Sql } from "../apps/api/src/db.js";
import { migrate, postgres } from "../apps/api/src/db.js";
export async function testDatabase(): Promise<Database> {
  if (process.env.TEST_DATABASE_URL) {
    // Match PGlite's per-test isolation. Shared tables let one test's reserved
    // provider cost incorrectly consume a later test's otherwise independent cap.
    const schema = "ourjam_test_" + randomUUID().replaceAll("-", "");
    const admin = postgres(process.env.TEST_DATABASE_URL);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set("options", `${url.searchParams.get("options") ?? ""} -csearch_path=${schema},public`.trim());
    const db = postgres(url.toString());
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await db.close();
      try { await admin.query(`DROP SCHEMA ${schema} CASCADE`); }
      finally { await admin.close(); }
    };
    try { await migrate(db); }
    catch (error) { await close(); throw error; }
    return { ...db, close };
  }
  const pg = new PGlite();
  const db: Database = {
    query: (sql, params) => pg.query(sql, params),
    transaction: (fn) => pg.transaction((tx) => fn(tx as Sql)),
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}
