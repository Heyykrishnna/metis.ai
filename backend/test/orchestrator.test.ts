import { describe, expect, it } from "vitest";
import { Check } from "typebox/value";
import {
  EvidenceBundleSchema,
  ResultSchema,
  RunSchema,
} from "../src/contracts/analysis.js";
import {
  AnalysisOrchestrator,
  type OrchestratorDeps,
} from "../src/analysis/orchestrator.js";
import type { ConnectorAdapter } from "../src/sql/connectors.js";
import type { InferenceClient } from "../src/inference/client.js";

describe("AnalysisOrchestrator and 7 terminal statuses", () => {
  const dummyAdapter: ConnectorAdapter = {
    id: "mock-adapter",
    dialect: "PostgreSQL",
    async query(input) {
      if (input.sql.includes("information_schema.tables")) {
        return {
          columns: ["schema", "name"],
          rows: [
            { schema: "analytics_clean", name: "schools" },
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

  const dummyInference: InferenceClient = {
    modelVersion: "test-model-v1",
    async generateStructured(_prompt, _schema) {
      return {} as never;
    },
  };

  const createDeps = (
    overrides?: Partial<OrchestratorDeps>,
  ): OrchestratorDeps => ({
    adapter: dummyAdapter,
    inference: dummyInference,
    ...overrides,
  });

  it("produces 'answered' terminal status with verified known-answer declines", async () => {
    const orchestrator = new AnalysisOrchestrator(createDeps());
    const run = await orchestrator.executeAnalysis({
      runId: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000010",
      connectionId: "00000000-0000-4000-8000-000000000020",
      allowedSchemas: ["analytics_clean"],
      question:
        "Which schools had lower enrolment in calendar 2025 than calendar 2024?",
    });

    expect(run.status).toBe("answered");
    expect(Check(RunSchema, run)).toBe(true);

    const result = await orchestrator.getResult(run.runId);
    expect(Check(ResultSchema, result)).toBe(true);
    expect(result.answer.status).toBe("answered");
    if (result.answer.status === "answered") {
      expect(result.rows).toEqual([
        { school_id: 1, delta: -20 },
        { school_id: 4, delta: -10 },
      ]);
    }

    const evidence = await orchestrator.getEvidence(run.runId);
    expect(Check(EvidenceBundleSchema, evidence)).toBe(true);
    expect(evidence.finalStatus).toBe("answered");
  });

  it("produces 'needs_clarification' terminal status for ambiguous date or year definition", async () => {
    const orchestrator = new AnalysisOrchestrator(createDeps());
    const run = await orchestrator.executeAnalysis({
      runId: "00000000-0000-4000-8000-000000000002",
      workspaceId: "00000000-0000-4000-8000-000000000010",
      connectionId: "00000000-0000-4000-8000-000000000020",
      allowedSchemas: ["analytics_clean"],
      question: "Which schools declined between 01/02/2025 and 02/01/2025?",
    });

    expect(run.status).toBe("needs_clarification");
    const result = await orchestrator.getResult(run.runId);
    expect(result.answer.status).toBe("needs_clarification");
    if (result.answer.status === "needs_clarification") {
      expect(result.answer.reason).toContain("clarification");
      expect(result.answer.nextAction).toBeDefined();
    }
  });

  it("produces 'blocked_by_policy' when SQL accesses a forbidden schema", async () => {
    const orchestrator = new AnalysisOrchestrator(createDeps());
    const run = await orchestrator.executeAnalysis({
      runId: "00000000-0000-4000-8000-000000000003",
      workspaceId: "00000000-0000-4000-8000-000000000010",
      connectionId: "00000000-0000-4000-8000-000000000020",
      allowedSchemas: ["analytics_clean"],
      question: "Show records from private_data.restricted",
      sqlOverride: "SELECT * FROM private_data.restricted",
    });

    expect(run.status).toBe("blocked_by_policy");
    const result = await orchestrator.getResult(run.runId);
    expect(result.answer.status).toBe("blocked_by_policy");
  });

  it("produces 'abstained' when required period or fields are missing", async () => {
    const orchestrator = new AnalysisOrchestrator(createDeps());
    const run = await orchestrator.executeAnalysis({
      runId: "00000000-0000-4000-8000-000000000004",
      workspaceId: "00000000-0000-4000-8000-000000000010",
      connectionId: "00000000-0000-4000-8000-000000000020",
      allowedSchemas: ["analytics_clean"],
      question: "Which schools declined in fiscal year 2010?",
    });

    expect(run.status).toBe("abstained");
    const result = await orchestrator.getResult(run.runId);
    expect(result.answer.status).toBe("abstained");
  });

  it("produces 'execution_failed' when SQL execution fails and repairs are exhausted", async () => {
    const failingAdapter: ConnectorAdapter = {
      ...dummyAdapter,
      async query(input) {
        if (input.sql.includes("information_schema")) {
          return dummyAdapter.query(input);
        }
        throw new Error("Syntax error near WHERE");
      },
    };

    const orchestrator = new AnalysisOrchestrator(
      createDeps({ adapter: failingAdapter }),
    );
    const run = await orchestrator.executeAnalysis({
      runId: "00000000-0000-4000-8000-000000000005",
      workspaceId: "00000000-0000-4000-8000-000000000010",
      connectionId: "00000000-0000-4000-8000-000000000020",
      allowedSchemas: ["analytics_clean"],
      question: "Calculate decline",
      sqlOverride:
        "SELECT * FROM analytics_clean.enrolments WHERE school_id = 1",
    });

    expect(run.status).toBe("execution_failed");
    const result = await orchestrator.getResult(run.runId);
    expect(result.answer.status).toBe("execution_failed");
  });

  it("produces 'cancelled' when cancellation is requested", async () => {
    const orchestrator = new AnalysisOrchestrator(createDeps());
    const controller = new AbortController();
    controller.abort();

    const run = await orchestrator.executeAnalysis({
      runId: "00000000-0000-4000-8000-000000000006",
      workspaceId: "00000000-0000-4000-8000-000000000010",
      connectionId: "00000000-0000-4000-8000-000000000020",
      allowedSchemas: ["analytics_clean"],
      question: "Which schools declined?",
      abortSignal: controller.signal,
    });

    expect(run.status).toBe("cancelled");
    const result = await orchestrator.getResult(run.runId);
    expect(result.answer.status).toBe("cancelled");
  });

  it("produces 'timed_out' when run timeout is exceeded", async () => {
    const slowAdapter: ConnectorAdapter = {
      ...dummyAdapter,
      async query(input) {
        if (input.sql.includes("information_schema")) {
          return dummyAdapter.query(input);
        }
        await new Promise((r) => setTimeout(r, 100));
        return { columns: ["a"], rows: [{ a: 1 }] };
      },
    };

    const orchestrator = new AnalysisOrchestrator(
      createDeps({ adapter: slowAdapter }),
    );
    const run = await orchestrator.executeAnalysis({
      runId: "00000000-0000-4000-8000-000000000007",
      workspaceId: "00000000-0000-4000-8000-000000000010",
      connectionId: "00000000-0000-4000-8000-000000000020",
      allowedSchemas: ["analytics_clean"],
      question: "Which schools declined?",
      totalTimeoutMs: 10,
    });

    expect(run.status).toBe("timed_out");
    const result = await orchestrator.getResult(run.runId);
    expect(result.answer.status).toBe("timed_out");
  });
});
