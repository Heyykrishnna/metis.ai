import type { SqlDialect } from "./ast.js";

export interface AnalyticalQuery {
  sql: string;
  params?: readonly unknown[];
  timeoutMs?: number;
  maxRows?: number;
  signal?: AbortSignal;
}

export interface AnalyticalResult {
  columns: readonly string[];
  rows: readonly Readonly<Record<string, unknown>>[];
}

export interface ConnectorAdapter {
  readonly id: string;
  readonly dialect: SqlDialect;
  query(query: AnalyticalQuery): Promise<AnalyticalResult>;
}

const adapters = new Map<string, ConnectorAdapter>();

export function registerConnector(adapter: ConnectorAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getConnector(id: string): ConnectorAdapter {
  const adapter = adapters.get(id);
  if (adapter === undefined) {
    throw new Error(`Unknown connector: ${id}`);
  }
  return adapter;
}

export function listConnectors(): readonly ConnectorAdapter[] {
  return [...adapters.values()];
}
