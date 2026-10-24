import { afterEach, expect, it, vi } from "vitest";
import {
  getHealth,
  getConnections,
  createConnection,
  testConnection,
  revokeConnection,
  getSchemaConstellation,
  submitAnalysis,
  getRun,
  getRunResult,
  getRunEvidence,
  getTruthLedger,
  getDirtyRadar,
  reviewRadarAnomaly,
  getCounterfactuals,
  getQueryCostPassport,
  getRecipes,
  executeRecipe,
  submitFeedback,
  getExportUrl,
  getEffectivePolicy,
  simulatePolicy,
  getRunContext,
  getConnectionDrift,
  getImpactPreview,
  getConnectionMappings,
  createSchemaMapping,
  approveSchemaMapping,
  reviewRecipe,
  publishRecipe,
  retireRecipe,
  getAuditEvents,
  getAuditExportUrl,
  getGovernanceReviews,
  getGovernanceReadiness,
  type ConnectionInput,
} from "../src/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

it("rejects a successful HTTP response with an invalid health contract", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ status: "unknown", secret: "not-for-display" }),
      ),
  );
  await expect(getHealth("http://127.0.0.1:3001")).rejects.toThrow(
    "Invalid API health response",
  );
});

it("returns validated health from the implemented API", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
  );
  await expect(getHealth("http://127.0.0.1:3001")).resolves.toEqual({
    status: "ok",
  });
});

it("keeps internal server error text out of client errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("private-database-password", { status: 503 }),
      ),
  );
  await expect(getHealth("http://127.0.0.1:3001")).rejects.toThrow(
    "API request failed (503)",
  );
});

it("provides a safe network failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("private-host:password")),
  );
  await expect(getHealth("http://127.0.0.1:3001")).rejects.toThrow(
    "API unavailable",
  );
});

it("fetches, tests, creates, and revokes connections", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json([
        {
          id: "c1",
          name: "conn1",
          engine: "PostgreSQL",
          allowedSchemas: ["public"],
          status: "ready",
        },
      ]),
    )
    .mockResolvedValueOnce(Response.json({ status: "ready", readOnly: true }))
    .mockResolvedValueOnce(
      Response.json({
        id: "c2",
        name: "conn2",
        engine: "PostgreSQL",
        allowedSchemas: ["public"],
        status: "ready",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: "c2",
        name: "conn2",
        engine: "PostgreSQL",
        allowedSchemas: ["public"],
        status: "revoked",
      }),
    );

  vi.stubGlobal("fetch", fetchMock);

  const list = await getConnections();
  expect(list).toHaveLength(1);
  expect(list[0]?.id).toBe("c1");

  const input: ConnectionInput = {
    name: "conn2",
    engine: "PostgreSQL",
    host: "127.0.0.1",
    port: 5432,
    database: "analytics",
    username: "reader",
    secretReference: "secret://fixture/reader",
    allowedSchemas: ["public"],
  };

  const testRes = await testConnection(input);
  expect(testRes.readOnly).toBe(true);

  const created = await createConnection(input);
  expect(created.name).toBe("conn2");

  const revoked = await revokeConnection("c2");
  expect(revoked.status).toBe("revoked");
});

