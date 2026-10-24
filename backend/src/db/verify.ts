import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import { runStatuses } from "../contracts/analysis.js";
import * as schema from "./schema.js";

export async function verifyMetadataSchema(
  pool: Pool,
): Promise<{ tables: number; columns: number }> {
  const tables = Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map(getTableConfig);
  const names = tables.map((table) => table.name);
  const actual = await pool.query<{
    table_name: string;
    column_name: string;
    type: string;
  }>(
    "SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a JOIN pg_class c ON a.attrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped",
    [names],
  );
  for (const table of tables) {
    const columns = actual.rows.filter(
      (column) => column.table_name === table.name,
    );
    if (columns.length !== table.columns.length)
      throw new Error(`Metadata schema mismatch: ${table.name}`);
    for (const expected of table.columns) {
      if (
        !columns.some(
          (column) =>
            column.column_name === expected.name &&
            column.type === expected.getSQLType(),
        )
      )
        throw new Error(
          `Metadata column mismatch: ${table.name}.${expected.name}`,
        );
    }
  }
  const statuses = await pool.query<{ value: string }>(
    "SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'run_status' AND n.nspname = 'public' ORDER BY e.enumsortorder",
  );
  if (
    JSON.stringify(statuses.rows.map((row) => row.value)) !==
    JSON.stringify(runStatuses)
  )
    throw new Error("Metadata run status enum is out of sync");
  return { tables: tables.length, columns: actual.rows.length };
}
