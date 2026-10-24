import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { ErrorSchema } from "../contracts/common.js";
import {
  AuditEventCategorySchema,
  AuditListResponseSchema,
  GovernanceReadinessResponseSchema,
  GovernanceReviewsResponseSchema,
  type AuditEventCategory,
} from "../contracts/governance.js";
import { requireAuth } from "../security/auth.js";
import {
  exportAuditEvents,
  getGovernanceReviews,
  getReadinessReport,
  queryAuditEvents,
  recordAuditEvent,
} from "../analysis/governance.js";

const auditQuerySchema = Type.Object(
  {
    category: Type.Optional(AuditEventCategorySchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

const auditExportQuerySchema = Type.Object(
  {
    format: Type.Optional(
      Type.Union([Type.Literal("json"), Type.Literal("csv")]),
    ),
  },
  { additionalProperties: false },
);

export const governanceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get(
    "/v1/audit/events",
    {
      schema: {
        querystring: auditQuerySchema,
        response: {
          200: AuditListResponseSchema,
          400: ErrorSchema,
        },
      },
    },
    async (request) => {
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const role = request.authContext?.role ?? "owner";
      const subject = request.authContext?.subject ?? "unknown-actor";

      const query = request.query as {
        category?: AuditEventCategory;
        limit?: number;
        offset?: number;
      };

      const result = queryAuditEvents({
        workspaceId,
        role,
        actorSubject: subject,
        category: query.category,
        limit: query.limit,
        offset: query.offset,
      });

      return result;
    },
  );

  app.get(
    "/v1/audit/export",
    {
      schema: {
        querystring: auditExportQuerySchema,
      },
    },
    async (request, reply) => {
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const role = request.authContext?.role ?? "owner";
      const subject = request.authContext?.subject ?? "unknown-actor";
      const requestId = request.id ?? "req-unknown";

      const query = request.query as { format?: "json" | "csv" };
      const format = query.format ?? "json";

      recordAuditEvent({
        workspaceId,
        category: "export_decision",
        action: "audit_events_exported",
        actorSubject: subject,
        actorRole: role,
        resourceId: `audit-export-${workspaceId}`,
        requestId,
        details: {
          format,
        },
      });

      const content = exportAuditEvents({
        workspaceId,
        role,
        actorSubject: subject,
        format,
      });

      if (format === "csv") {
        return reply
          .header("Content-Type", "text/csv; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename="audit-events-${Date.now()}.csv"`,
          )
          .send(content);
      }

      return reply
        .header("Content-Type", "application/json; charset=utf-8")
        .send(content);
    },
  );

  app.get(
    "/v1/governance/reviews",
    {
      schema: {
        response: {
          200: GovernanceReviewsResponseSchema,
        },
      },
    },
    async (request) => {
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";

      return getGovernanceReviews(workspaceId);
    },
  );

  app.get(
    "/v1/governance/readiness",
    {
      schema: {
        response: {
          200: GovernanceReadinessResponseSchema,
        },
      },
    },
    async (request) => {
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";

      return getReadinessReport(workspaceId);
    },
  );
};
