import "dotenv/config";
import Type from "typebox";
import { Check } from "typebox/value";

const EnvironmentSchema = Type.Union([
  Type.Literal("development"),
  Type.Literal("test"),
  Type.Literal("production"),
]);
const LogLevelSchema = Type.Union([
  Type.Literal("fatal"),
  Type.Literal("error"),
  Type.Literal("warn"),
  Type.Literal("info"),
  Type.Literal("debug"),
  Type.Literal("trace"),
  Type.Literal("silent"),
]);

export function readConfig(source: NodeJS.ProcessEnv) {
  const environment = source.NODE_ENV ?? "development";
  if (!Check(EnvironmentSchema, environment)) {
    throw new Error("Invalid configuration: NODE_ENV");
  }

  const portText = source.PORT ?? "3001";
  const port = Number(portText);
  if (
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("Invalid configuration: PORT");
  }

  const host = source.HOST ?? "127.0.0.1";
  if (host.trim().length === 0 || /\s/.test(host)) {
    throw new Error("Invalid configuration: HOST");
  }

  const logLevel =
    source.LOG_LEVEL ?? (environment === "test" ? "silent" : "info");
  if (!Check(LogLevelSchema, logLevel)) {
    throw new Error("Invalid configuration: LOG_LEVEL");
  }

  const databaseUrl = source.DATABASE_URL;
  if (databaseUrl !== undefined) {
    let valid = false;
    try {
      const parsed = new URL(databaseUrl);
      valid =
        ["postgres:", "postgresql:"].includes(parsed.protocol) &&
        parsed.hostname.length > 0 &&
        parsed.pathname.length > 1;
    } catch {
      throw new Error("Invalid configuration: DATABASE_URL");
    }
    if (!valid) throw new Error("Invalid configuration: DATABASE_URL");
  }
  if (environment === "production" && databaseUrl === undefined) {
    throw new Error("Missing configuration: DATABASE_URL");
  }

  return {
    NODE_ENV: environment,
    HOST: host,
    PORT: port,
    LOG_LEVEL: logLevel,
    DATABASE_URL: databaseUrl,
  } as const;
}

export const env = readConfig(process.env);
