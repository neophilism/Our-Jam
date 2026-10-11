import { PGlite } from "@electric-sql/pglite";
import type { Database, Sql } from "../apps/api/src/db.js";
import { migrate, postgres } from "../apps/api/src/db.js";
export async function testDatabase(): Promise<Database> {
  if (process.env.TEST_DATABASE_URL) {
    const db = postgres(process.env.TEST_DATABASE_URL);
    await migrate(db);
    return db;
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
