import pino, { type DestinationStream } from "pino";
import { env } from "./config.js";

export function createLogger(destination?: DestinationStream) {
  return pino(
    {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "password",
          "token",
          "secret",
          "DATABASE_URL",
          "databaseUrl",
          "*.password",
          "*.token",
          "*.secret",
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body",
          'res.headers["set-cookie"]',
        ],
        censor: "[Redacted]",
      },
      serializers: {
        err(error: unknown) {
          return { type: error instanceof Error ? error.name : "Error" };
        },
      },
      ...(env.NODE_ENV === "development" && destination === undefined
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "SYS:standard" },
            },
          }
        : {}),
    },
    destination,
  );
}

export const logger = createLogger();