it("fetches constellation, runs, ledger, radar, and counterfactuals", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        connectionId: "c1",
        snapshotId: "s1",
        schemaHash: "h1",
        nodes: [],
        edges: [],
        generatedAt: new Date().toISOString(),
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        runId: "r1",
        workspaceId: "w1",
        connectionId: "c1",
        status: "planning",
        intent: { question: "Q?" },
        startedAt: new Date().toISOString(),
        completedAt: null,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        runId: "r1",
        status: "answered",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        answer: {
          runId: "r1",
          status: "answered",
          answerText: "Result answer",
          definition: "def",
          sqlReference: "SELECT 1",
          evidence: [],
          assumptions: [],
          limitations: [],
          resultReference: "ref",
        },
        columns: ["col"],
        rows: [{ col: "val" }],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        runId: "r1",
        question: "Q?",
        assumptions: [],
        exclusions: [],
        modelVersion: "m1",
        finalStatus: "answered",
        candidate: {
          candidateId: "cand1",
          dialect: "PostgreSQL",
          sqlText: "SELECT 1",
          referencedObjects: [],
          parameterDefinitions: [],
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        runId: "r1",
        status: "answered",
        claims: [],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        runId: "r1",
        totalScannedRows: 100,
        anomalies: [],
        generatedAt: new Date().toISOString(),
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        anomalyId: "a1",
        reviewState: "accepted",
        updated: true,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        primaryRunId: "r1",
        variants: [],
        differences: [],
        isMaterialDifference: false,
        recommendation: "stable",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        runId: "r1",
        measured: {
          durationMs: 42,
          rowCount: 1,
          returnedBytes: 50,
          modelCalls: 1,
          isMeasured: true,
        },
        limits: {
          timeoutMs: 1000,
          maxRows: 100,
          modelCallsLimit: 5,
          policyEnforced: true,
        },
        advisoryEstimate: {
          estimatedCost: 1,
          estimatedRows: 1,
          planType: "index_scan",
          warnings: [],
          isEstimated: true,
          isAvailable: true,
        },
        safetySummary: "Safe",
      }),
    );

  vi.stubGlobal("fetch", fetchMock);

  const constellation = await getSchemaConstellation("c1");
  expect(constellation.connectionId).toBe("c1");

  const run = await submitAnalysis({ connectionId: "c1", question: "Q?" });
  expect(run.runId).toBe("r1");

  const activeRun = await getRun("r1");
  expect(activeRun.status).toBe("answered");

  const result = await getRunResult("r1");
  expect(result.columns).toEqual(["col"]);

  const evidence = await getRunEvidence("r1");
  expect(evidence.finalStatus).toBe("answered");

  const ledger = await getTruthLedger("r1");
  expect(ledger.status).toBe("answered");

  const radar = await getDirtyRadar("r1");
  expect(radar.totalScannedRows).toBe(100);

  const reviewed = await reviewRadarAnomaly("r1", "a1", "accepted");
  expect(reviewed.updated).toBe(true);

  const cf = await getCounterfactuals("r1");
  expect(cf.isMaterialDifference).toBe(false);

  const passport = await getQueryCostPassport("r1");
  expect(passport.measured.durationMs).toBe(42);
});

it("supports recipes, feedback, and export url generation", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json([
        {
          id: "rec1",
          name: "Recipe 1",
          metricName: "ARR",
          version: 1,
          ownerSubject: "user",
          connectionId: "c1",
          question: "What is ARR?",
          plan: {},
          sqlText: "SELECT 1",
          grain: ["day"],
          timeframePolicy: "trailing_30d",
          nullExclusionPolicy: "exclude",
          approvalStatus: "approved",
          createdAt: new Date().toISOString(),
        },
      ]),
    )
    .mockResolvedValueOnce(
      Response.json({
        recipeId: "rec1",
        runId: "run-recipe-1",
        status: "planning",
      }),
    )
    .mockResolvedValueOnce(Response.json({ id: "fb1" }));

  vi.stubGlobal("fetch", fetchMock);

  const recipes = await getRecipes();
  expect(recipes).toHaveLength(1);
  expect(recipes[0]?.metricName).toBe("ARR");

  const execution = await executeRecipe("rec1");
  expect(execution.runId).toBe("run-recipe-1");

  const fb = await submitFeedback({
    runId: "run-recipe-1",
    rating: 5,
    category: "correctness",
    comment: "Accurate query",
  });
  expect(fb.id).toBe("fb1");

  expect(getExportUrl("r1", "csv")).toBe("/api/backend/v1/runs/r1/export/csv");
  expect(getExportUrl("r1", "sql")).toBe("/api/backend/v1/runs/r1/export/sql");
  expect(getExportUrl("r1", "reproducibility")).toBe(
    "/api/backend/v1/runs/r1/export/reproducibility",
  );
});

it("supports effective policy inspection and policy simulation", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        role: "viewer",
        policyVersion: "1.0.0",
        permittedActions: ["read_published", "run_approved_recipe"],
        rowBoundaryPredicate: "organization_id = CURRENT_ORG",
        allowedColumns: ["school_name", "enrolment_count"],
        restrictedColumns: ["id", "national_id"],
        smallCohortThreshold: 5,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        allowed: false,
        targetRole: "viewer",
        evaluatedPolicyVersion: "1.0.0",
        rowBoundaryPredicate: "organization_id = CURRENT_ORG",
        violations: ["direct_sql_not_permitted"],
        effectiveColumns: [],
        reason: "Role viewer is not permitted to execute arbitrary SQL",
      }),
    );

  vi.stubGlobal("fetch", fetchMock);

  const policy = await getEffectivePolicy("viewer");
  expect(policy.role).toBe("viewer");
  expect(policy.smallCohortThreshold).toBe(5);

  const sim = await simulatePolicy({
    targetRole: "viewer",
    sql: "SELECT * FROM analytics_clean.enrolments",
  });
  expect(sim.allowed).toBe(false);
  expect(sim.violations).toContain("direct_sql_not_permitted");
});

