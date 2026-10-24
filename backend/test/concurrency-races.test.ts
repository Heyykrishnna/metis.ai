import { describe, expect, it } from "vitest";
import { AnalysisOrchestrator } from "../src/analysis/orchestrator.js";
import type {
  AnalyticalQuery,
  AnalyticalResult,
  ConnectorAdapter,
} from "../src/sql/connectors.js";
import type { Static, TSchema } from "typebox";
import type {
  GenerationOptions,
  InferenceClient,
} from "../src/inference/client.js";

class SlowMockAdapter implements ConnectorAdapter {
  readonly id = "slow-adapter";
  readonly dialect = "PostgreSQL" as const;

  async query(queryInput: AnalyticalQuery): Promise<AnalyticalResult> {
    const signal = queryInput.signal;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 500);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("Query was cancelled"));
          },
          { once: true },
        );
      }
    });

    return {
      columns: ["school_id", "delta"],
      rows: [{ school_id: 1, delta: -20 }],
    };
  }
}

class FastMockAdapter implements ConnectorAdapter {
  readonly id = "fast-adapter";
  readonly dialect = "PostgreSQL" as const;

  async query(_query: AnalyticalQuery): Promise<AnalyticalResult> {
    return {
      columns: ["school_id", "delta"],
      rows: [
        { school_id: 1, delta: -20 },
        { school_id: 4, delta: -10 },
      ],
    };
  }
}

class MockInferenceClient implements InferenceClient {
  readonly modelVersion = "Qwen2.5-Coder-7B-Instruct";
  async generateStructured<T extends TSchema>(
    _prompt: string,
    _schema: T,
    _options?: GenerationOptions,
  ): Promise<Static<T>> {
    return {} as Static<T>;
  }
}

describe("Concurrency, budget exhaustion, and cancellation races", () => {
  const workspaceId = "10000000-0000-4000-8000-000000000001";
  const connectionId = "conn-race-1";
  const allowedSchemas = ["analytics_clean"];
  const inference = new MockInferenceClient();

  it("handles cancellation race condition where cancellation cannot be overwritten by completion", async () => {
    const adapter = new SlowMockAdapter();
    const orchestrator = new AnalysisOrchestrator({ adapter, inference });

    const abortController = new AbortController();
    const runPromise = orchestrator.executeAnalysis({
      workspaceId,
      connectionId,
      allowedSchemas,
      question: "Which schools had lower enrolment?",
      abortSignal: abortController.signal,
    });

    setTimeout(() => {
      abortController.abort();
    }, 50);

    const run = await runPromise;
    expect(["cancelled", "timed_out"]).toContain(run.status);

    const fetchedRun = await orchestrator.getRun(run.runId, workspaceId);
    expect(["cancelled", "timed_out"]).toContain(fetchedRun?.status);

    const cancelAgain = await orchestrator.cancelRun(run.runId, workspaceId);
    expect(["cancelled", "timed_out"]).toContain(cancelAgain.status);
  });

  it("enforces stage budget timeout leading to timed_out terminal status", async () => {
    const adapter = new SlowMockAdapter();
    const orchestrator = new AnalysisOrchestrator({ adapter, inference });

    const run = await orchestrator.executeAnalysis({
      workspaceId,
      connectionId,
      allowedSchemas,
      question: "Which schools had lower enrolment?",
      totalTimeoutMs: 100,
    });

    expect(run.status).toBe("timed_out");
    const evidence = await orchestrator.getEvidence(run.runId, workspaceId);
    expect(evidence.finalStatus).toBe("timed_out");
  });

  it("handles immediate cancellation before execution begins", async () => {
    const adapter = new FastMockAdapter();
    const orchestrator = new AnalysisOrchestrator({ adapter, inference });

    const abortController = new AbortController();
    abortController.abort();

    const run = await orchestrator.executeAnalysis({
      workspaceId,
      connectionId,
      allowedSchemas,
      question: "Which schools had lower enrolment?",
      abortSignal: abortController.signal,
    });

    expect(run.status).toBe("cancelled");
  });
});
