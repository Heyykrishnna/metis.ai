import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { Check } from "typebox/value";
import { FileAnalysisSchema, type StoredFile } from "../src/contracts/files.js";
import { compressFile, restoreFile } from "../src/files/compression.js";
import { parseFile } from "../src/files/parser.js";
import { answerFile } from "../src/files/analysis.js";
import type { InferenceClient } from "../src/inference/client.js";

function planner(output: unknown): InferenceClient {
  return {
    modelVersion: "test-planner",
    async generateStructured(_prompt, schema) {
      if (!Check(schema, output)) throw new Error("Invalid test plan");
      return output;
    },
  };
}
const source = Buffer.from(
  "region,revenue\nNorth,0.1\nNorth,0.2\nSouth,20\nSouth,\n",
);
function file(): StoredFile {
  return {
    id: randomUUID(),
    name: "revenue.csv",
    kind: "CSV",
    size: source.length,
    compressedSize: 30,
    sha256: "a".repeat(64),
    compression: "br",
    rowCount: 4,
    emptyCells: 1,
    columns: ["region", "revenue"],
    createdAt: new Date().toISOString(),
  };
}

it("stores and restores exact file bytes with Brotli and integrity verification", async () => {
  const original = Buffer.from("name,value\r\n" + "North,100\r\n".repeat(300));
  const packed = await compressFile(original);
  expect(packed.compressedSize).toBeLessThan(original.length);
  expect(
    await restoreFile(packed.compressed, packed.originalSize, packed.sha256),
  ).toEqual(original);
  await expect(
    restoreFile(packed.compressed, packed.originalSize, "0".repeat(64)),
  ).rejects.toThrow("integrity");
  await expect(
    restoreFile(packed.compressed, 10, packed.sha256),
  ).rejects.toThrow();
});

it("parses quoted CSV, rejects malformed records, and handles inherited JSON keys safely", () => {
  expect(
    parseFile("data.csv", Buffer.from('name,note\n"Lee, Jo","two\nlines"'))
      .rows,
  ).toEqual([["Lee, Jo", "two\nlines"]]);
  expect(() => parseFile("bad.csv", Buffer.from("a,b\n1,2,3"))).toThrow(
    "Invalid CSV",
  );
  expect(
    parseFile("data.json", Buffer.from('[{"constructor":"a"},{}]')).rows,
  ).toEqual([["a"], [""]]);
});

it("answers a data overview from full source records without a model dependency", async () => {
  const result = await answerFile(
    file(),
    parseFile("revenue.csv", source),
    "explain this data",
    randomUUID(),
    planner(null),
  );
  expect(Check(FileAnalysisSchema, result)).toBe(true);
  expect(result.result.answer.status).toBe("answered");
  expect(result.result.rows).toContainEqual({
    field: "revenue",
    nonempty_rows: 3,
    empty_rows: 1,
    numeric_rows: 3,
  });
  expect(result.method).toBe("deterministic");
});

it("uses a validated plan and exact decimals instead of model-generated totals", async () => {
  const result = await answerFile(
    file(),
    parseFile("revenue.csv", source),
    "What is total revenue by region?",
    randomUUID(),
    planner({
      operation: "sum",
      column: "revenue",
      groupBy: "region",
      filters: [],
      clarification: "",
    }),
  );
  expect(result.result.rows).toEqual([
    { region: "North", value: "0.3", included_rows: 2, excluded_empty_rows: 0 },
    { region: "South", value: "20", included_rows: 1, excluded_empty_rows: 1 },
  ]);
  expect(result.result.answer.status).toBe("answered");
});

it("does not silently turn nonnumeric data or unknown columns into answers", async () => {
  const data = parseFile("bad.csv", Buffer.from("region,revenue\nNorth,N/A\n"));
  const result = await answerFile(
    file(),
    data,
    "Calculate revenue",
    randomUUID(),
    planner({
      operation: "sum",
      column: "revenue",
      groupBy: null,
      filters: [],
      clarification: "",
    }),
  );
  expect(result.result.answer.status).toBe("needs_clarification");
  const unknown = await answerFile(
    file(),
    data,
    "Calculate profit",
    randomUUID(),
    planner({
      operation: "sum",
      column: "profit",
      groupBy: null,
      filters: [],
      clarification: "",
    }),
  );
  expect(unknown.result.answer.status).toBe("needs_clarification");
});

it("handles an inference outage and refuses fabricated text quotations", async () => {
  const unavailable = await answerFile(
    file(),
    parseFile("revenue.csv", source),
    "calculate total revenue",
    randomUUID(),
    planner(null),
  );
  expect(unavailable.result.answer.status).toBe("execution_failed");
  const text = await answerFile(
    { ...file(), name: "notes.txt", kind: "Text" },
    parseFile("notes.txt", Buffer.from("The project starts in June.")),
    "When does it start?",
    randomUUID(),
    planner({ quotes: ["The project starts in July."] }),
  );
  expect(text.result.answer.status).toBe("abstained");
});

it("preserves grouping values when a source column has a reserved result name", async () => {
  const result = await answerFile(
    file(),
    parseFile("reserved.csv", Buffer.from("value,revenue\nNorth,10\nSouth,20")),
    "Sum revenue by value",
    randomUUID(),
    planner({
      operation: "sum",
      column: "revenue",
      groupBy: "value",
      filters: [],
      clarification: "",
    }),
  );
  expect(result.result.columns).toEqual([
    "group: value",
    "value",
    "included_rows",
    "excluded_empty_rows",
  ]);
  expect(result.result.rows).toContainEqual({
    "group: value": "North",
    value: "10",
    included_rows: 1,
    excluded_empty_rows: 0,
  });
});

it("abstains when no passage answers a text question", async () => {
  const result = await answerFile(
    { ...file(), name: "notes.txt", kind: "Text" },
    parseFile("notes.txt", Buffer.from("The project starts in June.")),
    "What is the budget?",
    randomUUID(),
    planner({ quotes: [] }),
  );
  expect(result.result.answer.status).toBe("abstained");
});

it("preserves JSON numeric literals before decimal computation", () => {
  expect(
    parseFile(
      "precise.json",
      Buffer.from('[{"amount":9007199254740993,"rate":0.1234567890123456789}]'),
    ).rows,
  ).toEqual([["9007199254740993", "0.1234567890123456789"]]);
});