it("supports conversation context and delta retrieval", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    Response.json({
      runId: "r2",
      parentRunId: "r1",
      rootRunId: "r1",
      turnNumber: 2,
      activeContext: {
        connectionId: "c1",
        sources: ["analytics_clean.enrolments"],
        metric: "enrolment_decline",
        grain: ["school_id"],
        timeRange: { start: "2022", end: "2023", semantics: "calendar_year" },
        filters: [],
        confirmedAssumptions: [],
      },
      delta: {
        changedFields: ["timeRange"],
        previousValues: { timeRange: { start: "2024", end: "2025" } },
        newValues: { timeRange: { start: "2022", end: "2023" } },
        changeType: "refinement",
        explanation: "Constrained time range to 2023",
      },
      turns: [
        {
          turnNumber: 1,
          runId: "r1",
          parentRunId: null,
          question: "Initial question",
          status: "answered",
          activeContext: {
            connectionId: "c1",
            sources: ["analytics_clean.enrolments"],
            metric: "enrolment_decline",
            grain: ["school_id"],
            timeRange: null,
            filters: [],
            confirmedAssumptions: [],
          },
          delta: {
            changedFields: [],
            previousValues: {},
            newValues: {},
            changeType: "initial",
            explanation: "Initial turn",
          },
          createdAt: new Date().toISOString(),
        },
        {
          turnNumber: 2,
          runId: "r2",
          parentRunId: "r1",
          question: "Now for 2023",
          status: "answered",
          activeContext: {
            connectionId: "c1",
            sources: ["analytics_clean.enrolments"],
            metric: "enrolment_decline",
            grain: ["school_id"],
            timeRange: {
              start: "2022",
              end: "2023",
              semantics: "calendar_year",
            },
            filters: [],
            confirmedAssumptions: [],
          },
          delta: {
            changedFields: ["timeRange"],
            previousValues: { timeRange: { start: "2024", end: "2025" } },
            newValues: { timeRange: { start: "2022", end: "2023" } },
            changeType: "refinement",
            explanation: "Constrained time range to 2023",
          },
          createdAt: new Date().toISOString(),
        },
      ],
    }),
  );

  vi.stubGlobal("fetch", fetchMock);

  const context = await getRunContext("r2");
  expect(context.runId).toBe("r2");
  expect(context.turnNumber).toBe(2);
  expect(context.delta.changeType).toBe("refinement");
  expect(context.turns).toHaveLength(2);
});

it("fetches drift diff, impact preview, and manages schema mappings", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        connectionId: "conn-1",
        previousSchemaHash: "hash-prev",
        currentSchemaHash: "hash-curr",
        hasDrift: true,
        changes: [
          {
            category: "renamed_table",
            severity: "warning",
            sourceObject: "analytics_clean.schools",
            targetObjects: ["analytics_clean.org"],
            affectedColumns: ["school_id"],
            explanation: "Table renamed",
          },
        ],
        detectedAt: new Date().toISOString(),
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        connectionId: "conn-1",
        drift: {
          connectionId: "conn-1",
          previousSchemaHash: "hash-prev",
          currentSchemaHash: "hash-curr",
          hasDrift: true,
          changes: [],
          detectedAt: new Date().toISOString(),
        },
        affectedRecipes: [
          {
            recipeId: "rec-1",
            name: "School trends",
            status: "needs_update",
            staleObjects: ["analytics_clean.schools"],
            proposedUpdate: "Map to analytics_clean.org",
          },
        ],
        affectedContexts: [],
        recommendedActions: ["Approve pending schema mappings"],
      }),
    )
    .mockResolvedValueOnce(
      Response.json([
        {
          id: "map-1",
          connectionId: "conn-1",
          sourceTable: "analytics_clean.schools",
          targetTables: ["analytics_clean.org"],
          mappingType: "rename",
          columnRules: [
            {
              sourceColumn: "school_id",
              targetTable: "analytics_clean.org",
              targetColumn: "k",
            },
          ],
          status: "proposed",
          createdAt: new Date().toISOString(),
        },
      ]),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: "map-2",
        connectionId: "conn-1",
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
        status: "proposed",
        createdAt: new Date().toISOString(),
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: "map-2",
        connectionId: "conn-1",
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
        status: "approved",
        reviewedBy: "steward",
        reviewedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }),
    );

  vi.stubGlobal("fetch", fetchMock);

  const drift = await getConnectionDrift("conn-1");
  expect(drift.hasDrift).toBe(true);
  expect(drift.changes).toHaveLength(1);
  expect(drift.changes[0].category).toBe("renamed_table");

  const impact = await getImpactPreview("conn-1");
  expect(impact.affectedRecipes).toHaveLength(1);
  expect(impact.recommendedActions).toHaveLength(1);

  const mappings = await getConnectionMappings("conn-1");
  expect(mappings).toHaveLength(1);
  expect(mappings[0].id).toBe("map-1");

  const created = await createSchemaMapping("conn-1", {
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
  expect(created.id).toBe("map-2");
  expect(created.status).toBe("proposed");

  const approved = await approveSchemaMapping("conn-1", "map-2");
  expect(approved.id).toBe("map-2");
  expect(approved.status).toBe("approved");
});

