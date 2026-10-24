import Type, { type TSchema } from "typebox";
import {
  AnswerEnvelopeSchema,
  AnalyticalPlanSchema,
  EvidenceBundleSchema,
  ExecutionRecordSchema,
  QuestionIntentSchema,
  ResultSchema,
  RunEventSchema,
  RunSchema,
  SchemaEvidenceSchema,
  SqlCandidateSchema,
  SubmitAnalysisSchema,
  TruthLedgerSchema,
  ReproducibilityBundleSchema,
  VerificationReportSchema,
  ConversationContextResponseSchema,
} from "./analysis.js";
import { ErrorSchema, HealthSchema, IdSchema } from "./common.js";
import {
  ConnectionInputSchema,
  ConnectionSchema,
  ConnectionTestSchema,
  FeedbackSchema,
} from "./connections.js";
import {
  CounterfactualReportSchema,
  DirtyRadarReportSchema,
  QueryCostPassportSchema,
  RecipeExecuteResponseSchema,
  RecipeInputSchema,
  RecipeSchema,
  SchemaConstellationSchema,
} from "./features.js";
import {
  EffectivePolicySchema,
  PolicySimulateInputSchema,
  PolicySimulateResultSchema,
} from "./policy.js";
import {
  ImpactPreviewResponseSchema,
  SchemaDriftDiffSchema,
  SchemaMappingRequestSchema,
  SchemaMappingSchema,
} from "./drift.js";
import {
  AuditEventSchema,
  AuditListResponseSchema,
  GovernanceReadinessResponseSchema,
  GovernanceReviewsResponseSchema,
  GovernanceReviewTaskSchema,
  RecipePublishInputSchema,
} from "./governance.js";

import {
  FileAnalysisSchema,
  FilePreviewSchema,
  FileQuestionSchema,
  FileUploadSchema,
  StoredFileSchema,
} from "./files.js";

const apiSchemas = {
  StoredFile: StoredFileSchema,
  FileUpload: FileUploadSchema,
  FilePreview: FilePreviewSchema,
  FileQuestion: FileQuestionSchema,
  FileAnalysis: FileAnalysisSchema,
  QuestionIntent: QuestionIntentSchema,
  SchemaEvidence: SchemaEvidenceSchema,
  AnalyticalPlan: AnalyticalPlanSchema,
  SqlCandidate: SqlCandidateSchema,
  ExecutionRecord: ExecutionRecordSchema,
  VerificationReport: VerificationReportSchema,
  AnswerEnvelope: AnswerEnvelopeSchema,
  RunEvent: RunEventSchema,
  Health: HealthSchema,
  Error: ErrorSchema,
  Run: RunSchema,
  Result: ResultSchema,
  EvidenceBundle: EvidenceBundleSchema,
  ConnectionInput: ConnectionInputSchema,
  Connection: ConnectionSchema,
  Connections: Type.Array(ConnectionSchema, { maxItems: 100 }),
  ConnectionTest: ConnectionTestSchema,
  Feedback: FeedbackSchema,
  SubmitAnalysis: SubmitAnalysisSchema,
  TruthLedger: TruthLedgerSchema,
  ReproducibilityBundle: ReproducibilityBundleSchema,
  SchemaConstellation: SchemaConstellationSchema,
  QueryCostPassport: QueryCostPassportSchema,
  DirtyRadarReport: DirtyRadarReportSchema,
  CounterfactualReport: CounterfactualReportSchema,
  RecipeInput: RecipeInputSchema,
  Recipe: RecipeSchema,
  Recipes: Type.Array(RecipeSchema, { maxItems: 100 }),
  RecipeExecuteResponse: RecipeExecuteResponseSchema,
  FeedbackReceipt: Type.Object(
    { id: IdSchema },
    { additionalProperties: false },
  ),
  EffectivePolicy: EffectivePolicySchema,
  PolicySimulateInput: PolicySimulateInputSchema,
  PolicySimulateResult: PolicySimulateResultSchema,
  ConversationContextResponse: ConversationContextResponseSchema,
  SchemaDriftDiff: SchemaDriftDiffSchema,
  SchemaMappingRequest: SchemaMappingRequestSchema,
  SchemaMapping: SchemaMappingSchema,
  SchemaMappings: Type.Array(SchemaMappingSchema, { maxItems: 100 }),
  ImpactPreviewResponse: ImpactPreviewResponseSchema,
  AuditEvent: AuditEventSchema,
  AuditListResponse: AuditListResponseSchema,
  GovernanceReviewTask: GovernanceReviewTaskSchema,
  GovernanceReviewsResponse: GovernanceReviewsResponseSchema,
  GovernanceReadinessResponse: GovernanceReadinessResponseSchema,
  RecipePublishInput: RecipePublishInputSchema,
};
function ref(name: keyof typeof apiSchemas) {
  return Type.Ref(`#/components/schemas/${name}`);
}

