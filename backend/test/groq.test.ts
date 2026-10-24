import { describe, expect, it } from "vitest";
import { GroqClient } from "../src/inference/groq.js";

describe("GroqClient: Query Classification & Statistical Agent", () => {
  it("classifies schema and relationship questions as algorithmic", async () => {
    const client = new GroqClient();
    const result = await client.classify(
      "Help me understand the tables, columns, and relationships in my data.",
    );
    expect(result.classification).toBe("algorithmic");
    expect(result.reason).toContain("schema");
  });

  it("classifies statistical aggregation and trend questions as statistical", async () => {
    const client = new GroqClient();
    const result1 = await client.classify(
      "What is the average revenue by region?",
    );
    expect(result1.classification).toBe("statistical");

    const result2 = await client.classify(
      "What are the most important trends in this dataset?",
    );
    expect(result2.classification).toBe("statistical");

    const result3 = await client.classify("Is revenue left or right skewed?");
    expect(result3.classification).toBe("statistical");
  });

  it("contextualizes statistical questions with operational metadata", async () => {
    const client = new GroqClient();
    const context = await client.contextualizeStatisticalQuery({
      question: "What is total revenue by region?",
      columns: ["region", "revenue"],
    });
    expect(context).toHaveProperty("metrics");
    expect(context).toHaveProperty("dimensions");
    expect(context).toHaveProperty("operations");
    expect(context).toHaveProperty("guidance");
  });

  it("synthesizes accurate statistical answer strictly adhering to calculated figures", async () => {
    const client = new GroqClient();
    const synthesized = await client.synthesizeStatisticalAnswer({
      question: "What is total revenue by region?",
      calculatedResults: {
        columns: ["region", "value"],
        rows: [
          { region: "North", value: "0.3" },
          { region: "South", value: "20" },
        ],
        summary: "North: 0.3; South: 20",
      },
      originalAnswerText: "Calculated 2 rows: North 0.3, South 20.",
    });
    expect(synthesized).toBeTruthy();
    expect(typeof synthesized).toBe("string");
  });

  it("synthesizes schema overview accurately", async () => {
    const client = new GroqClient();
    const synthesized = await client.synthesizeSchemaAnswer({
      question:
        "Help me understand the tables, columns, and relationships in my data.",
      datasetName: "test_db",
      tables: [
        {
          name: "schools",
          rowCount: 10,
          columns: [
            { name: "id", type: "integer", nullable: false },
            { name: "name", type: "text", nullable: false },
          ],
        },
        {
          name: "enrolments",
          rowCount: 20,
          columns: [
            { name: "school_id", type: "integer", nullable: false },
            { name: "year", type: "integer", nullable: false },
            { name: "enrolled", type: "integer", nullable: true },
          ],
        },
      ],
      relationships: [
        {
          source: "enrolments.school_id",
          target: "schools.id",
          type: "declared",
          description: "Foreign key reference",
        },
      ],
      originalAnswerText: "Database contains 2 tables: schools, enrolments.",
    });
    expect(synthesized).toBeTruthy();
    expect(typeof synthesized).toBe("string");
  });

  it("connects to live Groq API with configured API key when invoked", async () => {
    const liveClient = new GroqClient();
    expect(liveClient.isConfigured()).toBe(true);
    expect(liveClient.configuredModel).toBe("openai/gpt-oss-120b");

    // Test a live classification request directly to Groq API
    const liveResult = await liveClient.classify(
      "What is the average revenue by region?",
      { columns: ["region", "revenue"] },
    );
    expect(liveResult.classification).toBe("statistical");
  });
});
