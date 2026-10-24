import "dotenv/config";

const nodeEnv = process.env.NODE_ENV;
const NODE_ENV =
  nodeEnv === "production" || nodeEnv === "test" ? nodeEnv : "development";

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "3001", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value ?? ""}`);
  }
  return port;
}

export const env = {
  NODE_ENV,
  HOST: process.env.HOST ?? "127.0.0.1",
  PORT: parsePort(process.env.PORT),
  LOG_LEVEL:
    process.env.LOG_LEVEL ?? (NODE_ENV === "test" ? "silent" : "info"),
  DATABASE_URL: process.env.DATABASE_URL,
} as const;