function response(schema: TSchema, description: string) {
  return { description, content: { "application/json": { schema } } };
}

function operation(
  operationId: string,
  schema: TSchema,
  body?: TSchema,
  status = "200",
) {
  return {
    operationId,
    "x-implementation-status": "implemented",
    security: [{ bearerAuth: [] }],
    ...(body === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: { "application/json": { schema: body } },
          },
        }),
    responses: {
      [status]: response(schema, "Successful response"),
      "400": response(ref("Error"), "Invalid request"),
      "401": response(ref("Error"), "Authentication required"),
      "403": response(ref("Error"), "Access denied"),
      "404": response(ref("Error"), "Resource unavailable"),
      "429": response(ref("Error"), "Resource limit reached"),
      "503": response(ref("Error"), "Dependency unavailable"),
    },
  };
}
const runParameters = [
  { name: "runId", in: "path", required: true, schema: IdSchema },
];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "metis.ai API",
    version: "0.1.0",
    description:
      "Local workspace API. Stored-file analysis uses Neon persistence, Brotli compression and bounded local inference. External SQL analysis requires a configured read-only analytical adapter.",
  },
  paths: {
    "/v1/capabilities": {
      get: operation(
        "getCapabilities",
        Type.Object(
          {
            storageAvailable: Type.Boolean(),
            analysisAvailable: Type.Boolean(),
            inferenceAvailable: Type.Boolean(),
            model: Type.String(),
          },
          { additionalProperties: false },
        ),
      ),
    },
    "/v1/files": {
      get: operation("listFiles", Type.Array(ref("StoredFile"))),
      post: operation(
        "uploadFile",
        ref("FilePreview"),
        ref("FileUpload"),
        "201",
      ),
    },
    "/v1/files/{fileId}": {
      parameters: [
        { name: "fileId", in: "path", required: true, schema: IdSchema },
      ],
      get: operation("previewFile", ref("FilePreview")),
      delete: operation("deleteFile", Type.Object({ deleted: Type.Boolean() })),
    },
    "/v1/files/{fileId}/content": {
      parameters: [
        { name: "fileId", in: "path", required: true, schema: IdSchema },
      ],
      get: {
        ...operation("downloadFile", Type.String()),
        responses: {
          ...operation("downloadFile", Type.String()).responses,
          "200": {
            description:
              "Original file bytes, verified after Brotli decompression",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
        },
      },
    },
    "/v1/files/{fileId}/analyses": {
      parameters: [
        { name: "fileId", in: "path", required: true, schema: IdSchema },
      ],
      post: operation("analyzeFile", ref("FileAnalysis"), ref("FileQuestion")),
    },
    "/v1/file-analyses": {
      get: operation("listFileAnalyses", Type.Array(ref("FileAnalysis"))),
    },
    "/health": {
      get: {
        operationId: "getHealth",
        security: [],
        "x-implementation-status": "implemented",
        responses: { "200": response(ref("Health"), "Process is alive") },
      },
    },
    "/v1/connections/test": {
      post: operation(
        "testConnection",
        ref("ConnectionTest"),
        ref("ConnectionInput"),
      ),
    },
    "/v1/connections": {
      post: operation(
        "createConnection",
        ref("Connection"),
        ref("ConnectionInput"),
        "201",
      ),
      get: operation("listConnections", ref("Connections")),
    },
    "/v1/connections/{connectionId}": {
      parameters: [
        { name: "connectionId", in: "path", required: true, schema: IdSchema },
      ],
      get: operation("getConnection", ref("Connection")),
      delete: operation("revokeConnection", ref("Connection")),
    },
    "/v1/connections/{connectionId}/constellation": {
      parameters: [
        { name: "connectionId", in: "path", required: true, schema: IdSchema },
      ],
      get: operation("getSchemaConstellation", ref("SchemaConstellation")),
    },
    "/v1/connections/{connectionId}/drift": {
      parameters: [
        { name: "connectionId", in: "path", required: true, schema: IdSchema },
      ],
      get: operation("getConnectionDrift", ref("SchemaDriftDiff")),
    },
    "/v1/connections/{connectionId}/impact-preview": {
      parameters: [
        { name: "connectionId", in: "path", required: true, schema: IdSchema },
      ],
      get: operation("getImpactPreview", ref("ImpactPreviewResponse")),
    },
    "/v1/connections/{connectionId}/mappings": {
      parameters: [
        { name: "connectionId", in: "path", required: true, schema: IdSchema },
      ],
      get: operation("listConnectionMappings", ref("SchemaMappings")),
      post: operation(
        "createSchemaMapping",
        ref("SchemaMapping"),
        ref("SchemaMappingRequest"),
        "201",
      ),
    },
    "/v1/connections/{connectionId}/mappings/{mappingId}/approve": {
      parameters: [
        { name: "connectionId", in: "path", required: true, schema: IdSchema },
        { name: "mappingId", in: "path", required: true, schema: IdSchema },
      ],
      post: operation("approveSchemaMapping", ref("SchemaMapping")),
    },
    "/v1/analyses": {
      post: operation(
        "submitAnalysis",
        ref("Run"),
        ref("SubmitAnalysis"),
        "202",
      ),
    },
    "/v1/runs/{runId}": {
      parameters: runParameters,
      get: operation("getRun", ref("Run")),
    },
    "/v1/runs/{runId}/events": {
      parameters: runParameters,
      get: {
        ...operation("getRunEvents", ref("RunEvent")),
        responses: {
          "200": {
            description:
              "Ordered SSE progress; each data frame conforms to RunEvent",
            content: { "text/event-stream": { schema: Type.String() } },
          },
          "401": response(ref("Error"), "Authentication required"),
          "403": response(ref("Error"), "Access denied"),
          "404": response(ref("Error"), "Resource unavailable"),
        },
      },
    },
    "/v1/runs/{runId}/cancel": {
      parameters: runParameters,
      post: operation("cancelRun", ref("Run"), undefined, "202"),
    },
    "/v1/runs/{runId}/result": {
      parameters: runParameters,
      get: operation("getRunResult", ref("Result")),
    },
    "/v1/runs/{runId}/evidence": {
      parameters: runParameters,
      get: operation("getRunEvidence", ref("EvidenceBundle")),
    },
    "/v1/runs/{runId}/context": {
      parameters: runParameters,
      get: operation("getRunContext", ref("ConversationContextResponse")),
    },
    "/v1/runs/{runId}/export/csv": {
      parameters: runParameters,
      get: {
        operationId: "exportRunCsv",
        "x-implementation-status": "implemented",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Safe CSV export with formula injection defense",
            content: { "text/csv": { schema: Type.String() } },
          },
          "401": response(ref("Error"), "Authentication required"),
          "403": response(ref("Error"), "Access denied"),
          "404": response(ref("Error"), "Resource unavailable"),
        },
      },
    },
    "/v1/runs/{runId}/export/sql": {
      parameters: runParameters,
      get: {
        operationId: "exportRunSql",
        "x-implementation-status": "implemented",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Inspectable analytical SQL with dialect headers",
            content: { "application/sql": { schema: Type.String() } },
          },
          "401": response(ref("Error"), "Authentication required"),
          "403": response(ref("Error"), "Access denied"),
          "404": response(ref("Error"), "Resource unavailable"),
        },
      },
    },
    "/v1/runs/{runId}/export/reproducibility": {
      parameters: runParameters,
      get: operation(
        "exportReproducibilityBundle",
        ref("ReproducibilityBundle"),
      ),
    },
    "/v1/runs/{runId}/ledger": {
      parameters: runParameters,
      get: operation("getTruthLedger", ref("TruthLedger")),
    },
    "/v1/runs/{runId}/passport": {
      parameters: runParameters,
      get: operation("getQueryCostPassport", ref("QueryCostPassport")),
    },
    "/v1/runs/{runId}/dirty-radar": {
      parameters: runParameters,
      get: operation("getDirtyRadarReport", ref("DirtyRadarReport")),
    },
    "/v1/runs/{runId}/counterfactuals": {
      parameters: runParameters,
      get: operation("getCounterfactualReport", ref("CounterfactualReport")),
    },
    "/v1/recipes": {
      post: operation("createRecipe", ref("Recipe"), ref("RecipeInput"), "201"),
      get: operation("listRecipes", ref("Recipes")),
    },
    "/v1/recipes/{recipeId}": {
      parameters: [
        { name: "recipeId", in: "path", required: true, schema: IdSchema },
      ],
      get: operation("getRecipe", ref("Recipe")),
    },
    "/v1/recipes/{recipeId}/execute": {
      parameters: [
        { name: "recipeId", in: "path", required: true, schema: IdSchema },
      ],
      post: operation(
        "executeRecipe",
        ref("RecipeExecuteResponse"),
        undefined,
        "202",
      ),
    },
    "/v1/recipes/{recipeId}/review": {
      parameters: [
        { name: "recipeId", in: "path", required: true, schema: IdSchema },
      ],
      post: operation("reviewRecipe", ref("Recipe")),
    },
    "/v1/recipes/{recipeId}/publish": {
      parameters: [
        { name: "recipeId", in: "path", required: true, schema: IdSchema },
      ],
      post: operation(
        "publishRecipe",
        ref("Recipe"),
        ref("RecipePublishInput"),
      ),
    },
    "/v1/recipes/{recipeId}/retire": {
      parameters: [
        { name: "recipeId", in: "path", required: true, schema: IdSchema },
      ],
      post: operation("retireRecipe", ref("Recipe")),
    },
    "/v1/audit/events": {
      get: operation("listAuditEvents", ref("AuditListResponse")),
    },
    "/v1/audit/export": {
      get: {
        operationId: "exportAuditEvents",
        "x-implementation-status": "implemented",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Safe audit log export in JSON or CSV",
            content: {
              "application/json": { schema: Type.String() },
              "text/csv": { schema: Type.String() },
            },
          },
          "401": response(ref("Error"), "Authentication required"),
          "403": response(ref("Error"), "Access denied"),
          "404": response(ref("Error"), "Resource unavailable"),
        },
      },
    },
    "/v1/governance/reviews": {
      get: operation("getGovernanceReviews", ref("GovernanceReviewsResponse")),
    },
    "/v1/governance/readiness": {
      get: operation(
        "getGovernanceReadiness",
        ref("GovernanceReadinessResponse"),
      ),
    },
    "/v1/policies/effective": {
      get: operation("getEffectivePolicy", ref("EffectivePolicy")),
    },
    "/v1/policies/simulate": {
      post: operation(
        "simulatePolicy",
        ref("PolicySimulateResult"),
        ref("PolicySimulateInput"),
      ),
    },
    "/v1/feedback": {
      post: operation(
        "submitFeedback",
        ref("FeedbackReceipt"),
        ref("Feedback"),
        "201",
      ),
    },
    "/health/live": {
      get: { ...operation("getLiveness", ref("Health")), security: [] },
    },
    "/health/ready": {
      get: { ...operation("getReadiness", ref("Health")), security: [] },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    schemas: apiSchemas,
  },
};
