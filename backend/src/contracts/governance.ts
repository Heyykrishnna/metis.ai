import Type, { type Static } from "typebox";
import { IdSchema, TimestampSchema } from "./common.js";

export const RecipeLifecycleStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("reviewed"),
  Type.Literal("published"),
  Type.Literal("retired"),
  Type.Literal("approved"),
  Type.Literal("archived"),
]);

export const RecipeAudienceScopeSchema = Type.Union([
  Type.Literal("private"),
  Type.Literal("role_restricted"),
  Type.Literal("workspace"),
]);

export const RecipeVersionEntrySchema = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    changeDescription: Type.String({ minLength: 1, maxLength: 500 }),
    updatedBy: Type.String({ minLength: 1, maxLength: 200 }),
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const RecipePublishInputSchema = Type.Object(
  {
    audienceScope: Type.Optional(RecipeAudienceScopeSchema),
    changeDescription: Type.Optional(
      Type.String({ minLength: 1, maxLength: 500 }),
    ),
  },
  { additionalProperties: false },
);

export const AuditEventCategorySchema = Type.Union([
  Type.Literal("policy_change"),
  Type.Literal("denied_attempt"),
  Type.Literal("conversation_context"),
  Type.Literal("schema_recovery"),
  Type.Literal("recipe_lifecycle"),
  Type.Literal("access_review"),
  Type.Literal("export_decision"),
]);

export const AuditEventSchema = Type.Object(
  {
    id: IdSchema,
    workspaceId: IdSchema,
    category: AuditEventCategorySchema,
    action: Type.String({ minLength: 1, maxLength: 100 }),
    actorSubject: Type.String({ minLength: 1, maxLength: 200 }),
    actorRole: Type.String({ minLength: 1, maxLength: 50 }),
    resourceId: Type.String({ minLength: 1, maxLength: 200 }),
    requestId: Type.String({ minLength: 1, maxLength: 100 }),
    runId: Type.Optional(IdSchema),
    details: Type.Record(Type.String(), Type.Any()),
    occurredAt: TimestampSchema,
    tamperEvidenceHash: Type.String({ minLength: 32, maxLength: 128 }),
  },
  { additionalProperties: false },
);

export const AuditListResponseSchema = Type.Object(
  {
    events: Type.Array(AuditEventSchema),
    total: Type.Integer({ minimum: 0 }),
    limit: Type.Integer({ minimum: 1 }),
    offset: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const GovernanceReviewTaskSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 100 }),
    taskType: Type.Union([
      Type.Literal("schema_mapping"),
      Type.Literal("recipe_publication"),
      Type.Literal("access_request"),
    ]),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.String({ minLength: 1, maxLength: 1000 }),
    resourceId: Type.String({ minLength: 1, maxLength: 100 }),
    requestedBy: Type.String({ minLength: 1, maxLength: 200 }),
    requestedAt: TimestampSchema,
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("approved"),
      Type.Literal("rejected"),
    ]),
  },
  { additionalProperties: false },
);

export const GovernanceReviewsResponseSchema = Type.Object(
  {
    tasks: Type.Array(GovernanceReviewTaskSchema),
    pendingCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const GovernanceReadinessResponseSchema = Type.Object(
  {
    candidateVersion: Type.String({ minLength: 1 }),
    status: Type.Union([
      Type.Literal("ready_for_release"),
      Type.Literal("blocked"),
    ]),
    releaseManifest: Type.Object({
      candidateVersion: Type.String(),
      modelArtifacts: Type.Record(Type.String(), Type.String()),
      promptTemplates: Type.Record(Type.String(), Type.String()),
      policyEngine: Type.Record(Type.String(), Type.String()),
      runtimeEnvironment: Type.Record(Type.String(), Type.String()),
      measuredLimits: Type.Record(Type.String(), Type.Number()),
      reviewerSignOffs: Type.Record(Type.String(), Type.String()),
      recoveryInstructions: Type.String(),
    }),
    requirementCoverage: Type.Array(
      Type.Object({
        requirementId: Type.String(),
        title: Type.String(),
        status: Type.String(),
        owner: Type.String(),
        verifiedGate: Type.String(),
      }),
    ),
    gateMetrics: Type.Object({
      g6OrganizationPermissions: Type.Record(Type.String(), Type.Any()),
      g7ConversationalFollowUps: Type.Record(Type.String(), Type.Any()),
      g8SchemaEvolutionRecovery: Type.Record(Type.String(), Type.Any()),
      g9GovernedCollaboration: Type.Record(Type.String(), Type.Any()),
    }),
    generatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export type RecipeLifecycleStatus = Static<typeof RecipeLifecycleStatusSchema>;
export type RecipeAudienceScope = Static<typeof RecipeAudienceScopeSchema>;
export type RecipeVersionEntry = Static<typeof RecipeVersionEntrySchema>;
export type RecipePublishInput = Static<typeof RecipePublishInputSchema>;
export type AuditEventCategory = Static<typeof AuditEventCategorySchema>;
export type AuditEvent = Static<typeof AuditEventSchema>;
export type AuditListResponse = Static<typeof AuditListResponseSchema>;
export type GovernanceReviewTask = Static<typeof GovernanceReviewTaskSchema>;
export type GovernanceReviewsResponse = Static<
  typeof GovernanceReviewsResponseSchema
>;
export type GovernanceReadinessResponse = Static<
  typeof GovernanceReadinessResponseSchema
>;
