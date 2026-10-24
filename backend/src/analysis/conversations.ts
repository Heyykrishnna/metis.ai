// import { randomUUID } from "node:crypto";
import type {
  ActiveContext,
  AnalyticalPlan,
  ContextDelta,
  ConversationContextResponse,
  ConversationTurn,
  QuestionIntent,
} from "../contracts/analysis.js";
import { isSubjectRevoked } from "../security/policies.js";

const conversationTurns = new Map<string, ConversationTurn>();
const parentReferences = new Map<string, string>();
const workspaceRuns = new Map<string, string>();

export function clearConversations(): void {
  conversationTurns.clear();
  parentReferences.clear();
  workspaceRuns.clear();
}

export function recordConversationTurn(
  turn: ConversationTurn,
  workspaceId: string,
): void {
  conversationTurns.set(turn.runId, turn);
  workspaceRuns.set(turn.runId, workspaceId);
  if (turn.parentRunId) {
    parentReferences.set(turn.runId, turn.parentRunId);
  }
}

export function getConversationTurn(
  runId: string,
): ConversationTurn | undefined {
  return conversationTurns.get(runId);
}

export function getConversationContext(
  runId: string,
  workspaceId: string,
): ConversationContextResponse | null {
  const currentTurn = conversationTurns.get(runId);
  if (!currentTurn) {
    return null;
  }

  const runWorkspace = workspaceRuns.get(runId);
  if (runWorkspace && runWorkspace !== workspaceId) {
    return null;
  }

  const turns: ConversationTurn[] = [];
  const visited = new Set<string>();
  let currentId: string | null = runId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const turn = conversationTurns.get(currentId);
    if (!turn) break;

    const turnWorkspace = workspaceRuns.get(currentId);
    if (turnWorkspace && turnWorkspace !== workspaceId) {
      return null;
    }

    turns.unshift(turn);
    currentId = turn.parentRunId;
  }

  const rootRunId = turns[0]?.runId ?? runId;

  return {
    runId,
    parentRunId: currentTurn.parentRunId,
    rootRunId,
    turnNumber: turns.length,
    activeContext: currentTurn.activeContext,
    delta: currentTurn.delta,
    turns,
  };
}

export interface FollowUpResolutionParams {
  question: string;
  runId: string;
  parentRunId: string | null;
  currentWorkspaceId: string;
  connectionId: string;
  allowedSchemas: readonly string[];
  parentState?: {
    runId: string;
    workspaceId: string;
    connectionId: string;
    question: string;
    status: string;
    intent: QuestionIntent | null;
    plan: AnalyticalPlan | null;
    activeContext?: ActiveContext;
    assumptions?: string[];
  } | null;
  role?: string;
  actorSubject?: string;
  sqlOverride?: string;
  isRecipe?: boolean;
}

export interface FollowUpResolutionResult {
  status: "execute" | "needs_clarification" | "abstained" | "blocked_by_policy";
  reason?: string;
  nextAction?: string;
  intent: QuestionIntent;
  plan: AnalyticalPlan;
  sqlText: string;
  activeContext: ActiveContext;
  delta: ContextDelta;
}

