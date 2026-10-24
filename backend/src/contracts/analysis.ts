import Type, { type Static } from "typebox";
import { foundationPolicy } from "../policy.js";
import {
  IdSchema,
  ScalarSchema,
  TextSchema,
  TimestampSchema,
} from "./common.js";

export const terminalStatuses = [
  "answered",
  "needs_clarification",
  "abstained",
  "blocked_by_policy",
  "execution_failed",
  "timed_out",
  "cancelled",
] as const;
export const activeStatuses = [
  "queued",
  "parsing",
  "retrieving",
  "grounding",
  "planning",
  "generating",
  "authorizing",
  "estimating",
  "executing",
  "verifying",
  "challenging",
] as const;
export const runStatuses = [...activeStatuses, ...terminalStatuses] as const;
export const TerminalStatusSchema = Type.Enum(terminalStatuses);
export const RunStatusSchema = Type.Enum(runStatuses);
export const QuestionIntentSchema = Type.Object(
  {
    question: TextSchema,
    entities: Type.Array(TextSchema, { maxItems: 50 }),
    measures: Type.Array(TextSchema, { minItems: 1, maxItems: 20 }),
    dimensions: Type.Array(TextSchema, { maxItems: 20 }),
    filters: Type.Array(
      Type.Object(
        {
          field: TextSchema,
          operator: Type.Union([
            Type.Literal("eq"),
            Type.Literal("ne"),
            Type.Literal("gt"),
            Type.Literal("gte"),
            Type.Literal("lt"),
            Type.Literal("lte"),
            Type.Literal("in"),
          ]),
          values: Type.Array(ScalarSchema, { minItems: 1, maxItems: 100 }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 50 },
    ),
    timeRange: Type.Union([
      Type.Object(
        { start: TextSchema, end: TextSchema, semantics: TextSchema },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    comparison: Type.Union([TextSchema, Type.Null()]),
    grain: Type.Array(TextSchema, { minItems: 1, maxItems: 20 }),
    ambiguityFlags: Type.Array(TextSchema, { maxItems: 20 }),
  },
  { additionalProperties: false },
);
export const SchemaEvidenceSchema = Type.Object(
  {
    objectId: TextSchema,
    objectType: Type.Union([
      Type.Literal("table"),
      Type.Literal("column"),
      Type.Literal("relationship"),
    ]),
    type: TextSchema,
    constraints: Type.Array(TextSchema, { maxItems: 100 }),
    profileSummary: Type.Object(
      {
        sampledRows: Type.Integer({
          minimum: 0,
          maximum: foundationPolicy.limits.resultRows,
        }),
        nullCount: Type.Integer({ minimum: 0 }),
        distinctCount: Type.Integer({ minimum: 0 }),
        estimated: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    provenance: Type.Object(
      { snapshotId: IdSchema, method: TextSchema, capturedAt: TimestampSchema },
      { additionalProperties: false },
    ),
    relevanceSignals: Type.Array(TextSchema, { maxItems: 50 }),
  },
  { additionalProperties: false },
);
export const AnalyticalPlanSchema = Type.Object(
  {
    sources: Type.Array(TextSchema, { minItems: 1, maxItems: 20 }),
    joinEdges: Type.Array(
      Type.Object(
        {
          left: TextSchema,
          right: TextSchema,
          relationshipEvidence: Type.Array(TextSchema, {
            minItems: 1,
            maxItems: 20,
          }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 20 },
    ),
    predicates: Type.Array(TextSchema, { maxItems: 50 }),
    aggregations: Type.Array(TextSchema, { maxItems: 20 }),
    grain: Type.Array(TextSchema, { minItems: 1, maxItems: 20 }),
    nullPolicy: TextSchema,
    assumptions: Type.Array(TextSchema, { maxItems: 50 }),
    verificationPlan: Type.Array(TextSchema, { minItems: 1, maxItems: 30 }),
  },
  { additionalProperties: false },
);
export const SqlCandidateSchema = Type.Object(
  {
    candidateId: IdSchema,
    dialect: Type.Literal("PostgreSQL"),
    sqlText: Type.String({ minLength: 1, maxLength: 32768 }),
    referencedObjects: Type.Array(TextSchema, { minItems: 1, maxItems: 100 }),
    parameterDefinitions: Type.Array(
      Type.Object(
        { name: TextSchema, type: TextSchema, sensitive: Type.Boolean() },
        { additionalProperties: false },
      ),
      { maxItems: 100 },
    ),
  },
  { additionalProperties: false },
);
export const ExecutionRecordSchema = Type.Object(
  {
    runId: IdSchema,
    queryHash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    durationMs: Type.Number({ minimum: 0 }),
    rowCount: Type.Integer({
      minimum: 0,
      maximum: foundationPolicy.limits.resultRows,
    }),
    status: Type.Union([
      Type.Literal("succeeded"),
      Type.Literal("failed"),
      Type.Literal("timed_out"),
      Type.Literal("cancelled"),
    ]),
    safeErrorCode: Type.Union([TextSchema, Type.Null()]),
    resourceUsage: Type.Object(
      {
        returnedBytes: Type.Integer({ minimum: 0 }),
        modelCalls: Type.Integer({
          minimum: 0,
          maximum: foundationPolicy.limits.modelCallsPerRun,
        }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export const VerificationReportSchema = Type.Object(
  {
    checks: Type.Array(
      Type.Object(
        {
          ruleId: TextSchema,
          version: TextSchema,
          outcome: Type.Union([
            Type.Literal("passed"),
            Type.Literal("failed"),
            Type.Literal("not_applicable"),
          ]),
          severity: Type.Union([Type.Literal("hard"), Type.Literal("warning")]),
          reason: TextSchema,
          evidenceReferences: Type.Array(TextSchema, { maxItems: 100 }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 100 },
    ),
    hardGateFailures: Type.Array(TextSchema, { maxItems: 100 }),
    warnings: Type.Array(TextSchema, { maxItems: 100 }),
    coverage: Type.Object(
      {
        included: Type.Integer({ minimum: 0 }),
        excluded: Type.Integer({ minimum: 0 }),
        denominator: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    evidenceReferences: Type.Array(TextSchema, { maxItems: 100 }),
  },
  { additionalProperties: false },
);
const answerFields = {
  runId: IdSchema,
  assumptions: Type.Array(TextSchema, { maxItems: 50 }),
  limitations: Type.Array(TextSchema, { maxItems: 50 }),
};
export const AnswerEnvelopeSchema = Type.Union([
  Type.Object(
    {
      ...answerFields,
      status: Type.Literal("answered"),
      answerText: TextSchema,
      definition: TextSchema,
      resultReference: IdSchema,
      sqlReference: Type.Union([IdSchema, Type.Null()]),
      evidence: Type.Array(TextSchema, { minItems: 1, maxItems: 100 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...answerFields,
      status: Type.Exclude(TerminalStatusSchema, Type.Literal("answered")),
      reason: TextSchema,
      nextAction: TextSchema,
    },
    { additionalProperties: false },
  ),
]);
export const SubmitAnalysisSchema = Type.Object(
  {
    connectionId: IdSchema,
    question: Type.String({ minLength: 1, maxLength: 4096, pattern: "\\S" }),
    parentRunId: Type.Optional(IdSchema),
  },
  { additionalProperties: false },
);
export const RunSchema = Type.Object(
  {
    runId: IdSchema,
    status: RunStatusSchema,
    sequence: Type.Integer({ minimum: 0 }),
    startedAt: TimestampSchema,
    completedAt: Type.Union([TimestampSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export const RunEventSchema = Type.Object(
  {
    runId: IdSchema,
    sequence: Type.Integer({ minimum: 1 }),
    type: Type.Literal("progress"),
    status: RunStatusSchema,
    timestamp: TimestampSchema,
  },
  { additionalProperties: false },
);
export const ResultSchema = Type.Object(
  {
    answer: AnswerEnvelopeSchema,
    columns: Type.Array(TextSchema, { maxItems: 100 }),
    rows: Type.Array(Type.Record(Type.String(), ScalarSchema), {
      maxItems: foundationPolicy.limits.resultRows,
    }),
  },
  { additionalProperties: false },
);
const evidenceFields = {
  runId: IdSchema,
  question: TextSchema,
  assumptions: Type.Array(TextSchema, { maxItems: 50 }),
  exclusions: Type.Array(TextSchema, { maxItems: 100 }),
  modelVersion: TextSchema,
};
export const EvidenceBundleSchema = Type.Union([
  Type.Object(
    {
      ...evidenceFields,
      finalStatus: Type.Literal("answered"),
      intent: QuestionIntentSchema,
      snapshotId: IdSchema,
      plan: AnalyticalPlanSchema,
      candidate: SqlCandidateSchema,
      execution: ExecutionRecordSchema,
      verification: VerificationReportSchema,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...evidenceFields,
      finalStatus: Type.Exclude(TerminalStatusSchema, Type.Literal("answered")),
      intent: Type.Union([QuestionIntentSchema, Type.Null()]),
      snapshotId: Type.Union([IdSchema, Type.Null()]),
      plan: Type.Union([AnalyticalPlanSchema, Type.Null()]),
      candidate: Type.Union([SqlCandidateSchema, Type.Null()]),
      execution: Type.Union([ExecutionRecordSchema, Type.Null()]),
      verification: Type.Union([VerificationReportSchema, Type.Null()]),
    },
    { additionalProperties: false },
  ),
]);
export type QuestionIntent = Static<typeof QuestionIntentSchema>;
export type AnalyticalPlan = Static<typeof AnalyticalPlanSchema>;
export type Result = Static<typeof ResultSchema>;
export type AnswerEnvelope = Static<typeof AnswerEnvelopeSchema>;
export type RunStatus = Static<typeof RunStatusSchema>;

export const TruthLedgerRuleCheckSchema = Type.Object(
  {
    ruleId: TextSchema,
    outcome: TextSchema,
    reason: TextSchema,
  },
  { additionalProperties: false },
);

export const TruthLedgerClaimSchema = Type.Object(
  {
    claim: TextSchema,
    supportingRows: Type.Array(Type.Record(Type.String(), ScalarSchema), {
      maxItems: foundationPolicy.limits.resultRows,
    }),
    sqlReference: Type.Union([IdSchema, Type.Null()]),
    sourceObjects: Type.Array(TextSchema, { maxItems: 100 }),
    verificationRules: Type.Array(TruthLedgerRuleCheckSchema, {
      maxItems: 100,
    }),
  },
  { additionalProperties: false },
);

export const TruthLedgerSchema = Type.Object(
  {
    runId: IdSchema,
    status: TerminalStatusSchema,
    claims: Type.Array(TruthLedgerClaimSchema, { maxItems: 100 }),
    coverage: Type.Object(
      {
        included: Type.Integer({ minimum: 0 }),
        excluded: Type.Integer({ minimum: 0 }),
        denominator: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    exclusions: Type.Array(TextSchema, { maxItems: 100 }),
    limitations: Type.Array(TextSchema, { maxItems: 100 }),
  },
  { additionalProperties: false },
);

export const ReproducibilityBundleSchema = Type.Object(
  {
    version: Type.Literal("1.0.0"),
    runId: IdSchema,
    workspaceId: IdSchema,
    connectionId: IdSchema,
    parentRunId: Type.Union([IdSchema, Type.Null()]),
    question: TextSchema,
    intent: Type.Union([QuestionIntentSchema, Type.Null()]),
    snapshotId: Type.Union([IdSchema, Type.Null()]),
    plan: Type.Union([AnalyticalPlanSchema, Type.Null()]),
    candidate: Type.Union([SqlCandidateSchema, Type.Null()]),
    execution: Type.Union([ExecutionRecordSchema, Type.Null()]),
    verification: Type.Union([VerificationReportSchema, Type.Null()]),
    answer: AnswerEnvelopeSchema,
    assumptions: Type.Array(TextSchema, { maxItems: 50 }),
    exclusions: Type.Array(TextSchema, { maxItems: 100 }),
    modelVersion: TextSchema,
    exportedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export type TruthLedger = Static<typeof TruthLedgerSchema>;
export type ReproducibilityBundle = Static<typeof ReproducibilityBundleSchema>;

export const ActiveContextSchema = Type.Object(
  {
    connectionId: IdSchema,
    sources: Type.Array(TextSchema, { maxItems: 50 }),
    metric: TextSchema,
    grain: Type.Array(TextSchema, { maxItems: 20 }),
    timeRange: Type.Union([
      Type.Object(
        {
          start: TextSchema,
          end: TextSchema,
          semantics: TextSchema,
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    filters: Type.Array(
      Type.Object(
        {
          field: TextSchema,
          operator: TextSchema,
          values: Type.Array(ScalarSchema, { maxItems: 100 }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 50 },
    ),
    confirmedAssumptions: Type.Array(TextSchema, { maxItems: 50 }),
  },
  { additionalProperties: false },
);

export const ContextDeltaSchema = Type.Object(
  {
    changedFields: Type.Array(TextSchema, { maxItems: 20 }),
    previousValues: Type.Record(TextSchema, Type.Any()),
    newValues: Type.Record(TextSchema, Type.Any()),
    changeType: Type.Union([
      Type.Literal("initial"),
      Type.Literal("refinement"),
      Type.Literal("branch"),
      Type.Literal("reset"),
      Type.Literal("clarification"),
    ]),
    explanation: TextSchema,
  },
  { additionalProperties: false },
);

export const ConversationTurnSchema = Type.Object(
  {
    turnNumber: Type.Integer({ minimum: 1 }),
    runId: IdSchema,
    parentRunId: Type.Union([IdSchema, Type.Null()]),
    question: TextSchema,
    status: TerminalStatusSchema,
    activeContext: ActiveContextSchema,
    delta: ContextDeltaSchema,
    createdAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const ConversationContextResponseSchema = Type.Object(
  {
    runId: IdSchema,
    parentRunId: Type.Union([IdSchema, Type.Null()]),
    rootRunId: IdSchema,
    turnNumber: Type.Integer({ minimum: 1 }),
    activeContext: ActiveContextSchema,
    delta: ContextDeltaSchema,
    turns: Type.Array(ConversationTurnSchema, { maxItems: 100 }),
  },
  { additionalProperties: false },
);

export type ActiveContext = Static<typeof ActiveContextSchema>;
export type ContextDelta = Static<typeof ContextDeltaSchema>;
export type ConversationTurn = Static<typeof ConversationTurnSchema>;
export type ConversationContextResponse = Static<
  typeof ConversationContextResponseSchema
>;
