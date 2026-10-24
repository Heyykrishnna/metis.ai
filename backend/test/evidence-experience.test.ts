import { fixtureAdapter } from "./support/fixture-adapter.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { getDefaultSecretStore } from "../src/security/secrets.js";

describe("Phase 3: Evidence experience, exports, ledger, and connection lifecycle", () => {
  let app: App;
  const workspaceA = "00000000-0000-4000-8000-000000000001";
  const workspaceB = "00000000-0000-4000-8000-000000000002";
  const authA = { authorization: `Bearer analyst-a:${workspaceA}` };
  const authB = { authorization: `Bearer analyst-b:${workspaceB}` };

  beforeAll(async () => {
    app = await buildApp({ adapter: fixtureAdapter() });
    const secrets = getDefaultSecretStore();
    await secrets.set("secret://fixture/reader", "fixture-password");
  });

  afterAll(async () => {
    await app.close();
  });

  it("manages connection retrieval, revocation, and prevents execution on revoked connections", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authA,
      payload: {
        name: "Revocable Test DB",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "metis_test",
        username: "metis_reader",
        secretReference: "secret://fixture/reader",
        allowedSchemas: ["analytics_clean"],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const connId = createRes.json().id;

    const getResA = await app.inject({
      method: "GET",
      url: `/v1/connections/${connId}`,
      headers: authA,
    });
    expect(getResA.statusCode).toBe(200);
    expect(getResA.json().status).toBe("ready");

    const getResB = await app.inject({
      method: "GET",
      url: `/v1/connections/${connId}`,
      headers: authB,
    });
    expect(getResB.statusCode).toBe(404);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/connections/${connId}`,
      headers: authA,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe("revoked");

    const postRevokedRes = await app.inject({
      method: "POST",
      url: "/v1/analyses",
      headers: authA,
      payload: {
        connectionId: connId,
        question: "How many students are enrolled?",
      },
    });
    expect(postRevokedRes.statusCode).toBe(404);
  });

  it("handles clarification requests and successful child run resumption", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authA,
      payload: {
        name: "Clarification DB",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "metis_test",
        username: "metis_reader",
        secretReference: "secret://fixture/reader",
        allowedSchemas: ["analytics_clean"],
      },
    });
    const connectionId = createRes.json().id;

    const ambiguousRes = await app.inject({
      method: "POST",
      url: "/v1/analyses",
      headers: authA,
      payload: {
        connectionId,
        question:
          "Show enrollment delta between 01/02/2025 and 02/01/2025 calendar or academic",
      },
    });
    expect(ambiguousRes.statusCode).toBe(202);
    const initialRun = ambiguousRes.json();
    expect(initialRun.status).toBe("needs_clarification");

    const resumeRes = await app.inject({
      method: "POST",
      url: "/v1/analyses",
      headers: authA,
      payload: {
        connectionId,
        question: "Show enrollment delta between 01/02/2025 and 02/01/2025",
        parentRunId: initialRun.runId,
      },
    });
    expect(resumeRes.statusCode).toBe(202);
    const resumedRun = resumeRes.json();
    expect(resumedRun.status).toBe("answered");

    const evidenceRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${resumedRun.runId}/evidence`,
      headers: authA,
    });
    expect(evidenceRes.statusCode).toBe(200);
    expect(evidenceRes.json().assumptions).toContain(
      `Clarified from parent run ${initialRun.runId}`,
    );
  });

  it("exports safe CSV, SQL, reproducibility bundle, and truth ledger", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authA,
      payload: {
        name: "Export DB",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "metis_test",
        username: "metis_reader",
        secretReference: "secret://fixture/reader",
        allowedSchemas: ["analytics_clean"],
      },
    });
    const connectionId = createRes.json().id;

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
    const runId = runRes.json().runId;

    const csvRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/export/csv`,
      headers: authA,
    });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.headers["content-disposition"]).toBe(
      `attachment; filename="analysis-${runId}.csv"`,
    );
    expect(csvRes.body).toContain("school_id,delta");
    expect(csvRes.body).toContain("-20");

    const sqlRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/export/sql`,
      headers: authA,
    });
    expect(sqlRes.statusCode).toBe(200);
    expect(sqlRes.headers["content-type"]).toContain("application/sql");
    expect(sqlRes.headers["content-disposition"]).toBe(
      `attachment; filename="query-${runId}.sql"`,
    );
    expect(sqlRes.body).toContain("-- Metis Analytical SQL Export");
    expect(sqlRes.body).toContain("-- Dialect: PostgreSQL");
    expect(sqlRes.body).toContain("analytics_clean.enrolments");

    const reproRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/export/reproducibility`,
      headers: authA,
    });
    expect(reproRes.statusCode).toBe(200);
    expect(reproRes.headers["content-type"]).toContain("application/json");
    expect(reproRes.headers["content-disposition"]).toBe(
      `attachment; filename="reproducibility-${runId}.json"`,
    );
    const bundle = reproRes.json();
    expect(bundle.version).toBe("1.0.0");
    expect(bundle.runId).toBe(runId);
    expect(bundle.plan).toBeDefined();
    expect(bundle.candidate).toBeDefined();
    expect(bundle.execution).toBeDefined();
    expect(bundle.verification).toBeDefined();
    expect(bundle.answer.status).toBe("answered");

    const ledgerRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/ledger`,
      headers: authA,
    });
    expect(ledgerRes.statusCode).toBe(200);
    const ledger = ledgerRes.json();
    expect(ledger.runId).toBe(runId);
    expect(ledger.status).toBe("answered");
    expect(ledger.claims.length).toBeGreaterThan(0);
    expect(ledger.claims[0].supportingRows.length).toBeGreaterThan(0);
    expect(ledger.claims[0].verificationRules.length).toBeGreaterThan(0);
    expect(ledger.coverage.included).toBeGreaterThan(0);

    const crossCsv = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/export/csv`,
      headers: authB,
    });
    expect(crossCsv.statusCode).toBe(404);

    const crossSql = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/export/sql`,
      headers: authB,
    });
    expect(crossSql.statusCode).toBe(404);

    const crossRepro = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/export/reproducibility`,
      headers: authB,
    });
    expect(crossRepro.statusCode).toBe(404);

    const crossLedger = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}/ledger`,
      headers: authB,
    });
    expect(crossLedger.statusCode).toBe(404);
  });
});
