import type { PoolConfig } from "pg";
import { foundationPolicy } from "../policy.js";

export function metadataPoolConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  const neon = url.hostname.endsWith(".neon.tech");
  if (
    neon &&
    ["disable", "allow", "prefer"].includes(
      url.searchParams.get("sslmode") ?? "",
    )
  ) {
    throw new Error("Neon requires verified TLS");
  }
  if (neon) {
    for (const parameter of [
      "sslmode",
      "sslcert",
      "sslkey",
      "sslrootcert",
      "ssl",
      "channel_binding",
    ])
      url.searchParams.delete(parameter);
  }
  return {
    connectionString: url.href,
    ...(neon
      ? { ssl: { rejectUnauthorized: true }, enableChannelBinding: true }
      : {}),
    max: foundationPolicy.limits.databasePoolSize,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    maxLifetimeSeconds: 300,
    statement_timeout: foundationPolicy.limits.queryTimeoutMs,
    application_name: "metis-ai",
  };
}
