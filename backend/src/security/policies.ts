import { parseSql, type SqlAst } from "../sql/ast.js";
import type {
  EffectivePolicy,
  OrganizationRole,
  PolicySimulateInput,
  PolicySimulateResult,
} from "../contracts/policy.js";

export const CURRENT_POLICY_VERSION = "1.0.0";
export const SMALL_COHORT_THRESHOLD = 5;

const ownerDisallowedColumns = new Set([
  "password",
  "secret",
  "token",
  "classified",
  "private_key",
  "access_token",
  "api_key",
  "canary_secret",
  "credit_card",
  "pin",
]);

const analystDisallowedColumns = new Set([
  "password",
  "secret",
  "token",
  "classified",
  "private_key",
  "access_token",
  "api_key",
  "canary_secret",
  "salary",
  "compensation",
  "ssn",
  "tax_id",
  "credit_card",
  "pin",
]);

const approvedAnalyticalColumns = [
  "school_id",
  "school_name",
  "region",
  "year",
  "enrolled",
  "capacity",
  "status",
  "score",
  "category",
  "delta",
  "ratio",
  "average",
];

const approvedAggregateMeasures = [
  "total_enrolled",
  "avg_enrolled",
  "school_count",
  "min_enrolled",
  "max_enrolled",
  "delta",
];

const approvedAggregateDimensions = ["region", "year", "category"];

const ownerActions = [
  "manage_workspace",
  "manage_policies",
  "manage_connections",
  "execute_analysis",
  "execute_recipe",
  "export_csv",
  "export_sql",
  "simulate_policy",
  "view_shared_outputs",
];

const analystActions = [
  "execute_analysis",
  "execute_recipe",
  "create_recipe_draft",
  "export_csv",
  "export_sql",
  "view_shared_outputs",
];

const viewerActions = ["execute_recipe", "view_shared_outputs"];

export interface PolicyEvaluationOptions {
  isRecipe?: boolean;
  assignedRegion?: string;
  allowArbitrarySql?: boolean;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: string;
  violations: string[];
  referencedColumns: string[];
  hasAggregation: boolean;
  hasSmallCohortRisk: boolean;
}

interface ColumnCollectorState {
  columns: Set<string>;
  aggregates: Set<string>;
  whereExpressions: Array<{
    left: string;
    op: string;
    right: string | number;
    isColumnComparison?: boolean;
  }>;
  havingExpressions: Array<{
    left: string;
    op: string;
    right: string | number;
  }>;
}

function extractColumnName(val: unknown): string | null {
  if (typeof val === "string") {
    return val.toLowerCase();
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.value === "string") {
      return obj.value.toLowerCase();
    }
    if (obj.expr !== null && typeof obj.expr === "object") {
      const exprObj = obj.expr as Record<string, unknown>;
      if (typeof exprObj.value === "string") {
        return exprObj.value.toLowerCase();
      }
    }
  }
  return null;
}

function extractBinaryOperand(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  if (typeof val === "string" || typeof val === "number") {
    return String(val);
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (obj.type === "column_ref") {
      return extractColumnName(obj.column) ?? "";
    }
    if (obj.type === "expr_list" && Array.isArray(obj.value)) {
      return obj.value
        .map((v) =>
          v && typeof v === "object" && "value" in v
            ? String((v as Record<string, unknown>).value)
            : String(v),
        )
        .join(",");
    }
    if (obj.value !== undefined) {
      return String(obj.value);
    }
  }
  return "";
}

function isColumnReferenceNode(val: unknown): boolean {
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    return obj.type === "column_ref";
  }
  return false;
}

