import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  EvidenceBundleSchema,
  ResultSchema,
  RunSchema,
  SubmitAnalysisSchema,
} from "../contracts/analysis.js";
import { ErrorSchema, IdSchema } from "../contracts/common.js";
import { requireAuth } from "../security/auth.js";
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
      if (!memoryConn) {
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
};
