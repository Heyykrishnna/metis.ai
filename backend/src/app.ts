import Fastify from "fastify";
import {
  TypeBoxValidatorCompiler,
  type TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { createMetadataDb, type MetadataDatabase } from "./db/index.js";
import { logger } from "./logger.js";
import { healthRoutes } from "./routes/health.js";

declare module "fastify" {
  interface FastifyInstance {
    metadataDb: MetadataDatabase | null;
  }
}

export async function buildApp(databaseUrl?: string) {
  const app = Fastify({
    loggerInstance: logger,
  })
    .setValidatorCompiler(TypeBoxValidatorCompiler)
    .withTypeProvider<TypeBoxTypeProvider>();

  const metadata = databaseUrl ? createMetadataDb(databaseUrl) : undefined;
  app.decorate("metadataDb", metadata?.db ?? null);
  if (metadata) {
    app.addHook("onReady", async () => {
      await metadata.pool.query("SELECT 1");
    });
    app.addHook("onClose", async () => {
      await metadata.pool.end();
    });
  }
  await app.register(healthRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
