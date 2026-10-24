import { randomUUID } from "node:crypto";
import { Check } from "typebox/value";
import { expect, it } from "vitest";
import { groundQuestion } from "../src/analysis/planning.js";
import { resolveConversationalFollowUp } from "../src/analysis/conversations.js";
import type { InferenceClient } from "../src/inference/client.js";
import type { DiscoveredSchema } from "../src/analysis/schema.js";

const question = "What is total revenue?";
const previous = resolveConversationalFollowUp({
  question,
  runId: randomUUID(),
  parentRunId: null,
  currentWorkspaceId: randomUUID(),
  connectionId: randomUUID(),
  allowedSchemas: ["sales"],
});
const discovered: DiscoveredSchema = {
  tables: [
    {
      schema: "sales",
      name: "orders",
      columns: [{ name: "revenue", type: "numeric", nullable: false }],
      primaryKey: [],
      foreignKeys: [],
      rowCount: 4,
    },
  ],
};
function model(sources: string[], prompts: string[] = []): InferenceClient {
  return {
    modelVersion: "test",
    async generateStructured(prompt, schema) {
      prompts.push(prompt);
      const output = {
        action: "query",
        sql: "SELECT sum(revenue) AS total FROM sales.orders",
        sources,
        grain: ["aggregate"],
        reason: "",
      };
      if (!Check(schema, output)) throw new Error("Invalid test plan");
      return output;
    },
  };
}

it("grounds a fresh SQL plan in the actual schema without treating fixture context as confirmed", async () => {
  const prompts: string[] = [];
  const result = await groundQuestion(
    model(["sales.orders"], prompts),
    question,
    discovered,
    previous,
    AbortSignal.timeout(1000),
  );
  expect(result.status).toBe("execute");
  expect(result.plan.sources).toEqual(["sales.orders"]);
  expect(result.activeContext.sources).toEqual(["sales.orders"]);
  expect(prompts[0]).toContain("Prior confirmed context: null");
  expect(prompts[0]).not.toContain("analytics_clean");
});

it("refuses an invented source or an empty authorized schema", async () => {
  expect(
    (
      await groundQuestion(
        model(["private.payroll"]),
        question,
        discovered,
        previous,
        AbortSignal.timeout(1000),
      )
    ).status,
  ).toBe("abstained");
  expect(
    (
      await groundQuestion(
        model(["sales.orders"]),
        question,
        { tables: [] },
        previous,
        AbortSignal.timeout(1000),
      )
    ).status,
  ).toBe("abstained");
});
