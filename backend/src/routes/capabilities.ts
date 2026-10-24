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
      const defaultModel =
        process.env.OPENROUTER_API_KEY ||
        process.env.INFERENCE_PROVIDER === "openrouter"
          ? "nvidia/nemotron-3.5-lightning:free"
          : process.env.NVIDIA_API_KEY ||
              process.env.INFERENCE_PROVIDER === "nvidia"
            ? "nvidia/nemotron-3.5-lightning-30b-a3b"
            : "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16";
      const model = process.env.INFERENCE_MODEL ?? defaultModel;

      let inferenceAvailable = false;
      const hasCloudToken = Boolean(
        (process.env.OPENROUTER_API_KEY &&
          process.env.OPENROUTER_API_KEY.trim().length > 0) ||
        (process.env.HF_TOKEN && process.env.HF_TOKEN.trim().length > 0) ||
        (process.env.HUGGINGFACE_API_KEY &&
          process.env.HUGGINGFACE_API_KEY.trim().length > 0) ||
        (process.env.NVIDIA_API_KEY &&
          process.env.NVIDIA_API_KEY.trim().length > 0),
      );

      if (hasCloudToken) {
        inferenceAvailable = true;
      } else {
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
                typeof item.name === "string" &&
                (item.name === model || item.name.includes("qwen")),
            );
        } catch {
          inferenceAvailable = false;
        }
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
