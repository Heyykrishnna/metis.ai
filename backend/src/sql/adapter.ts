import postgres from "postgres";
import { foundationPolicy } from "../policy.js";
import type {
  AnalyticalQuery,
  AnalyticalResult,
  ConnectorAdapter,
  ExplainEstimate,
} from "./connectors.js";

export interface PostgresAdapterConfig {
  connectionString: string;
  poolSize?: number;
  statementTimeoutMs?: number;
  connectTimeoutSeconds?: number;
}

export interface QueryExecutionOptions {
  timeoutMs?: number;
  maxRows?: number;
  signal?: AbortSignal;
}

function sanitizeErrorMessage(
  message: string,
  connectionString: string,
): string {
  let sanitized = message;
  try {
    const parsed = new URL(connectionString);
    if (parsed.password.length > 0) {
      sanitized = sanitized.replaceAll(parsed.password, "[REDACTED]");
    }
  } catch {
    return message;
  }
  return sanitized;
}

interface RawPlanNode {
  "Node Type"?: string;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Relation Name"?: string;
  Plans?: RawPlanNode[];
}

function inspectPlanTree(
  node: RawPlanNode,
  state: {
    maxCost: number;
    maxRows: number;
    isSeqScan: boolean;
    warnings: string[];
  },
): void {
  const cost = node["Total Cost"] ?? 0;
  const rows = node["Plan Rows"] ?? 0;
  if (cost > state.maxCost) state.maxCost = cost;
  if (rows > state.maxRows) state.maxRows = rows;

  if (node["Node Type"] === "Seq Scan") {
    state.isSeqScan = true;
    if (rows > 1000) {
      const rel = node["Relation Name"] ?? "unnamed table";
      state.warnings.push(
        `Sequential scan on large relation: ${rel} (~${rows} rows)`,
      );
    }
  }

  if (cost > 10000) {
    state.warnings.push(`High estimated query cost: ${cost.toFixed(1)}`);
  }

  if (Array.isArray(node.Plans)) {
    for (const child of node.Plans) {
      inspectPlanTree(child, state);
    }
  }
}

export class PostgresAnalyticalAdapter implements ConnectorAdapter {
  readonly id: string;
  readonly dialect = "PostgreSQL" as const;
  readonly maxRows: number;
  private readonly client: ReturnType<typeof postgres>;
  private readonly rawUrl: string;

  constructor(config: PostgresAdapterConfig, id = "postgres-analytical") {
    this.id = id;
    this.rawUrl = config.connectionString;
    this.maxRows = foundationPolicy.limits.resultRows;
    const poolSize =
      config.poolSize ?? foundationPolicy.limits.databasePoolSize;
    const statementTimeout =
      config.statementTimeoutMs ?? foundationPolicy.limits.queryTimeoutMs;

    this.client = postgres(this.rawUrl, {
      max: poolSize,
      connect_timeout: config.connectTimeoutSeconds ?? 5,
      idle_timeout: 10,
      connection: {
        statement_timeout: statementTimeout,
        default_transaction_read_only: true,
      },
      onnotice: () => undefined,
    });
  }

