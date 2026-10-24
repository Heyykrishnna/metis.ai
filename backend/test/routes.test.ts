import { fixtureAdapter } from "./support/fixture-adapter.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { getDefaultSecretStore } from "../src/security/secrets.js";

describe("Phase 1 API routes", () => {
  let app: App;
  const authHeader = {
    authorization: "Bearer test-user:00000000-0000-4000-8000-000000000001",
  };
  const otherAuthHeader = {
    authorization: "Bearer other-user:00000000-0000-4000-8000-000000000002",
  };

  beforeAll(async () => {
    app = await buildApp({ adapter: fixtureAdapter() });
    const secrets = getDefaultSecretStore();
    await secrets.set("secret://fixture/reader", "fixture-password");
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers liveness and readiness health checks", async () => {
    const liveRes = await app.inject({ method: "GET", url: "/health/live" });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json()).toEqual({ status: "ok" });

    const readyRes = await app.inject({ method: "GET", url: "/health/ready" });
    expect(readyRes.statusCode).toBe(200);
    expect(readyRes.json()).toEqual({ status: "ok" });
  });

  it("denies unauthenticated requests to protected endpoints", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/connections",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthorized" });
  });

  it("tests and registers a connection with sanitized outputs", async () => {
    const testInput = {
      name: "Local Test Connection",
      engine: "PostgreSQL",
      host: "127.0.0.1",
      port: 5432,
      database: "metis_test",
      username: "metis_reader",
      secretReference: "secret://fixture/reader",
      allowedSchemas: ["analytics_clean"],
    };

    const blockRes = await app.inject({
      method: "POST",
      url: "/v1/connections/test",
      headers: authHeader,
      payload: { ...testInput, host: "169.254.169.254" },
    });
    expect(blockRes.statusCode).toBe(400);

    const createRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authHeader,
      payload: testInput,
    });
    expect(createRes.statusCode).toBe(201);
    const conn = createRes.json();
    expect(conn).toMatchObject({
      name: "Local Test Connection",
      engine: "PostgreSQL",
      allowedSchemas: ["analytics_clean"],
      status: "ready",
    });
    expect(conn.id).toBeDefined();

    const listRes = await app.inject({
      method: "GET",
      url: "/v1/connections",
      headers: authHeader,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().length).toBeGreaterThan(0);
  });

  it("submits analysis, retrieves run, result, and evidence bundle", async () => {
    const createConnRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authHeader,
      payload: {
        name: "Analysis Connection",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "metis_test",
        username: "metis_reader",
        secretReference: "secret://fixture/reader",
        allowedSchemas: ["analytics_clean"],
      },
    });
    const connectionId = createConnRes.json().id;

    const submitRes = await app.inject({
      method: "POST",
      url: "/v1/analyses",
      headers: authHeader,
      payload: {
        connectionId,
        question:
          "Which schools had lower enrolment in calendar 2025 than calendar 2024?",
      },
    });
    expect(submitRes.statusCode).toBe(202);
    const run = submitRes.json();
    expect(run.runId).toBeDefined();
    expect(run.status).toBe("answered");

    const getRunRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${run.runId}`,
      headers: authHeader,
    });
    expect(getRunRes.statusCode).toBe(200);
    expect(getRunRes.json().runId).toBe(run.runId);

    const resultRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${run.runId}/result`,
      headers: authHeader,
    });
    expect(resultRes.statusCode).toBe(200);
    const result = resultRes.json();
    expect(result.answer.status).toBe("answered");

    const evidenceRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${run.runId}/evidence`,
      headers: authHeader,
    });
    expect(evidenceRes.statusCode).toBe(200);
    const evidence = evidenceRes.json();
    expect(evidence.finalStatus).toBe("answered");

    const isolationRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${run.runId}`,
      headers: otherAuthHeader,
    });
    expect(isolationRes.statusCode).toBe(404);
  });

  it("submits feedback for completed run", async () => {
    const createConnRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authHeader,
      payload: {
        name: "Feedback Conn",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "metis_test",
        username: "metis_reader",
        secretReference: "secret://fixture/reader",
        allowedSchemas: ["analytics_clean"],
      },
    });
    const connectionId = createConnRes.json().id;

    const submitRes = await app.inject({
      method: "POST",
      url: "/v1/analyses",
      headers: authHeader,
      payload: {
        connectionId,
        question: "Which schools declined?",
      },
    });
    const runId = submitRes.json().runId;

    const feedbackRes = await app.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: authHeader,
      payload: {
        runId,
        rating: 5,
        category: "correctness",
        comment: "Excellent and verified result",
      },
    });
    expect(feedbackRes.statusCode).toBe(201);
    expect(feedbackRes.json().id).toBeDefined();
  });
});
