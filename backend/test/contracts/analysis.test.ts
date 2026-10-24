import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import { AnswerEnvelopeSchema } from "../../src/contracts/analysis.js";

describe("answer contract", () => {
  it("rejects a definitive answer without execution evidence", () => {
    expect(
      Check(AnswerEnvelopeSchema, {
        runId: "00000000-0000-4000-8000-000000000001",
        status: "answered",
        answerText: "12 schools declined",
        assumptions: [],
        limitations: [],
      }),
    ).toBe(false);
  });
});

it("accepts a traceable answered envelope", () => {
  expect(
    Check(AnswerEnvelopeSchema, {
      runId: "00000000-0000-4000-8000-000000000001",
      status: "answered",
      answerText: "Two schools declined under the selected definition.",
      definition: "Calendar 2025 versus 2024, school-year grain",
      resultReference: "00000000-0000-4000-8000-000000000002",
      sqlReference: "00000000-0000-4000-8000-000000000003",
      evidence: ["execution:fixture-001"],
      assumptions: [],
      limitations: ["Two schools excluded for missing observations"],
    }),
  ).toBe(true);
});

it("requires a next action for non-answer outcomes", () => {
  expect(
    Check(AnswerEnvelopeSchema, {
      runId: "00000000-0000-4000-8000-000000000001",
      status: "abstained",
      reason: "Insufficient periods",
      assumptions: [],
      limitations: [],
    }),
  ).toBe(false);
});
