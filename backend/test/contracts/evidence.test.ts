import { Check } from "typebox/value";
import { expect, it } from "vitest";
import { EvidenceBundleSchema } from "../../src/contracts/analysis.js";

const earlyEvidence = {
  runId: "00000000-0000-4000-8000-000000000001",
  question: "Compare enrolment last year",
  assumptions: [],
  exclusions: [],
  modelVersion: "configured-not-called",
  intent: null,
  snapshotId: null,
  plan: null,
  candidate: null,
  execution: null,
  verification: null,
};

it.each(["cancelled", "needs_clarification", "blocked_by_policy"])(
  "represents %s before execution without fabricated artifacts",
  (status) => {
    expect(
      Check(EvidenceBundleSchema, { ...earlyEvidence, finalStatus: status }),
    ).toBe(true);
  },
);

it("requires completed evidence for an answered run", () => {
  expect(
    Check(EvidenceBundleSchema, { ...earlyEvidence, finalStatus: "answered" }),
  ).toBe(false);
});

it("retains explicit interpretation assumptions", () => {
  expect(
    Check(EvidenceBundleSchema, {
      ...earlyEvidence,
      finalStatus: "needs_clarification",
      assumptions: ["The term last year remains unresolved"],
    }),
  ).toBe(true);
});
