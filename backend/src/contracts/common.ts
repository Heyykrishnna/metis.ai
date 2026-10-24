import Type from "typebox";

export const IdSchema = Type.String({
  pattern:
    "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
});
export const TextSchema = Type.String({ minLength: 1, maxLength: 4096 });
export const TimestampSchema = Type.String({ format: "date-time" });
export const ScalarSchema = Type.Union([
  Type.String({ maxLength: 16384 }),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
]);
export const HealthSchema = Type.Object(
  { status: Type.Literal("ok") },
  { additionalProperties: false },
);
export const ErrorCodeSchema = Type.Union([
  Type.Literal("invalid_request"),
  Type.Literal("unauthorized"),
  Type.Literal("forbidden"),
  Type.Literal("not_found"),
  Type.Literal("policy_denied"),
  Type.Literal("dependency_unavailable"),
  Type.Literal("budget_exceeded"),
  Type.Literal("invalid_model_output"),
  Type.Literal("verification_failed"),
  Type.Literal("internal_error"),
]);
export const ErrorSchema = Type.Object(
  {
    code: ErrorCodeSchema,
    message: TextSchema,
    requestId: TextSchema,
  },
  { additionalProperties: false },
);
