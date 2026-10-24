import { describe, expect, it } from "vitest";
import { PostgresAnalyticalAdapter } from "../src/sql/adapter.js";

describe("PostgresAnalyticalAdapter configuration", () => {
  it("sanitizes connection errors so credentials never leak", async () => {
    const adapter = new PostgresAnalyticalAdapter({
      connectionString:
        "postgres://secret_user:super_secret_password@127.0.0.1:59999/nonexistent",
      poolSize: 1,
      statementTimeoutMs: 1000,
    });

    try {
      await expect(adapter.testConnection()).rejects.toThrow();
      await adapter.testConnection().catch((error: Error) => {
        expect(error.message).not.toContain("super_secret_password");
      });
    } finally {
      await adapter.close();
    }
  });

  it("enforces maximum row limits on queries", () => {
    const adapter = new PostgresAnalyticalAdapter({
      connectionString: "postgres://reader:pass@127.0.0.1:5432/test",
      poolSize: 1,
    });
    expect(adapter.maxRows).toBe(1000);
    adapter.close();
  });
});
