import { expect, it } from "vitest";
import { readQuestions, serializeQuestions } from "../src/lib/workspace";

const draft = {
  id: "q1",
  text: "What changed?",
  mode: "Ask your data",
  source: "report.csv",
  createdAt: 1000,
  saved: true,
};

it("restores question drafts and bookmarks without file contents", () => {
  expect(readQuestions(JSON.stringify([draft]))).toEqual([draft]);
});

it("recovers safely from malformed storage and invalid dates", () => {
  expect(readQuestions("invalid")).toEqual([]);
  expect(readQuestions('{"private":"value"}')).toEqual([]);
  expect(
    readQuestions(
      JSON.stringify([
        null,
        {},
        { ...draft, createdAt: 1e20 },
        { ...draft, createdAt: -1 },
        { ...draft, text: "a".repeat(4001) },
        draft,
      ]),
    ),
  ).toEqual([draft]);
});

it("bounds restored question history to 100 records", () => {
  expect(
    readQuestions(
      JSON.stringify(
        Array.from({ length: 120 }, (_, index) => ({
          ...draft,
          id: `q${index}`,
        })),
      ),
    ),
  ).toHaveLength(100);
});

it("persists draft metadata without retaining private result rows", () => {
  const serialized = serializeQuestions([
    {
      ...draft,
      fileId: "file-1",
      result: {
        answer: {
          runId: "run-1",
          status: "abstained",
          reason: "private reason",
          nextAction: "clarify",
          assumptions: [],
          limitations: [],
        },
        columns: ["private_column"],
        rows: [{ private_column: "private_value" }],
      },
    },
  ]);
  expect(JSON.parse(serialized)).toEqual([{ ...draft, fileId: "file-1" }]);
  expect(serialized).not.toContain("private");
});
