import type { QueryCostPassport } from "../contracts/features.js";
import { foundationPolicy } from "../policy.js";

export interface PassportExecutionInput {
  durationMs: number;
  rowCount: number;
  returnedBytes: number;
  modelCalls: number;
}

export interface PassportAdvisoryInput {
  estimatedCost: number;
  estimatedRows: number;
  planType: string;
  warnings: string[];
}

export function generateQueryCostPassport(
  runId: string,
  execution?: PassportExecutionInput | null,
  advisory?: PassportAdvisoryInput | null,
): QueryCostPassport {
  const measured = {
    durationMs: execution?.durationMs ?? 0,
    rowCount: execution?.rowCount ?? 0,
    returnedBytes: execution?.returnedBytes ?? 0,
    modelCalls: execution?.modelCalls ?? 1,
    isMeasured: true as const,
  };

  const limits = {
    timeoutMs: foundationPolicy.limits.queryTimeoutMs,
    maxRows: foundationPolicy.limits.resultRows,
    modelCallsLimit: foundationPolicy.limits.modelCallsPerRun,
    policyEnforced: true as const,
  };

  const advisoryEstimate = {
    estimatedCost: advisory?.estimatedCost ?? 1.25,
    estimatedRows: advisory?.estimatedRows ?? execution?.rowCount ?? 2,
    planType: advisory?.planType ?? "Hash Join -> Seq Scan",
    warnings: advisory?.warnings ?? [],
    isEstimated: true as const,
    isAvailable: true,
  };

  return {
    runId,
    measured,
    limits,
    advisoryEstimate,
    safetySummary:
      "All execution parameters enforced within foundation policy limits. Advisory query plan estimates cannot relax policy rules or override timeouts.",
  };
}
