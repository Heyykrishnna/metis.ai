import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import {
  clearAuditEvents,
  exportAuditEvents,
  getGovernanceReviews,
  getReadinessReport,
  queryAuditEvents,
  recordAuditEvent,
  redactSensitiveData,
} from "../src/analysis/governance.js";
import {
  clearMappings,
  createSchemaMapping,
  approveSchemaMapping,
} from "../src/analysis/drift.js";
import { clearMemoryRecipes } from "../src/routes/recipes.js";
import {
  resetRevocations,
  revokeSubjectAccess,
} from "../src/security/policies.js";
import { clearConversations } from "../src/analysis/conversations.js";
import { setMemoryConnection } from "../src/routes/connections.js";
import type { ConnectorAdapter } from "../src/sql/connectors.js";
import type { DiscoveredSchema } from "../src/analysis/schema.js";

const testSchemaOriginal: DiscoveredSchema = {
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
      foreignKeys: [],
      rowCount: 12,
    },
  ],
};

const testSchemaSplit: DiscoveredSchema = {
  tables: [
    {
      schema: "analytics_clean",
      name: "school_core",
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
      name: "school_attrs",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "region", type: "text", nullable: false },
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
      foreignKeys: [],
      rowCount: 12,
    },
  ],
};

const mockAdapter: ConnectorAdapter = {
  id: "test-adapter",
  dialect: "PostgreSQL",
  async query(input) {
    const sql = input.sql;
    if (sql.includes("information_schema.tables")) {
      return {
        columns: ["schema", "name"],
        rows: [
          { schema: "analytics_clean", name: "schools" },
          { schema: "analytics_clean", name: "enrolments" },
        ],
      };
    }
    if (sql.includes("information_schema.columns")) {
      return {
        columns: ["schema", "table_name", "name", "type", "nullable"],
        rows: [
          {
            schema: "analytics_clean",
            table_name: "schools",
            name: "id",
            type: "integer",
            nullable: false,
          },
          {
            schema: "analytics_clean",
            table_name: "schools",
            name: "name",
            type: "text",
            nullable: false,
          },
          {
            schema: "analytics_clean",
            table_name: "enrolments",
            name: "school_id",
            type: "integer",
            nullable: false,
          },
          {
            schema: "analytics_clean",
            table_name: "enrolments",
            name: "year",
            type: "integer",
            nullable: false,
          },
          {
            schema: "analytics_clean",
            table_name: "enrolments",
            name: "enrolled",
            type: "integer",
            nullable: true,
          },
        ],
      };
    }
    return {
      columns: ["school_id", "delta"],
      rows: [
        { school_id: 1, delta: -20 },
        { school_id: 4, delta: -10 },
      ],
    };
  },
};

const testWsId = "00000000-0000-4000-8000-000000000001";
function makeAuth(subject: string, role: "owner" | "analyst" | "viewer") {
  return {
    authorization: `Bearer ${subject}:${testWsId}:${role}`,
  };
}

