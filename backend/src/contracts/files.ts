import Type, { type Static } from "typebox";
import { IdSchema, TextSchema, TimestampSchema } from "./common.js";
import { ResultSchema } from "./analysis.js";

export const FileUploadSchema = Type.Object(
  {
    name: Type.String({
      minLength: 1,
      maxLength: 255,
      pattern: "^[^/\\\\\\u0000-\\u001f]+$",
    }),
    contentBase64: Type.String({ minLength: 4, maxLength: 6990508 }),
  },
  { additionalProperties: false },
);

export const StoredFileSchema = Type.Object(
  {
    id: IdSchema,
    name: Type.String({ maxLength: 255 }),
    kind: Type.Union([
      Type.Literal("CSV"),
      Type.Literal("JSON"),
      Type.Literal("Text"),
    ]),
    size: Type.Integer({ minimum: 1, maximum: 5242880 }),
    compressedSize: Type.Integer({ minimum: 1 }),
    compression: Type.Literal("br"),
    sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    rowCount: Type.Integer({ minimum: 0, maximum: 10000 }),
    columns: Type.Array(Type.String(), { maxItems: 100 }),
    emptyCells: Type.Integer({ minimum: 0 }),
    createdAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const FilePreviewSchema = Type.Object(
  {
    file: StoredFileSchema,
    rows: Type.Array(Type.Array(Type.String()), { maxItems: 100 }),
    text: Type.String({ maxLength: 20000 }),
  },
  { additionalProperties: false },
);

export const FileQuestionSchema = Type.Object(
  { question: TextSchema },
  { additionalProperties: false },
);
export const FileAnalysisSchema = Type.Object(
  {
    id: IdSchema,
    fileId: IdSchema,
    question: TextSchema,
    result: ResultSchema,
    modelVersion: TextSchema,
    sourceHash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    method: Type.Union([
      Type.Literal("deterministic"),
      Type.Literal("model-planned-computation"),
      Type.Literal("extractive"),
    ]),
    createdAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export type StoredFile = Static<typeof StoredFileSchema>;
export type FilePreview = Static<typeof FilePreviewSchema>;
export type FileAnalysis = Static<typeof FileAnalysisSchema>;