function traverseAstForPolicy(
  node: unknown,
  state: ColumnCollectorState,
): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      traverseAstForPolicy(item, state);
    }
    return;
  }

  const record = node as Record<string, unknown>;

  if (record.type === "column_ref") {
    const colName = extractColumnName(record.column);
    if (colName && colName !== "*") {
      state.columns.add(colName);
    }
  }

  if (record.type === "aggr_func" && typeof record.name === "string") {
    state.aggregates.add(record.name.toUpperCase());
  }

  if (record.type === "binary_expr") {
    const leftStr = extractBinaryOperand(record.left);
    const opStr = typeof record.operator === "string" ? record.operator : "";
    const rightStr = extractBinaryOperand(record.right);
    const isColumnComparison =
      isColumnReferenceNode(record.left) && isColumnReferenceNode(record.right);
    if (leftStr && opStr) {
      state.whereExpressions.push({
        left: leftStr.toLowerCase(),
        op: opStr.toUpperCase(),
        right: rightStr,
        isColumnComparison,
      });
    }
  }

  if (record.with !== undefined && Array.isArray(record.with)) {
    for (const cte of record.with) {
      traverseAstForPolicy(cte, state);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (key !== "with") {
      traverseAstForPolicy(value, state);
    }
  }
}

export function evaluatePolicyCompliance(
  sql: string,
  role: OrganizationRole,
  options: PolicyEvaluationOptions = {},
): PolicyEvaluationResult {
  const trimmed = sql.trim();
  const violations: string[] = [];

  if (role === "viewer" && !options.isRecipe) {
    violations.push(
      "Viewers are restricted to approved aggregate recipes and cannot execute arbitrary SQL",
    );
    return {
      allowed: false,
      reason:
        "Viewers are restricted to approved aggregate recipes and cannot execute arbitrary SQL",
      violations,
      referencedColumns: [],
      hasAggregation: false,
      hasSmallCohortRisk: false,
    };
  }

  if (
    /powershell/i.test(trimmed) ||
    /cmd\|/i.test(trimmed) ||
    /['"]?[=+\-@|]\s*cmd/i.test(trimmed) ||
    /curl\s+http/i.test(trimmed)
  ) {
    violations.push(
      "Dangerous formula injection or command execution pattern detected",
    );
    return {
      allowed: false,
      reason:
        "Dangerous formula injection or command execution pattern detected",
      violations,
      referencedColumns: [],
      hasAggregation: false,
      hasSmallCohortRisk: false,
    };
  }

  let ast: SqlAst;
  try {
    ast = parseSql(trimmed);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SQL parsing failed";
    violations.push(`Malformed SQL: ${message}`);
    return {
      allowed: false,
      reason: `Malformed SQL: ${message}`,
      violations,
      referencedColumns: [],
      hasAggregation: false,
      hasSmallCohortRisk: false,
    };
  }

  const state: ColumnCollectorState = {
    columns: new Set<string>(),
    aggregates: new Set<string>(),
    whereExpressions: [],
    havingExpressions: [],
  };

  traverseAstForPolicy(ast, state);

  const referencedColumns = Array.from(state.columns);
  const disallowedSet =
    role === "owner" ? ownerDisallowedColumns : analystDisallowedColumns;

  for (const col of referencedColumns) {
    if (disallowedSet.has(col)) {
      violations.push(`Restricted column access: ${col}`);
    }
  }

  if (role === "viewer") {
    for (const col of referencedColumns) {
      const isAllowedDim = approvedAggregateDimensions.includes(col);
      const isAllowedMeasure = approvedAggregateMeasures.includes(col);
      const isCleanAllowed = approvedAnalyticalColumns.includes(col);
      if (!isAllowedDim && !isAllowedMeasure && !isCleanAllowed) {
        violations.push(`Viewer restricted from raw identifier column: ${col}`);
      }
    }
  }

  const assignedRegion = options.assignedRegion ?? "North America";
  if (role === "analyst" || role === "viewer") {
    for (const expr of state.whereExpressions) {
      if (expr.left === "region" && expr.op === "=") {
        const targetRegion = String(expr.right).replace(/['"]/g, "").trim();
        if (
          targetRegion.length > 0 &&
          targetRegion.toLowerCase() !== assignedRegion.toLowerCase()
        ) {
          violations.push(
            `Access denied to rows outside assigned region '${assignedRegion}' (requested: '${targetRegion}')`,
          );
        }
      }
    }
  }

  let hasSmallCohortRisk = false;
  for (const expr of state.whereExpressions) {
    if (expr.isColumnComparison) {
      continue;
    }
    const isEntityKey =
      expr.left === "school_id" ||
      expr.left === "student_id" ||
      expr.left === "employee_id" ||
      expr.left === "id" ||
      expr.left === "k" ||
      expr.left === "org_k";

    if (isEntityKey) {
      if (expr.op === "!=" || expr.op === "<>") {
        hasSmallCohortRisk = true;
        violations.push(
          "Differencing attack detected: isolating individual record via exclusion predicate",
        );
      }
      if (
        (expr.op === "=" || expr.op === "IN") &&
        state.aggregates.size > 0 &&
        (role === "analyst" || role === "viewer")
      ) {
        const cohortSize =
          expr.op === "IN" ? String(expr.right).split(",").length : 1;
        if (cohortSize < SMALL_COHORT_THRESHOLD) {
          hasSmallCohortRisk = true;
          violations.push(
            `Small-cohort aggregate below privacy threshold (cohort < ${SMALL_COHORT_THRESHOLD})`,
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    return {
      allowed: false,
      reason: violations[0],
      violations,
      referencedColumns,
      hasAggregation: state.aggregates.size > 0,
      hasSmallCohortRisk,
    };
  }

  return {
    allowed: true,
    violations: [],
    referencedColumns,
    hasAggregation: state.aggregates.size > 0,
    hasSmallCohortRisk: false,
  };
}

export function getEffectivePolicy(
  role: OrganizationRole,
  assignedRegion = "North America",
): EffectivePolicy {
  switch (role) {
    case "owner":
      return {
        role: "owner",
        policyVersion: CURRENT_POLICY_VERSION,
        permittedActions: [...ownerActions],
        rowBoundaryPredicate: "workspace_id = :workspace_id",
        allowedColumns: [
          ...approvedAnalyticalColumns,
          "region",
          "all_business",
        ],
        restrictedColumns: Array.from(ownerDisallowedColumns),
        smallCohortThreshold: SMALL_COHORT_THRESHOLD,
      };
    case "analyst":
      return {
        role: "analyst",
        policyVersion: CURRENT_POLICY_VERSION,
        permittedActions: [...analystActions],
        rowBoundaryPredicate: `region = '${assignedRegion}'`,
        allowedColumns: [...approvedAnalyticalColumns],
        restrictedColumns: Array.from(analystDisallowedColumns),
        smallCohortThreshold: SMALL_COHORT_THRESHOLD,
      };
    case "viewer":
      return {
        role: "viewer",
        policyVersion: CURRENT_POLICY_VERSION,
        permittedActions: [...viewerActions],
        rowBoundaryPredicate: `region = '${assignedRegion}' AND is_aggregate = true`,
        allowedColumns: [
          ...approvedAggregateMeasures,
          ...approvedAggregateDimensions,
        ],
        restrictedColumns: Array.from(analystDisallowedColumns),
        smallCohortThreshold: SMALL_COHORT_THRESHOLD,
      };
  }
}

export function simulatePolicy(
  input: PolicySimulateInput,
): PolicySimulateResult {
  const effective = getEffectivePolicy(input.targetRole);
  const evaluation = evaluatePolicyCompliance(input.sql, input.targetRole, {
    isRecipe: false,
    assignedRegion: "North America",
  });

  return {
    allowed: evaluation.allowed,
    targetRole: input.targetRole,
    evaluatedPolicyVersion: CURRENT_POLICY_VERSION,
    rowBoundaryPredicate: effective.rowBoundaryPredicate,
    violations: evaluation.violations,
    effectiveColumns: evaluation.allowed ? evaluation.referencedColumns : [],
    reason: evaluation.reason,
  };
}

const revokedSubjects = new Set<string>();

export function revokeSubjectAccess(subject: string): void {
  revokedSubjects.add(subject);
}

export function restoreSubjectAccess(subject: string): void {
  revokedSubjects.delete(subject);
}

export function resetRevocations(): void {
  revokedSubjects.clear();
}

export function isSubjectRevoked(subject: string): boolean {
  return revokedSubjects.has(subject);
}
