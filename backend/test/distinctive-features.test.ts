import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { getDefaultSecretStore } from "../src/security/secrets.js";

describe("Phase 4: Distinctive analytical features (Constellation, Radar, Counterfactuals, Passport, Recipes)", () => {
  let app: App;
  const workspaceA = "00000000-0000-4000-8000-000000000001";
  const workspaceB = "00000000-0000-4000-8000-000000000002";
  const authA = { authorization: `Bearer analyst-a:${workspaceA}` };
  const authB = { authorization: `Bearer analyst-b:${workspaceB}` };

  let connectionId: string;
  let runId: string;

  beforeAll(async () => {
    app = await buildApp();
    const secrets = getDefaultSecretStore();
    await secrets.set("secret://fixture/reader", "fixture-password");

    const connRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authA,
      payload: {
        name: "Feature Test DB",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "metis_test",
        username: "metis_reader",
        secretReference: "secret://fixture/reader",
        allowedSchemas: ["analytics_clean"],
      },
    });
    connectionId = connRes.json().id;

    const runRes = await app.inject({
      method: "POST",
      url: "/v1/analyses",
      headers: authA,
      payload: {
        connectionId,
        question:
          "Which schools had lower enrolment in calendar 2025 than calendar 2024?",
      },
    });
    runId = runRes.json().runId;
  });

  afterAll(async () => {
    await app.close();
  });

  it("4A. generates Schema Constellation distinguishing declared FKs from candidate join inferences", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/connections/${connectionId}/constellation`,
      headers: authA,
    });
    expect(res.statusCode).toBe(200);
    const constellation = res.json();
    expect(constellation.connectionId).toBe(connectionId);
    expect(constellation.nodes.length).toBeGreaterThanOrEqual(2);

    const schoolNode = constellation.nodes.find(
      (n: { name: string }) => n.name === "schools",
    );
    expect(schoolNode).toBeDefined();

    const candidateEdge = constellation.edges.find(
      (e: { confidence: string }) => e.confidence === "inferred_name",
    );
    if (candidateEdge) {
      expect(candidateEdge.isAuthoritative).toBe(false);
      expect(candidateEdge.notes).toContain(
        "candidate join, not authoritative proof",
      );
    }

    const crossRes = await app.inject({
      method: "GET",
      url: `/v1/connections/${connectionId}/constellation`,
      headers: authB,
    });
    expect(crossRes.statusCode).toBe(404);
  });

  it("4B. scans Dirty-Value Radar for anomalies and manages anomaly review state", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/dirty-radar`,
      headers: authA,
    });
    expect(res.statusCode).toBe(200);
    const radar = res.json();
    expect(radar.runId).toBe(runId);
    expect(radar.anomalies.length).toBeGreaterThan(0);

    const anomaly = radar.anomalies[0];
    expect(anomaly.id).toBeDefined();
    expect(anomaly.reviewState).toBeDefined();

    const reviewRes = await app.inject({
      method: "POST",
      url: `/v1/runs/${runId}/dirty-radar/reviews/${anomaly.id}`,
      headers: authA,
      payload: { reviewState: "accepted" },
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json()).toEqual({
      anomalyId: anomaly.id,
      reviewState: "accepted",
      updated: true,
    });

    const crossRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/dirty-radar`,
      headers: authB,
    });
    expect(crossRes.statusCode).toBe(404);
  });

  it("4C. executes Counterfactual Comparison evaluating material semantic differences", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/counterfactuals`,
      headers: authA,
    });
    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.primaryRunId).toBe(runId);
    expect(report.variants.length).toBe(2);

    const calendarVariant = report.variants.find(
      (v: { id: string }) => v.id === "variant-calendar-year",
    );
    const academicVariant = report.variants.find(
      (v: { id: string }) => v.id === "variant-academic-year",
    );
    expect(calendarVariant).toBeDefined();
    expect(academicVariant).toBeDefined();
    expect(calendarVariant.rowCount).not.toBe(academicVariant.rowCount);

    expect(report.isMaterialDifference).toBe(true);
    expect(report.recommendation).toContain("Material differences observed");

    const crossRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/counterfactuals`,
      headers: authB,
    });
    expect(crossRes.statusCode).toBe(404);
  });

  it("4D. generates Query Cost Passport with measured stats and advisory plan bounds", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/passport`,
      headers: authA,
    });
    expect(res.statusCode).toBe(200);
    const passport = res.json();
    expect(passport.runId).toBe(runId);
    expect(passport.measured.isMeasured).toBe(true);
    expect(passport.limits.policyEnforced).toBe(true);
    expect(passport.advisoryEstimate.isEstimated).toBe(true);
    expect(passport.safetySummary).toContain(
      "cannot relax policy rules or override timeouts",
    );

    const crossRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/passport`,
      headers: authB,
    });
    expect(crossRes.statusCode).toBe(404);
  });

  it("4E. saves, lists, re-authorizes, and executes analysis recipes", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/recipes",
      headers: authA,
      payload: {
        name: "Annual Enrolment Decline Recipe",
        metricName: "enrolment_decline",
        connectionId,
        question: "Which schools declined between 2024 and 2025?",
        plan: {
          sources: ["analytics_clean.enrolments"],
          grain: ["school_id"],
        },
        sqlText:
          "SELECT current.school_id, current.enrolled - previous.enrolled AS delta FROM analytics_clean.enrolments current JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id WHERE current.year = 2025 AND previous.year = 2024 AND current.enrolled < previous.enrolled ORDER BY current.school_id;",
        grain: ["school_id"],
        timeframePolicy: "calendar_year",
        nullExclusionPolicy: "exclude_null_enrolments",
        approvalStatus: "approved",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const recipe = createRes.json();
    expect(recipe.id).toBeDefined();
    expect(recipe.approvalStatus).toBe("approved");

    const listRes = await app.inject({
      method: "GET",
      url: "/v1/recipes",
      headers: authA,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().length).toBeGreaterThan(0);

    const getRes = await app.inject({
      method: "GET",
      url: `/v1/recipes/${recipe.id}`,
      headers: authA,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe("Annual Enrolment Decline Recipe");

    const execRes = await app.inject({
      method: "POST",
      url: `/v1/recipes/${recipe.id}/execute`,
      headers: authA,
    });
    expect(execRes.statusCode).toBe(202);
    expect(execRes.json().recipeId).toBe(recipe.id);
    expect(execRes.json().status).toBe("answered");

    const crossListRes = await app.inject({
      method: "GET",
      url: "/v1/recipes",
      headers: authB,
    });
    expect(crossListRes.statusCode).toBe(200);
    expect(crossListRes.json()).toEqual([]);

    const crossGetRes = await app.inject({
      method: "GET",
      url: `/v1/recipes/${recipe.id}`,
      headers: authB,
    });
    expect(crossGetRes.statusCode).toBe(404);

    const crossExecRes = await app.inject({
      method: "POST",
      url: `/v1/recipes/${recipe.id}/execute`,
      headers: authB,
    });
    expect(crossExecRes.statusCode).toBe(404);
  });

  it("4E. re-authorization blocks execution if recipe query targets unauthorized schemas", async () => {
    const unauthorizedRecipeRes = await app.inject({
      method: "POST",
      url: "/v1/recipes",
      headers: authA,
      payload: {
        name: "Unauthorized Recipe",
        metricName: "private_data_leak",
        connectionId,
        question: "Show private data",
        plan: { sources: ["private_data.restricted"] },
        sqlText: "SELECT * FROM private_data.restricted;",
        grain: ["id"],
        timeframePolicy: "none",
        nullExclusionPolicy: "none",
        approvalStatus: "draft",
      },
    });
    const badRecipe = unauthorizedRecipeRes.json();

    const blockedExecRes = await app.inject({
      method: "POST",
      url: `/v1/recipes/${badRecipe.id}/execute`,
      headers: authA,
    });
    expect(blockedExecRes.statusCode).toBe(403);
    expect(blockedExecRes.json().message).toContain(
      "rejected by current schema authorization",
    );
  });
});
