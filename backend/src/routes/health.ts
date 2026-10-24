import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { HealthSchema } from "../contracts/common.js";

export const healthRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: HealthSchema,
        },
      },
    },
    async () => ({ status: "ok" as const }),
  );
};
