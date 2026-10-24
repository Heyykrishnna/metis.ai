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
  knownSentinels?: string[];
}

const defaultSentinelValues = new Set([
  "n/a",
  "unknown",
  "-",
  "null",
  "none",
  "missing",
]);

function isAmbiguousDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return (
    first >= 1 && first <= 12 && second >= 1 && second <= 12 && first !== second
  );
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
  const entityCounts = new Map<string, number>();
  let duplicateCount = 0;
  for (const row of input.rows) {
    const key = input.planGrain.map((g) => String(row[g] ?? "")).join("::");
    if (seenKeys.has(key)) {
      duplicateCount++;
    } else {
      seenKeys.add(key);
    }

    if (input.planGrain.length > 0) {
      const primaryKey = String(row[input.planGrain[0] ?? ""] ?? "");
      entityCounts.set(primaryKey, (entityCounts.get(primaryKey) ?? 0) + 1);
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

  let maxMultiplier = 1;
  let fanoutEntity: string | null = null;
  for (const [entityId, count] of entityCounts.entries()) {
    if (count > maxMultiplier) {
      maxMultiplier = count;
      fanoutEntity = entityId;
    }
  }

  if (maxMultiplier > 1 && input.planGrain.length === 1) {
    checks.push({
      ruleId: "check-fanout",
      version: "1.0.0",
      outcome: "failed",
      severity: "hard",
      reason: `Join fanout detected on entity ${fanoutEntity}: multiplied ${maxMultiplier}x without grouping`,
      evidenceReferences,
    });
    hardGateFailures.push("check-fanout");
  } else {
    checks.push({
      ruleId: "check-fanout",
      version: "1.0.0",
      outcome: "passed",
      severity: "hard",
      reason: "No unintended join fanout detected on target entities",
      evidenceReferences,
    });
  }

  const sentinelsToCheck = new Set([
    ...defaultSentinelValues,
    ...(input.knownSentinels ?? []).map((s) => s.toLowerCase()),
  ]);

  const foundSentinels = new Set<string>();
  for (const row of input.rows) {
    for (const [, val] of Object.entries(row)) {
      if (typeof val === "string") {
        const valLower = val.trim().toLowerCase();
        if (sentinelsToCheck.has(valLower)) {
          foundSentinels.add(val.trim());
        }
      }
    }
  }

  if (foundSentinels.size > 0) {
    const list = [...foundSentinels].join(", ");
    checks.push({
      ruleId: "check-sentinel-values",
      version: "1.0.0",
      outcome: "failed",
      severity: "hard",
      reason: `Unreviewed sentinel/placeholder value(s) detected in data: [${list}]`,
      evidenceReferences,
    });
    hardGateFailures.push("check-sentinel-values");
  } else {
    checks.push({
      ruleId: "check-sentinel-values",
      version: "1.0.0",
      outcome: "passed",
      severity: "hard",
      reason: "No unreviewed sentinel or placeholder values detected",
      evidenceReferences,
    });
  }

  let ambiguousDateFound: string | null = null;
  for (const row of input.rows) {
    for (const val of Object.values(row)) {
      if (isAmbiguousDate(val)) {
        ambiguousDateFound = String(val);
        break;
      }
    }
    if (ambiguousDateFound) break;
  }

  if (ambiguousDateFound) {
    checks.push({
      ruleId: "check-ambiguous-dates",
      version: "1.0.0",
      outcome: "failed",
      severity: "hard",
      reason: `Ambiguous date format detected (${ambiguousDateFound}): requires clarification of DD/MM vs MM/DD`,
      evidenceReferences,
    });
    hardGateFailures.push("check-ambiguous-dates");
  } else {
    checks.push({
      ruleId: "check-ambiguous-dates",
      version: "1.0.0",
      outcome: "passed",
      severity: "hard",
      reason: "Dates follow unambiguous formats",
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

  let invariantFailures = 0;
  for (const row of input.rows) {
    for (const [col, val] of Object.entries(row)) {
      if (typeof val === "number" && (isNaN(val) || !isFinite(val))) {
        invariantFailures++;
      }
      if (
        col.toLowerCase().includes("enrolled") &&
        typeof val === "number" &&
        val < 0
      ) {
        invariantFailures++;
      }
    }
  }

  if (invariantFailures > 0) {
    checks.push({
      ruleId: "check-aggregation-invariants",
      version: "1.0.0",
      outcome: "failed",
      severity: "hard",
      reason: `Found ${invariantFailures} aggregation invariant violation(s)`,
      evidenceReferences,
    });
    hardGateFailures.push("check-aggregation-invariants");
  } else {
    checks.push({
      ruleId: "check-aggregation-invariants",
      version: "1.0.0",
      outcome: "passed",
      severity: "hard",
      reason: "Numerical aggregation invariants satisfied",
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
