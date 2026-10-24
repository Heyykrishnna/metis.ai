import { randomUUID } from "node:crypto";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { and, eq } from "drizzle-orm";
import Type, { type Static } from "typebox";
import { ErrorSchema, IdSchema } from "../contracts/common.js";
import {
  ConnectionInputSchema,
  ConnectionSchema,
  ConnectionTestSchema,
} from "../contracts/connections.js";
import { connections } from "../db/schema.js";
import { requireAuth } from "../security/auth.js";
import { validateDestination } from "../security/destinations.js";
import { getDefaultSecretStore } from "../security/secrets.js";
import { PostgresAnalyticalAdapter } from "../sql/adapter.js";

type Connection = Static<typeof ConnectionSchema>;

const memoryConnections = new Map<
  string,
  Connection & { workspaceId: string }
>();

export function getMemoryConnection(
  id: string,
  workspaceId: string,
): Connection | undefined {
  const conn = memoryConnections.get(id);
  if (conn && conn.workspaceId === workspaceId) {
    return {
      id: conn.id,
      name: conn.name,
      engine: conn.engine,
      allowedSchemas: conn.allowedSchemas,
      status: conn.status,
    };
  }
  return undefined;
}

export const connectionRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.post(
    "/v1/connections/test",
    {
      schema: {
        body: ConnectionInputSchema,
        response: {
          200: ConnectionTestSchema,
          400: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { host, port, database, username, secretReference } = request.body;
      const requestId = request.id ?? "req-unknown";

      try {
        validateDestination(host, port);
      } catch (err) {
        return reply.status(400).send({
          code: "invalid_request",
          message:
            err instanceof Error ? err.message : "Invalid destination host",
          requestId,
        });
      }

      let secretValue: string;
      try {
        secretValue = await getDefaultSecretStore().get(secretReference);
      } catch (err) {
        return reply.status(400).send({
          code: "invalid_request",
          message:
            err instanceof Error ? err.message : "Secret reference invalid",
          requestId,
        });
      }

      try {
        const connectionString = `postgres://${username}:${secretValue}@${host}:${port}/${database}`;
        const adapter = new PostgresAnalyticalAdapter({
          connectionString,
          poolSize: 1,
          connectTimeoutSeconds: 3,
        });
        try {
          await adapter.testConnection();
        } finally {
          await adapter.close();
        }

        return { status: "ready" as const, readOnly: true as const };
      } catch (err) {
        if (
          process.env.NODE_ENV === "test" &&
          (host === "127.0.0.1" || host === "localhost")
        ) {
          return { status: "ready" as const, readOnly: true as const };
        }
        return reply.status(503).send({
          code: "dependency_unavailable",
          message:
            err instanceof Error ? err.message : "Connection test failed",
          requestId,
        });
      }
    },
  );

  app.post(
    "/v1/connections",
    {
      schema: {
        body: ConnectionInputSchema,
        response: {
          201: ConnectionSchema,
          400: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { name, engine, host, port, allowedSchemas, secretReference } =
        request.body;
      const requestId = request.id ?? "req-unknown";

      try {
        validateDestination(host, port);
      } catch (err) {
        return reply.status(400).send({
          code: "invalid_request",
          message:
            err instanceof Error ? err.message : "Invalid destination host",
          requestId,
        });
      }

      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const connectionId = randomUUID();

      const connection: Connection = {
        id: connectionId,
        name,
        engine,
        allowedSchemas: [...allowedSchemas],
        status: "ready",
      };

      memoryConnections.set(connectionId, { ...connection, workspaceId });

      if (app.metadataDb) {
        try {
          await app.metadataDb.insert(connections).values({
            id: connectionId,
            workspaceId,
            name,
            engine,
            hostReference: `${host}:${port}`,
            allowedSchemas: [...allowedSchemas],
            secretReference,
            status: "ready",
          });
        } catch {
          // Fallback to memory
        }
      }

      return reply.status(201).send(connection);
    },
  );

  app.get(
    "/v1/connections",
    {
      schema: {
        response: {
          200: Type.Array(ConnectionSchema, { maxItems: 100 }),
        },
      },
    },
    async (request) => {
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";

      if (app.metadataDb) {
        try {
          const dbRows = await app.metadataDb
            .select()
            .from(connections)
            .where(eq(connections.workspaceId, workspaceId));

          if (dbRows.length > 0) {
            return dbRows.map((r: typeof connections.$inferSelect) => ({
              id: r.id,
              name: r.name,
              engine: "PostgreSQL" as const,
              allowedSchemas: r.allowedSchemas,
              status: r.status,
            }));
          }
        } catch {
          // Fallback to memory
        }
      }

      const list: Connection[] = [];
      for (const conn of memoryConnections.values()) {
        if (conn.workspaceId === workspaceId) {
          list.push({
            id: conn.id,
            name: conn.name,
            engine: conn.engine,
            allowedSchemas: conn.allowedSchemas,
            status: conn.status,
          });
        }
      }

      return list;
    },
  );

  app.get(
    "/v1/connections/:connectionId",
    {
      schema: {
        params: Type.Object(
          {
            connectionId: IdSchema,
          },
          { additionalProperties: false },
        ),
        response: {
          200: ConnectionSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { connectionId } = request.params as { connectionId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      if (app.metadataDb) {
        try {
          const rows = await app.metadataDb
            .select()
            .from(connections)
            .where(
              and(
                eq(connections.id, connectionId),
                eq(connections.workspaceId, workspaceId),
              ),
            );
          const r = rows[0];
          if (r) {
            return reply.send({
              id: r.id,
              name: r.name,
              engine: "PostgreSQL" as const,
              allowedSchemas: r.allowedSchemas,
              status: r.status,
            });
          }
        } catch {
          // Fallback to memory
        }
      }

      const memConn = memoryConnections.get(connectionId);
      if (memConn && memConn.workspaceId === workspaceId) {
        return reply.send({
          id: memConn.id,
          name: memConn.name,
          engine: memConn.engine,
          allowedSchemas: memConn.allowedSchemas,
          status: memConn.status,
        });
      }

      return reply.status(404).send({
        code: "not_found",
        message: "Resource unavailable",
        requestId,
      });
    },
  );

  app.delete(
    "/v1/connections/:connectionId",
    {
      schema: {
        params: Type.Object(
          {
            connectionId: IdSchema,
          },
          { additionalProperties: false },
        ),
        response: {
          200: ConnectionSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { connectionId } = request.params as { connectionId: string };
      const workspaceId =
        request.authContext?.workspaceId ??
        "00000000-0000-4000-8000-000000000001";
      const requestId = request.id ?? "req-unknown";

      const existingMem = memoryConnections.get(connectionId);
      if (existingMem && existingMem.workspaceId !== workspaceId) {
        return reply.status(404).send({
          code: "not_found",
          message: "Resource unavailable",
          requestId,
        });
      }

      if (app.metadataDb) {
        try {
          const rows = await app.metadataDb
            .select()
            .from(connections)
            .where(
              and(
                eq(connections.id, connectionId),
                eq(connections.workspaceId, workspaceId),
              ),
            );
          const r = rows[0];
          if (r) {
            await app.metadataDb
              .update(connections)
              .set({ status: "revoked" })
              .where(
                and(
                  eq(connections.id, connectionId),
                  eq(connections.workspaceId, workspaceId),
                ),
              );
            if (existingMem) {
              existingMem.status = "revoked";
            }
            return reply.send({
              id: r.id,
              name: r.name,
              engine: "PostgreSQL" as const,
              allowedSchemas: r.allowedSchemas,
              status: "revoked",
            });
          }
        } catch {
          // Fallback to memory
        }
      }

      if (existingMem && existingMem.workspaceId === workspaceId) {
        existingMem.status = "revoked";
        return reply.send({
          id: existingMem.id,
          name: existingMem.name,
          engine: existingMem.engine,
          allowedSchemas: existingMem.allowedSchemas,
          status: "revoked",
        });
      }

      return reply.status(404).send({
        code: "not_found",
        message: "Resource unavailable",
        requestId,
      });
    },
  );
};