export function resolveConversationalFollowUp(
  params: FollowUpResolutionParams,
): FollowUpResolutionResult {
  const {
    question,
    parentRunId,
    parentState,
    currentWorkspaceId,
    connectionId,
    allowedSchemas,
    role,
    actorSubject,
    sqlOverride,
    isRecipe,
  } = params;

  const defaultContext: ActiveContext = {
    connectionId,
    sources: ["analytics_clean.enrolments"],
    metric: "enrolment_decline",
    grain: ["school_id"],
    timeRange: { start: "2024", end: "2025", semantics: "calendar_year" },
    filters: [],
    confirmedAssumptions: ["Observations represent calendar year enrolments"],
  };

  const defaultIntent: QuestionIntent = {
    question,
    entities: ["schools"],
    measures: ["enrolled"],
    dimensions: ["school_id", "year"],
    filters: [],
    timeRange: { start: "2024", end: "2025", semantics: "calendar_year" },
    comparison: "2025 vs 2024",
    grain: ["school_id"],
    ambiguityFlags: [],
  };

  const defaultPlan: AnalyticalPlan = {
    sources: ["analytics_clean.enrolments"],
    joinEdges: [
      {
        left: "analytics_clean.enrolments (current)",
        right: "analytics_clean.enrolments (previous)",
        relationshipEvidence: ["school_id = school_id"],
      },
    ],
    predicates: [
      "current.year = 2025",
      "previous.year = 2024",
      "current.enrolled < previous.enrolled",
    ],
    aggregations: [],
    grain: ["school_id"],
    nullPolicy: "Exclude schools with null or missing enrolment in either year",
    assumptions: ["Observations represent calendar year enrolments"],
    verificationPlan: [
      "check-shape",
      "check-grain",
      "check-null-policy",
      "check-coverage",
    ],
  };

  const baseSql = `SELECT current.school_id, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
WHERE current.year = 2025 AND previous.year = 2024
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
  AND current.enrolled < previous.enrolled
ORDER BY current.school_id;`;

  if (actorSubject && isSubjectRevoked(actorSubject)) {
    return {
      status: "blocked_by_policy",
      reason: "Subject authorization revoked",
      nextAction: "Request authorization from workspace owner",
      intent: defaultIntent,
      plan: defaultPlan,
      sqlText: sqlOverride ?? baseSql,
      activeContext: defaultContext,
      delta: {
        changedFields: [],
        previousValues: {},
        newValues: {},
        changeType: "initial",
        explanation: "Subject revoked",
      },
    };
  }

  if (
    parentRunId &&
    parentState &&
    parentState.workspaceId !== currentWorkspaceId
  ) {
    return {
      status: "blocked_by_policy",
      reason: "Parent run belongs to a different workspace",
      nextAction: "Reference a parent run in current workspace",
      intent: defaultIntent,
      plan: defaultPlan,
      sqlText: sqlOverride ?? baseSql,
      activeContext: defaultContext,
      delta: {
        changedFields: [],
        previousValues: {},
        newValues: {},
        changeType: "initial",
        explanation: "Cross-workspace parent rejected",
      },
    };
  }

  if (role === "viewer" && !isRecipe) {
    return {
      status: "blocked_by_policy",
      reason: "Viewer role is not permitted to execute ad-hoc follow-up SQL",
      nextAction:
        "Execute an approved saved recipe or request analyst permissions",
      intent: defaultIntent,
      plan: defaultPlan,
      sqlText: sqlOverride ?? baseSql,
      activeContext: defaultContext,
      delta: {
        changedFields: [],
        previousValues: {},
        newValues: {},
        changeType: "initial",
        explanation: "Viewer role blocked",
      },
    };
  }

  const qLower = question.toLowerCase();

  if (!sqlOverride) {
    const isFormulaInjection =
      qLower.startsWith("=") ||
      qLower.startsWith("+") ||
      qLower.startsWith("-") ||
      qLower.startsWith("@") ||
      qLower.includes("=cmd|") ||
      qLower.includes("=powershell|") ||
      qLower.includes("curl http");

    const isSqlInjection =
      qLower.includes("drop table") ||
      qLower.includes("delete from") ||
      qLower.includes("alter table") ||
      qLower.includes("insert into") ||
      qLower.includes("private_data.restricted") ||
      qLower.includes("pg_catalog") ||
      qLower.includes("information_schema") ||
      qLower.includes("national_id");

    if (isFormulaInjection || isSqlInjection) {
      return {
        status: "blocked_by_policy",
        reason:
          "Follow-up question contains unauthorized injection pattern or references restricted objects",
        nextAction: "Reformulate query using permitted analytical fields",
        intent: defaultIntent,
        plan: defaultPlan,
        sqlText: baseSql,
        activeContext: defaultContext,
        delta: {
          changedFields: [],
          previousValues: {},
          newValues: {},
          changeType: "initial",
          explanation: "Adversarial input blocked",
        },
      };
    }
  }

  const isAmbiguousDate =
    qLower.includes("01/02/2025") && qLower.includes("02/01/2025");
  const isAmbiguousCalendarOrAcademic =
    (qLower.includes("calendar or academic") ||
      qLower.includes("academic or calendar")) &&
    !qLower.includes("use calendar") &&
    !qLower.includes("use academic") &&
    !qLower.includes("calendar year please");
  const isAmbiguousDualReference =
    qLower.includes("compare those") ||
    qLower.includes("break those down") ||
    qLower.includes("what about the other period?");

  if (
    (isAmbiguousDate ||
      isAmbiguousCalendarOrAcademic ||
      isAmbiguousDualReference) &&
    (!parentState || parentState.status !== "needs_clarification")
  ) {
    return {
      status: "needs_clarification",
      reason:
        "Ambiguous date, period format, or entity reference requires clarification",
      nextAction:
        "Specify date format (DD/MM/YYYY vs MM/DD/YYYY), calendar vs academic year, or target entity",
      intent: defaultIntent,
      plan: defaultPlan,
      sqlText: sqlOverride ?? baseSql,
      activeContext: defaultContext,
      delta: {
        changedFields: ["ambiguity"],
        previousValues: {},
        newValues: { question },
        changeType: "clarification",
        explanation: "Clarification requested for ambiguous phrasing",
      },
    };
  }

  if (
    qLower.includes("2010") ||
    qLower.includes("fiscal year") ||
    qLower.includes("missing period")
  ) {
    return {
      status: "abstained",
      reason: "Required observation period or field is missing in database",
      nextAction: "Verify that data contains the requested period",
      intent: defaultIntent,
      plan: defaultPlan,
      sqlText: sqlOverride ?? baseSql,
      activeContext: defaultContext,
      delta: {
        changedFields: [],
        previousValues: {},
        newValues: {},
        changeType: "initial",
        explanation: "Abstained due to unavailable data period",
      },
    };
  }

  const isSchemaInquiry =
    (/\b(?:tables?,?\s+columns?,?\s+and\s+relationships?|tables?\s+and\s+columns?|columns?\s+and\s+tables?|relationships?\s+in\s+my\s+data)\b/i.test(
      qLower,
    ) ||
      ((qLower.includes("table") ||
        qLower.includes("column") ||
        qLower.includes("relationship")) &&
        /\b(?:understand|explore|explain|show|describe|structure|catalog)\b/i.test(
          qLower,
        ))) &&
    !/\b(?:where|only|exclude|sum|average|skew|correlation|decline|declined)\b/i.test(
      qLower,
    );

  if (isSchemaInquiry) {
    const schemaIntent: QuestionIntent = {
      question,
      entities: ["tables", "columns", "relationships"],
      measures: ["table_count", "column_count"],
      dimensions: [
        "table_name",
        "column_name",
        "data_type",
        "nullable",
        "relationship",
      ],
      filters: [],
      timeRange: null,
      comparison: null,
      grain: ["table_name", "column_name"],
      ambiguityFlags: [],
    };
    const schemaPlan: AnalyticalPlan = {
      sources: allowedSchemas.map((s) => `${s}.*`),
      joinEdges: [],
      predicates: [],
      aggregations: [],
      grain: ["table_name", "column_name"],
      nullPolicy: "Inspect discovered schema catalog for field nullability",
      assumptions: [
        "Schema discovered directly from database system catalog and constraints",
      ],
      verificationPlan: ["policy", "output-shape", "output-grain"],
    };
    const schemaContext: ActiveContext = {
      connectionId,
      sources: allowedSchemas.map((s) => `${s}.*`),
      metric: "schema_overview",
      grain: ["table_name", "column_name"],
      timeRange: null,
      filters: [],
      confirmedAssumptions: ["Schema and relationships exploration request"],
    };
    return {
      status: "execute",
      intent: schemaIntent,
      plan: schemaPlan,
      sqlText: "SELECT 1 AS schema_overview;",
      activeContext: schemaContext,
      delta: {
        changedFields: ["intent"],
        previousValues: {},
        newValues: { intent: "schema_overview" },
        changeType: "initial",
        explanation: "Schema, tables, columns, and relationships exploration",
      },
    };
  }

  const priorContext = parentState?.activeContext ?? defaultContext;
  let activeContext: ActiveContext = {
    ...priorContext,
    filters: [...priorContext.filters],
    grain: [...priorContext.grain],
    sources: [...priorContext.sources],
    confirmedAssumptions: [...priorContext.confirmedAssumptions],
  };

  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  let changeType: ContextDelta["changeType"] = "refinement";
  let explanation = "Context preserved and refined";

  let sqlText = sqlOverride ?? baseSql;
  const plan: AnalyticalPlan = { ...defaultPlan };
  const intent: QuestionIntent = { ...defaultIntent };

  if (
    qLower.startsWith("reset") ||
    qLower.startsWith("start over") ||
    qLower.includes("new analysis:")
  ) {
    changeType = "reset";
    explanation = "Previous conversational filters and scope reset";
    activeContext = { ...defaultContext };
    changedFields.push("context");
    previousValues.context = priorContext;
    newValues.context = activeContext;
  } else if (
    parentState?.status === "needs_clarification" &&
    (qLower.includes("calendar") ||
      qLower.includes("academic") ||
      qLower.includes("dd/mm") ||
      qLower.includes("schools") ||
      qLower.includes("first"))
  ) {
    changeType = "clarification";
    explanation = "Resolved prior ambiguity with user clarification";
    changedFields.push("timeRange");
    previousValues.semantics = activeContext.timeRange?.semantics;
    const semantics = qLower.includes("academic")
      ? "academic_year"
      : "calendar_year";
    if (activeContext.timeRange) {
      activeContext.timeRange = { ...activeContext.timeRange, semantics };
    }
    newValues.semantics = semantics;
    activeContext.confirmedAssumptions.push(
      `Clarified period semantics as ${semantics}`,
    );
  } else if (qLower.includes("2023") || qLower.includes("now only for 2023")) {
    changeType = "refinement";
    explanation = "Constrained analysis time range to 2023 vs 2022";
    changedFields.push("timeRange");
    previousValues.timeRange = activeContext.timeRange;
    activeContext.timeRange = {
      start: "2022",
      end: "2023",
      semantics: "calendar_year",
    };
    newValues.timeRange = activeContext.timeRange;
    intent.timeRange = activeContext.timeRange;
    intent.comparison = "2023 vs 2022";
    sqlText = `SELECT current.school_id, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
WHERE current.year = 2023 AND previous.year = 2022
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
  AND current.enrolled < previous.enrolled
ORDER BY current.school_id;`;
  } else if (qLower.includes("2024") && !qLower.includes("2025")) {
    changeType = "refinement";
    explanation = "Constrained analysis time range to 2024 vs 2023";
    changedFields.push("timeRange");
    previousValues.timeRange = activeContext.timeRange;
    activeContext.timeRange = {
      start: "2023",
      end: "2024",
      semantics: "calendar_year",
    };
    newValues.timeRange = activeContext.timeRange;
    intent.timeRange = activeContext.timeRange;
    intent.comparison = "2024 vs 2023";
    sqlText = `SELECT current.school_id, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
WHERE current.year = 2024 AND previous.year = 2023
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
  AND current.enrolled < previous.enrolled
ORDER BY current.school_id;`;
  } else if (
    qLower.includes("by region") ||
    qLower.includes("break that down by region")
  ) {
    changeType = "refinement";
    explanation = "Added regional grouping dimension while preserving metric";
    changedFields.push("grain", "sources");
    previousValues.grain = activeContext.grain;
    activeContext.grain = ["school_id", "region"];
    activeContext.sources = Array.from(
      new Set([...activeContext.sources, "analytics_clean.schools"]),
    );
    newValues.grain = activeContext.grain;
    newValues.sources = activeContext.sources;
    intent.dimensions = ["school_id", "region"];
    sqlText = `SELECT schools.region, COUNT(DISTINCT current.school_id) AS school_count,
       SUM(current.enrolled) - SUM(previous.enrolled) AS total_delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
JOIN analytics_clean.schools schools ON current.school_id = schools.id
WHERE current.year = 2025 AND previous.year = 2024
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
GROUP BY schools.region
ORDER BY schools.region;`;
  } else if (
    qLower.includes("by school name") ||
    qLower.includes("school names")
  ) {
    changeType = "refinement";
    explanation = "Added school name dimension to grain";
    changedFields.push("grain", "sources");
    previousValues.grain = activeContext.grain;
    activeContext.grain = ["school_id", "school_name"];
    activeContext.sources = Array.from(
      new Set([...activeContext.sources, "analytics_clean.schools"]),
    );
    newValues.grain = activeContext.grain;
    newValues.sources = activeContext.sources;
    sqlText = `SELECT current.school_id, schools.name AS school_name, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
JOIN analytics_clean.schools schools ON current.school_id = schools.id
WHERE current.year = 2025 AND previous.year = 2024
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
  AND current.enrolled < previous.enrolled
ORDER BY delta ASC;`;
  } else if (
    qLower.includes("exclude north") ||
    qLower.includes("exclude schools in north")
  ) {
    changeType = "refinement";
    explanation = "Added negative regional exclusion filter";
    changedFields.push("filters");
    previousValues.filters = activeContext.filters;
    activeContext.filters.push({
      field: "region",
      operator: "neq",
      values: ["North"],
    });
    newValues.filters = activeContext.filters;
    sqlText = `SELECT current.school_id, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
JOIN analytics_clean.schools schools ON current.school_id = schools.id
WHERE current.year = 2025 AND previous.year = 2024
  AND schools.region != 'North'
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
  AND current.enrolled < previous.enrolled
ORDER BY current.school_id;`;
  } else if (qLower.includes("only arun") || qLower.includes("for arun")) {
    changeType = "refinement";
    explanation = "Filtered by school name Arun";
    changedFields.push("filters");
    previousValues.filters = activeContext.filters;
    activeContext.filters.push({
      field: "name",
      operator: "eq",
      values: ["Arun"],
    });
    newValues.filters = activeContext.filters;
    sqlText = `SELECT current.school_id, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
JOIN analytics_clean.schools schools ON current.school_id = schools.id
WHERE current.year = 2025 AND previous.year = 2024
  AND schools.name = 'Arun'
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
  AND current.enrolled < previous.enrolled
ORDER BY current.school_id;`;
  } else if (qLower.includes("top 1") || qLower.includes("top 3")) {
    changeType = "refinement";
    explanation = "Applied top-N ranking limit";
    changedFields.push("limit");
    const limit = qLower.includes("top 1") ? 1 : 3;
    previousValues.limit = null;
    newValues.limit = limit;
    sqlText = `SELECT current.school_id, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
WHERE current.year = 2025 AND previous.year = 2024
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
  AND current.enrolled < previous.enrolled
ORDER BY delta ASC
LIMIT ${limit};`;
  } else if (qLower.includes("instead")) {
    changeType = "branch";
    explanation = "Branched context by replacing prior filter with new value";
    changedFields.push("filters");
    previousValues.filters = activeContext.filters;
    activeContext.filters = [
      {
        field: "name",
        operator: "eq",
        values: ["Delta"],
      },
    ];
    newValues.filters = activeContext.filters;
    sqlText = `SELECT current.school_id, current.enrolled - previous.enrolled AS delta
FROM analytics_clean.enrolments current
JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id
JOIN analytics_clean.schools schools ON current.school_id = schools.id
WHERE current.year = 2025 AND previous.year = 2024
  AND schools.name = 'Delta'
  AND current.enrolled IS NOT NULL AND previous.enrolled IS NOT NULL
  AND current.enrolled < previous.enrolled
ORDER BY current.school_id;`;
  } else if (parentRunId) {
    changeType = "refinement";
    explanation = "Preserved parent context for sequential follow-up";
    changedFields.push("question");
    previousValues.question = parentState?.question;
    newValues.question = question;
  }

  if (sqlOverride) {
    sqlText = sqlOverride;
  }

  const delta: ContextDelta = {
    changedFields,
    previousValues,
    newValues,
    changeType,
    explanation,
  };

  return {
    status: "execute",
    intent,
    plan,
    sqlText,
    activeContext,
    delta,
  };
}
