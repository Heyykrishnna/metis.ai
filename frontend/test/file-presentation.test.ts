import { expect, it } from "vitest";
import type { FileAnalysis } from "../src/lib/file-client";
import {
  fileCoverage,
  normalizeFileAnalysis,
  operationLabel,
  readFilePlan,
} from "../src/lib/file-presentation";

function analysis(
  rows: FileAnalysis["result"]["rows"],
  definition = "{}",
): FileAnalysis {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    fileId: "00000000-0000-4000-8000-000000000002",
    question: "Total revenue",
    sourceHash: "a".repeat(64),
    modelVersion: "test",
    method: "model-planned-computation",
    createdAt: "2026-10-24T00:00:00.000Z",
    result: {
      columns: [],
      rows,
      answer: {
        runId: "00000000-0000-4000-8000-000000000001",
        status: "answered",
        answerText: "Revenue",
        definition,
        resultReference: "result",
        sqlReference: null,
        evidence: [],
        assumptions: [],
        limitations: [],
      },
    },
  };
}

it("measures coverage from actual included and excluded rows", () => {
  expect(
    fileCoverage(
      analysis([
        { included_rows: 2, excluded_empty_rows: 0 },
        { included_rows: 1, excluded_empty_rows: 1 },
      ]),
    ),
  ).toEqual({
    percent: 75,
    included: 3,
    excluded: 1,
    unit: "matching metric rows",
  });
  expect(
    fileCoverage(
      analysis([
        {
          value: "1.73",
          shape: "right-skewed",
          included_rows: 3,
          excluded_empty_rows: 1,
        },
      ]),
    ),
  ).toEqual({
    percent: 75,
    included: 3,
    excluded: 1,
    unit: "matching metric rows",
  });
});

it("labels skewness as a distribution calculation", () => {
  expect(operationLabel("skewness")).toBe("Skewness");
});

it("does not invent a confidence score when data coverage is unavailable", () => {
  expect(
    fileCoverage(analysis([{ excerpt: "A source passage" }])).percent,
  ).toBeNull();
  expect(
    fileCoverage(analysis([{ included_rows: 0, excluded_empty_rows: 0 }]))
      .percent,
  ).toBeNull();
  expect(
    fileCoverage(analysis([{ included_rows: -1, excluded_empty_rows: 1 }]))
      .percent,
  ).toBeNull();
});

it("flags contradictory historical plans without mutating the stored record", () => {
  const original = analysis(
    [{ value: 10 }],
    JSON.stringify({
      operation: "describe",
      clarification: "Which column should I use?",
    }),
  );
  const corrected = normalizeFileAnalysis(original);
  expect(corrected.result.answer.status).toBe("needs_clarification");
  expect(corrected.result.rows).toEqual([]);
  expect(original.result.answer.status).toBe("answered");
  expect(fileCoverage(corrected).percent).toBeNull();
});

it("handles old or malformed definitions safely and retains legitimate schema plans", () => {
  expect(readFilePlan("not json")).toBeNull();
  expect(readFilePlan("null")).toBeNull();
  expect(
    readFilePlan('{"operation":"schema","filters":[null,{"column":4}]}')
      ?.operation,
  ).toBe("schema");
  expect(
    readFilePlan('{"operation":"schema","filters":[null,{"column":4}]}')
      ?.filters,
  ).toEqual([]);
});
