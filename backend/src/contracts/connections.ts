import Type from "typebox";
import { IdSchema, TextSchema } from "./common.js";

export const ConnectionInputSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
    engine: Type.Literal("PostgreSQL"),
    host: Type.String({
      minLength: 1,
      maxLength: 253,
      pattern: "^[a-zA-Z0-9.:-]+$",
    }),
    port: Type.Integer({ minimum: 1, maximum: 65535 }),
    database: Type.String({ minLength: 1, maxLength: 63 }),
    username: Type.String({ minLength: 1, maxLength: 63 }),
    secretReference: Type.String({
      pattern: "^secret://[a-zA-Z0-9/_-]+$",
      maxLength: 512,
    }),
    allowedSchemas: Type.Array(Type.String({ minLength: 1, maxLength: 63 }), {
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
);
export const ConnectionSchema = Type.Object(
  {
    id: IdSchema,
    name: TextSchema,
    engine: Type.Literal("PostgreSQL"),
    allowedSchemas: Type.Array(TextSchema, { minItems: 1, maxItems: 20 }),
    status: Type.Union([
      Type.Literal("registered"),
      Type.Literal("ready"),
      Type.Literal("revoked"),
    ]),
  },
  { additionalProperties: false },
);
export const ConnectionTestSchema = Type.Object(
  { status: Type.Literal("ready"), readOnly: Type.Literal(true) },
  { additionalProperties: false },
);
export const FeedbackSchema = Type.Object(
  {
    runId: IdSchema,
    rating: Type.Integer({ minimum: 1, maximum: 5 }),
    category: Type.Union([
      Type.Literal("correctness"),
      Type.Literal("usefulness"),
      Type.Literal("other"),
    ]),
    comment: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
);
