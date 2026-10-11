import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
export interface Sql {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, any>[] }>;
}
export interface Database extends Sql {
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function postgres(url: string): Database {
  const parsed = new URL(url);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    parsed.hostname,
  );
  for (const key of [
    "sslmode",
    "ssl",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "channel_binding",
  ])
    parsed.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: parsed.toString(),
    max: 8,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    ssl: local ? false : { rejectUnauthorized: true, minVersion: "TLSv1.3" },
    statement_timeout: 10000,
  });
  return {
    query: (sql, params) => pool.query(sql, params),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
export async function migrate(db: Database) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir(path.resolve("db/migrations")))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await db.transaction(async (tx) => {
      await tx.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
      if (
        (
          await tx.query("SELECT name FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rows.length
      )
        return;
      // Migration files are trusted versioned source; splitting is restricted to this simple DDL format.
      const sql = await readFile(path.resolve("db/migrations", name), "utf8");
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
    });
  }
}
