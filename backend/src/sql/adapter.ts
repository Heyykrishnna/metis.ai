import postgres from "postgres";
import { foundationPolicy } from "../policy.js";
import type {
  AnalyticalQuery,
  AnalyticalResult,
  ConnectorAdapter,
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
    // If URL parsing fails, continue with original message
  }
  return sanitized;
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

    const pending = this.client.unsafe(
      queryInput.sql,
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
