import Type, { type Static } from "typebox";
import { IdSchema, TextSchema, TimestampSchema } from "./common.js";

export const DriftCategorySchema = Type.Union([
  Type.Literal("renamed_table"),
  Type.Literal("renamed_column"),
  Type.Literal("split_vertical"),
  Type.Literal("split_horizontal"),
  Type.Literal("dropped_object"),
  Type.Literal("permission_loss"),
  Type.Literal("type_changed"),
]);
export type DriftCategory = Static<typeof DriftCategorySchema>;

export const DriftSeveritySchema = Type.Union([
  Type.Literal("info"),
  Type.Literal("warning"),
  Type.Literal("breaking"),
]);
export type DriftSeverity = Static<typeof DriftSeveritySchema>;

export const DriftChangeSchema = Type.Object(
  {
    category: DriftCategorySchema,
    severity: DriftSeveritySchema,
    sourceObject: TextSchema,
    targetObjects: Type.Array(TextSchema, { maxItems: 10 }),
    affectedColumns: Type.Array(TextSchema, { maxItems: 50 }),
    explanation: TextSchema,
  },
  { additionalProperties: false },
);
export type DriftChange = Static<typeof DriftChangeSchema>;

export const SchemaDriftDiffSchema = Type.Object(
  {
    connectionId: IdSchema,
    previousSchemaHash: TextSchema,
    currentSchemaHash: TextSchema,
    hasDrift: Type.Boolean(),
    changes: Type.Array(DriftChangeSchema, { maxItems: 50 }),
    detectedAt: TimestampSchema,
  },
  { additionalProperties: false },
);
export type SchemaDriftDiff = Static<typeof SchemaDriftDiffSchema>;

export const MappingTypeSchema = Type.Union([
  Type.Literal("rename"),
  Type.Literal("split_vertical"),
  Type.Literal("split_horizontal"),
]);
export type MappingType = Static<typeof MappingTypeSchema>;

export const MappingColumnRuleSchema = Type.Object(
  {
    sourceColumn: TextSchema,
    targetTable: TextSchema,
    targetColumn: TextSchema,
    transformation: Type.Optional(TextSchema),
  },
  { additionalProperties: false },
);
export type MappingColumnRule = Static<typeof MappingColumnRuleSchema>;

export const SchemaMappingSchema = Type.Object(
  {
    id: IdSchema,
    connectionId: IdSchema,
    sourceTable: TextSchema,
    targetTables: Type.Array(TextSchema, { minItems: 1, maxItems: 10 }),
    mappingType: MappingTypeSchema,
    joinKey: Type.Optional(TextSchema),
    partitionColumn: Type.Optional(TextSchema),
    columnRules: Type.Array(MappingColumnRuleSchema, { maxItems: 100 }),
    status: Type.Union([
      Type.Literal("proposed"),
      Type.Literal("approved"),
      Type.Literal("rejected"),
    ]),
    reviewedBy: Type.Optional(TextSchema),
    reviewedAt: Type.Optional(TimestampSchema),
    createdAt: TimestampSchema,
  },
  { additionalProperties: false },
);
export type SchemaMapping = Static<typeof SchemaMappingSchema>;

export const SchemaMappingRequestSchema = Type.Object(
  {
    sourceTable: TextSchema,
    targetTables: Type.Array(TextSchema, { minItems: 1, maxItems: 10 }),
    mappingType: MappingTypeSchema,
    joinKey: Type.Optional(TextSchema),
    partitionColumn: Type.Optional(TextSchema),
    columnRules: Type.Array(MappingColumnRuleSchema, { maxItems: 100 }),
    status: Type.Optional(
      Type.Union([
        Type.Literal("proposed"),
        Type.Literal("approved"),
        Type.Literal("rejected"),
      ]),
    ),
  },
  { additionalProperties: false },
);
export type SchemaMappingRequest = Static<typeof SchemaMappingRequestSchema>;

export const AffectedRecipeSchema = Type.Object(
  {
    recipeId: IdSchema,
    name: TextSchema,
    status: Type.Union([
      Type.Literal("valid"),
      Type.Literal("needs_update"),
      Type.Literal("invalidated"),
    ]),
    staleObjects: Type.Array(TextSchema, { maxItems: 20 }),
    proposedUpdate: Type.Optional(TextSchema),
  },
  { additionalProperties: false },
);
export type AffectedRecipe = Static<typeof AffectedRecipeSchema>;

export const AffectedContextSchema = Type.Object(
  {
    runId: IdSchema,
    turnNumber: Type.Integer({ minimum: 1 }),
    staleSources: Type.Array(TextSchema, { maxItems: 20 }),
  },
  { additionalProperties: false },
);
export type AffectedContext = Static<typeof AffectedContextSchema>;

export const ImpactPreviewResponseSchema = Type.Object(
  {
    connectionId: IdSchema,
    drift: SchemaDriftDiffSchema,
    affectedRecipes: Type.Array(AffectedRecipeSchema, { maxItems: 100 }),
    affectedContexts: Type.Array(AffectedContextSchema, { maxItems: 100 }),
    recommendedActions: Type.Array(TextSchema, { maxItems: 50 }),
  },
  { additionalProperties: false },
);
export type ImpactPreviewResponse = Static<typeof ImpactPreviewResponseSchema>;
