import { describe, expect, it } from "vitest";
import Type from "typebox";
import {
  type InferenceClient,
  InferenceDependencyError,
  InferenceTimeoutError,
  MalformedModelOutputError,
  NemotronInferenceClient,
  OllamaInferenceClient,
  createInferenceClient,
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

  describe("NemotronInferenceClient", () => {
    it("parses structured JSON from chat completions response", async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "nemotron answer",
                    confidence: 0.99,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );

      const client = new NemotronInferenceClient({
        apiKey: "hf_test_token",
        fetcher: mockFetch as unknown as typeof fetch,
      });

      const result = await client.generateStructured("test prompt", TestSchema);
      expect(result).toEqual({ answer: "nemotron answer", confidence: 0.99 });
      expect(client.modelVersion).toBe(
        "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16",
      );
    });

    it("extracts JSON even when wrapped in markdown code blocks", async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '```json\n{"answer": "fenced answer", "confidence": 0.88}\n```',
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );

      const client = new NemotronInferenceClient({
        apiKey: "hf_test_token",
        fetcher: mockFetch as unknown as typeof fetch,
      });

      const result = await client.generateStructured("test prompt", TestSchema);
      expect(result).toEqual({ answer: "fenced answer", confidence: 0.88 });
    });

    it("rejects non-JSON output with MalformedModelOutputError", async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "I cannot produce JSON for this request.",
                },
              },
            ],
          }),
          { status: 200 },
        );

      const client = new NemotronInferenceClient({
        apiKey: "hf_test_token",
        fetcher: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.generateStructured("test prompt", TestSchema),
      ).rejects.toBeInstanceOf(MalformedModelOutputError);
    });

    it("handles service errors with InferenceDependencyError", async () => {
      const mockFetch = async () =>
        new Response("Service Unavailable", { status: 503 });

      const client = new NemotronInferenceClient({
        apiKey: "hf_test_token",
        fetcher: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.generateStructured("test prompt", TestSchema),
      ).rejects.toBeInstanceOf(InferenceDependencyError);
    });
  });

  describe("createInferenceClient", () => {
    it("returns NemotronInferenceClient when HF_TOKEN is present", () => {
      const original = process.env.HF_TOKEN;
      process.env.HF_TOKEN = "hf_dummy_token";
      try {
        const client = createInferenceClient();
        expect(client).toBeInstanceOf(NemotronInferenceClient);
      } finally {
        if (original === undefined) delete process.env.HF_TOKEN;
        else process.env.HF_TOKEN = original;
      }
    });

    it("returns OllamaInferenceClient when no cloud credentials are provided", () => {
      const originalHf = process.env.HF_TOKEN;
      const originalNv = process.env.NVIDIA_API_KEY;
      const originalProv = process.env.INFERENCE_PROVIDER;
      delete process.env.HF_TOKEN;
      delete process.env.NVIDIA_API_KEY;
      delete process.env.INFERENCE_PROVIDER;
      try {
        const client = createInferenceClient();
        expect(client).toBeInstanceOf(OllamaInferenceClient);
      } finally {
        if (originalHf !== undefined) process.env.HF_TOKEN = originalHf;
        if (originalNv !== undefined) process.env.NVIDIA_API_KEY = originalNv;
        if (originalProv !== undefined)
          process.env.INFERENCE_PROVIDER = originalProv;
      }
    });
  });
});
