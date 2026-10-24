import { describe, expect, it } from "vitest";
import { validateQuerySafety } from "../src/sql/safety.js";

describe("SQL safety validation", () => {
  const allowedSchemas = ["analytics_clean", "analytics_dirty"];

  it("allows a read-only SELECT referencing allowed schemas", () => {
    const sql = `
      SELECT school_id, enrolled
      FROM analytics_clean.enrolments
      WHERE year = 2025
    `;
    const result = validateQuerySafety(sql, allowedSchemas);
    expect(result.allowed).toBe(true);
    expect(result.referencedTables).toContain("analytics_clean.enrolments");
  });

  it("allows CTEs that only read from allowed schemas", () => {
    const sql = `
      WITH current_year AS (
        SELECT school_id, enrolled FROM analytics_clean.enrolments WHERE year = 2025
      ),
      prev_year AS (
        SELECT school_id, enrolled FROM analytics_clean.enrolments WHERE year = 2024
      )
      SELECT c.school_id, c.enrolled - p.enrolled AS delta
      FROM current_year c
      JOIN prev_year p ON c.school_id = p.school_id
    `;
    const result = validateQuerySafety(sql, allowedSchemas);
    expect(result.allowed).toBe(true);
  });

  it("denies multiple statements", () => {
    const sql = "SELECT 1; SELECT 2;";
    const result = validateQuerySafety(sql, allowedSchemas);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Multiple statements");
  });

  it("denies non-SELECT statements", () => {
    const statements = [
      "UPDATE analytics_clean.enrolments SET enrolled = 0 WHERE school_id = 1",
      "DELETE FROM analytics_clean.enrolments WHERE school_id = 1",
      "INSERT INTO analytics_clean.schools VALUES (99, 'Test')",
      "DROP TABLE analytics_clean.schools",
      "CREATE TABLE public.injected (id int)",
      "TRUNCATE analytics_clean.enrolments",
    ];

    for (const sql of statements) {
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(
        /Only read-only SELECT statements are permitted/,
      );
    }
  });

  it("denies access to forbidden schemas outside the allowed list", () => {
    const sql = "SELECT * FROM private_data.restricted";
    const result = validateQuerySafety(sql, allowedSchemas);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Forbidden schema/);
  });

  it("denies access to system catalog and metadata schemas", () => {
    const catalogQueries = [
      "SELECT * FROM pg_catalog.pg_user",
      "SELECT * FROM pg_shadow",
      "SELECT * FROM information_schema.tables",
    ];

    for (const sql of catalogQueries) {
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
    }
  });

  it("denies dangerous system functions", () => {
    const dangerousQueries = [
      "SELECT pg_sleep(5)",
      "SELECT pg_read_file('/etc/passwd')",
      "SELECT current_setting('server_version')",
      "SELECT pg_terminate_backend(1234)",
    ];

    for (const sql of dangerousQueries) {
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Disallowed function/);
    }
  });
});
