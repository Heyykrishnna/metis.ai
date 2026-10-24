import { randomUUID } from "node:crypto";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { ErrorSchema, IdSchema } from "../contracts/common.js";
import { FeedbackSchema } from "../contracts/connections.js";
import { feedback } from "../db/schema.js";
import { requireAuth } from "../security/auth.js";

const FeedbackReceiptSchema = {
  type: "object",
  properties: {
    id: IdSchema,
  },
  required: ["id"],
  additionalProperties: false,
} as const;

export const feedbackRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/v1/feedback",
    {
      schema: {
        body: FeedbackSchema,
        response: {
          201: FeedbackReceiptSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId, rating, category, comment } = request.body;
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const subject = request.authContext?.subject ?? "unknown-actor";
      const requestId = request.id ?? "req-unknown";

      const run = await app.orchestrator.getRun(runId, workspaceId);
      if (!run) {
        return reply.status(404).send({
          code: "not_found",
          message: "Resource unavailable",
          requestId,
        });
      }

      const feedbackId = randomUUID();

      if (app.metadataDb) {
        try {
          await app.metadataDb.insert(feedback).values({
            id: feedbackId,
            runId,
            workspaceId,
            actorSubject: subject,
            rating,
            category,
            comment: comment ?? null,
          });
        } catch {
          // Best-effort persistence
        }
      }

      return reply.status(201).send({ id: feedbackId });
    },
  );
};
