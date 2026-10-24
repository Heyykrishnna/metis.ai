import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import Type from "typebox";
import { requireAuth } from "../security/auth.js";

export const capabilitiesRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook("preHandler", requireAuth);
  app.get(
    "/v1/capabilities",
    {
      schema: {
        response: {
          200: Type.Object(
            {
              storageAvailable: Type.Boolean(),
              analysisAvailable: Type.Boolean(),
              inferenceAvailable: Type.Boolean(),
              model: Type.String(),
            },
            { additionalProperties: false },
          ),
        },
      },
    },
    async () => {
      const model =
        process.env.INFERENCE_MODEL ?? "qwen2.5-coder:7b-instruct-q4_K_M";
      let inferenceAvailable = false;
      try {
        const response = await fetch(
          new URL(
            "/api/tags",
            process.env.INFERENCE_BASE_URL ?? "http://127.0.0.1:11434",
          ),
          { signal: AbortSignal.timeout(3000) },
        );
        const body: unknown = await response.json();
        inferenceAvailable =
          response.ok &&
          typeof body === "object" &&
          body !== null &&
          "models" in body &&
          Array.isArray(body.models) &&
          body.models.some(
            (item: unknown) =>
              typeof item === "object" &&
              item !== null &&
              "name" in item &&
              item.name === model,
          );
      } catch {
        inferenceAvailable = false;
      }
      return {
        storageAvailable: app.metadataDb !== null,
        analysisAvailable: app.metadataDb !== null,
        inferenceAvailable,
        model,
      };
    },
  );
};
