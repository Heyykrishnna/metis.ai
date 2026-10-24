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
import {
  RecipePublishInputSchema,
  type RecipePublishInput,
} from "../contracts/governance.js";
import { metricDefinitions } from "../db/schema.js";
import { requireAuth } from "../security/auth.js";
import { validateQuerySafety } from "../sql/safety.js";
import { getMemoryConnection } from "./connections.js";
import { recordAuditEvent } from "../analysis/governance.js";

const memoryRecipes = new Map<string, Recipe>();

export function getRecipesForConnection(connectionId: string): Recipe[] {
  const result: Recipe[] = [];
  for (const recipe of memoryRecipes.values()) {
    if (recipe.connectionId === connectionId) {
      result.push(recipe);
    }
  }
  return result;
}

export function invalidateRecipeDueToDrift(recipeId: string): boolean {
  const recipe = memoryRecipes.get(recipeId);
  if (recipe) {
    recipe.approvalStatus = "draft";
    return true;
  }
  return false;
}

export function clearMemoryRecipes(): void {
  memoryRecipes.clear();
}

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
        approvalStatus = "draft",
        audienceScope = "workspace",
      } = request.body;

      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const subject = request.authContext?.subject ?? "unknown-actor";
      const role = request.authContext?.role ?? "owner";
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
        audienceScope,
        versionHistory: [
          {
            version: 1,
            changeDescription: "Initial creation",
            updatedBy: subject,
            updatedAt: now,
          },
        ],
        createdAt: now,
      };

      memoryRecipes.set(recipeId, recipe);

      recordAuditEvent({
        workspaceId,
        category: "recipe_lifecycle",
        action: "recipe_created",
        actorSubject: subject,
        actorRole: role,
        resourceId: recipeId,
        requestId: request.id ?? `req-${recipeId}`,
        details: {
          name,
          metricName,
          audienceScope,
          approvalStatus,
        },
      });

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
              audienceScope,
              createdAt: now,
            },
            approvalStatus:
              approvalStatus === "archived" || approvalStatus === "retired"
                ? "revoked"
                : approvalStatus === "draft"
                  ? "draft"
                  : "approved",
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

      const list: Recipe[] = [];
      for (const recipe of memoryRecipes.values()) {
        if (recipe.workspaceId === workspaceId) {
          list.push(recipe);
        }
      }

      if (list.length > 0) {
        return list;
      }

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

      const recipe = memoryRecipes.get(recipeId);
      if (recipe && recipe.workspaceId === workspaceId) {
        return reply.send(recipe);
      }

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

      return reply.status(404).send({
        code: "not_found",
        message: "Resource unavailable",
        requestId,
      });
    },
  );

  app.post(
    "/v1/recipes/:recipeId/review",
    {
      schema: {
        params: recipeParamsSchema,
        response: {
          200: RecipeSchema,
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
      const role = request.authContext?.role ?? "owner";
      const subject = request.authContext?.subject ?? "steward";

      if (role === "viewer") {
        return reply.status(403).send({
          code: "forbidden",
          message: "Viewers cannot review recipes",
          requestId,
        });
      }

      const recipe = memoryRecipes.get(recipeId);
      if (!recipe || recipe.workspaceId !== workspaceId) {
        return reply.status(404).send({
          code: "not_found",
          message: "Recipe not found",
          requestId,
        });
      }

      const now = new Date().toISOString();
      recipe.approvalStatus = "reviewed";
      recipe.reviewedBy = subject;
      recipe.reviewedAt = now;

      recordAuditEvent({
        workspaceId,
        category: "recipe_lifecycle",
        action: "recipe_reviewed",
        actorSubject: subject,
        actorRole: role,
        resourceId: recipeId,
        requestId,
        details: {
          recipeName: recipe.name,
          reviewedBy: subject,
        },
      });

      return reply.send(recipe);
    },
  );

  app.post(
    "/v1/recipes/:recipeId/publish",
    {
      schema: {
        params: recipeParamsSchema,
        body: RecipePublishInputSchema,
        response: {
          200: RecipeSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { recipeId } = request.params as { recipeId: string };
      const body = request.body as RecipePublishInput;
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";
      const role = request.authContext?.role ?? "owner";
      const subject = request.authContext?.subject ?? "publisher";

      if (role === "viewer") {
        return reply.status(403).send({
          code: "forbidden",
          message: "Viewers cannot publish recipes",
          requestId,
        });
      }

      const recipe = memoryRecipes.get(recipeId);
      if (!recipe || recipe.workspaceId !== workspaceId) {
        return reply.status(404).send({
          code: "not_found",
          message: "Recipe not found",
          requestId,
        });
      }

      const now = new Date().toISOString();
      recipe.approvalStatus = "published";
      recipe.publishedBy = subject;
      recipe.publishedAt = now;
      if (body.audienceScope) {
        recipe.audienceScope = body.audienceScope;
      }
      recipe.version += 1;

      const history = recipe.versionHistory ?? [];
      history.push({
        version: recipe.version,
        changeDescription:
          body.changeDescription ?? "Published recipe for organization use",
        updatedBy: subject,
        updatedAt: now,
      });
      recipe.versionHistory = history;

      recordAuditEvent({
        workspaceId,
        category: "recipe_lifecycle",
        action: "recipe_published",
        actorSubject: subject,
        actorRole: role,
        resourceId: recipeId,
        requestId,
        details: {
          recipeName: recipe.name,
          version: recipe.version,
          audienceScope: recipe.audienceScope,
          publishedBy: subject,
        },
      });

      return reply.send(recipe);
    },
  );

  app.post(
    "/v1/recipes/:recipeId/retire",
    {
      schema: {
        params: recipeParamsSchema,
        response: {
          200: RecipeSchema,
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
      const role = request.authContext?.role ?? "owner";
      const subject = request.authContext?.subject ?? "steward";

      if (role === "viewer") {
        return reply.status(403).send({
          code: "forbidden",
          message: "Viewers cannot retire recipes",
          requestId,
        });
      }

      const recipe = memoryRecipes.get(recipeId);
      if (!recipe || recipe.workspaceId !== workspaceId) {
        return reply.status(404).send({
          code: "not_found",
          message: "Recipe not found",
          requestId,
        });
      }

      const now = new Date().toISOString();
      recipe.approvalStatus = "retired";
      recipe.retiredBy = subject;
      recipe.retiredAt = now;

      recordAuditEvent({
        workspaceId,
        category: "recipe_lifecycle",
        action: "recipe_retired",
        actorSubject: subject,
        actorRole: role,
        resourceId: recipeId,
        requestId,
        details: {
          recipeName: recipe.name,
          retiredBy: subject,
        },
      });

      return reply.send(recipe);
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
      const subject = request.authContext?.subject ?? "unknown-actor";
      const role = request.authContext?.role ?? "owner";

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
              audienceScope:
                (def.audienceScope as
                  "private" | "role_restricted" | "workspace") ?? "workspace",
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

      if (
        recipe.approvalStatus === "retired" ||
        recipe.approvalStatus === "archived"
      ) {
        recordAuditEvent({
          workspaceId,
          category: "denied_attempt",
          action: "recipe_execution_retired",
          actorSubject: subject,
          actorRole: role,
          resourceId: recipeId,
          requestId,
          details: {
            recipeId,
            status: recipe.approvalStatus,
          },
        });
        return reply.status(400).send({
          code: "invalid_request",
          message: "Recipe has been retired and cannot be executed",
          requestId,
        });
      }

      if (
        recipe.audienceScope === "private" &&
        recipe.ownerSubject !== subject &&
        role !== "owner"
      ) {
        recordAuditEvent({
          workspaceId,
          category: "denied_attempt",
          action: "recipe_execution_private",
          actorSubject: subject,
          actorRole: role,
          resourceId: recipeId,
          requestId,
          details: {
            recipeId,
            ownerSubject: recipe.ownerSubject,
          },
        });
        return reply.status(403).send({
          code: "forbidden",
          message: "Recipe is private to author",
          requestId,
        });
      }

      if (recipe.audienceScope === "role_restricted" && role === "viewer") {
        recordAuditEvent({
          workspaceId,
          category: "denied_attempt",
          action: "recipe_execution_role_restricted",
          actorSubject: subject,
          actorRole: role,
          resourceId: recipeId,
          requestId,
          details: {
            recipeId,
            audienceScope: recipe.audienceScope,
          },
        });
        return reply.status(403).send({
          code: "forbidden",
          message: "Recipe is restricted to authorized analyst or owner roles",
          requestId,
        });
      }

      if (
        role === "viewer" &&
        recipe.approvalStatus !== "approved" &&
        recipe.approvalStatus !== "published"
      ) {
        recordAuditEvent({
          workspaceId,
          category: "denied_attempt",
          action: "recipe_execution_unapproved",
          actorSubject: subject,
          actorRole: role,
          resourceId: recipeId,
          requestId,
          details: {
            recipeId,
            approvalStatus: recipe.approvalStatus,
          },
        });
        return reply.status(403).send({
          code: "forbidden",
          message: "Viewers can only execute approved or published recipes",
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
          role,
          actorSubject: subject,
          isRecipe: true,
        });

        recordAuditEvent({
          workspaceId,
          category: "recipe_lifecycle",
          action: "recipe_executed",
          actorSubject: subject,
          actorRole: role,
          resourceId: recipeId,
          requestId,
          runId: run.runId,
          details: {
            recipeId,
            runStatus: run.status,
          },
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
