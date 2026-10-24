import { describe, expect, it } from "vitest";
import {
  calculateSchemaHash,
  maskSensitiveValue,
  type DiscoveredSchema,
} from "../src/analysis/schema.js";

describe("schema discovery and profiling", () => {
  const sampleSchema: DiscoveredSchema = {
    tables: [
      {
        schema: "analytics_clean",
        name: "schools",
        columns: [
          { name: "id", type: "integer", nullable: false },
          { name: "name", type: "text", nullable: false },
        ],
        primaryKey: ["id"],
        foreignKeys: [],
        rowCount: 6,
      },
      {
        schema: "analytics_clean",
        name: "enrolments",
        columns: [
          { name: "school_id", type: "integer", nullable: false },
          { name: "year", type: "integer", nullable: false },
          { name: "enrolled", type: "integer", nullable: true },
        ],
        primaryKey: ["school_id", "year"],
        foreignKeys: [
          {
            column: "school_id",
            referencedSchema: "analytics_clean",
            referencedTable: "schools",
            referencedColumn: "id",
          },
        ],
        rowCount: 11,
      },
    ],
  };

  it("computes a deterministic schema hash", () => {
    const hash1 = calculateSchemaHash(sampleSchema);
    const hash2 = calculateSchemaHash(sampleSchema);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).toBe(hash2);
  });

  it("masks sensitive patterns and passwords", () => {
    expect(maskSensitiveValue("password", "super-secret-123")).toBe("[MASKED]");
    expect(maskSensitiveValue("token", "xyz-123-abc")).toBe("[MASKED]");
    expect(maskSensitiveValue("name", "Arun High School")).toBe(
      "Arun High School",
    );
  });
});
