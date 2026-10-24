import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  EffectivePolicySchema,
  PolicySimulateInputSchema,
  PolicySimulateResultSchema,
} from "../contracts/policy.js";
import { ErrorSchema } from "../contracts/common.js";
import { requireAuth } from "../security/auth.js";
import { getEffectivePolicy, simulatePolicy } from "../security/policies.js";

export const policyRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get(
    "/v1/policies/effective",
    {
      schema: {
        response: {
          200: EffectivePolicySchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const role = request.authContext?.role ?? "owner";
      const policy = getEffectivePolicy(role);
      return reply.send(policy);
    },
  );

  app.post(
    "/v1/policies/simulate",
    {
      schema: {
        body: PolicySimulateInputSchema,
        response: {
          200: PolicySimulateResultSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const callerRole = request.authContext?.role ?? "owner";
      const requestId = request.id ?? "req-unknown";

      if (callerRole !== "owner") {
        return reply.status(403).send({
          code: "forbidden",
          message: "Policy simulation requires workspace owner role",
          requestId,
        });
      }

      const result = simulatePolicy(request.body);
      return reply.send(result);
    },
  );
};