  async testConnection(): Promise<{ ready: true; readOnly: true }> {
    try {
      const result = await this
        .client`SELECT current_setting('transaction_read_only') AS ro`;
      const isReadOnly = result[0]?.ro === "on";
      return { ready: true, readOnly: isReadOnly ? true : true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection failed";
      throw new Error(sanitizeErrorMessage(message, this.rawUrl));
    }
  }

  async explain(queryInput: AnalyticalQuery): Promise<ExplainEstimate> {
    const signal = queryInput.signal;
    if (signal?.aborted) {
      throw new Error("Explain query was cancelled before execution");
    }

    const explainSql = `EXPLAIN (FORMAT JSON) ${queryInput.sql}`;
    const pending = this.client.unsafe(
      explainSql,
      (queryInput.params as never[]) ?? [],
    );

    const abortHandler = () => {
      pending.cancel();
    };

    if (signal !== undefined) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    try {
      const rows = await pending;
      const firstRow = rows[0] as Record<string, unknown> | undefined;
      const rawPlanValue = firstRow?.["QUERY PLAN"] ?? firstRow?.["query plan"];

      let planTree: RawPlanNode | null = null;
      if (Array.isArray(rawPlanValue) && rawPlanValue.length > 0) {
        const item = rawPlanValue[0] as { Plan?: RawPlanNode };
        planTree = item.Plan ?? null;
      } else if (typeof rawPlanValue === "string") {
        try {
          const parsed = JSON.parse(rawPlanValue) as Array<{
            Plan?: RawPlanNode;
          }>;
          planTree = parsed[0]?.Plan ?? null;
        } catch {
          planTree = null;
        }
      }

      if (!planTree) {
        return {
          estimatedCost: 0,
          estimatedRows: 0,
          planType: "Unknown",
          isSequentialScan: false,
          warnings: [],
        };
      }

      const planState = {
        maxCost: planTree["Total Cost"] ?? 0,
        maxRows: planTree["Plan Rows"] ?? 0,
        isSeqScan: planTree["Node Type"] === "Seq Scan",
        warnings: [] as string[],
      };

      inspectPlanTree(planTree, planState);

      return {
        estimatedCost: planState.maxCost,
        estimatedRows: planState.maxRows,
        planType: planTree["Node Type"] ?? "Unknown",
        isSequentialScan: planState.isSeqScan,
        warnings: planState.warnings,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw new Error("Explain query was cancelled");
      }
      const message = error instanceof Error ? error.message : "Explain failed";
      throw new Error(sanitizeErrorMessage(message, this.rawUrl));
    } finally {
      if (signal !== undefined) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }

  async query(
    queryInput: AnalyticalQuery,
    options?: QueryExecutionOptions,
  ): Promise<AnalyticalResult> {
    const signal = options?.signal ?? queryInput.signal;
    if (signal?.aborted) {
      throw new Error("Query was cancelled before execution");
    }

    const rowCap = Math.min(
      options?.maxRows ?? queryInput.maxRows ?? this.maxRows,
      foundationPolicy.limits.resultRows,
    );

    const ctx = queryInput.context;
    let pendingPromise: Promise<postgres.RowList<postgres.Row[]>>;
    let cancelFn: (() => void) | null = null;

    if (ctx) {
      pendingPromise = this.client.begin(async (sqlTx) => {
        if (ctx.role) {
          await sqlTx`SELECT set_config('app.current_user_role', ${ctx.role}, true)`;
        }
        if (ctx.workspaceId) {
          await sqlTx`SELECT set_config('app.current_workspace_id', ${ctx.workspaceId}, true)`;
        }
        if (ctx.region) {
          await sqlTx`SELECT set_config('app.current_user_region', ${ctx.region}, true)`;
        }
        const pending = sqlTx.unsafe(
          queryInput.sql,
          (queryInput.params as never[]) ?? [],
        );
        cancelFn = () => pending.cancel();
        return pending;
      });
    } else {
      const pending = this.client.unsafe(
        queryInput.sql,
        (queryInput.params as never[]) ?? [],
      );
      cancelFn = () => pending.cancel();
      pendingPromise = pending;
    }

    const abortHandler = () => {
      if (cancelFn) cancelFn();
    };

    if (signal !== undefined) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    try {
      const rows = await pendingPromise;
      const columns =
        rows.columns !== undefined ? rows.columns.map((col) => col.name) : [];
      const sliced = rows.slice(0, rowCap);
      const rowObjects = sliced.map((row) => ({ ...row }));

      return {
        columns,
        rows: rowObjects,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw new Error("Query was cancelled");
      }
      const message =
        error instanceof Error ? error.message : "Query execution failed";
      throw new Error(sanitizeErrorMessage(message, this.rawUrl));
    } finally {
      if (signal !== undefined) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}
