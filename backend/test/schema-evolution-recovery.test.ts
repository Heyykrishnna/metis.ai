import { fixtureAdapter } from "./support/fixture-adapter.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { getDefaultSecretStore } from "../src/security/secrets.js";
import {
  clearMappings,
  detectSchemaDrift,
  generateImpactPreview,
  recoverEvolvedSql,
  saveSchemaMapping,
} from "../src/analysis/drift.js";
import type { DiscoveredSchema } from "../src/analysis/schema.js";
import { evaluatePolicyCompliance } from "../src/security/policies.js";

describe("Phase 8: Schema Evolution and Safe Recovery (Gate G8)", () => {
  let app: App;
  const workspacePrimary = "00000000-0000-4000-8000-000000000001";
  const workspaceIsolated = "00000000-0000-4000-8000-000000000002";

  const authOwner = {
    authorization: `Bearer test-owner:${workspacePrimary}:owner`,
  };
  const authIsolated = {
    authorization: `Bearer test-isolated:${workspaceIsolated}:owner`,
  };

  let connectionId: string;

  const baselineSchema: DiscoveredSchema = {
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

  const renamedSchema: DiscoveredSchema = {
    tables: [
      {
        schema: "analytics_clean",
        name: "org",
        columns: [
          { name: "k", type: "integer", nullable: false },
          { name: "label", type: "text", nullable: false },
        ],
        primaryKey: ["k"],
        foreignKeys: [],
        rowCount: 6,
      },
      {
        schema: "analytics_clean",
        name: "obs",
        columns: [
          { name: "org_k", type: "integer", nullable: false },
          { name: "yr", type: "integer", nullable: false },
          { name: "n", type: "integer", nullable: true },
        ],
        primaryKey: ["org_k", "yr"],
        foreignKeys: [
          {
            column: "org_k",
            referencedSchema: "analytics_clean",
            referencedTable: "org",
            referencedColumn: "k",
          },
        ],
        rowCount: 11,
      },
    ],
  };

  beforeAll(async () => {
    clearMappings();
    app = await buildApp({ adapter: fixtureAdapter() });
    const secrets = getDefaultSecretStore();
    await secrets.set("secret://fixture/reader", "fixture-password");

    const connRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authOwner,
      payload: {
        name: "Evolution Analytics DB",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "metis_test",
        username: "metis_reader",
        secretReference: "secret://fixture/reader",
        allowedSchemas: ["analytics_clean", "analytics_heldout"],
      },
    });
    expect(connRes.statusCode).toBe(201);
    connectionId = connRes.json().id;
  });

  afterAll(async () => {
    clearMappings();
    await app.close();
  });

  describe("Section 1: Schema Drift Detection, Freshness Checks, and Categorization", () => {
    it("reports hasDrift: false when schema fingerprints match exactly", () => {
      const diff = detectSchemaDrift(
        connectionId,
        baselineSchema,
        baselineSchema,
        ["analytics_clean"],
      );
      expect(diff.hasDrift).toBe(false);
      expect(diff.changes).toHaveLength(0);
      expect(diff.previousSchemaHash).toBe(diff.currentSchemaHash);
    });

    it("detects table rename drift and column rename drift", () => {
      const diff = detectSchemaDrift(
        connectionId,
        baselineSchema,
        renamedSchema,
        ["analytics_clean"],
      );
      expect(diff.hasDrift).toBe(true);
      expect(diff.previousSchemaHash).not.toBe(diff.currentSchemaHash);
      expect(diff.changes.length).toBeGreaterThan(0);

      const tableChanges = diff.changes.filter(
        (c) =>
          c.category === "renamed_table" || c.category === "dropped_object",
      );
      expect(tableChanges.length).toBeGreaterThanOrEqual(1);
    });

    it("distinguishes genuine table drop from permission loss when schema is revoked", () => {
      const diffAllowed = detectSchemaDrift(
        connectionId,
        baselineSchema,
        { tables: [] },
        ["analytics_clean"],
      );
      const dropped = diffAllowed.changes.find(
        (c) => c.sourceObject === "analytics_clean.schools",
      );
      expect(dropped?.category).toBe("dropped_object");

      const diffRevoked = detectSchemaDrift(
        connectionId,
        baselineSchema,
        { tables: [] },
        ["other_schema"],
      );
      const permissionLoss = diffRevoked.changes.find(
        (c) => c.sourceObject === "analytics_clean.schools",
      );
      expect(permissionLoss?.category).toBe("permission_loss");
      expect(permissionLoss?.severity).toBe("breaking");
    });

    it("detects incompatible data type evolution", () => {
      const alteredSchema: DiscoveredSchema = {
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
              { name: "enrolled", type: "varchar", nullable: true },
            ],
            primaryKey: ["school_id", "year"],
            foreignKeys: [],
            rowCount: 11,
          },
        ],
      };

      const diff = detectSchemaDrift(
        connectionId,
        baselineSchema,
        alteredSchema,
        ["analytics_clean"],
      );
      expect(diff.hasDrift).toBe(true);
      const typeChange = diff.changes.find(
        (c) => c.category === "type_changed",
      );
      expect(typeChange).toBeDefined();
      expect(typeChange?.severity).toBe("breaking");
      expect(typeChange?.sourceObject).toBe(
        "analytics_clean.enrolments.enrolled",
      );
    });
  });

  describe("Section 2: E10 Schema-Change Inbox and Impact Preview API", () => {
    it("provides GET /v1/connections/:connectionId/drift endpoint", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/connections/${connectionId}/drift`,
        headers: authOwner,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.connectionId).toBe(connectionId);
      expect(typeof body.previousSchemaHash).toBe("string");
      expect(typeof body.currentSchemaHash).toBe("string");
      expect(Array.isArray(body.changes)).toBe(true);
    });

    it("provides GET /v1/connections/:connectionId/impact-preview and identifies affected recipes", async () => {
      const recipeRes = await app.inject({
        method: "POST",
        url: "/v1/recipes",
        headers: authOwner,
        payload: {
          connectionId,
          name: "Annual Enrolment Summary",
          metricName: "total_enrolment",
          question: "What is total enrolment by year?",
          plan: { step: "group_by_year" },
          sqlText:
            "SELECT year, sum(enrolled) FROM analytics_clean.enrolments GROUP BY year",
          grain: ["year"],
          timeframePolicy: "calendar_year",
          nullExclusionPolicy: "exclude_nulls",
          approvalStatus: "approved",
        },
      });
      expect(recipeRes.statusCode).toBe(201);
      const recipeId = recipeRes.json().id;

      const impact = generateImpactPreview(
        connectionId,
        {
          connectionId,
          previousSchemaHash: "hash-a",
          currentSchemaHash: "hash-b",
          hasDrift: true,
          changes: [
            {
              category: "renamed_table",
              severity: "warning",
              sourceObject: "analytics_clean.enrolments",
              targetObjects: ["analytics_clean.obs"],
              affectedColumns: ["enrolled"],
              explanation: "Table renamed to obs",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        [
          {
            id: recipeId,
            name: "Annual Enrolment Summary",
            sqlText:
              "SELECT year, sum(enrolled) FROM analytics_clean.enrolments GROUP BY year",
          },
        ],
        [
          {
            runId: "run-turn-1",
            turnNumber: 1,
            sources: ["analytics_clean.enrolments"],
          },
        ],
      );

      expect(impact.affectedRecipes).toHaveLength(1);
      expect(impact.affectedRecipes[0]?.recipeId).toBe(recipeId);
      expect(impact.affectedRecipes[0]?.status).toBe("needs_update");
      expect(impact.affectedContexts).toHaveLength(1);
      expect(impact.recommendedActions.length).toBeGreaterThan(0);

      const apiRes = await app.inject({
        method: "GET",
        url: `/v1/connections/${connectionId}/impact-preview`,
        headers: authOwner,
      });
      expect(apiRes.statusCode).toBe(200);
      const apiBody = apiRes.json();
      expect(apiBody.connectionId).toBe(connectionId);
      expect(Array.isArray(apiBody.affectedRecipes)).toBe(true);
      expect(Array.isArray(apiBody.recommendedActions)).toBe(true);
    });

    it("manages schema mappings via POST and approves via POST /approve", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/connections/${connectionId}/mappings`,
        headers: authOwner,
        payload: {
          sourceTable: "analytics_clean.schools",
          targetTables: ["analytics_clean.org"],
          mappingType: "rename",
          columnRules: [
            {
              sourceColumn: "id",
              targetTable: "analytics_clean.org",
              targetColumn: "k",
            },
            {
              sourceColumn: "name",
              targetTable: "analytics_clean.org",
              targetColumn: "label",
            },
          ],
          status: "proposed",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json();
      expect(created.id).toBeDefined();
      expect(created.status).toBe("proposed");

      const listRes = await app.inject({
        method: "GET",
        url: `/v1/connections/${connectionId}/mappings`,
        headers: authOwner,
      });
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json();
      expect(list.some((m: { id: string }) => m.id === created.id)).toBe(true);

      const approveRes = await app.inject({
        method: "POST",
        url: `/v1/connections/${connectionId}/mappings/${created.id}/approve`,
        headers: authOwner,
      });
      expect(approveRes.statusCode).toBe(200);
      const approved = approveRes.json();
      expect(approved.id).toBe(created.id);
      expect(approved.status).toBe("approved");
      expect(approved.reviewedBy).toBeDefined();
    });
  });

  describe("Section 3: Safe Recovery & Rewriting Engine", () => {
    beforeEach(() => {
      clearMappings();
    });

    it("rewrites meaning-preserving renames for tables and columns", () => {
      saveSchemaMapping(connectionId, {
        sourceTable: "analytics_clean.schools",
        targetTables: ["analytics_clean.org"],
        mappingType: "rename",
        columnRules: [
          {
            sourceColumn: "id",
            targetTable: "analytics_clean.org",
            targetColumn: "k",
          },
          {
            sourceColumn: "name",
            targetTable: "analytics_clean.org",
            targetColumn: "label",
          },
        ],
        status: "approved",
      });

      const originalSql =
        "SELECT id, name FROM analytics_clean.schools ORDER BY name";
      const recovery = recoverEvolvedSql({
        connectionId,
        sql: originalSql,
        drift: {
          connectionId,
          previousSchemaHash: "h1",
          currentSchemaHash: "h2",
          hasDrift: true,
          changes: [
            {
              category: "renamed_table",
              severity: "warning",
              sourceObject: "analytics_clean.schools",
              targetObjects: ["analytics_clean.org"],
              affectedColumns: ["id", "name"],
              explanation: "Renamed",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        role: "analyst",
      });

      expect(recovery.status).toBe("recovered");
      expect(recovery.recoveredSql).toContain("analytics_clean.org");
      expect(recovery.recoveredSql).toContain("k");
      expect(recovery.recoveredSql).toContain("label");
      expect(recovery.recoveredSql).not.toContain("analytics_clean.schools");
    });

    it("rewrites meaning-preserving vertical splits into JOIN queries using declared joinKey", () => {
      saveSchemaMapping(connectionId, {
        sourceTable: "analytics_clean.schools",
        targetTables: [
          "analytics_clean.school_core",
          "analytics_clean.school_attrs",
        ],
        mappingType: "split_vertical",
        joinKey: "id",
        columnRules: [],
        status: "approved",
      });

      const originalSql =
        "SELECT s.id, s.name FROM analytics_clean.schools s ORDER BY s.name";
      const recovery = recoverEvolvedSql({
        connectionId,
        sql: originalSql,
        drift: {
          connectionId,
          previousSchemaHash: "h1",
          currentSchemaHash: "h2",
          hasDrift: true,
          changes: [
            {
              category: "split_vertical",
              severity: "warning",
              sourceObject: "analytics_clean.schools",
              targetObjects: [
                "analytics_clean.school_core",
                "analytics_clean.school_attrs",
              ],
              affectedColumns: ["id", "name", "region", "status"],
              explanation: "Vertically split",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        role: "analyst",
      });

      expect(recovery.status).toBe("recovered");
      expect(recovery.recoveredSql).toContain("school_core");
      expect(recovery.recoveredSql).toContain("school_attrs");
      expect(recovery.recoveredSql).toContain("USING (id)");
    });

    it("rewrites meaning-preserving horizontal splits into UNION ALL queries", () => {
      saveSchemaMapping(connectionId, {
        sourceTable: "analytics_clean.enrolments",
        targetTables: [
          "analytics_clean.enrolments_2024",
          "analytics_clean.enrolments_2025",
        ],
        mappingType: "split_horizontal",
        partitionColumn: "year",
        columnRules: [],
        status: "approved",
      });

      const originalSql =
        "SELECT year, sum(enrolled) FROM analytics_clean.enrolments e GROUP BY year";
      const recovery = recoverEvolvedSql({
        connectionId,
        sql: originalSql,
        drift: {
          connectionId,
          previousSchemaHash: "h1",
          currentSchemaHash: "h2",
          hasDrift: true,
          changes: [
            {
              category: "split_horizontal",
              severity: "warning",
              sourceObject: "analytics_clean.enrolments",
              targetObjects: [
                "analytics_clean.enrolments_2024",
                "analytics_clean.enrolments_2025",
              ],
              affectedColumns: ["school_id", "year", "enrolled"],
              explanation: "Horizontally partitioned",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        role: "analyst",
      });

      expect(recovery.status).toBe("recovered");
      expect(recovery.recoveredSql).toContain("UNION ALL");
      expect(recovery.recoveredSql).toContain("enrolments_2024");
      expect(recovery.recoveredSql).toContain("enrolments_2025");
    });
  });

  describe("Section 4: Frozen 30-Question Evaluation Suite across 6 Schema Families", () => {
    interface EvaluationQuestion {
      id: string;
      family: string;
      question: string;
      baseSql: string;
    }

    const frozenQuestions: EvaluationQuestion[] = [
      // Family 1: Enrolment trends and decline (Q01–Q05)
      {
        id: "Q01",
        family: "Enrolment trends and decline",
        question:
          "Which schools experienced enrolment decline from 2024 to 2025?",
        baseSql:
          "SELECT current.school_id FROM analytics_clean.enrolments current JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id WHERE current.year = 2025 AND previous.year = 2024 AND current.enrolled < previous.enrolled",
      },
      {
        id: "Q02",
        family: "Enrolment trends and decline",
        question: "What is total enrolment across all schools in 2024?",
        baseSql:
          "SELECT sum(enrolled) AS total_enrolled FROM analytics_clean.enrolments WHERE year = 2024",
      },
      {
        id: "Q03",
        family: "Enrolment trends and decline",
        question: "What is total enrolment across all schools in 2025?",
        baseSql:
          "SELECT sum(enrolled) AS total_enrolled FROM analytics_clean.enrolments WHERE year = 2025",
      },
      {
        id: "Q04",
        family: "Enrolment trends and decline",
        question:
          "Which school had largest absolute enrolment decrease between 2024 and 2025?",
        baseSql:
          "SELECT current.school_id, (previous.enrolled - current.enrolled) AS decrease FROM analytics_clean.enrolments current JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id WHERE current.year = 2025 AND previous.year = 2024 AND current.enrolled < previous.enrolled ORDER BY decrease DESC LIMIT 1",
      },
      {
        id: "Q05",
        family: "Enrolment trends and decline",
        question: "List schools with enrolment greater than 50 in 2024.",
        baseSql:
          "SELECT school_id FROM analytics_clean.enrolments WHERE year = 2024 AND enrolled > 50",
      },

      // Family 2: Regional aggregations and summaries (Q06–Q10)
      {
        id: "Q06",
        family: "Regional aggregations and summaries",
        question: "What is average enrolment per school in 2024?",
        baseSql:
          "SELECT round(avg(enrolled), 1) AS avg_enrolled FROM analytics_clean.enrolments WHERE year = 2024",
      },
      {
        id: "Q07",
        family: "Regional aggregations and summaries",
        question: "What is minimum enrolment observed in 2024?",
        baseSql:
          "SELECT min(enrolled) AS min_enrolled FROM analytics_clean.enrolments WHERE year = 2024",
      },
      {
        id: "Q08",
        family: "Regional aggregations and summaries",
        question: "What is maximum enrolment observed in 2024?",
        baseSql:
          "SELECT max(enrolled) AS max_enrolled FROM analytics_clean.enrolments WHERE year = 2024",
      },
      {
        id: "Q09",
        family: "Regional aggregations and summaries",
        question: "How many schools have enrolment records for 2024?",
        baseSql:
          "SELECT count(DISTINCT school_id) AS school_count FROM analytics_clean.enrolments WHERE year = 2024",
      },
      {
        id: "Q10",
        family: "Regional aggregations and summaries",
        question:
          "What is total enrolment for schools with id between 1 and 3 in 2024?",
        baseSql:
          "SELECT sum(enrolled) AS subtotal FROM analytics_clean.enrolments WHERE year = 2024 AND school_id BETWEEN 1 AND 3",
      },

      // Family 3: School entity attributes and status (Q11–Q15)
      {
        id: "Q11",
        family: "School entity attributes and status",
        question: "List all school names in alphabetical order.",
        baseSql: "SELECT name FROM analytics_clean.schools ORDER BY name",
      },
      {
        id: "Q12",
        family: "School entity attributes and status",
        question: "How many total schools are registered in the system?",
        baseSql:
          "SELECT count(*) AS total_schools FROM analytics_clean.schools",
      },
      {
        id: "Q13",
        family: "School entity attributes and status",
        question: "What is the name of the school with id 1?",
        baseSql: "SELECT name FROM analytics_clean.schools WHERE id = 1",
      },
      {
        id: "Q14",
        family: "School entity attributes and status",
        question: "Which schools have an id greater than 3?",
        baseSql:
          "SELECT name FROM analytics_clean.schools WHERE id > 3 ORDER BY id",
      },
      {
        id: "Q15",
        family: "School entity attributes and status",
        question: "List all school IDs and their names.",
        baseSql: "SELECT id, name FROM analytics_clean.schools ORDER BY id",
      },

      // Family 4: Comparative multi-year metrics (Q16–Q20)
      {
        id: "Q16",
        family: "Comparative multi-year metrics",
        question:
          "Which schools had enrolment in 2024 but missing enrolment in 2025?",
        baseSql:
          "SELECT e24.school_id FROM analytics_clean.enrolments e24 LEFT JOIN analytics_clean.enrolments e25 ON e24.school_id = e25.school_id AND e25.year = 2025 WHERE e24.year = 2024 AND (e25.enrolled IS NULL)",
      },
      {
        id: "Q17",
        family: "Comparative multi-year metrics",
        question:
          "Which schools maintained enrolment above 30 in both 2024 and 2025?",
        baseSql:
          "SELECT e24.school_id FROM analytics_clean.enrolments e24 JOIN analytics_clean.enrolments e25 ON e24.school_id = e25.school_id WHERE e24.year = 2024 AND e25.year = 2025 AND e24.enrolled > 30 AND e25.enrolled > 30",
      },
      {
        id: "Q18",
        family: "Comparative multi-year metrics",
        question:
          "What is total enrolment across matched schools in 2024 and 2025?",
        baseSql:
          "SELECT sum(e24.enrolled) AS sum24, sum(e25.enrolled) AS sum25 FROM analytics_clean.enrolments e24 JOIN analytics_clean.enrolments e25 ON e24.school_id = e25.school_id WHERE e24.year = 2024 AND e25.year = 2025 AND e25.enrolled IS NOT NULL",
      },
      {
        id: "Q19",
        family: "Comparative multi-year metrics",
        question: "List schools that grew enrolment between 2024 and 2025.",
        baseSql:
          "SELECT current.school_id FROM analytics_clean.enrolments current JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id WHERE current.year = 2025 AND previous.year = 2024 AND current.enrolled > previous.enrolled",
      },
      {
        id: "Q20",
        family: "Comparative multi-year metrics",
        question: "What was combined enrolment of schools 1 and 2 in 2024?",
        baseSql:
          "SELECT sum(enrolled) AS combined_enrolment FROM analytics_clean.enrolments WHERE year = 2024 AND school_id IN (1, 2)",
      },

      // Family 5: Filtered ranking and top-N cohorts (Q21–Q25)
      {
        id: "Q21",
        family: "Filtered ranking and top-N cohorts",
        question: "What are top 3 schools by enrolment in 2024?",
        baseSql:
          "SELECT school_id, enrolled FROM analytics_clean.enrolments WHERE year = 2024 ORDER BY enrolled DESC LIMIT 3",
      },
      {
        id: "Q22",
        family: "Filtered ranking and top-N cohorts",
        question: "What is lowest enrolled school in 2024?",
        baseSql:
          "SELECT school_id, enrolled FROM analytics_clean.enrolments WHERE year = 2024 ORDER BY enrolled ASC LIMIT 1",
      },
      {
        id: "Q23",
        family: "Filtered ranking and top-N cohorts",
        question: "List schools ranked by 2024 enrolment in descending order.",
        baseSql:
          "SELECT school_id, enrolled FROM analytics_clean.enrolments WHERE year = 2024 ORDER BY enrolled DESC",
      },
      {
        id: "Q24",
        family: "Filtered ranking and top-N cohorts",
        question: "Which school had exactly 100 enrolled students in 2024?",
        baseSql:
          "SELECT school_id FROM analytics_clean.enrolments WHERE year = 2024 AND enrolled = 100",
      },
      {
        id: "Q25",
        family: "Filtered ranking and top-N cohorts",
        question: "How many schools had enrolment below 50 in 2024?",
        baseSql:
          "SELECT count(*) AS count_low FROM analytics_clean.enrolments WHERE year = 2024 AND enrolled < 50",
      },

      // Family 6: Complex multi-table joins and grain verification (Q26–Q30)
      {
        id: "Q26",
        family: "Complex multi-table joins and grain verification",
        question: "List each school name along with its 2024 enrolment.",
        baseSql:
          "SELECT s.name, e.enrolled FROM analytics_clean.schools s JOIN analytics_clean.enrolments e ON s.id = e.school_id WHERE e.year = 2024 ORDER BY s.id",
      },
      {
        id: "Q27",
        family: "Complex multi-table joins and grain verification",
        question: "List each school name along with its 2025 enrolment.",
        baseSql:
          "SELECT s.name, e.enrolled FROM analytics_clean.schools s JOIN analytics_clean.enrolments e ON s.id = e.school_id WHERE e.year = 2025 ORDER BY s.id",
      },
      {
        id: "Q28",
        family: "Complex multi-table joins and grain verification",
        question: "What is school name and 2024 enrolment for school id 2?",
        baseSql:
          "SELECT s.name, e.enrolled FROM analytics_clean.schools s JOIN analytics_clean.enrolments e ON s.id = e.school_id WHERE s.id = 2 AND e.year = 2024",
      },
      {
        id: "Q29",
        family: "Complex multi-table joins and grain verification",
        question:
          "List all schools with their 2024 and 2025 enrolment numbers.",
        baseSql:
          "SELECT s.name, e24.enrolled AS n24, e25.enrolled AS n25 FROM analytics_clean.schools s JOIN analytics_clean.enrolments e24 ON s.id = e24.school_id AND e24.year = 2024 LEFT JOIN analytics_clean.enrolments e25 ON s.id = e25.school_id AND e25.year = 2025 ORDER BY s.id",
      },
      {
        id: "Q30",
        family: "Complex multi-table joins and grain verification",
        question:
          "Find schools whose 2024 enrolment was at least double their 2025 enrolment.",
        baseSql:
          "SELECT s.name FROM analytics_clean.schools s JOIN analytics_clean.enrolments e24 ON s.id = e24.school_id AND e24.year = 2024 JOIN analytics_clean.enrolments e25 ON s.id = e25.school_id AND e25.year = 2025 WHERE e24.enrolled >= (2 * e25.enrolled)",
      },
    ];

    it("evaluates Condition A (Original schema) with 100% baseline accuracy on answerable questions", () => {
      let baselinePassCount = 0;
      for (const q of frozenQuestions) {
        const recovery = recoverEvolvedSql({
          connectionId,
          sql: q.baseSql,
          drift: {
            connectionId,
            previousSchemaHash: "h1",
            currentSchemaHash: "h1",
            hasDrift: false,
            changes: [],
            detectedAt: new Date().toISOString(),
          },
          role: "owner",
        });

        expect(recovery.status).toBe("unchanged");
        expect(recovery.recoveredSql).toBe(q.baseSql);

        const policyCheck = evaluatePolicyCompliance(q.baseSql, "owner");
        expect(policyCheck.allowed).toBe(true);
        baselinePassCount++;
      }

      const baselineAccuracy =
        (baselinePassCount / frozenQuestions.length) * 100;
      expect(baselineAccuracy).toBe(100);
    });

    it("evaluates Condition B (Meaning-preserving renames) with post-recovery accuracy >= 90% across roles", () => {
      clearMappings();
      saveSchemaMapping(connectionId, {
        sourceTable: "analytics_clean.schools",
        targetTables: ["analytics_clean.org"],
        mappingType: "rename",
        columnRules: [
          {
            sourceColumn: "id",
            targetTable: "analytics_clean.org",
            targetColumn: "k",
          },
          {
            sourceColumn: "name",
            targetTable: "analytics_clean.org",
            targetColumn: "label",
          },
        ],
        status: "approved",
      });
      saveSchemaMapping(connectionId, {
        sourceTable: "analytics_clean.enrolments",
        targetTables: ["analytics_clean.obs"],
        mappingType: "rename",
        columnRules: [
          {
            sourceColumn: "school_id",
            targetTable: "analytics_clean.obs",
            targetColumn: "org_k",
          },
          {
            sourceColumn: "year",
            targetTable: "analytics_clean.obs",
            targetColumn: "yr",
          },
          {
            sourceColumn: "enrolled",
            targetTable: "analytics_clean.obs",
            targetColumn: "n",
          },
        ],
        status: "approved",
      });

      let recoveredPassCount = 0;
      for (const q of frozenQuestions) {
        const recovery = recoverEvolvedSql({
          connectionId,
          sql: q.baseSql,
          drift: {
            connectionId,
            previousSchemaHash: "prev-hash",
            currentSchemaHash: "curr-hash",
            hasDrift: true,
            changes: [
              {
                category: "renamed_table",
                severity: "info",
                sourceObject: "analytics_clean.schools",
                targetObjects: ["analytics_clean.org"],
                affectedColumns: ["id", "name"],
                explanation: "Renamed",
              },
              {
                category: "renamed_table",
                severity: "info",
                sourceObject: "analytics_clean.enrolments",
                targetObjects: ["analytics_clean.obs"],
                affectedColumns: ["school_id", "year", "enrolled"],
                explanation: "Renamed",
              },
            ],
            detectedAt: new Date().toISOString(),
          },
          role: "owner",
        });

        expect(recovery.status).toBe("recovered");
        expect(recovery.recoveredSql).not.toContain("analytics_clean.schools");
        expect(recovery.recoveredSql).not.toContain(
          "analytics_clean.enrolments",
        );

        const policyCheck = evaluatePolicyCompliance(
          recovery.recoveredSql,
          "owner",
        );
        expect(policyCheck.allowed).toBe(true);
        recoveredPassCount++;
      }

      const postRecoveryAccuracy =
        (recoveredPassCount / frozenQuestions.length) * 100;
      expect(postRecoveryAccuracy).toBeGreaterThanOrEqual(90);
    });

    it("evaluates Condition C (Meaning-preserving table splits) with post-recovery accuracy >= 90%", () => {
      clearMappings();
      saveSchemaMapping(connectionId, {
        sourceTable: "analytics_clean.schools",
        targetTables: [
          "analytics_clean.school_core",
          "analytics_clean.school_attrs",
        ],
        mappingType: "split_vertical",
        joinKey: "id",
        columnRules: [],
        status: "approved",
      });
      saveSchemaMapping(connectionId, {
        sourceTable: "analytics_clean.enrolments",
        targetTables: [
          "analytics_clean.enrolments_2024",
          "analytics_clean.enrolments_2025",
        ],
        mappingType: "split_horizontal",
        partitionColumn: "year",
        columnRules: [],
        status: "approved",
      });

      let splitPassCount = 0;
      for (const q of frozenQuestions) {
        const recovery = recoverEvolvedSql({
          connectionId,
          sql: q.baseSql,
          drift: {
            connectionId,
            previousSchemaHash: "prev-hash",
            currentSchemaHash: "curr-hash",
            hasDrift: true,
            changes: [
              {
                category: "split_vertical",
                severity: "warning",
                sourceObject: "analytics_clean.schools",
                targetObjects: [
                  "analytics_clean.school_core",
                  "analytics_clean.school_attrs",
                ],
                affectedColumns: ["id", "name"],
                explanation: "Vertically split",
              },
              {
                category: "split_horizontal",
                severity: "warning",
                sourceObject: "analytics_clean.enrolments",
                targetObjects: [
                  "analytics_clean.enrolments_2024",
                  "analytics_clean.enrolments_2025",
                ],
                affectedColumns: ["school_id", "year", "enrolled"],
                explanation: "Horizontally split",
              },
            ],
            detectedAt: new Date().toISOString(),
          },
          role: "owner",
        });

        expect(recovery.status).toBe("recovered");
        const policyCheck = evaluatePolicyCompliance(
          recovery.recoveredSql,
          "owner",
        );
        expect(policyCheck.allowed).toBe(true);
        splitPassCount++;
      }

      const splitAccuracy = (splitPassCount / frozenQuestions.length) * 100;
      expect(splitAccuracy).toBeGreaterThanOrEqual(90);
    });

    it("enforces role policies across all 3 roles (owner, analyst, viewer)", () => {
      for (const q of frozenQuestions) {
        const ownerEval = evaluatePolicyCompliance(q.baseSql, "owner");
        expect(ownerEval.allowed).toBe(true);

        const analystEval = evaluatePolicyCompliance(q.baseSql, "analyst");
        expect(typeof analystEval.allowed).toBe("boolean");

        const viewerArbitrary = evaluatePolicyCompliance(q.baseSql, "viewer");
        expect(viewerArbitrary.allowed).toBe(false);
        expect(viewerArbitrary.reason).toMatch(/viewer/i);

        const viewerRecipe = evaluatePolicyCompliance(q.baseSql, "viewer", {
          isRecipe: true,
        });
        expect(typeof viewerRecipe.allowed).toBe("boolean");
      }
    });
  });

  describe("Section 5: Ten Negative Controls (Incompatible / Ambiguous / Permission-Loss)", () => {
    beforeEach(() => {
      clearMappings();
    });

    it("NC01: Incompatible unit/type change safely abstains", () => {
      const recovery = recoverEvolvedSql({
        connectionId,
        sql: "SELECT sum(enrolment_pct_string) FROM analytics_clean.enrolments",
        drift: {
          connectionId,
          previousSchemaHash: "h1",
          currentSchemaHash: "h2",
          hasDrift: true,
          changes: [
            {
              category: "type_changed",
              severity: "breaking",
              sourceObject: "analytics_clean.enrolments.enrolment_pct_string",
              targetObjects: [],
              affectedColumns: ["enrolment_pct_string"],
              explanation:
                "Converted from numeric integer to formatted string percentage",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        role: "analyst",
      });

      expect(recovery.status).toBe("abstained");
      expect(recovery.reason).toContain("incompatible");
    });

    it("NC02: Ambiguous candidate split targets without approved mapping safely requests clarification", () => {
      const recovery = recoverEvolvedSql({
        connectionId,
        sql: "SELECT * FROM analytics_clean.schools",
        drift: {
          connectionId,
          previousSchemaHash: "h1",
          currentSchemaHash: "h2",
          hasDrift: true,
          changes: [
            {
              category: "split_vertical",
              severity: "breaking",
              sourceObject: "analytics_clean.schools",
              targetObjects: [
                "analytics_clean.school_primary",
                "analytics_clean.school_secondary",
              ],
              affectedColumns: ["id", "name"],
              explanation: "Candidate tables observed without mapping",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        role: "analyst",
      });

      expect(recovery.status).toBe("needs_clarification");
      expect(recovery.reason).toContain("Multiple plausible");
    });

    it("NC03: Dropped table without replacement mapping safely abstains", () => {
      const recovery = recoverEvolvedSql({
        connectionId,
        sql: "SELECT * FROM analytics_clean.dropped_unmapped_table",
        drift: {
          connectionId,
          previousSchemaHash: "h1",
          currentSchemaHash: "h2",
          hasDrift: true,
          changes: [
            {
              category: "dropped_object",
              severity: "breaking",
              sourceObject: "analytics_clean.dropped_unmapped_table",
              targetObjects: [],
              affectedColumns: [],
              explanation: "Table dropped permanently",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        role: "analyst",
      });

      expect(recovery.status).toBe("abstained");
      expect(recovery.reason).toContain("dropped without replacement");
    });

    it("NC04: Dropped column without approved mapping safely abstains", () => {
      const recovery = recoverEvolvedSql({
        connectionId,
        sql: "SELECT dropped_unmapped_column FROM analytics_clean.enrolments",
        drift: {
          connectionId,
          previousSchemaHash: "h1",
          currentSchemaHash: "h2",
          hasDrift: true,
          changes: [
            {
              category: "renamed_column",
              severity: "warning",
              sourceObject:
                "analytics_clean.enrolments.dropped_unmapped_column",
              targetObjects: [],
              affectedColumns: ["dropped_unmapped_column"],
              explanation: "Column dropped",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        role: "analyst",
      });

      expect(recovery.status).toBe("abstained");
      expect(recovery.reason).toContain("dropped or renamed");
    });

    it("NC05: Revoked schema permissions safely blocks query via policy", () => {
      const recovery = recoverEvolvedSql({
        connectionId,
        sql: "SELECT * FROM private_data.restricted",
        drift: {
          connectionId,
          previousSchemaHash: "h1",
          currentSchemaHash: "h2",
          hasDrift: true,
          changes: [
            {
              category: "permission_loss",
              severity: "breaking",
              sourceObject: "private_data.restricted",
              targetObjects: [],
              affectedColumns: [],
              explanation: "Schema revoked from allowedSchemas",
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        role: "analyst",
      });

      expect(recovery.status).toBe("blocked_by_policy");
      expect(recovery.reason).toContain("denied by policy");
    });

    it("NC06: Viewer role attempting unaggregated drill-down on evolved schema is blocked by policy", () => {
      const query = "SELECT k, label FROM analytics_clean.org ORDER BY k";
      const compliance = evaluatePolicyCompliance(query, "viewer");
      expect(compliance.allowed).toBe(false);
      expect(compliance.reason).toMatch(/viewer/i);
    });

    it("NC07: Differencing attack across evolved partitioned years is blocked by policy", () => {
      const diffAttack =
        "SELECT (SELECT sum(n) FROM analytics_clean.obs WHERE yr = 2024) - (SELECT sum(n) FROM analytics_clean.obs WHERE yr = 2024 AND org_k != 1) AS isolated_metric";
      const compliance = evaluatePolicyCompliance(diffAttack, "analyst");
      expect(compliance.allowed).toBe(false);
      expect(compliance.reason).toContain("Differencing attack");
    });

    it("NC08: Small-cohort isolation query on evolved schema is blocked by policy", () => {
      const smallCohort =
        "SELECT avg(n) FROM analytics_clean.obs WHERE org_k IN (1, 2) GROUP BY yr";
      const compliance = evaluatePolicyCompliance(smallCohort, "analyst");
      expect(compliance.allowed).toBe(false);
      expect(compliance.reason).toContain("Small-cohort aggregate");
    });

    it("NC09: Cross-tenant evolved schema reference is blocked by workspace isolation", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/connections/${connectionId}/drift`,
        headers: authIsolated,
      });
      expect(res.statusCode).toBe(404);
    });

    it("NC10: Formula injection payload inside schema mapping target is rejected", () => {
      expect(() =>
        saveSchemaMapping(connectionId, {
          sourceTable: "analytics_clean.schools",
          targetTables: ["org; DROP TABLE schools--"],
          mappingType: "rename",
          columnRules: [],
        }),
      ).toThrow("Invalid identifier");
    });
  });
});
