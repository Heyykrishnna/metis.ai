import { randomUUID } from "node:crypto";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { and, eq } from "drizzle-orm";
import Type from "typebox";
import { ErrorSchema, IdSchema } from "../contracts/common.js";
import {
  RecipeExecuteResponseSchema,
  RecipeInputSchema,
  RecipeSchema,
  type Recipe,
} from "../contracts/features.js";
import { metricDefinitions } from "../db/schema.js";
import { requireAuth } from "../security/auth.js";
import { validateQuerySafety } from "../sql/safety.js";
import { getMemoryConnection } from "./connections.js";

const memoryRecipes = new Map<string, Recipe>();

const recipeParamsSchema = Type.Object(
  {
    recipeId: IdSchema,
  },
  { additionalProperties: false },
);

export const recipeRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/v1/recipes",
    {
      schema: {
        body: RecipeInputSchema,
        response: {
          201: RecipeSchema,
          400: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        name,
        metricName,
        connectionId,
        question,
        plan,
        sqlText,
        grain,
        timeframePolicy,
        nullExclusionPolicy,
        approvalStatus,
      } = request.body;

      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const subject = request.authContext?.subject ?? "unknown-actor";
      const recipeId = randomUUID();
      const now = new Date().toISOString();

      const recipe: Recipe = {
        id: recipeId,
        workspaceId,
        name,
        metricName,
        version: 1,
        ownerSubject: subject,
        connectionId,
        question,
        plan,
        sqlText,
        grain: [...grain],
        timeframePolicy,
        nullExclusionPolicy,
        approvalStatus,
        createdAt: now,
      };

      memoryRecipes.set(recipeId, recipe);

      if (app.metadataDb) {
        try {
          await app.metadataDb.insert(metricDefinitions).values({
            id: recipeId,
            workspaceId,
            name,
            ownerSubject: subject,
            version: 1,
            definition: {
              metricName,
              connectionId,
              question,
              plan,
              sqlText,
              grain,
              timeframePolicy,
              nullExclusionPolicy,
              createdAt: now,
            },
            approvalStatus:
              approvalStatus === "archived" ? "revoked" : approvalStatus,
          });
        } catch {
          void 0;
        }
      }

      return reply.status(201).send(recipe);
    },
  );

  app.get(
    "/v1/recipes",
    {
      schema: {
        response: {
          200: Type.Array(RecipeSchema, { maxItems: 100 }),
        },
      },
    },
    async (request) => {
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";

      if (app.metadataDb) {
        try {
          const rows = await app.metadataDb
            .select()
            .from(metricDefinitions)
            .where(eq(metricDefinitions.workspaceId, workspaceId));

          if (rows.length > 0) {
            return rows.map((r: typeof metricDefinitions.$inferSelect) => {
              const def = r.definition as Record<string, unknown>;
              return {
                id: r.id,
                workspaceId: r.workspaceId,
                name: r.name,
                metricName: String(def.metricName ?? r.name),
                version: r.version,
                ownerSubject: r.ownerSubject,
                connectionId: String(def.connectionId ?? ""),
                question: String(def.question ?? ""),
                plan: (def.plan as Record<string, unknown>) ?? {},
                sqlText: String(def.sqlText ?? ""),
                grain: Array.isArray(def.grain)
                  ? def.grain.map(String)
                  : ["school_id"],
                timeframePolicy: String(def.timeframePolicy ?? ""),
                nullExclusionPolicy: String(def.nullExclusionPolicy ?? ""),
                approvalStatus:
                  r.approvalStatus === "revoked"
                    ? "archived"
                    : (r.approvalStatus as "draft" | "approved"),
                createdAt: String(def.createdAt ?? new Date().toISOString()),
              };
            });
          }
        } catch {
          void 0;
        }
      }

      const list: Recipe[] = [];
      for (const recipe of memoryRecipes.values()) {
        if (recipe.workspaceId === workspaceId) {
          list.push(recipe);
        }
      }
      return list;
    },
  );

  app.get(
    "/v1/recipes/:recipeId",
    {
      schema: {
        params: recipeParamsSchema,
        response: {
          200: RecipeSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { recipeId } = request.params as { recipeId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      if (app.metadataDb) {
        try {
          const rows = await app.metadataDb
            .select()
            .from(metricDefinitions)
            .where(
              and(
                eq(metricDefinitions.id, recipeId),
                eq(metricDefinitions.workspaceId, workspaceId),
              ),
            );
          const r = rows[0];
          if (r) {
            const def = r.definition as Record<string, unknown>;
            return reply.send({
              id: r.id,
              workspaceId: r.workspaceId,
              name: r.name,
              metricName: String(def.metricName ?? r.name),
              version: r.version,
              ownerSubject: r.ownerSubject,
              connectionId: String(def.connectionId ?? ""),
              question: String(def.question ?? ""),
              plan: (def.plan as Record<string, unknown>) ?? {},
              sqlText: String(def.sqlText ?? ""),
              grain: Array.isArray(def.grain)
                ? def.grain.map(String)
                : ["school_id"],
              timeframePolicy: String(def.timeframePolicy ?? ""),
              nullExclusionPolicy: String(def.nullExclusionPolicy ?? ""),
              approvalStatus:
                r.approvalStatus === "revoked"
                  ? "archived"
                  : (r.approvalStatus as "draft" | "approved"),
              createdAt: String(def.createdAt ?? new Date().toISOString()),
            });
          }
        } catch {
          void 0;
        }
      }

      const recipe = memoryRecipes.get(recipeId);
      if (recipe && recipe.workspaceId === workspaceId) {
        return reply.send(recipe);
      }

      return reply.status(404).send({
        code: "not_found",
        message: "Resource unavailable",
        requestId,
      });
    },
  );

  app.post(
    "/v1/recipes/:recipeId/execute",
    {
      schema: {
        params: recipeParamsSchema,
        response: {
          202: RecipeExecuteResponseSchema,
          400: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { recipeId } = request.params as { recipeId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      let recipe = memoryRecipes.get(recipeId);
      if (app.metadataDb && (!recipe || recipe.workspaceId !== workspaceId)) {
        try {
          const rows = await app.metadataDb
            .select()
            .from(metricDefinitions)
            .where(
              and(
                eq(metricDefinitions.id, recipeId),
                eq(metricDefinitions.workspaceId, workspaceId),
              ),
            );
          const r = rows[0];
          if (r) {
            const def = r.definition as Record<string, unknown>;
            recipe = {
              id: r.id,
              workspaceId: r.workspaceId,
              name: r.name,
              metricName: String(def.metricName ?? r.name),
              version: r.version,
              ownerSubject: r.ownerSubject,
              connectionId: String(def.connectionId ?? ""),
              question: String(def.question ?? ""),
              plan: (def.plan as Record<string, unknown>) ?? {},
              sqlText: String(def.sqlText ?? ""),
              grain: Array.isArray(def.grain)
                ? def.grain.map(String)
                : ["school_id"],
              timeframePolicy: String(def.timeframePolicy ?? ""),
              nullExclusionPolicy: String(def.nullExclusionPolicy ?? ""),
              approvalStatus:
                r.approvalStatus === "revoked"
                  ? "archived"
                  : (r.approvalStatus as "draft" | "approved"),
              createdAt: String(def.createdAt ?? new Date().toISOString()),
            };
          }
        } catch {
          void 0;
        }
      }

      if (!recipe || recipe.workspaceId !== workspaceId) {
        return reply.status(404).send({
          code: "not_found",
          message: "Recipe not found in workspace",
          requestId,
        });
      }

      const connection = getMemoryConnection(recipe.connectionId, workspaceId);
      if (!connection || connection.status === "revoked") {
        return reply.status(404).send({
          code: "not_found",
          message: "Target connection not found or revoked",
          requestId,
        });
      }

      const safety = validateQuerySafety(
        recipe.sqlText,
        connection.allowedSchemas,
      );
      if (!safety.allowed) {
        return reply.status(403).send({
          code: "forbidden",
          message: `Recipe query rejected by current schema authorization: ${safety.reason ?? "disallowed objects"}`,
          requestId,
        });
      }

      try {
        const run = await app.orchestrator.executeAnalysis({
          workspaceId,
          connectionId: recipe.connectionId,
          allowedSchemas: connection.allowedSchemas,
          question: recipe.question,
          sqlOverride: recipe.sqlText,
        });

        return reply.status(202).send({
          recipeId: recipe.id,
          runId: run.runId,
          status: run.status,
        });
      } catch (err) {
        return reply.status(400).send({
          code: "invalid_request",
          message:
            err instanceof Error ? err.message : "Failed to execute recipe",
          requestId,
        });
      }
    },
  );
};
