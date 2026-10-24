import Fastify from "fastify";
import {
  TypeBoxValidatorCompiler,
  type TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { AnalysisOrchestrator } from "./analysis/orchestrator.js";
import { createMetadataDb, type MetadataDatabase } from "./db/index.js";
import {
  createInferenceClient,
  type InferenceClient,
} from "./inference/client.js";
import { logger } from "./logger.js";
import { analysisRoutes } from "./routes/analyses.js";
import { connectionRoutes } from "./routes/connections.js";
import { capabilitiesRoutes } from "./routes/capabilities.js";
import { fileRoutes } from "./routes/files.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { governanceRoutes } from "./routes/governance.js";
import { healthRoutes } from "./routes/health.js";
import { policyRoutes } from "./routes/policies.js";
import { recipeRoutes } from "./routes/recipes.js";
import type { ConnectorAdapter } from "./sql/connectors.js";

declare module "fastify" {
  interface FastifyInstance {
    metadataDb: MetadataDatabase | null;
    orchestrator: AnalysisOrchestrator;
  }
}

export interface BuildAppOptions {
  databaseUrl?: string;
  adapter?: ConnectorAdapter;
  inference?: InferenceClient;
  orchestrator?: AnalysisOrchestrator;
  useModelPlanning?: boolean;
}

export async function buildApp(
  databaseUrlOrOptions?: string | BuildAppOptions,
) {
  const options: BuildAppOptions =
    typeof databaseUrlOrOptions === "string"
      ? { databaseUrl: databaseUrlOrOptions }
      : (databaseUrlOrOptions ?? {});

  const app = Fastify({
    loggerInstance: logger,
  })
    .setValidatorCompiler(TypeBoxValidatorCompiler)
    .withTypeProvider<TypeBoxTypeProvider>();

  const metadata = options.databaseUrl
    ? createMetadataDb(options.databaseUrl)
    : undefined;
  app.decorate("metadataDb", metadata?.db ?? null);

  if (metadata) {
    app.addHook("onReady", async () => {
      await metadata.pool.query("SELECT 1");
    });
    app.addHook("onClose", async () => {
      await metadata.pool.end();
    });
  }

  const defaultAdapter: ConnectorAdapter = options.adapter ?? {
    id: "unconfigured-analytical-source",
    dialect: "PostgreSQL",
    async query() {
      throw new Error(
        "No read-only analytical source is configured. Upload and select a file to use the stored-file analysis service.",
      );
    },
  };

  const defaultInference: InferenceClient =
    options.inference ?? createInferenceClient();

  const orchestrator =
    options.orchestrator ??
    new AnalysisOrchestrator({
      adapter: defaultAdapter,
      inference: defaultInference,
      metadataDb: metadata?.db ?? null,
      useModelPlanning:
        options.useModelPlanning ?? options.adapter === undefined,
    });

  app.decorate("orchestrator", orchestrator);

  await app.register(healthRoutes);
  await app.register(fileRoutes);
  await app.register(capabilitiesRoutes);
  await app.register(connectionRoutes);
  await app.register(analysisRoutes);
  await app.register(feedbackRoutes);
  await app.register(recipeRoutes);
  await app.register(policyRoutes);
  await app.register(governanceRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
