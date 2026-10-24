import type { Question } from "./workspace";

const stages: Record<string, string> = {
  queued: "Waiting to begin",
  parsing: "Understanding your question",
  retrieving: "Finding relevant schema",
  grounding: "Matching the question to your data",
  planning: "Planning the analysis",
  generating: "Preparing a read-only query",
  authorizing: "Checking data permissions",
  estimating: "Checking query cost",
  executing: "Running the analysis",
  verifying: "Verifying the results",
  challenging: "Reviewing the evidence",
};

const outcomes: Record<string, string> = {
  answered: "Analysis complete",
  completed: "Analysis complete",
  needs_clarification: "A little more context needed",
  abstained: "More evidence needed",
  blocked_by_policy: "Stopped by data policy",
  execution_failed: "Analysis interrupted",
  timed_out: "Analysis timed out",
  cancelled: "Analysis cancelled",
};

export function analysisActivity(question: Question) {
  const status = question.status;
  if (!status) return null;
  const stage = Object.hasOwn(stages, status) ? stages[status] : undefined;
  const label =
    stage ?? (Object.hasOwn(outcomes, status) ? outcomes[status] : undefined);
  if (!label) return null;
  const complete = status === "answered" || status === "completed";
  const result = question.result;
  const description = stage
    ? question.fileId
      ? "Reading the stored file and preparing a validated calculation."
      : "Working with your connected source. Activity updates as the service reports progress."
    : result?.answer.status === "answered"
      ? "The answer and supporting results are ready to explore."
      : (result?.answer.reason ??
        "Review the analysis status below before continuing.");

  return {
    state: stage ? "thinking" : complete ? "complete" : "attention",
    label,
    description,
    resultSummary:
      complete && result?.answer.status === "answered"
        ? `${result.rows.length.toLocaleString()} result ${result.rows.length === 1 ? "row" : "rows"} · ${result.columns.length.toLocaleString()} ${result.columns.length === 1 ? "column" : "columns"}`
        : null,
    hasEvidence: Boolean(question.evidence || question.fileAnalysis),
  };
}
