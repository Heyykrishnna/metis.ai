import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";

describe("runtime configuration", () => {
  it("rejects partially numeric ports without exposing input", () => {
    expect(() => readConfig({ PORT: "3001secret" })).toThrow(
      "Invalid configuration: PORT",
    );
  });
});

it.each([
  { NODE_ENV: "staging" },
  { LOG_LEVEL: "verbose" },
  { PORT: "0" },
  { PORT: "65536" },
  { PORT: "3.5" },
  { HOST: " " },
  { DATABASE_URL: "not-a-url-private-password" },
  { DATABASE_URL: "https://private-host/db" },
])("rejects invalid environment input safely: %j", (input) => {
  expect(() => readConfig(input)).toThrow(/^Invalid configuration: [A-Z_]+$/);
});

it("requires metadata configuration in production", () => {
  expect(() => readConfig({ NODE_ENV: "production" })).toThrow(
    "Missing configuration: DATABASE_URL",
  );
});

it("starts development safely without optional dependencies", () => {
  expect(readConfig({})).toMatchObject({
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: 3001,
  });
});
