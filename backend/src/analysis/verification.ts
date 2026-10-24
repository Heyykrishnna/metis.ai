import type { Static } from "typebox";
import type { VerificationReportSchema } from "../contracts/analysis.js";

export type VerificationReport = Static<typeof VerificationReportSchema>;

export interface VerificationInput {
  runId: string;
  planGrain: string[];
  columns: string[];
  rows: Record<string, unknown>[];
  coverage: {
    included: number;
    excluded: number;
    denominator: number;
  };
}

export function verifyAnalysis(input: VerificationInput): VerificationReport {
  const checks: VerificationReport["checks"] = [];
  const hardGateFailures: string[] = [];
  const warnings: string[] = [];
  const evidenceReferences: string[] = [`run:${input.runId}`];

  const hasGrain = input.planGrain.every((col) => input.columns.includes(col));
  if (input.rows.length > 0 && !hasGrain && input.planGrain.length > 0) {
    checks.push({
      ruleId: "check-shape",
      version: "1.0.0",
      outcome: "failed",
      severity: "hard",
      reason: `Expected grain columns [${input.planGrain.join(", ")}] not found in result columns [${input.columns.join(", ")}]`,
      evidenceReferences,
    });
    hardGateFailures.push("check-shape");
  } else {
    checks.push({
      ruleId: "check-shape",
      version: "1.0.0",
      outcome: "passed",
      severity: "hard",
      reason: "Result columns align with planned grain",
      evidenceReferences,
    });
  }

  const seenKeys = new Set<string>();
  let duplicateCount = 0;
  for (const row of input.rows) {
    const key = input.planGrain.map((g) => String(row[g] ?? "")).join("::");
    if (seenKeys.has(key)) {
      duplicateCount++;
    } else {
      seenKeys.add(key);
    }
  }

  if (duplicateCount > 0) {
    checks.push({
      ruleId: "check-grain",
      version: "1.0.0",
      outcome: "failed",
      severity: "hard",
      reason: `Found ${duplicateCount} duplicate row(s) on grain [${input.planGrain.join(", ")}]`,
      evidenceReferences,
    });
    hardGateFailures.push("check-grain");
  } else {
    checks.push({
      ruleId: "check-grain",
      version: "1.0.0",
      outcome: "passed",
      severity: "hard",
      reason: "Row uniqueness satisfied on declared grain",
      evidenceReferences,
    });
  }

  let nullCountInGrain = 0;
  for (const row of input.rows) {
    for (const g of input.planGrain) {
      if (row[g] === null || row[g] === undefined) {
        nullCountInGrain++;
      }
    }
  }

  if (nullCountInGrain > 0) {
    checks.push({
      ruleId: "check-null-policy",
      version: "1.0.0",
      outcome: "failed",
      severity: "hard",
      reason: `Found ${nullCountInGrain} null value(s) in declared grain columns`,
      evidenceReferences,
    });
    hardGateFailures.push("check-null-policy");
  } else {
    checks.push({
      ruleId: "check-null-policy",
      version: "1.0.0",
      outcome: "passed",
      severity: "hard",
      reason: "No unexpected nulls in grain identifiers",
      evidenceReferences,
    });
  }

  const cov = input.coverage;
  if (cov.denominator > 0 && cov.included + cov.excluded !== cov.denominator) {
    warnings.push(
      "Denominator does not equal sum of included and excluded items",
    );
    checks.push({
      ruleId: "check-coverage",
      version: "1.0.0",
      outcome: "failed",
      severity: "warning",
      reason: "Coverage mismatch between denominator and partitioned sets",
      evidenceReferences,
    });
  } else {
    checks.push({
      ruleId: "check-coverage",
      version: "1.0.0",
      outcome: "passed",
      severity: "warning",
      reason: "Coverage partition is consistent",
      evidenceReferences,
    });
  }

  return {
    checks,
    hardGateFailures,
    warnings,
    coverage: input.coverage,
    evidenceReferences,
  };
}
