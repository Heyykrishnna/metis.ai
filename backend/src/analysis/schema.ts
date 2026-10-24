import { createHash } from "node:crypto";
import type { ConnectorAdapter } from "../sql/connectors.js";

export interface DiscoveredColumn {
  name: string;
  type: string;
  nullable: boolean;
  profile?: {
    nullCount: number;
    distinctCount: number;
    sampleValues: unknown[];
  };
}

export interface DiscoveredForeignKey {
  column: string;
  referencedSchema: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface DiscoveredTable {
  schema: string;
  name: string;
  columns: DiscoveredColumn[];
  primaryKey: string[];
  foreignKeys: DiscoveredForeignKey[];
  rowCount: number;
}

export interface DiscoveredSchema {
  tables: DiscoveredTable[];
}

export function calculateSchemaHash(schema: DiscoveredSchema): string {
  const normalized = {
    tables: schema.tables
      .map((t) => ({
        schema: t.schema,
        name: t.name,
        columns: t.columns.map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
        })),
        primaryKey: [...t.primaryKey].sort(),
        foreignKeys: t.foreignKeys.map((fk) => ({
          column: fk.column,
          ref: `${fk.referencedSchema}.${fk.referencedTable}.${fk.referencedColumn}`,
        })),
      }))
      .sort((a, b) =>
        `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`),
      ),
  };

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function maskSensitiveValue(fieldName: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  const lower = fieldName.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.includes("api_key") ||
    lower.includes("ssn") ||
    lower.includes("credential")
  ) {
    return "[MASKED]";
  }
  return value;
}

export async function discoverSchema(
  adapter: ConnectorAdapter,
  allowedSchemas: readonly string[],
): Promise<DiscoveredSchema> {
  const schemaListLiteral = allowedSchemas.map((s) => `'${s}'`).join(", ");
  if (schemaListLiteral.length === 0) {
    return { tables: [] };
  }

  const tablesQuery = `
    SELECT table_schema AS schema, table_name AS name
    FROM information_schema.tables
    WHERE table_schema IN (${schemaListLiteral})
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name;
  `;
  const tablesResult = await adapter.query({ sql: tablesQuery });

  const columnsQuery = `
    SELECT table_schema AS schema, table_name AS table_name,
           column_name AS name, data_type AS type,
           (is_nullable = 'YES') AS nullable
    FROM information_schema.columns
    WHERE table_schema IN (${schemaListLiteral})
    ORDER BY table_schema, table_name, ordinal_position;
  `;
  const columnsResult = await adapter.query({ sql: columnsQuery });

  const tables: DiscoveredTable[] = [];

  for (const tRow of tablesResult.rows) {
    const schema = String(tRow.schema ?? "");
    const name = String(tRow.name ?? "");

    const cols: DiscoveredColumn[] = [];
    for (const cRow of columnsResult.rows) {
      if (cRow.schema === schema && cRow.table_name === name) {
        cols.push({
          name: String(cRow.name ?? ""),
          type: String(cRow.type ?? ""),
          nullable: Boolean(cRow.nullable),
        });
      }
    }

    let rowCount = 0;
    try {
      const countRes = await adapter.query({
        sql: `SELECT count(*)::int AS cnt FROM ${schema}.${name}`,
      });
      rowCount = Number(countRes.rows[0]?.cnt ?? 0);
    } catch {
      rowCount = 0;
    }

    for (const col of cols) {
      try {
        const profileSql = `
          SELECT
            count(*) FILTER (WHERE ${col.name} IS NULL)::int AS null_cnt,
            count(DISTINCT ${col.name})::int AS distinct_cnt
          FROM (SELECT ${col.name} FROM ${schema}.${name} LIMIT 100) AS s;
        `;
        const profRes = await adapter.query({ sql: profileSql });
        col.profile = {
          nullCount: Number(profRes.rows[0]?.null_cnt ?? 0),
          distinctCount: Number(profRes.rows[0]?.distinct_cnt ?? 0),
          sampleValues: [],
        };
      } catch {
        // Profile error fallback
      }
    }

    tables.push({
      schema,
      name,
      columns: cols,
      primaryKey: [],
      foreignKeys: [],
      rowCount,
    });
  }

  return { tables };
}

export function formatSchemaForPrompt(schema: DiscoveredSchema): string {
  const lines: string[] = [];
  for (const table of schema.tables) {
    const colList = table.columns
      .map((c) => `${c.name} (${c.type}${c.nullable ? ", nullable" : ""})`)
      .join(", ");
    lines.push(
      `Table ${table.schema}.${table.name} (approx rows: ${table.rowCount}): ${colList}`,
    );
  }
  return lines.join("\n");
}
