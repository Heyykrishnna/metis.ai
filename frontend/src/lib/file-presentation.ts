import type { FileAnalysis } from "./file-client";

export type FilePlan = {
  operation: string;
  column: string | null;
  groupBy: string | null;
  filters: { column: string; operator: string; value: string }[];
  clarification: string;
};

export function readFilePlan(definition: string): FilePlan | null {
  try {
    const value: unknown = JSON.parse(definition);
    if (
      typeof value !== "object" ||
      value === null ||
      !("operation" in value) ||
      typeof value.operation !== "string"
    )
      return null;
    const filters =
      "filters" in value && Array.isArray(value.filters)
        ? value.filters.filter(
            (
              item: unknown,
            ): item is { column: string; operator: string; value: string } =>
              typeof item === "object" &&
              item !== null &&
              "column" in item &&
              typeof item.column === "string" &&
              "operator" in item &&
              typeof item.operator === "string" &&
              "value" in item &&
              typeof item.value === "string",
          )
        : [];
    return {
      operation: value.operation,
      column:
        "column" in value && typeof value.column === "string"
          ? value.column
          : null,
      groupBy:
        "groupBy" in value && typeof value.groupBy === "string"
          ? value.groupBy
          : null,
      filters,
      clarification:
        "clarification" in value && typeof value.clarification === "string"
          ? value.clarification
          : "",
    };
  } catch {
    return null;
  }
}

export function normalizeFileAnalysis(analysis: FileAnalysis): FileAnalysis {
  const answer = analysis.result.answer;
  const plan =
    answer.status === "answered" ? readFilePlan(answer.definition) : null;
  if (!plan?.clarification.trim()) return analysis;
  return {
    ...analysis,
    result: {
      columns: [],
      rows: [],
      answer: {
        runId: analysis.id,
        status: "needs_clarification",
        reason: plan.clarification,
        nextAction:
          "Choose the relevant field and clarify the requested calculation.",
        assumptions: [],
        limitations: [
          "This saved plan requested clarification. Its earlier result is not treated as a confirmed answer.",
        ],
      },
    },
  };
}

export function fileCoverage(analysis: FileAnalysis): {
  percent: number | null;
  included: number;
  excluded: number;
  unit: string;
} {
  if (analysis.result.answer.status !== "answered")
    return {
      percent: null,
      included: 0,
      excluded: 0,
      unit: "No confirmed calculation",
    };
  const rows = analysis.result.rows;
  const aggregate =
    rows.length > 0 &&
    rows.every(
      (row) =>
        typeof row.included_rows === "number" &&
        typeof row.excluded_empty_rows === "number",
    );
  const profile =
    rows.length > 0 &&
    rows.every(
      (row) =>
        typeof row.nonempty_rows === "number" &&
        typeof row.empty_rows === "number",
    );
  if (!aggregate && !profile)
    return {
      percent: null,
      included: 0,
      excluded: 0,
      unit:
        analysis.method === "extractive"
          ? "Verified source excerpts"
          : "Coverage not measured for this result",
    };
  let included = 0;
  let excluded = 0;
  for (const row of rows) {
    const kept = aggregate ? row.included_rows : row.nonempty_rows;
    const missing = aggregate ? row.excluded_empty_rows : row.empty_rows;
    if (
      typeof kept !== "number" ||
      typeof missing !== "number" ||
      kept < 0 ||
      missing < 0 ||
      !Number.isSafeInteger(kept) ||
      !Number.isSafeInteger(missing)
    )
      return {
        percent: null,
        included: 0,
        excluded: 0,
        unit: "Coverage unavailable",
      };
    included += kept;
    excluded += missing;
  }
  return {
    percent:
      included + excluded > 0
        ? Math.round((100 * included) / (included + excluded))
        : null,
    included,
    excluded,
    unit: aggregate ? "matching metric rows" : "observed table cells",
  };
}

export function operationLabel(operation: string) {
  const labels: Record<string, string> = {
    describe: "Data overview",
    schema: "File schema",
    count: "Record count",
    sum: "Total",
    average: "Average",
    minimum: "Minimum",
    maximum: "Maximum",
    rows: "Matching records",
    clarify: "Clarification",
  };
  return labels[operation] ?? "File analysis";
}
