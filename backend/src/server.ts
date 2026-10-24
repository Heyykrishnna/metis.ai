import { buildApp } from "./app.js";
import { env } from "./config.js";
import { logger } from "./logger.js";

const app = await buildApp();

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  logger.error(error, "Failed to start server");
  process.exit(1);
}
