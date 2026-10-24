import { describe, expect, it } from "vitest";
import { canTransition } from "../../src/contracts/lifecycle.js";

describe("analysis lifecycle", () => {
  it("prevents an answer before execution and verification", () => {
    expect(canTransition("queued", "answered")).toBe(false);
    expect(canTransition("verifying", "answered")).toBe(true);
    expect(canTransition("cancelled", "answered")).toBe(false);
  });
});

it.each([
  "answered",
  "needs_clarification",
  "abstained",
  "blocked_by_policy",
  "execution_failed",
  "timed_out",
  "cancelled",
] as const)("keeps %s terminal despite late events", (status) => {
  expect(canTransition(status, "executing")).toBe(false);
  expect(canTransition(status, "cancelled")).toBe(false);
});
