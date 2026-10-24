import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { memberships, workspaces } from "../db/schema.js";

export interface AuthContext {
  workspaceId: string;
  subject: string;
  role: "owner" | "analyst" | "viewer";
}

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export function parseBearerToken(header?: string): string | null {
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? (match[1] ?? null) : null;
}

export function parseTokenPayload(token: string): {
  subject: string;
  workspaceId?: string;
  role?: "owner" | "analyst" | "viewer";
} {
  if (token.includes(":")) {
    const parts = token.split(":");
    const sub = parts[0] ?? "test-subject";
    const ws = parts[1];
    const rolePart = parts[2];
    const role =
      rolePart === "analyst" || rolePart === "viewer" || rolePart === "owner"
        ? rolePart
        : undefined;
    return { subject: sub, workspaceId: ws, role };
  }
  return { subject: token };
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = parseBearerToken(request.headers.authorization);
  const requestId = request.id ?? "req-unknown";

  if (token === null) {
    await reply.status(401).send({
      code: "unauthorized",
      message: "Authentication required",
      requestId,
    });
    return;
  }

  const {
    subject,
    workspaceId: tokenWorkspaceId,
    role: tokenRole,
  } = parseTokenPayload(token);
  const requestedWorkspaceId =
    (request.headers["x-workspace-id"] as string | undefined) ??
    tokenWorkspaceId;

  const db = request.server.metadataDb;
  if (!db) {
    request.authContext = {
      subject,
      workspaceId:
        requestedWorkspaceId ?? "00000000-0000-4000-8000-000000000001",
      role: tokenRole ?? "owner",
    };
    return;
  }

  if (requestedWorkspaceId) {
    const userMemberships = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.subject, subject),
          eq(memberships.workspaceId, requestedWorkspaceId),
        ),
      );

    const mem = userMemberships[0];
    if (!mem) {
      const allMemberships = await db
        .select()
        .from(memberships)
        .where(eq(memberships.subject, subject));

      if (allMemberships.length === 0) {
        if (requestedWorkspaceId === "00000000-0000-4000-8000-000000000001") {
          await db
            .insert(workspaces)
            .values({
              id: requestedWorkspaceId,
              ownerSubject: subject,
              name: "Personal Workspace",
            })
            .onConflictDoNothing();
          await db
            .insert(memberships)
            .values({
              workspaceId: requestedWorkspaceId,
              subject,
              role: "owner",
            })
            .onConflictDoNothing();

          request.authContext = {
            subject,
            workspaceId: requestedWorkspaceId,
            role: "owner",
          };
          return;
        }

        await reply.status(401).send({
          code: "unauthorized",
          message: "Subject has no workspace access",
          requestId,
        });
        return;
      }

      await reply.status(403).send({
        code: "forbidden",
        message: "Access denied to requested workspace",
        requestId,
      });
      return;
    }

    request.authContext = {
      subject,
      workspaceId: mem.workspaceId,
      role: mem.role,
    };
    return;
  }

  const userMemberships = await db
    .select()
    .from(memberships)
    .where(eq(memberships.subject, subject));

  const mem = userMemberships[0];
  if (!mem) {
    let existingWorkspaces = await db.select().from(workspaces).limit(1);
    let defaultWs = existingWorkspaces[0];
    if (!defaultWs) {
      const defaultId = "00000000-0000-4000-8000-000000000001";
      await db
        .insert(workspaces)
        .values({
          id: defaultId,
          ownerSubject: subject,
          name: "Personal Workspace",
        })
        .onConflictDoNothing();
      existingWorkspaces = await db.select().from(workspaces).limit(1);
      defaultWs = existingWorkspaces[0];
    }
    if (defaultWs) {
      await db
        .insert(memberships)
        .values({
          workspaceId: defaultWs.id,
          subject,
          role: "owner",
        })
        .onConflictDoNothing();

      request.authContext = {
        subject,
        workspaceId: defaultWs.id,
        role: "owner",
      };
      return;
    }

    await reply.status(401).send({
      code: "unauthorized",
      message: "Subject has no associated workspace",
      requestId,
    });
    return;
  }

  request.authContext = {
    workspaceId: mem.workspaceId,
    subject: mem.subject,
    role: mem.role,
  };
}
