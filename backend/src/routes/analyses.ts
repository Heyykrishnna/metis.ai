import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import {
  EvidenceBundleSchema,
  ReproducibilityBundleSchema,
  ResultSchema,
  RunSchema,
  SubmitAnalysisSchema,
  TruthLedgerSchema,
} from "../contracts/analysis.js";
import { ErrorSchema, IdSchema, TextSchema } from "../contracts/common.js";
import {
  CounterfactualReportSchema,
  DirtyRadarReportSchema,
  QueryCostPassportSchema,
  UpdateRadarReviewSchema,
} from "../contracts/features.js";
import { generateCounterfactualReport } from "../analysis/counterfactual.js";
import { generateQueryCostPassport } from "../analysis/passport.js";
import { scanDirtyRadar, updateAnomalyReview } from "../analysis/radar.js";
import { requireAuth } from "../security/auth.js";
import { serializeToSafeCsv } from "../security/csv.js";
import { isSubjectRevoked } from "../security/policies.js";
import { getMemoryConnection } from "./connections.js";

const runParamsSchema = {
  type: "object",
  properties: {
    runId: IdSchema,
  },
  required: ["runId"],
  additionalProperties: false,
} as const;

export const analysisRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/v1/analyses",
    {
      schema: {
        body: SubmitAnalysisSchema,
        response: {
          202: RunSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { connectionId, question, parentRunId } = request.body;
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      const memoryConn = getMemoryConnection(connectionId, workspaceId);
      if (!memoryConn || memoryConn.status === "revoked") {
        return reply.status(404).send({
          code: "not_found",
          message: "Connection not found in workspace",
          requestId,
        });
      }
      const allowedSchemas = memoryConn.allowedSchemas;

      try {
        const run = await app.orchestrator.executeAnalysis({
          workspaceId,
          connectionId,
          allowedSchemas,
          question,
          parentRunId,
          role: request.authContext?.role,
          actorSubject: request.authContext?.subject,
        });

        return reply.status(202).send(run);
      } catch (err) {
        return reply.status(400).send({
          code: "invalid_request",
          message:
            err instanceof Error ? err.message : "Failed to execute analysis",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId",
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: RunSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      const run = await app.orchestrator.getRun(runId, workspaceId);
      if (!run) {
        return reply.status(404).send({
          code: "not_found",
          message: "Resource unavailable",
          requestId,
        });
      }

      return reply.send(run);
    },
  );

  app.get(
    "/v1/runs/:runId/events",
    {
      schema: {
        params: runParamsSchema,
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      const run = await app.orchestrator.getRun(runId, workspaceId);
      if (!run) {
        return reply.status(404).send({
          code: "not_found",
          message: "Resource unavailable",
          requestId,
        });
      }

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");

      const initial = {
        runId: run.runId,
        sequence: run.sequence,
        type: "progress",
        status: run.status,
        timestamp: new Date().toISOString(),
      };
      reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);

      const unsubscribe = app.orchestrator.subscribeEvents(runId, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        if (
          [
            "answered",
            "needs_clarification",
            "abstained",
            "blocked_by_policy",
            "execution_failed",
            "timed_out",
            "cancelled",
          ].includes(event.status)
        ) {
          unsubscribe();
          reply.raw.end();
        }
      });

      request.raw.on("close", () => {
        unsubscribe();
      });

      return reply;
    },
  );

  app.post(
    "/v1/runs/:runId/cancel",
    {
      schema: {
        params: runParamsSchema,
        response: {
          202: RunSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      try {
        const run = await app.orchestrator.cancelRun(runId, workspaceId);
        return reply.status(202).send(run);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId/result",
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: ResultSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      if (
        request.authContext?.subject &&
        isSubjectRevoked(request.authContext.subject)
      ) {
        return reply.status(403).send({
          code: "forbidden",
          message: "Subject authorization revoked",
          requestId,
        });
      }

      try {
        const result = await app.orchestrator.getResult(runId, workspaceId);
        return reply.send(result);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId/evidence",
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: EvidenceBundleSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      try {
        const evidence = await app.orchestrator.getEvidence(runId, workspaceId);
        return reply.send(evidence);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId/export/csv",
    {
      schema: {
        params: runParamsSchema,
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      const role = request.authContext?.role ?? "owner";
      if (role === "viewer") {
        return reply.status(403).send({
          code: "forbidden",
          message:
            "Viewers are restricted from exporting raw analysis detail records",
          requestId,
        });
      }

      if (
        request.authContext?.subject &&
        isSubjectRevoked(request.authContext.subject)
      ) {
        return reply.status(403).send({
          code: "forbidden",
          message: "Subject authorization revoked",
          requestId,
        });
      }

      try {
        const result = await app.orchestrator.getResult(runId, workspaceId);
        const csvContent = serializeToSafeCsv(result.columns, result.rows);

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="analysis-${runId}.csv"`,
        );
        return reply.send(csvContent);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId/export/sql",
    {
      schema: {
        params: runParamsSchema,
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      const role = request.authContext?.role ?? "owner";
      if (role === "viewer") {
        return reply.status(403).send({
          code: "forbidden",
          message: "Viewers are restricted from exporting SQL definitions",
          requestId,
        });
      }

      if (
        request.authContext?.subject &&
        isSubjectRevoked(request.authContext.subject)
      ) {
        return reply.status(403).send({
          code: "forbidden",
          message: "Subject authorization revoked",
          requestId,
        });
      }

      try {
        const evidence = await app.orchestrator.getEvidence(runId, workspaceId);
        if (!evidence.candidate) {
          return reply.status(404).send({
            code: "not_found",
            message: "No SQL query candidate available for run",
            requestId,
          });
        }

        const candidate = evidence.candidate;
        const now = new Date().toISOString();
        const sqlExport = [
          `-- Metis Analytical SQL Export`,
          `-- Run ID: ${runId}`,
          `-- Dialect: ${candidate.dialect}`,
          `-- Exported At: ${now}`,
          `-- Read-only analytical query`,
          ``,
          candidate.sqlText.trim().endsWith(";")
            ? candidate.sqlText.trim()
            : `${candidate.sqlText.trim()};`,
          ``,
        ].join("\n");

        reply.header("Content-Type", "application/sql; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="query-${runId}.sql"`,
        );
        return reply.send(sqlExport);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId/export/reproducibility",
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: ReproducibilityBundleSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      try {
        const bundle = await app.orchestrator.getReproducibilityBundle(
          runId,
          workspaceId,
        );
        reply.header("Content-Type", "application/json; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="reproducibility-${runId}.json"`,
        );
        return reply.send(bundle);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId/ledger",
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: TruthLedgerSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      try {
        const ledger = await app.orchestrator.getLedger(runId, workspaceId);
        reply.header("Content-Type", "application/json; charset=utf-8");
        return reply.send(ledger);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId/passport",
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: QueryCostPassportSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      try {
        const evidence = await app.orchestrator.getEvidence(runId, workspaceId);
        const execution = evidence.execution
          ? {
              durationMs: evidence.execution.durationMs,
              rowCount: evidence.execution.rowCount,
              returnedBytes: evidence.execution.resourceUsage.returnedBytes,
              modelCalls: evidence.execution.resourceUsage.modelCalls,
            }
          : null;
        const passport = generateQueryCostPassport(runId, execution, {
          estimatedCost: 1.25,
          estimatedRows: evidence.execution?.rowCount ?? 2,
          planType: "Hash Join -> Seq Scan",
          warnings: [],
        });
        return reply.send(passport);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.get(
    "/v1/runs/:runId/dirty-radar",
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: DirtyRadarReportSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      try {
        const result = await app.orchestrator.getResult(runId, workspaceId);
        const report = scanDirtyRadar(runId, result.rows, result.columns);
        return reply.send(report);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );

  app.post(
    "/v1/runs/:runId/dirty-radar/reviews/:anomalyId",
    {
      schema: {
        params: Type.Object(
          {
            runId: IdSchema,
            anomalyId: TextSchema,
          },
          { additionalProperties: false },
        ),
        body: UpdateRadarReviewSchema,
        response: {
          200: Type.Object({
            anomalyId: TextSchema,
            reviewState: Type.Union([
              Type.Literal("accepted"),
              Type.Literal("rejected"),
            ]),
            updated: Type.Literal(true),
          }),
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId, anomalyId } = request.params as {
        runId: string;
        anomalyId: string;
      };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      const run = await app.orchestrator.getRun(runId, workspaceId);
      if (!run) {
        return reply.status(404).send({
          code: "not_found",
          message: "Resource unavailable",
          requestId,
        });
      }

      updateAnomalyReview(anomalyId, request.body.reviewState);
      return reply.send({
        anomalyId,
        reviewState: request.body.reviewState,
        updated: true,
      });
    },
  );

  app.get(
    "/v1/runs/:runId/counterfactuals",
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: CounterfactualReportSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      try {
        const result = await app.orchestrator.getResult(runId, workspaceId);
        const report = generateCounterfactualReport(
          runId,
          result.answer.status === "answered"
            ? result.answer.answerText
            : "Analysis completed",
        );
        return reply.send(report);
      } catch (err) {
        return reply.status(404).send({
          code: "not_found",
          message: err instanceof Error ? err.message : "Resource unavailable",
          requestId,
        });
      }
    },
  );
};
