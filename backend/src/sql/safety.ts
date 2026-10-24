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
  "pg_reload_conf",
  "pg_rotate_logfile",
  "dblink",
  "dblink_connect",
  "dblink_disconnect",
  "dblink_exec",
  "dblink_open",
  "dblink_close",
  "dblink_fetch",
  "current_setting",
  "set_config",
  "lo_import",
  "lo_export",
  "lo_create",
  "lo_unlink",
  "query_to_xml",
  "query_to_xml_and_xmlschema",
  "cursor_to_xml",
  "cursor_to_xmlschema",
  "schema_to_xml",
  "schema_to_xml_and_xmlschema",
  "table_to_xml",
  "table_to_xml_and_xmlschema",
  "inet_client_addr",
  "inet_client_port",
  "inet_server_addr",
  "inet_server_port",
  "has_table_privilege",
  "has_database_privilege",
  "has_schema_privilege",
  "has_function_privilege",
  "has_column_privilege",
  "has_sequence_privilege",
  "has_server_privilege",
  "has_foreign_data_wrapper_privilege",
  "has_tablespace_privilege",
  "has_type_privilege",
  "pg_has_role",
  "row_security_active",
  "txid_current",
  "txid_current_snapshot",
]);

const systemSchemas = new Set([
  "pg_catalog",
  "information_schema",
  "pg_toast",
  "pg_temp",
]);

const disallowedStatementTypes = new Set([
  "insert",
  "update",
  "delete",
  "replace",
  "drop",
  "alter",
  "create",
  "truncate",
  "grant",
  "revoke",
  "set",
]);

const dangerousKeywordPatterns = [
  /\bBEGIN\b/i,
  /\bCOMMIT\b/i,
  /\bROLLBACK\b/i,
  /\bSAVEPOINT\b/i,
  /\bSET\s+ROLE\b/i,
  /\bSET\s+SESSION\s+AUTHORIZATION\b/i,
  /\bSET\s+TRANSACTION\b/i,
  /\bLISTEN\b/i,
  /\bNOTIFY\b/i,
  /\bCOPY\b/i,
  /\bEXECUTE\b/i,
  /\bPREPARE\b/i,
  /\bDEALLOCATE\b/i,
  /\bLOCK\s+TABLE\b/i,
  /\bFOR\s+UPDATE\b/i,
  /\bFOR\s+SHARE\b/i,
  /\bFOR\s+NO\s+KEY\s+UPDATE\b/i,
  /\bFOR\s+KEY\s+SHARE\b/i,
];

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

interface AstCollectorState {
  tables: Set<string>;
  functions: Set<string>;
  cteNames: Set<string>;
  disallowedFound: string[];
  hasInto: boolean;
}

function traverseAst(node: unknown, state: AstCollectorState): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      traverseAst(item, state);
    }
    return;
  }

  const record = node as Record<string, unknown>;

  if (typeof record.type === "string") {
    const stmtType = record.type.toLowerCase();
    if (disallowedStatementTypes.has(stmtType)) {
      state.disallowedFound.push(stmtType);
    }
  }

  if (
    record.into !== undefined &&
    record.into !== null &&
    typeof record.into === "object"
  ) {
    const intoObj = record.into as { position?: unknown; expr?: unknown };
    if (intoObj.position !== null && intoObj.position !== undefined) {
      state.hasInto = true;
    } else if (intoObj.expr !== undefined && intoObj.expr !== null) {
      state.hasInto = true;
    }
  }

  if (record.with !== undefined && Array.isArray(record.with)) {
    for (const cte of record.with) {
      if (typeof cte === "object" && cte !== null) {
        const cteRecord = cte as Record<string, unknown>;
        if ("name" in cteRecord) {
          const cteName = cteRecord.name;
          if (typeof cteName === "string") {
            state.cteNames.add(cteName.toLowerCase());
          } else if (
            typeof cteName === "object" &&
            cteName !== null &&
            "value" in cteName
          ) {
            state.cteNames.add(String(cteName.value).toLowerCase());
          }
        }
        if (
          "stmt" in cteRecord &&
          typeof cteRecord.stmt === "object" &&
          cteRecord.stmt !== null
        ) {
          const cteStmt = cteRecord.stmt as { type?: string };
          if (
            typeof cteStmt.type === "string" &&
            cteStmt.type.toLowerCase() !== "select"
          ) {
            state.disallowedFound.push(`write CTE (${cteStmt.type})`);
          }
          traverseAst(cteRecord.stmt, state);
        }
      }
    }
  }

  if (record.table !== undefined && typeof record.table === "string") {
    const schema = typeof record.db === "string" ? record.db : "";
    const tableName =
      schema.length > 0 ? `${schema}.${record.table}` : record.table;
    state.tables.add(tableName);
  }

  if (record.type === "function") {
    const fnName = extractFunctionName(record.name);
    if (fnName !== null) {
      state.functions.add(fnName);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (key !== "with") {
      traverseAst(value, state);
    }
  }
}

