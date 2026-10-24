import Type, { type Static } from "typebox";
import { IdSchema, TextSchema, TimestampSchema } from "./common.js";
import { RunStatusSchema } from "./analysis.js";

export const ConstellationNodeSchema = Type.Object(
  {
    id: TextSchema,
    name: TextSchema,
    schema: TextSchema,
    columns: Type.Array(
      Type.Object(
        {
          name: TextSchema,
          type: TextSchema,
          nullable: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      { maxItems: 100 },
    ),
    primaryKey: Type.Array(TextSchema, { maxItems: 10 }),
    rowCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const ConstellationEdgeSchema = Type.Object(
  {
    id: TextSchema,
    sourceTable: TextSchema,
    sourceColumn: TextSchema,
    targetTable: TextSchema,
    targetColumn: TextSchema,
    confidence: Type.Union([
      Type.Literal("declared"),
      Type.Literal("inferred_name"),
      Type.Literal("inferred_type"),
      Type.Literal("inferred_overlap"),
      Type.Literal("inferred_cardinality"),
    ]),
    isAuthoritative: Type.Boolean(),
    notes: TextSchema,
  },
  { additionalProperties: false },
);

export const SchemaConstellationSchema = Type.Object(
  {
    connectionId: IdSchema,
    snapshotId: IdSchema,
    schemaHash: TextSchema,
    nodes: Type.Array(ConstellationNodeSchema, { maxItems: 100 }),
    edges: Type.Array(ConstellationEdgeSchema, { maxItems: 200 }),
    generatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const RadarAnomalySchema = Type.Object(
  {
    id: TextSchema,
    ruleId: TextSchema,
    sourceObject: TextSchema,
    field: TextSchema,
    observedPattern: TextSchema,
    sampleCount: Type.Integer({ minimum: 0 }),
    samplingMethod: Type.Union([
      Type.Literal("deterministic_scan"),
      Type.Literal("bounded_sample"),
    ]),
    estimatedPrevalence: Type.Number({ minimum: 0, maximum: 1 }),
    proposedMapping: TextSchema,
    reviewState: Type.Union([
      Type.Literal("unreviewed"),
      Type.Literal("accepted"),
      Type.Literal("rejected"),
    ]),
  },
  { additionalProperties: false },
);

export const DirtyRadarReportSchema = Type.Object(
  {
    runId: IdSchema,
    anomalies: Type.Array(RadarAnomalySchema, { maxItems: 100 }),
    totalScannedRows: Type.Integer({ minimum: 0 }),
    generatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const UpdateRadarReviewSchema = Type.Object(
  {
    reviewState: Type.Union([
      Type.Literal("accepted"),
      Type.Literal("rejected"),
    ]),
  },
  { additionalProperties: false },
);

export const CounterfactualVariantSchema = Type.Object(
  {
    id: TextSchema,
    name: TextSchema,
    definition: TextSchema,
    periodSemantics: TextSchema,
    predicates: Type.Array(TextSchema, { maxItems: 20 }),
    grain: Type.Array(TextSchema, { maxItems: 10 }),
    rowCount: Type.Integer({ minimum: 0 }),
    deltaSummary: TextSchema,
    coverage: Type.Object(
      {
        included: Type.Integer({ minimum: 0 }),
        excluded: Type.Integer({ minimum: 0 }),
        denominator: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const CounterfactualDifferenceSchema = Type.Object(
  {
    dimension: TextSchema,
    primaryValue: TextSchema,
    counterfactualValue: TextSchema,
    isMaterial: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const CounterfactualReportSchema = Type.Object(
  {
    primaryRunId: IdSchema,
    variants: Type.Array(CounterfactualVariantSchema, { maxItems: 10 }),
    differences: Type.Array(CounterfactualDifferenceSchema, { maxItems: 50 }),
    isMaterialDifference: Type.Boolean(),
    recommendation: TextSchema,
  },
  { additionalProperties: false },
);

export const QueryCostPassportSchema = Type.Object(
  {
    runId: IdSchema,
    measured: Type.Object(
      {
        durationMs: Type.Number({ minimum: 0 }),
        rowCount: Type.Integer({ minimum: 0 }),
        returnedBytes: Type.Integer({ minimum: 0 }),
        modelCalls: Type.Integer({ minimum: 0 }),
        isMeasured: Type.Literal(true),
      },
      { additionalProperties: false },
    ),
    limits: Type.Object(
      {
        timeoutMs: Type.Integer({ minimum: 0 }),
        maxRows: Type.Integer({ minimum: 0 }),
        modelCallsLimit: Type.Integer({ minimum: 0 }),
        policyEnforced: Type.Literal(true),
      },
      { additionalProperties: false },
    ),
    advisoryEstimate: Type.Object(
      {
        estimatedCost: Type.Number({ minimum: 0 }),
        estimatedRows: Type.Number({ minimum: 0 }),
        planType: TextSchema,
        warnings: Type.Array(TextSchema, { maxItems: 20 }),
        isEstimated: Type.Literal(true),
        isAvailable: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    safetySummary: TextSchema,
  },
  { additionalProperties: false },
);

export const RecipeInputSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 200, pattern: "\\S" }),
    metricName: Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
    connectionId: IdSchema,
    question: Type.String({ minLength: 1, maxLength: 4096, pattern: "\\S" }),
    plan: Type.Record(Type.String(), Type.Any()),
    sqlText: Type.String({ minLength: 1, maxLength: 32768 }),
    grain: Type.Array(TextSchema, { minItems: 1, maxItems: 20 }),
    timeframePolicy: TextSchema,
    nullExclusionPolicy: TextSchema,
    approvalStatus: Type.Union([
      Type.Literal("draft"),
      Type.Literal("approved"),
      Type.Literal("archived"),
    ]),
  },
  { additionalProperties: false },
);

export const RecipeSchema = Type.Object(
  {
    id: IdSchema,
    workspaceId: IdSchema,
    name: TextSchema,
    metricName: TextSchema,
    version: Type.Integer({ minimum: 1 }),
    ownerSubject: TextSchema,
    connectionId: IdSchema,
    question: TextSchema,
    plan: Type.Record(Type.String(), Type.Any()),
    sqlText: TextSchema,
    grain: Type.Array(TextSchema, { minItems: 1, maxItems: 20 }),
    timeframePolicy: TextSchema,
    nullExclusionPolicy: TextSchema,
    approvalStatus: Type.Union([
      Type.Literal("draft"),
      Type.Literal("approved"),
      Type.Literal("archived"),
    ]),
    createdAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const RecipeExecuteResponseSchema = Type.Object(
  {
    recipeId: IdSchema,
    runId: IdSchema,
    status: RunStatusSchema,
  },
  { additionalProperties: false },
);

export type SchemaConstellation = Static<typeof SchemaConstellationSchema>;
export type DirtyRadarReport = Static<typeof DirtyRadarReportSchema>;
export type CounterfactualReport = Static<typeof CounterfactualReportSchema>;
export type QueryCostPassport = Static<typeof QueryCostPassportSchema>;
export type Recipe = Static<typeof RecipeSchema>;
export type RecipeInput = Static<typeof RecipeInputSchema>;
