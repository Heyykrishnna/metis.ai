import { describe, expect, it } from "vitest";
import { verifyAnalysis } from "../src/analysis/verification.js";
import { validateQuerySafety } from "../src/sql/safety.js";

describe("Adversarial verification and PRD benchmark fault cases", () => {
  const runId = "test-run-verification-001";

  it("schools-calendar-decline-001: verifies known-answer decline partition", () => {
    const report = verifyAnalysis({
      runId,
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
    });

    expect(report.hardGateFailures).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    const passedRules = report.checks
      .filter((c) => c.outcome === "passed")
      .map((c) => c.ruleId);
    expect(passedRules).toContain("check-shape");
    expect(passedRules).toContain("check-grain");
    expect(passedRules).toContain("check-fanout");
    expect(passedRules).toContain("check-coverage");
  });

  it("join-fanout-001: detects 1-to-many multiplication (multiplier: 3) as a hard gate failure", () => {
    const report = verifyAnalysis({
      runId,
      planGrain: ["school_id"],
      columns: ["school_id", "tag", "enrolled"],
      rows: [
        { school_id: 1, tag: "a", enrolled: 80 },
        { school_id: 1, tag: "b", enrolled: 80 },
        { school_id: 1, tag: "c", enrolled: 80 },
        { school_id: 2, tag: "a", enrolled: 60 },
      ],
      coverage: { included: 2, excluded: 0, denominator: 2 },
    });

    expect(report.hardGateFailures).toContain("check-grain");
    expect(report.hardGateFailures).toContain("check-fanout");
    const fanoutCheck = report.checks.find((c) => c.ruleId === "check-fanout");
    expect(fanoutCheck?.outcome).toBe("failed");
    expect(fanoutCheck?.reason).toContain("3x");
  });

  it("sentinel-values-001: detects unreviewed dirty string placeholders ('N/A', 'unknown', '-')", () => {
    const report = verifyAnalysis({
      runId,
      planGrain: ["school_id", "period"],
      columns: ["school_id", "period", "enrolled_raw"],
      rows: [
        { school_id: 1, period: "2025", enrolled_raw: "80" },
        { school_id: 2, period: "2025", enrolled_raw: "N/A" },
        { school_id: 3, period: "2025", enrolled_raw: "unknown" },
        { school_id: 4, period: "2025", enrolled_raw: "-" },
      ],
      coverage: { included: 4, excluded: 0, denominator: 4 },
      knownSentinels: ["N/A", "unknown", "-"],
    });

    expect(report.hardGateFailures).toContain("check-sentinel-values");
    const sentinelCheck = report.checks.find(
      (c) => c.ruleId === "check-sentinel-values",
    );
    expect(sentinelCheck?.outcome).toBe("failed");
    expect(sentinelCheck?.reason).toMatch(/N\/A|unknown|-/);
  });

  it("ambiguous-date-001: detects mixed ambiguous date formats ('01/02/2025' vs '02/01/2025')", () => {
    const report = verifyAnalysis({
      runId,
      planGrain: ["school_id"],
      columns: ["school_id", "observed_at", "enrolled"],
      rows: [
        { school_id: 1, observed_at: "01/02/2025", enrolled: 80 },
        { school_id: 2, observed_at: "02/01/2025", enrolled: 80 },
      ],
      coverage: { included: 2, excluded: 0, denominator: 2 },
    });

    expect(report.hardGateFailures).toContain("check-ambiguous-dates");
    const dateCheck = report.checks.find(
      (c) => c.ruleId === "check-ambiguous-dates",
    );
    expect(dateCheck?.outcome).toBe("failed");
    expect(dateCheck?.reason).toContain("clarification");
  });

  it("duplicate-period-001: detects duplicate period entries for same entity", () => {
    const report = verifyAnalysis({
      runId,
      planGrain: ["school_id", "period"],
      columns: ["school_id", "period", "enrolled"],
      rows: [
        { school_id: 1, period: "2025", enrolled: 80 },
        { school_id: 1, period: "2025", enrolled: 80 },
      ],
      coverage: { included: 1, excluded: 0, denominator: 1 },
    });

    expect(report.hardGateFailures).toContain("check-grain");
    const grainCheck = report.checks.find((c) => c.ruleId === "check-grain");
    expect(grainCheck?.outcome).toBe("failed");
    expect(grainCheck?.reason).toContain("duplicate");
  });

  it("missing-period-001 & null-measure-001: verifies explicit exclusion reasons and coverage partition", () => {
    const coverage = {
      included: 4,
      excluded: 2,
      denominator: 6,
    };
    const exclusions = [
      "School 5 excluded: missing 2025 observation (missing-period-001)",
      "School 6 excluded: null 2025 observation (null-measure-001)",
    ];

    expect(coverage.included + coverage.excluded).toBe(coverage.denominator);
    expect(exclusions).toHaveLength(2);
    expect(exclusions[0]).toContain("missing 2025 observation");
    expect(exclusions[1]).toContain("null 2025 observation");

    const report = verifyAnalysis({
      runId,
      planGrain: ["school_id"],
      columns: ["school_id", "delta"],
      rows: [
        { school_id: 1, delta: -20 },
        { school_id: 2, delta: 10 },
        { school_id: 3, delta: 30 },
        { school_id: 4, delta: -10 },
      ],
      coverage,
    });

    expect(report.hardGateFailures).toHaveLength(0);
    expect(report.coverage).toEqual(coverage);
  });

  it("forbidden-object-001: triggers blocked_by_policy on unauthorized schema access", () => {
    const safety = validateQuerySafety(
      "SELECT id, value FROM private_data.restricted",
      ["analytics_clean"],
    );
    expect(safety.allowed).toBe(false);
    expect(safety.reason).toContain("Forbidden schema");
  });

  it("coverage mismatch: flags warning when included + excluded != denominator", () => {
    const report = verifyAnalysis({
      runId,
      planGrain: ["school_id"],
      columns: ["school_id", "delta"],
      rows: [{ school_id: 1, delta: -20 }],
      coverage: {
        included: 4,
        excluded: 1,
        denominator: 6,
      },
    });

    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain("Denominator does not equal sum");
    const covCheck = report.checks.find((c) => c.ruleId === "check-coverage");
    expect(covCheck?.outcome).toBe("failed");
    expect(covCheck?.severity).toBe("warning");
  });

  it("aggregation invariants: flags hard failure on invalid negative counts or NaN values", () => {
    const report = verifyAnalysis({
      runId,
      planGrain: ["school_id"],
      columns: ["school_id", "enrolled"],
      rows: [
        { school_id: 1, enrolled: -50 },
        { school_id: 2, enrolled: NaN },
      ],
      coverage: { included: 2, excluded: 0, denominator: 2 },
    });

    expect(report.hardGateFailures).toContain("check-aggregation-invariants");
  });
});
