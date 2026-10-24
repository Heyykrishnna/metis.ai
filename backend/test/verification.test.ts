import { describe, expect, it } from "vitest";
import { Check } from "typebox/value";
import { VerificationReportSchema } from "../src/contracts/analysis.js";
import { verifyAnalysis } from "../src/analysis/verification.js";

describe("verification engine", () => {
  it("passes verification on valid known-answer fixture result", () => {
    const report = verifyAnalysis({
      planGrain: ["school_id"],
      columns: ["school_id", "delta"],
      rows: [
        { school_id: 1, delta: -20 },
        { school_id: 4, delta: -10 },
      ],
      coverage: {
        included: 4,
        excluded: 2,
        denominator: 6,
      },
      runId: "00000000-0000-4000-8000-000000000001",
    });

    expect(report.hardGateFailures.length).toBe(0);
    expect(Check(VerificationReportSchema, report)).toBe(true);
    expect(report.coverage).toEqual({
      included: 4,
      excluded: 2,
      denominator: 6,
    });
  });

  it("fails hard gate when grain uniqueness is violated (fanout/duplicate)", () => {
    const report = verifyAnalysis({
      planGrain: ["school_id"],
      columns: ["school_id", "delta"],
      rows: [
        { school_id: 1, delta: -20 },
        { school_id: 1, delta: -20 },
      ],
      coverage: {
        included: 2,
        excluded: 0,
        denominator: 2,
      },
      runId: "00000000-0000-4000-8000-000000000001",
    });

    expect(report.hardGateFailures).toContain("check-grain");
    const grainCheck = report.checks.find((c) => c.ruleId === "check-grain");
    expect(grainCheck?.outcome).toBe("failed");
  });

  it("handles valid empty results cleanly without failure", () => {
    const report = verifyAnalysis({
      planGrain: ["school_id"],
      columns: ["school_id", "delta"],
      rows: [],
      coverage: {
        included: 0,
        excluded: 0,
        denominator: 0,
      },
      runId: "00000000-0000-4000-8000-000000000001",
    });

    expect(report.hardGateFailures.length).toBe(0);
    expect(Check(VerificationReportSchema, report)).toBe(true);
  });
});
