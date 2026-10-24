import { describe, expect, it } from "vitest";
import { analysisActivity } from "../src/lib/analysis-activity";
import type { Question } from "../src/lib/workspace";

function question(status?: string): Question {
  return {
    id: "analysis-1",
    text: "How many records are there?",
    mode: "Ask your data",
    source: "records.csv",
    createdAt: 1,
    saved: false,
    status,
  };
}

describe("analysis activity", () => {
  it.each([
    "queued",
    "parsing",
    "retrieving",
    "grounding",
    "planning",
    "generating",
    "authorizing",
    "estimating",
    "executing",
    "verifying",
    "challenging",
  ])("keeps the %s stage in progress without claiming results", (status) => {
    const activity = analysisActivity(question(status));
    expect(activity?.state).toBe("thinking");
    expect(activity?.resultSummary).toBeNull();
    expect(activity?.hasEvidence).toBe(false);
  });

  it("uses the reported stage rather than a simulated progress sequence", () => {
    expect(analysisActivity(question("authorizing"))?.label).toBe(
      "Checking data permissions",
    );
    expect(analysisActivity(question("verifying"))?.label).toBe(
      "Verifying the results",
    );
  });

  it.each([
    "needs_clarification",
    "abstained",
    "blocked_by_policy",
    "execution_failed",
    "timed_out",
    "cancelled",
  ])("keeps %s distinct from successful completion", (status) => {
    expect(analysisActivity(question(status))?.state).toBe("attention");
  });

  it("preserves the service's actionable failure reason", () => {
    const failed = question("execution_failed");
    failed.result = {
      answer: {
        runId: failed.id,
        status: "execution_failed",
        reason: "The source is unavailable. Reconnect and try again.",
        nextAction: "Reconnect the source.",
        assumptions: [],
        limitations: [],
      },
      columns: [],
      rows: [],
    };
    expect(analysisActivity(failed)?.description).toBe(
      "The source is unavailable. Reconnect and try again.",
    );
    expect(analysisActivity(failed)?.resultSummary).toBeNull();
  });

  it("summarizes actual result rows and columns after an answer", () => {
    const answered = question("answered");
    answered.result = {
      answer: {
        runId: answered.id,
        status: "answered",
        answerText: "There are 42 records.",
        definition: "Count every record in the source.",
        resultReference: "result-1",
        sqlReference: null,
        evidence: [],
        assumptions: [],
        limitations: [],
      },
      columns: ["count"],
      rows: [{ count: 42 }],
    };
    expect(analysisActivity(answered)).toMatchObject({
      state: "complete",
      label: "Analysis complete",
      resultSummary: "1 result row · 1 column",
      hasEvidence: false,
    });
  });

  it("does not invent file milestones while the file request is pending", () => {
    const pending = { ...question("planning"), fileId: "file-1" };
    expect(analysisActivity(pending)).toMatchObject({
      state: "thinking",
      label: "Planning the analysis",
      hasEvidence: false,
      resultSummary: null,
    });
  });

  it.each([undefined, "unknown", "toString", "constructor"])(
    "omits activity for a draft or unrecognized status: %s",
    (status) => {
      expect(analysisActivity(question(status))).toBeNull();
    },
  );
});
