import pg from "pg";
import { createHash } from "node:crypto";
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
/** Verify the immutable migration source before applying new ordered changes.
 * Legacy filename-only records gain an explicitly labelled first observation,
 * not retrospective proof of the bytes used by an earlier deployment. */
export async function migrate(
  db: Database,
  directory = path.resolve("db/migrations"),
) {
  const names = (await readdir(directory))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  if (names.some((name) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(name)))
    throw new Error("Invalid migration filename");
  const sources = await Promise.all(
    names.map(async (name) => {
      const bytes = await readFile(path.join(directory, name));
      return {
        name,
        sql: bytes.toString("utf8"),
        hash: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
  );
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.transaction(async (tx) => {
    await tx.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
    await tx.query(
      "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS content_sha256 text",
    );
    await tx.query(
      "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_origin text",
    );
    const recorded = (
      await tx.query(
        "SELECT name,content_sha256,checksum_origin FROM schema_migrations",
      )
    ).rows;
    for (const row of recorded) {
      const source = sources.find((s) => s.name === row.name);
      if (!source)
        throw new Error("Applied migration source is missing: " + row.name);
      if (row.content_sha256 !== null && row.content_sha256 !== source.hash)
        throw new Error("Applied migration checksum changed: " + row.name);
      if (
        row.content_sha256 !== null &&
        !["applied", "legacy_observation"].includes(row.checksum_origin)
      )
        throw new Error("Invalid migration checksum provenance: " + row.name);
    }
    for (const row of recorded)
      if (row.content_sha256 === null) {
        const source = sources.find((s) => s.name === row.name)!;
        await tx.query(
          "UPDATE schema_migrations SET content_sha256=$1,checksum_origin='legacy_observation' WHERE name=$2",
          [source.hash, row.name],
        );
      }
  });
  for (const source of sources)
    await db.transaction(async (tx) => {
      await tx.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
      const row = (
        await tx.query(
          "SELECT content_sha256 FROM schema_migrations WHERE name=$1",
          [source.name],
        )
      ).rows[0];
      if (row) {
        if (row.content_sha256 !== source.hash)
          throw new Error("Applied migration checksum changed: " + source.name);
        return;
      }
      // Trusted versioned source only. Preserve the existing simple-DDL boundary.
      for (const statement of source.sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query(
        "INSERT INTO schema_migrations(name,content_sha256,checksum_origin) VALUES($1,$2,'applied')",
        [source.name, source.hash],
      );
    });
}