it("supports recipe lifecycle transitions, audit logging, review tasks, and readiness manifest", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        id: "recipe-1",
        workspaceId: "ws-1",
        name: "Enrolment Trend",
        metricName: "trend",
        version: 1,
        ownerSubject: "analyst-1",
        connectionId: "conn-1",
        question: "trend?",
        plan: {},
        sqlText: "SELECT 1",
        grain: ["school_id"],
        timeframePolicy: "calendar",
        nullExclusionPolicy: "exclude",
        approvalStatus: "reviewed",
        reviewedBy: "steward-1",
        reviewedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: "recipe-1",
        workspaceId: "ws-1",
        name: "Enrolment Trend",
        metricName: "trend",
        version: 2,
        ownerSubject: "analyst-1",
        connectionId: "conn-1",
        question: "trend?",
        plan: {},
        sqlText: "SELECT 1",
        grain: ["school_id"],
        timeframePolicy: "calendar",
        nullExclusionPolicy: "exclude",
        approvalStatus: "published",
        audienceScope: "workspace",
        publishedBy: "publisher-1",
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: "recipe-1",
        workspaceId: "ws-1",
        name: "Enrolment Trend",
        metricName: "trend",
        version: 2,
        ownerSubject: "analyst-1",
        connectionId: "conn-1",
        question: "trend?",
        plan: {},
        sqlText: "SELECT 1",
        grain: ["school_id"],
        timeframePolicy: "calendar",
        nullExclusionPolicy: "exclude",
        approvalStatus: "retired",
        retiredBy: "steward-1",
        retiredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        events: [
          {
            id: "evt-1",
            workspaceId: "ws-1",
            category: "recipe_lifecycle",
            action: "recipe_published",
            actorSubject: "publisher-1",
            actorRole: "owner",
            resourceId: "recipe-1",
            requestId: "req-1",
            details: { name: "Enrolment Trend" },
            occurredAt: new Date().toISOString(),
            tamperEvidenceHash: "sha256-hash-1234567890abcdef1234567890abcdef",
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        tasks: [
          {
            id: "task-1",
            taskType: "recipe_publication",
            title: "Review Recipe",
            description: "Recipe requires approval",
            resourceId: "recipe-1",
            requestedBy: "analyst-1",
            requestedAt: new Date().toISOString(),
            status: "pending",
          },
        ],
        pendingCount: 1,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        candidateVersion: "1.0.0-rc1",
        status: "ready_for_release",
        releaseManifest: {
          candidateVersion: "1.0.0-rc1",
          modelArtifacts: { "gpt-4o": "sha256:123" },
          promptTemplates: { intent: "sha256:456" },
          policyEngine: { version: "2026.10.24" },
          runtimeEnvironment: { node: "v20" },
          measuredLimits: { maxTimeoutMs: 15000 },
          reviewerSignOffs: { securityLead: "approved" },
          recoveryInstructions: "Rollback instructions",
        },
        requirementCoverage: [
          {
            requirementId: "E11",
            title: "Governed collaboration",
            status: "passed",
            owner: "Product Lead",
            verifiedGate: "G9",
          },
        ],
        gateMetrics: {
          g6OrganizationPermissions: { attackPassRate: 1.0 },
          g7ConversationalFollowUps: { clarificationPrecision: 1.0 },
          g8SchemaEvolutionRecovery: { conditionBAccuracy: 1.0 },
          g9GovernedCollaboration: { tamperEvidenceChaining: true },
        },
        generatedAt: new Date().toISOString(),
      }),
    );

  vi.stubGlobal("fetch", fetchMock);

  const reviewed = await reviewRecipe("recipe-1");
  expect(reviewed.approvalStatus).toBe("reviewed");

  const published = await publishRecipe("recipe-1", {
    audienceScope: "workspace",
    changeDescription: "Organization publication",
  });
  expect(published.approvalStatus).toBe("published");
  expect(published.version).toBe(2);

  const retired = await retireRecipe("recipe-1");
  expect(retired.approvalStatus).toBe("retired");

  const audit = await getAuditEvents({ category: "recipe_lifecycle" });
  expect(audit.events).toHaveLength(1);
  expect(audit.events[0].action).toBe("recipe_published");

  expect(getAuditExportUrl("csv")).toBe(
    "/api/backend/v1/audit/export?format=csv",
  );

  const reviews = await getGovernanceReviews();
  expect(reviews.tasks).toHaveLength(1);
  expect(reviews.pendingCount).toBe(1);

  const readiness = await getGovernanceReadiness();
  expect(readiness.status).toBe("ready_for_release");
  expect(readiness.candidateVersion).toBe("1.0.0-rc1");
});
