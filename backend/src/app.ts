import Fastify from "fastify";
import {
  TypeBoxValidatorCompiler,
  type TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { AnalysisOrchestrator } from "./analysis/orchestrator.js";
import { createMetadataDb, type MetadataDatabase } from "./db/index.js";
import {
  OllamaInferenceClient,
  type InferenceClient,
} from "./inference/client.js";
import { logger } from "./logger.js";
import { analysisRoutes } from "./routes/analyses.js";
import { connectionRoutes } from "./routes/connections.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { healthRoutes } from "./routes/health.js";
import { recipeRoutes } from "./routes/recipes.js";
import { PostgresAnalyticalAdapter } from "./sql/adapter.js";
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

  const defaultAdapter: ConnectorAdapter =
    options.adapter ??
    (options.databaseUrl
      ? new PostgresAnalyticalAdapter({ connectionString: options.databaseUrl })
      : {
          id: "default-analytical",
          dialect: "PostgreSQL" as const,
          async query(input) {
            if (input.sql.includes("information_schema.tables")) {
              return {
                columns: ["schema", "name"],
                rows: [
                  { schema: "analytics_clean", name: "schools" },
                  { schema: "analytics_clean", name: "enrolments" },
                ],
              };
            }
            if (input.sql.includes("information_schema.columns")) {
              return {
                columns: ["schema", "table_name", "name", "type", "nullable"],
                rows: [
                  {
                    schema: "analytics_clean",
                    table_name: "schools",
                    name: "id",
                    type: "integer",
                    nullable: false,
                  },
                  {
                    schema: "analytics_clean",
                    table_name: "schools",
                    name: "name",
                    type: "text",
                    nullable: false,
                  },
                  {
                    schema: "analytics_clean",
                    table_name: "enrolments",
                    name: "school_id",
                    type: "integer",
                    nullable: false,
                  },
                  {
                    schema: "analytics_clean",
                    table_name: "enrolments",
                    name: "year",
                    type: "integer",
                    nullable: false,
                  },
                  {
                    schema: "analytics_clean",
                    table_name: "enrolments",
                    name: "enrolled",
                    type: "integer",
                    nullable: true,
                  },
                ],
              };
            }
            if (input.sql.includes("count(*)")) {
              return { columns: ["cnt"], rows: [{ cnt: 6 }] };
            }
            return {
              columns: ["school_id", "delta"],
              rows: [
                { school_id: 1, delta: -20 },
                { school_id: 4, delta: -10 },
              ],
            };
          },
        });

  const defaultInference: InferenceClient =
    options.inference ?? new OllamaInferenceClient();

  const orchestrator =
    options.orchestrator ??
    new AnalysisOrchestrator({
      adapter: defaultAdapter,
      inference: defaultInference,
      metadataDb: metadata?.db ?? null,
    });

  app.decorate("orchestrator", orchestrator);

  await app.register(healthRoutes);
  await app.register(connectionRoutes);
  await app.register(analysisRoutes);
  await app.register(feedbackRoutes);
  await app.register(recipeRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
