import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "../src/config.js";
import { createMetadataDb } from "../src/db/index.js";
import { normalizedDatabaseUrl } from "../src/db/url.js";
import { verifyMetadataSchema } from "../src/db/verify.js";

const command = process.argv[2] ?? "check";
if (!["inspect", "check", "migrate"].includes(command))
  throw new Error("Expected inspect, check or migrate");
const databaseUrl =
  command === "migrate"
    ? (env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL)
    : env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (
  command === "migrate" &&
  normalizedDatabaseUrl(databaseUrl).hostname.includes("-pooler.")
)
  throw new Error("Use DATABASE_URL_UNPOOLED for migrations");
const { db, pool } = createMetadataDb(databaseUrl);
try {
  await pool.query("SELECT 1");
  if (command === "inspect") {
    const objects = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    process.stdout.write(
      `Metadata connection verified; public table count: ${objects.rows[0]?.count ?? 0}\n`,
    );
  } else {
    const migrationsFolder = fileURLToPath(
      new URL("../drizzle", import.meta.url),
    );
    if (command === "migrate") await migrate(db, { migrationsFolder });
    const report = await verifyMetadataSchema(pool);
    const history = await pool.query<{ hash: string }>(
      "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at",
    );
    const expected = readMigrationFiles({ migrationsFolder });
    if (
      history.rows.length !== expected.length ||
      history.rows.some(
        (migration, index) => migration.hash !== expected[index]?.hash,
      )
    )
      throw new Error("Migration history is out of sync");
    process.stdout.write(
      `Metadata schema verified: ${report.tables} tables, ${report.columns} columns, ${history.rows.length} matching migration(s)\n`,
    );
  }
} catch (error) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "database_error";
  process.stderr.write(
    `Metadata operation failed (${code}); check connection permissions, TLS and migration state\n`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
