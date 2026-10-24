import { describe, expect, it } from "vitest";
import Type from "typebox";
import {
  type InferenceClient,
  InferenceDependencyError,
  InferenceTimeoutError,
  MalformedModelOutputError,
  OllamaInferenceClient,
} from "../src/inference/client.js";

describe("inference client", () => {
  const TestSchema = Type.Object({
    answer: Type.String(),
    confidence: Type.Number(),
  });

  it("parses and validates structured JSON output", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          response: JSON.stringify({ answer: "test answer", confidence: 0.95 }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const client: InferenceClient = new OllamaInferenceClient({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5-coder:7b-instruct-q4_K_M",
      fetcher: mockFetch as unknown as typeof fetch,
    });

    const result = await client.generateStructured("test prompt", TestSchema);
    expect(result).toEqual({ answer: "test answer", confidence: 0.95 });
  });

  it("rejects malformed non-JSON output with MalformedModelOutputError", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          response: "Not a JSON output",
        }),
        { status: 200 },
      );

    const client = new OllamaInferenceClient({
      fetcher: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateStructured("test prompt", TestSchema),
    ).rejects.toBeInstanceOf(MalformedModelOutputError);
  });

  it("rejects JSON that violates the schema with MalformedModelOutputError", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          response: JSON.stringify({ answer: 123, confidence: "high" }),
        }),
        { status: 200 },
      );

    const client = new OllamaInferenceClient({
      fetcher: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateStructured("test prompt", TestSchema),
    ).rejects.toBeInstanceOf(MalformedModelOutputError);
  });

  it("handles inference service outage with InferenceDependencyError", async () => {
    const mockFetch = async () => {
      const err = new Error("connect ECONNREFUSED 127.0.0.1:11434");
      throw err;
    };

    const client = new OllamaInferenceClient({
      fetcher: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateStructured("test prompt", TestSchema),
    ).rejects.toBeInstanceOf(InferenceDependencyError);
  });

  it("handles timeout with InferenceTimeoutError", async () => {
    const mockFetch = async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const abortErr = new Error("aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        }
      });
    };

    const client = new OllamaInferenceClient({
      fetcher: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateStructured("test prompt", TestSchema, { timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(InferenceTimeoutError);
  });
});
