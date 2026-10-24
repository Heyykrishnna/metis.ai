import { FileInputError } from "../files/errors.js";
import Type from "typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { FileStore } from "../files/store.js";
import {
  FileAnalysisSchema,
  FilePreviewSchema,
  FileQuestionSchema,
  FileUploadSchema,
  StoredFileSchema,
} from "../contracts/files.js";
import { ErrorSchema, IdSchema } from "../contracts/common.js";
import { requireAuth } from "../security/auth.js";
import { isSubjectRevoked } from "../security/policies.js";
import { OllamaInferenceClient } from "../inference/client.js";

export const fileRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const store = app.metadataDb
    ? new FileStore(app.metadataDb, new OllamaInferenceClient())
    : null;
  const active = new Map<string, number>();
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", async (request, reply) => {
    if (
      !request.authContext ||
      request.authContext.role === "viewer" ||
      isSubjectRevoked(request.authContext.subject)
    )
      return reply.status(403).send({
        code: "forbidden",
        message: "File access is restricted to the authorized uploader.",
        requestId: request.id,
      });
    if (!store)
      return reply.status(503).send({
        code: "dependency_unavailable",
        message:
          "File storage is unavailable. Check the configured metadata database.",
        requestId: request.id,
      });
  });
  app.setErrorHandler((error, request, reply) => {
    if (typeof error === "object" && error !== null && "validation" in error)
      return reply.status(400).send({
        code: "invalid_request",
        message: "Invalid file request. Check file type and size.",
        requestId: request.id,
      });
    app.log.error(
      {
        code:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "file_operation_error",
        requestId: request.id,
      },
      "File operation failed",
    );
    return reply.status(503).send({
      code: "dependency_unavailable",
      message: "The file operation could not be completed. Please retry.",
      requestId: request.id,
    });
  });
  const params = Type.Object(
    { fileId: IdSchema },
    { additionalProperties: false },
  );
  const errors = {
    400: ErrorSchema,
    403: ErrorSchema,
    404: ErrorSchema,
    503: ErrorSchema,
  };
  app.get(
    "/v1/files",
    {
      schema: {
        response: {
          200: Type.Array(StoredFileSchema, { maxItems: 10 }),
          ...errors,
        },
      },
    },
    async (request) => {
      if (store && request.authContext) return store.list(request.authContext);
    },
  );
  app.post(
    "/v1/files",
    {
      bodyLimit: 8 * 1024 * 1024,
      schema: {
        body: FileUploadSchema,
        response: { 201: FilePreviewSchema, ...errors },
      },
    },
    async (request, reply) => {
      if (!store || !request.authContext) return;
      try {
        return reply
          .status(201)
          .send(
            await store.upload(
              request.authContext,
              request.body.name,
              request.body.contentBase64,
            ),
          );
      } catch (error) {
        if (error instanceof FileInputError)
          return reply.status(400).send({
            code: "invalid_request",
            message: error.message,
            requestId: request.id,
          });
        throw error;
      }
    },
  );
  app.get(
    "/v1/file-analyses",
    {
      schema: {
        response: {
          200: Type.Array(FileAnalysisSchema, { maxItems: 50 }),
          ...errors,
        },
      },
    },
    async (request) => {
      if (store && request.authContext)
        return store.history(request.authContext);
    },
  );
  app.get(
    "/v1/files/:fileId",
    { schema: { params, response: { 200: FilePreviewSchema, ...errors } } },
    async (request, reply) => {
      if (!store || !request.authContext) return;
      const preview = await store.preview(
        request.authContext,
        request.params.fileId,
      );
      return (
        preview ??
        reply.status(404).send({
          code: "not_found",
          message: "File not found.",
          requestId: request.id,
        })
      );
    },
  );
  app.get(
    "/v1/files/:fileId/content",
    { schema: { params } },
    async (request, reply) => {
      if (!store || !request.authContext) return;
      const content = await store.original(
        request.authContext,
        request.params.fileId,
      );
      if (!content)
        return reply.status(404).send({
          code: "not_found",
          message: "File not found.",
          requestId: request.id,
        });
      return reply
        .header("Cache-Control", "no-store")
        .header("Content-Type", "application/octet-stream")
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(content.name)}`,
        )
        .send(content.bytes);
    },
  );
  app.delete(
    "/v1/files/:fileId",
    {
      schema: {
        params,
        response: { 200: Type.Object({ deleted: Type.Boolean() }), ...errors },
      },
    },
    async (request, reply) => {
      if (!store || !request.authContext) return;
      if (!(await store.remove(request.authContext, request.params.fileId)))
        return reply.status(404).send({
          code: "not_found",
          message: "File not found.",
          requestId: request.id,
        });
      return { deleted: true };
    },
  );
  app.post(
    "/v1/files/:fileId/analyses",
    {
      schema: {
        params,
        body: FileQuestionSchema,
        response: { 200: FileAnalysisSchema, ...errors },
      },
    },
    async (request, reply) => {
      if (!store || !request.authContext) return;
      const actor = request.authContext;
      const key = `${actor.workspaceId}:${actor.subject}`;
      if ((active.get(key) ?? 0) >= 1)
        return reply.status(503).send({
          code: "budget_exceeded",
          message: "An analysis is already running. Wait for it to finish.",
          requestId: request.id,
        });
      active.set(key, 1);
      try {
        const analysis = await store.analyze(
          actor,
          request.params.fileId,
          request.body.question,
        );
        if (isSubjectRevoked(actor.subject))
          return reply.status(403).send({
            code: "forbidden",
            message: "Access was revoked.",
            requestId: request.id,
          });
        return (
          analysis ??
          reply.status(404).send({
            code: "not_found",
            message: "File not found.",
            requestId: request.id,
          })
        );
      } finally {
        active.delete(key);
      }
    },
  );
};
