import Type, { type Static } from "typebox";
import { IdSchema, TextSchema } from "./common.js";

export const OrganizationRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("analyst"),
  Type.Literal("viewer"),
]);

export type OrganizationRole = Static<typeof OrganizationRoleSchema>;

export const EffectivePolicySchema = Type.Object(
  {
    role: OrganizationRoleSchema,
    policyVersion: TextSchema,
    permittedActions: Type.Array(TextSchema, { maxItems: 20 }),
    rowBoundaryPredicate: TextSchema,
    allowedColumns: Type.Array(TextSchema, { maxItems: 100 }),
    restrictedColumns: Type.Array(TextSchema, { maxItems: 50 }),
    smallCohortThreshold: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export type EffectivePolicy = Static<typeof EffectivePolicySchema>;

export const PolicySimulateInputSchema = Type.Object(
  {
    targetRole: OrganizationRoleSchema,
    sql: TextSchema,
    connectionId: Type.Optional(IdSchema),
  },
  { additionalProperties: false },
);

export type PolicySimulateInput = Static<typeof PolicySimulateInputSchema>;

export const PolicySimulateResultSchema = Type.Object(
  {
    allowed: Type.Boolean(),
    targetRole: OrganizationRoleSchema,
    evaluatedPolicyVersion: TextSchema,
    rowBoundaryPredicate: TextSchema,
    violations: Type.Array(TextSchema, { maxItems: 20 }),
    effectiveColumns: Type.Array(TextSchema, { maxItems: 100 }),
    reason: Type.Optional(TextSchema),
  },
  { additionalProperties: false },
);

export type PolicySimulateResult = Static<typeof PolicySimulateResultSchema>;
