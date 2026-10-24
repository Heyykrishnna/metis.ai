import { parseSql, type SqlAst } from "./ast.js";

export interface SqlSafetyResult {
  allowed: boolean;
  reason?: string;
  referencedTables: string[];
}

const disallowedFunctions = new Set([
  "pg_sleep",
  "pg_read_file",
  "pg_read_binary_file",
  "pg_write_file",
  "pg_ls_dir",
  "pg_stat_file",
  "pg_terminate_backend",
  "pg_cancel_backend",
  "dblink",
  "dblink_connect",
  "dblink_exec",
  "current_setting",
  "set_config",
  "lo_import",
  "lo_export",
]);

const systemSchemas = new Set([
  "pg_catalog",
  "information_schema",
  "pg_toast",
  "pg_temp",
]);

function extractFunctionName(nameObj: unknown): string | null {
  if (typeof nameObj === "string") {
    return nameObj.toLowerCase();
  }
  if (nameObj !== null && typeof nameObj === "object") {
    const obj = nameObj as Record<string, unknown>;
    if (typeof obj.name === "string") {
      return obj.name.toLowerCase();
    }
    if (Array.isArray(obj.name)) {
      const parts = obj.name
        .map((part) =>
          typeof part === "object" && part !== null && "value" in part
            ? String((part as { value: unknown }).value)
            : String(part),
        )
        .join(".");
      return parts.toLowerCase();
    }
  }
  return null;
}

function collectFromNode(
  node: unknown,
  tables: Set<string>,
  functions: Set<string>,
  cteNames: Set<string>,
): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectFromNode(item, tables, functions, cteNames);
    }
    return;
  }

  const record = node as Record<string, unknown>;

  if (record.with !== undefined && Array.isArray(record.with)) {
    for (const cte of record.with) {
      if (typeof cte === "object" && cte !== null && "name" in cte) {
        const cteName = (cte as { name: { value: string } | string }).name;
        if (typeof cteName === "string") {
          cteNames.add(cteName.toLowerCase());
        } else if (
          typeof cteName === "object" &&
          cteName !== null &&
          "value" in cteName
        ) {
          cteNames.add(cteName.value.toLowerCase());
        }
      }
    }
  }

  if (record.table !== undefined && typeof record.table === "string") {
    const schema = typeof record.db === "string" ? record.db : "";
    const tableName =
      schema.length > 0 ? `${schema}.${record.table}` : record.table;
    tables.add(tableName);
  }

  if (record.type === "function") {
    const fnName = extractFunctionName(record.name);
    if (fnName !== null) {
      functions.add(fnName);
    }
  }

  for (const value of Object.values(record)) {
    collectFromNode(value, tables, functions, cteNames);
  }
}

export function validateQuerySafety(
  sql: string,
  allowedSchemas: readonly string[],
): SqlSafetyResult {
  const normalizedAllowed = allowedSchemas.map((schema) =>
    schema.toLowerCase(),
  );
  let ast: SqlAst;
  try {
    ast = parseSql(sql);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SQL parsing failed";
    return {
      allowed: false,
      reason: `Malformed SQL: ${message}`,
      referencedTables: [],
    };
  }

  if (Array.isArray(ast)) {
    if (ast.length !== 1) {
      return {
        allowed: false,
        reason: "Multiple statements are not permitted",
        referencedTables: [],
      };
    }
    ast = ast[0] as SqlAst;
  }

  const root = ast as { type?: string };
  if (root.type !== "select") {
    return {
      allowed: false,
      reason: "Only read-only SELECT statements are permitted",
      referencedTables: [],
    };
  }

  const tables = new Set<string>();
  const functions = new Set<string>();
  const cteNames = new Set<string>();
  collectFromNode(ast, tables, functions, cteNames);

  for (const fn of functions) {
    const unqualifiedFn = fn.includes(".") ? (fn.split(".").pop() ?? fn) : fn;
    if (disallowedFunctions.has(unqualifiedFn) || disallowedFunctions.has(fn)) {
      return {
        allowed: false,
        reason: `Disallowed function: ${fn}`,
        referencedTables: [...tables],
      };
    }
  }

  const referenced: string[] = [];
  for (const table of tables) {
    const lower = table.toLowerCase();
    if (cteNames.has(lower)) {
      continue;
    }

    if (lower.startsWith("pg_") || lower.startsWith("information_schema.")) {
      return {
        allowed: false,
        reason: `Forbidden system table access: ${lower}`,
        referencedTables: [...tables],
      };
    }

    if (lower.includes(".")) {
      const [schema, name] = lower.split(".", 2) as [string, string];
      if (systemSchemas.has(schema) || !normalizedAllowed.includes(schema)) {
        return {
          allowed: false,
          reason: `Forbidden schema access: ${schema}`,
          referencedTables: [...tables],
        };
      }
      referenced.push(`${schema}.${name}`);
    } else {
      let matched = false;
      for (const allowedSchema of normalizedAllowed) {
        if (!systemSchemas.has(allowedSchema)) {
          matched = true;
          referenced.push(`${allowedSchema}.${lower}`);
          break;
        }
      }
      if (!matched) {
        return {
          allowed: false,
          reason: `Table without allowed schema qualification: ${lower}`,
          referencedTables: [...tables],
        };
      }
    }
  }

  return {
    allowed: true,
    referencedTables: referenced,
  };
}
