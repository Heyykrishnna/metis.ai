import { buildApp } from "./app.js";
import { env } from "./config.js";
import { logger } from "./logger.js";

const app = await buildApp(env.DATABASE_URL);

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  logger.error(error, "Failed to start server");
  await app.close();
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().catch((error: unknown) => {
      logger.error({ err: error }, "Failed to close server");
      process.exitCode = 1;
    });
  });
}
