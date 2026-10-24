import { expect, it } from "vitest";
import { metadataPoolConfig } from "../src/db/config.js";

it("uses verified TLS and channel binding for Neon without query-option overrides", () => {
  const settings = metadataPoolConfig("postgresql://user:synthetic@ep-example-pooler.us-east-2.aws.neon.tech/example?sslmode=require&channel_binding=require");
  expect(settings.ssl).toEqual({ rejectUnauthorized: true });
  expect(settings.enableChannelBinding).toBe(true);
  expect(settings.connectionString).not.toContain("sslmode");
  expect(settings.connectionString).not.toContain("channel_binding");
  expect(settings.max).toBe(5);
});

it("rejects a Neon TLS downgrade", () => {
  expect(() => metadataPoolConfig("postgresql://user:synthetic@ep-example.us-east-2.aws.neon.tech/example?sslmode=disable")).toThrow("Neon requires verified TLS");
});