describe("Phase 9: Governed collaboration and organization release", () => {
  let app: App;

  beforeEach(async () => {
    clearAuditEvents();
    clearMappings();
    clearMemoryRecipes();
    clearConversations();
    resetRevocations();

    setMemoryConnection({
      id: "00000000-0000-4000-8000-000000000002",
      workspaceId: testWsId,
      name: "Test Analytics DB",
      engine: "PostgreSQL",
      allowedSchemas: ["analytics_clean"],
      status: "ready",
    });

    app = await buildApp({
      adapter: mockAdapter,
    });
  });

  afterEach(async () => {
    clearAuditEvents();
    clearMappings();
    clearMemoryRecipes();
    clearConversations();
    resetRevocations();
    await app.close();
  });

  describe("1. Recipe lifecycle, audience scoping, and reauthorization", () => {
    it("manages recipe transitions: draft -> reviewed -> published -> retired with attribution", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/recipes",
        headers: makeAuth("author-alice", "analyst"),
        payload: {
          name: "Annual Enrolment Decline",
          metricName: "enrolment_decline",
          connectionId: "00000000-0000-4000-8000-000000000002",
          question: "Which schools declined between 2024 and 2025?",
          plan: { grain: ["school_id"], timeframe: "calendar" },
          sqlText:
            "SELECT school_id, delta FROM analytics_clean.enrolments WHERE year = 2025",
          grain: ["school_id"],
          timeframePolicy: "calendar",
          nullExclusionPolicy: "exclude_nulls",
          approvalStatus: "draft",
          audienceScope: "private",
        },
      });

      expect(createRes.statusCode).toBe(201);
      const created = createRes.json();
      expect(created.approvalStatus).toBe("draft");
      expect(created.audienceScope).toBe("private");
      expect(created.version).toBe(1);

      const viewerReviewRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${created.id}/review`,
        headers: makeAuth("viewer-bob", "viewer"),
      });
      expect(viewerReviewRes.statusCode).toBe(403);

      const reviewRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${created.id}/review`,
        headers: makeAuth("steward-charlie", "owner"),
      });
      expect(reviewRes.statusCode).toBe(200);
      const reviewed = reviewRes.json();
      expect(reviewed.approvalStatus).toBe("reviewed");
      expect(reviewed.reviewedBy).toBe("steward-charlie");
      expect(reviewed.reviewedAt).toBeDefined();

      const publishRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${created.id}/publish`,
        headers: makeAuth("publisher-dave", "owner"),
        payload: {
          audienceScope: "workspace",
          changeDescription: "Published for organization-wide analysis",
        },
      });
      expect(publishRes.statusCode).toBe(200);
      const published = publishRes.json();
      expect(published.approvalStatus).toBe("published");
      expect(published.audienceScope).toBe("workspace");
      expect(published.publishedBy).toBe("publisher-dave");
      expect(published.version).toBe(2);
      expect(published.versionHistory).toHaveLength(2);

      const retireRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${created.id}/retire`,
        headers: makeAuth("steward-charlie", "owner"),
      });
      expect(retireRes.statusCode).toBe(200);
      const retired = retireRes.json();
      expect(retired.approvalStatus).toBe("retired");
      expect(retired.retiredBy).toBe("steward-charlie");
      expect(retired.retiredAt).toBeDefined();

      const execRetiredRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${created.id}/execute`,
        headers: makeAuth("analyst-1", "analyst"),
      });
      expect(execRetiredRes.statusCode).toBe(400);
      expect(execRetiredRes.json().message).toContain("retired");
    });

    it("enforces audience scope and role policies during recipe execution", async () => {
      const privateRecipeRes = await app.inject({
        method: "POST",
        url: "/v1/recipes",
        headers: makeAuth("author-alice", "analyst"),
        payload: {
          name: "Private Analyst Metric",
          metricName: "private_metric",
          connectionId: "00000000-0000-4000-8000-000000000002",
          question: "Private metric question",
          plan: { grain: ["school_id"] },
          sqlText:
            "SELECT school_id, delta FROM analytics_clean.enrolments WHERE year = 2025",
          grain: ["school_id"],
          timeframePolicy: "calendar",
          nullExclusionPolicy: "exclude_nulls",
          approvalStatus: "draft",
          audienceScope: "private",
        },
      });
      const privateRecipe = privateRecipeRes.json();

      const execOtherAnalystRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${privateRecipe.id}/execute`,
        headers: makeAuth("analyst-bob", "analyst"),
      });
      expect(execOtherAnalystRes.statusCode).toBe(403);
      expect(execOtherAnalystRes.json().message).toContain("private to author");

      await app.inject({
        method: "POST",
        url: `/v1/recipes/${privateRecipe.id}/publish`,
        headers: makeAuth("owner-1", "owner"),
        payload: {
          audienceScope: "role_restricted",
          changeDescription: "Restricted to analysts",
        },
      });

      const execViewerRestrictedRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${privateRecipe.id}/execute`,
        headers: makeAuth("viewer-carol", "viewer"),
      });
      expect(execViewerRestrictedRes.statusCode).toBe(403);
      expect(execViewerRestrictedRes.json().message).toContain("restricted");

      await app.inject({
        method: "POST",
        url: `/v1/recipes/${privateRecipe.id}/publish`,
        headers: makeAuth("owner-1", "owner"),
        payload: {
          audienceScope: "workspace",
          changeDescription: "Opened to workspace",
        },
      });

      const execViewerAllowedRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${privateRecipe.id}/execute`,
        headers: makeAuth("viewer-carol", "viewer"),
      });
      expect(execViewerAllowedRes.statusCode).toBe(202);
    });
  });

  describe("2. Redacted audit trail, tamper-evidence, and role-scoped visibility", () => {
    it("records all 7 audit categories with automated sensitive data redaction", () => {
      const event1 = recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "policy_change",
        action: "role_provisioning",
        actorSubject: "owner-1",
        actorRole: "owner",
        resourceId: "membership-1",
        requestId: "req-01",
        details: {
          role: "analyst",
          secretReference: "secret://vault/credentials/postgres",
          token: "Bearer super-secret-token",
        },
      });

      expect(event1.details.secretReference).toBe("[REDACTED SECRET]");
      expect(event1.details.token).toBe("[REDACTED SECRET]");
      expect(event1.tamperEvidenceHash).toHaveLength(64);

      const event2 = recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "denied_attempt",
        action: "blocked_malicious_sql",
        actorSubject: "analyst-2",
        actorRole: "analyst",
        resourceId: "query-1",
        requestId: "req-02",
        details: {
          sql: "SELECT * FROM users; DROP TABLE students;--",
          reason: "SQL injection attempted",
        },
      });

      expect(event2.details.sql).toBe("[REDACTED BLOCKED QUERY]");
      expect(event2.tamperEvidenceHash).not.toBe(event1.tamperEvidenceHash);

      recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "conversation_context",
        action: "context_updated",
        actorSubject: "analyst-1",
        actorRole: "analyst",
        resourceId: "run-101",
        requestId: "req-03",
      });

      recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "schema_recovery",
        action: "mapping_approved",
        actorSubject: "steward-1",
        actorRole: "owner",
        resourceId: "map-201",
        requestId: "req-04",
      });

      recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "recipe_lifecycle",
        action: "recipe_published",
        actorSubject: "publisher-1",
        actorRole: "analyst",
        resourceId: "recipe-301",
        requestId: "req-05",
      });

      recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "access_review",
        action: "connection_revoked",
        actorSubject: "owner-1",
        actorRole: "owner",
        resourceId: "conn-401",
        requestId: "req-06",
      });

      recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "export_decision",
        action: "truth_ledger_exported",
        actorSubject: "analyst-1",
        actorRole: "analyst",
        resourceId: "export-501",
        requestId: "req-07",
      });

      const ownerQuery = queryAuditEvents({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        role: "owner",
      });
      expect(ownerQuery.total).toBe(7);

      const analystQuery = queryAuditEvents({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        role: "analyst",
      });
      expect(analystQuery.total).toBe(6);

      const viewerQuery = queryAuditEvents({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        role: "viewer",
        actorSubject: "viewer-nobody",
      });
      expect(viewerQuery.total).toBe(1);
      expect(viewerQuery.events[0]?.category).toBe("recipe_lifecycle");

      const redacted = redactSensitiveData({
        apiKey: "sk-1234567890abcdef",
        password: "super-secret-password",
        sqlText: "SELECT * FROM users; DROP TABLE students;",
        normal: "safe-value",
      }) as Record<string, unknown>;
      expect(redacted.apiKey).toBe("[REDACTED SECRET]");
      expect(redacted.password).toBe("[REDACTED SECRET]");
      expect(redacted.sqlText).toBe("[REDACTED BLOCKED QUERY]");
      expect(redacted.normal).toBe("safe-value");
    });

    it("exports audit trail to JSON and CSV with formula injection defense", async () => {
      recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "policy_change",
        action: "=cmd|' /C calc'!A0",
        actorSubject: "owner-1",
        actorRole: "owner",
        resourceId: "resource-1",
        requestId: "req-formula",
      });

      const jsonExport = exportAuditEvents({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        role: "owner",
        format: "json",
      });
      const parsedJson = JSON.parse(jsonExport);
      expect(Array.isArray(parsedJson)).toBe(true);
      expect(parsedJson).toHaveLength(1);

      const csvExport = exportAuditEvents({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        role: "owner",
        format: "csv",
      });
      expect(csvExport).toContain("'=cmd|' /C calc'!A0");

      const exportRes = await app.inject({
        method: "GET",
        url: "/v1/audit/export?format=csv",
        headers: {
          authorization: "Bearer test-token",
          "x-test-subject": "owner-1",
          "x-test-role": "owner",
        },
      });
      expect(exportRes.statusCode).toBe(200);
      expect(exportRes.headers["content-type"]).toContain("text/csv");
      expect(exportRes.payload).toContain("tamperEvidenceHash");
    });
  });

  describe("3. Readiness dashboard, release candidate manifest, and in-app review tasks", () => {
    it("returns comprehensive readiness dashboard and consolidated G6-G9 metrics", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/governance/readiness",
        headers: {
          authorization: "Bearer test-token",
          "x-test-subject": "release-lead",
          "x-test-role": "owner",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe("ready_for_release");
      expect(data.candidateVersion).toBe("1.0.0-rc1");

      const manifest = data.releaseManifest;
      expect(manifest.modelArtifacts).toBeDefined();
      expect(manifest.promptTemplates).toBeDefined();
      expect(manifest.policyEngine.version).toBe("2026.10.24");
      expect(manifest.measuredLimits.maxReturnedRows).toBe(1000);
      expect(manifest.reviewerSignOffs.securityLead).toContain("APPROVED");
      expect(manifest.reviewerSignOffs.evaluationLead).toContain("APPROVED");
      expect(manifest.reviewerSignOffs.productLead).toContain("APPROVED");

      const coverage = data.requirementCoverage;
      expect(coverage).toHaveLength(13);
      const reqIds = coverage.map(
        (r: { requirementId: string }) => r.requirementId,
      );
      expect(reqIds).toEqual([
        "E01",
        "E02",
        "E03",
        "E04",
        "E05",
        "E06",
        "E07",
        "E08",
        "E09",
        "E10",
        "E11",
        "E12",
        "E13",
      ]);

      const metrics = data.gateMetrics;
      expect(metrics.g6OrganizationPermissions.attackPassRate).toBe(1.0);
      expect(metrics.g7ConversationalFollowUps.clarificationPrecision).toBe(
        1.0,
      );
      expect(metrics.g8SchemaEvolutionRecovery.conditionBAccuracy).toBe(1.0);
      expect(metrics.g9GovernedCollaboration.tamperEvidenceChaining).toBe(true);

      const directReport = getReadinessReport(
        "00000000-0000-4000-8000-000000000001",
      );
      expect(directReport.candidateVersion).toBe("1.0.0-rc1");
    });

    it("lists pending in-app review tasks for schema mappings and recipe publication", async () => {
      createSchemaMapping({
        connectionId: "00000000-0000-4000-8000-000000000002",
        sourceTable: "analytics_clean.enrolments",
        targetTables: ["analytics_clean.obs"],
        mappingType: "rename",
        columnRules: [
          {
            sourceColumn: "school_id",
            targetTable: "analytics_clean.obs",
            targetColumn: "org_k",
          },
        ],
      });

      const res = await app.inject({
        method: "GET",
        url: "/v1/governance/reviews",
        headers: makeAuth("steward-1", "owner"),
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.tasks.length).toBeGreaterThanOrEqual(1);
      expect(data.pendingCount).toBeGreaterThanOrEqual(1);
      expect(data.tasks[0].taskType).toBe("schema_mapping");

      const directReviews = getGovernanceReviews(
        "00000000-0000-4000-8000-000000000001",
      );
      expect(directReviews.tasks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("4. Combined stress scenarios (PRD Section 20)", () => {
    it("Scenario 1: Published recipe receives follow-up after table split and role downgrade", async () => {
      app.orchestrator.setBaselineSchema(
        "00000000-0000-4000-8000-000000000002",
        testSchemaOriginal,
      );

      const splitAdapter: ConnectorAdapter = {
        id: "split-adapter",
        dialect: "PostgreSQL",
        async query(input) {
          if (input.sql.includes("information_schema.tables")) {
            return {
              columns: ["schema", "name"],
              rows: [
                { schema: "analytics_clean", name: "school_core" },
                { schema: "analytics_clean", name: "school_attrs" },
                { schema: "analytics_clean", name: "enrolments" },
              ],
            };
          }
          if (input.sql.includes("information_schema.columns")) {
            return {
              columns: ["schema", "table_name", "name", "type", "nullable"],
              rows: [
                {
                  schema: "analytics_clean",
                  table_name: "school_core",
                  name: "id",
                  type: "integer",
                  nullable: false,
                },
                {
                  schema: "analytics_clean",
                  table_name: "school_core",
                  name: "name",
                  type: "text",
                  nullable: false,
                },
                {
                  schema: "analytics_clean",
                  table_name: "school_attrs",
                  name: "id",
                  type: "integer",
                  nullable: false,
                },
                {
                  schema: "analytics_clean",
                  table_name: "school_attrs",
                  name: "region",
                  type: "text",
                  nullable: false,
                },
                {
                  schema: "analytics_clean",
                  table_name: "enrolments",
                  name: "school_id",
                  type: "integer",
                  nullable: false,
                },
                {
                  schema: "analytics_clean",
                  table_name: "enrolments",
                  name: "year",
                  type: "integer",
                  nullable: false,
                },
                {
                  schema: "analytics_clean",
                  table_name: "enrolments",
                  name: "enrolled",
                  type: "integer",
                  nullable: true,
                },
              ],
            };
          }
          if (input.sql.includes("count(*)")) {
            return { columns: ["cnt"], rows: [{ cnt: 6 }] };
          }
          return {
            columns: ["school_id", "delta"],
            rows: [
              { school_id: 1, delta: -20 },
              { school_id: 4, delta: -10 },
            ],
          };
        },
      };

      const splitApp = await buildApp({ adapter: splitAdapter });
      splitApp.orchestrator.setBaselineSchema(
        "00000000-0000-4000-8000-000000000002",
        testSchemaOriginal,
      );
      expect(testSchemaSplit.tables).toHaveLength(3);

      const mapping = createSchemaMapping({
        connectionId: "00000000-0000-4000-8000-000000000002",
        sourceTable: "analytics_clean.schools",
        targetTables: [
          "analytics_clean.school_core",
          "analytics_clean.school_attrs",
        ],
        mappingType: "split_vertical",
        joinKey: "id",
        columnRules: [
          {
            sourceColumn: "id",
            targetTable: "analytics_clean.school_core",
            targetColumn: "id",
          },
          {
            sourceColumn: "name",
            targetTable: "analytics_clean.school_core",
            targetColumn: "name",
          },
          {
            sourceColumn: "region",
            targetTable: "analytics_clean.school_attrs",
            targetColumn: "region",
          },
        ],
      });
      approveSchemaMapping(
        "00000000-0000-4000-8000-000000000002",
        mapping.id,
        "steward-1",
      );

      const analystRun = await splitApp.orchestrator.executeAnalysis({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        connectionId: "00000000-0000-4000-8000-000000000002",
        allowedSchemas: ["analytics_clean"],
        question: "Show schools that declined in enrolment",
        sqlOverride:
          "SELECT schools.id, schools.name FROM analytics_clean.schools",
        role: "analyst",
      });

      expect(analystRun.status).toBe("answered");
      const evidence = await splitApp.orchestrator.getEvidence(
        analystRun.runId,
      );
      expect(evidence.candidate?.sqlText).toContain("JOIN");

      const downgradedViewerRun = await splitApp.orchestrator.executeAnalysis({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        connectionId: "00000000-0000-4000-8000-000000000002",
        allowedSchemas: ["analytics_clean"],
        question: "Show individual school raw records",
        sqlOverride: "SELECT * FROM analytics_clean.schools WHERE id = 1",
        role: "viewer",
        parentRunId: analystRun.runId,
      });

      expect(downgradedViewerRun.status).toBe("blocked_by_policy");
      await splitApp.close();
    });

    it("Scenario 2: Poisoned metadata or malicious mapping injection is rejected by validation", async () => {
      expect(() => {
        createSchemaMapping({
          connectionId: "00000000-0000-4000-8000-000000000002",
          sourceTable: "analytics_clean.enrolments",
          targetTables: ["analytics_clean.obs; DROP TABLE students;--"],
          mappingType: "rename",
          columnRules: [
            {
              sourceColumn: "school_id",
              targetTable: "analytics_clean.obs",
              targetColumn: "org_k",
            },
          ],
        });
      }).toThrow(/Invalid identifier/);

      recordAuditEvent({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "denied_attempt",
        action: "malicious_mapping_rejected",
        actorSubject: "attacker-1",
        actorRole: "analyst",
        resourceId: "mapping-poison-attempt",
        requestId: "req-poison",
        details: {
          payload: "DROP TABLE students",
        },
      });

      const audit = queryAuditEvents({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        category: "denied_attempt",
      });
      expect(audit.total).toBe(1);
    });

    it("Scenario 3: Revoked viewer attempting to reconnect to earlier stream/export fails closed", async () => {
      const activeRun = await app.orchestrator.executeAnalysis({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        connectionId: "00000000-0000-4000-8000-000000000002",
        allowedSchemas: ["analytics_clean"],
        question: "Approved aggregate trend?",
        sqlOverride:
          "SELECT school_id, count(*) FROM analytics_clean.enrolments GROUP BY school_id",
        role: "viewer",
        actorSubject: "viewer-frank",
        isRecipe: true,
      });
      expect(activeRun.status).toBe("answered");

      revokeSubjectAccess("viewer-frank");

      const followUpRun = await app.orchestrator.executeAnalysis({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        connectionId: "00000000-0000-4000-8000-000000000002",
        allowedSchemas: ["analytics_clean"],
        question: "Attempted query after revocation",
        sqlOverride:
          "SELECT school_id, count(*) FROM analytics_clean.enrolments GROUP BY school_id",
        role: "viewer",
        actorSubject: "viewer-frank",
        isRecipe: true,
      });

      expect(followUpRun.status).toBe("blocked_by_policy");

      const exportRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${activeRun.runId}/export/csv`,
        headers: makeAuth("viewer-frank", "viewer"),
      });
      expect(exportRes.statusCode).toBe(403);
    });

    it("handles concurrent principals and maintains connection pool isolation", async () => {
      const runPromises = [
        app.orchestrator.executeAnalysis({
          workspaceId: "00000000-0000-4000-8000-000000000001",
          connectionId: "00000000-0000-4000-8000-000000000002",
          allowedSchemas: ["analytics_clean"],
          question: "Owner analysis query",
          sqlOverride: "SELECT * FROM analytics_clean.schools",
          role: "owner",
          actorSubject: "principal-owner",
        }),
        app.orchestrator.executeAnalysis({
          workspaceId: "00000000-0000-4000-8000-000000000001",
          connectionId: "00000000-0000-4000-8000-000000000002",
          allowedSchemas: ["analytics_clean"],
          question: "Analyst analysis query",
          sqlOverride:
            "SELECT school_id, count(*) FROM analytics_clean.enrolments GROUP BY school_id",
          role: "analyst",
          actorSubject: "principal-analyst",
        }),
        app.orchestrator.executeAnalysis({
          workspaceId: "00000000-0000-4000-8000-000000000001",
          connectionId: "00000000-0000-4000-8000-000000000002",
          allowedSchemas: ["analytics_clean"],
          question: "Viewer unauthorized unaggregated query",
          sqlOverride: "SELECT * FROM analytics_clean.schools",
          role: "viewer",
          actorSubject: "principal-viewer",
        }),
      ];

      const results = await Promise.all(runPromises);
      const resOwner = results[0];
      const resAnalyst = results[1];
      const resViewer = results[2];

      expect(resOwner?.status).toBe("answered");
      expect(resAnalyst?.status).toBe("answered");
      expect(resViewer?.status).toBe("blocked_by_policy");
    });
  });
});