export function validateQuerySafety(
  sql: string,
  allowedSchemas: readonly string[],
): SqlSafetyResult {
  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    return {
      allowed: false,
      reason: "Empty SQL query is not permitted",
      referencedTables: [],
    };
  }

  if (trimmed.includes("\0")) {
    return {
      allowed: false,
      reason: "Null byte detected in query",
      referencedTables: [],
    };
  }

  for (const pattern of dangerousKeywordPatterns) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: `Disallowed keyword or transaction command: ${pattern.source}`,
        referencedTables: [],
      };
    }
  }

  const normalizedAllowed = allowedSchemas.map((schema) =>
    schema.toLowerCase(),
  );

  let ast: SqlAst;
  try {
    ast = parseSql(trimmed);
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
      reason: `Only read-only SELECT statements are permitted (received: ${root.type ?? "unknown"})`,
      referencedTables: [],
    };
  }

  const state: AstCollectorState = {
    tables: new Set<string>(),
    functions: new Set<string>(),
    cteNames: new Set<string>(),
    disallowedFound: [],
    hasInto: false,
  };

  traverseAst(ast, state);

  if (state.hasInto) {
    return {
      allowed: false,
      reason: "SELECT INTO table creation is not permitted",
      referencedTables: [...state.tables],
    };
  }

  if (state.disallowedFound.length > 0) {
    return {
      allowed: false,
      reason: `Disallowed write or non-SELECT operation: ${state.disallowedFound.join(", ")}`,
      referencedTables: [...state.tables],
    };
  }

  for (const fn of state.functions) {
    const unqualifiedFn = fn.includes(".") ? (fn.split(".").pop() ?? fn) : fn;
    if (
      disallowedFunctions.has(unqualifiedFn) ||
      disallowedFunctions.has(fn) ||
      fn.startsWith("pg_catalog.") ||
      fn.startsWith("information_schema.") ||
      (fn.startsWith("pg_") && !fn.startsWith("pg_trgm"))
    ) {
      return {
        allowed: false,
        reason: `Disallowed function: ${fn}`,
        referencedTables: [...state.tables],
      };
    }
  }

  const referenced: string[] = [];
  for (const table of state.tables) {
    const lower = table.toLowerCase();
    if (state.cteNames.has(lower)) {
      continue;
    }

    if (lower.startsWith("pg_") || lower.startsWith("information_schema.")) {
      return {
        allowed: false,
        reason: `Forbidden system table access: ${lower}`,
        referencedTables: [...state.tables],
      };
    }

    if (lower.includes(".")) {
      const [schema, name] = lower.split(".", 2) as [string, string];
      if (systemSchemas.has(schema) || !normalizedAllowed.includes(schema)) {
        return {
          allowed: false,
          reason: `Forbidden schema access: ${schema}`,
          referencedTables: [...state.tables],
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
          referencedTables: [...state.tables],
        };
      }
    }
  }

  return {
    allowed: true,
    referencedTables: referenced,
  };
}
