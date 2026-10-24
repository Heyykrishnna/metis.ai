import { describe, expect, it } from "vitest";
import { parseBearerToken } from "../src/security/auth.js";

describe("auth helpers", () => {
  it("extracts bearer token successfully", () => {
    expect(parseBearerToken("Bearer test-token-123")).toBe("test-token-123");
  });

  it("returns null for missing or invalid header", () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("Basic abcdef")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
  });
});
