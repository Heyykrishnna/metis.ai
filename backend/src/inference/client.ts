import { type Static, type TSchema } from "typebox";
import { Check } from "typebox/value";
import { foundationPolicy } from "../policy.js";

export class InferenceDependencyError extends Error {
  readonly code = "dependency_unavailable" as const;
  constructor(message: string) {
    super(message);
    this.name = "InferenceDependencyError";
  }
}

export class MalformedModelOutputError extends Error {
  readonly code = "invalid_model_output" as const;
  constructor(message: string) {
    super(message);
    this.name = "MalformedModelOutputError";
  }
}

export class InferenceTimeoutError extends Error {
  readonly code = "timed_out" as const;
  constructor(message: string) {
    super(message);
    this.name = "InferenceTimeoutError";
  }
}

export class InferenceCancelledError extends Error {
  readonly code = "cancelled" as const;
  constructor(message: string) {
    super(message);
    this.name = "InferenceCancelledError";
  }
}

export interface InferenceClientOptions {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  fetcher?: typeof fetch;
}

export interface GenerationOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface InferenceClient {
  readonly modelVersion: string;
  generateStructured<T extends TSchema>(
    prompt: string,
    schema: T,
    options?: GenerationOptions,
  ): Promise<Static<T>>;
}

export function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const codeBlockMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (codeBlockMatch && codeBlockMatch[1] !== undefined) {
    return codeBlockMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export class OllamaInferenceClient implements InferenceClient {
  readonly modelVersion: string;
  private readonly baseUrl: string;
  private readonly temperature: number;
  private readonly fetcher: typeof fetch;

  constructor(options?: InferenceClientOptions) {
    this.baseUrl = (
      options?.baseUrl ??
      process.env.INFERENCE_BASE_URL ??
      "http://127.0.0.1:11434"
    ).replace(/\/+$/, "");
    this.modelVersion =
      options?.model ??
      process.env.INFERENCE_MODEL ??
      "qwen2.5-coder:7b-instruct-q4_K_M";
    this.temperature = options?.temperature ?? 0;
    this.fetcher = options?.fetcher ?? fetch;
  }

  async generateStructured<T extends TSchema>(
    prompt: string,
    schema: T,
    options?: GenerationOptions,
  ): Promise<Static<T>> {
    const timeoutMs =
      options?.timeoutMs ?? foundationPolicy.limits.modelTimeoutMs;
    const controller = new AbortController();

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => {
      controller.abort();
    };

    if (options?.signal !== undefined) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        throw new InferenceCancelledError(
          "Inference cancelled before execution",
        );
      }
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const url = `${this.baseUrl}/api/generate`;
      const body = {
        model: this.modelVersion,
        prompt,
        stream: false,
        format: schema,
        options: {
          temperature: this.temperature,
          num_ctx: 8192,
          num_predict: 1024,
        },
      };

      const response = await this.fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new InferenceDependencyError(
          `Inference service returned status ${response.status}`,
        );
      }

      const responseJson = (await response.json()) as { response?: unknown };
      const rawText =
        typeof responseJson.response === "string"
          ? responseJson.response
          : JSON.stringify(responseJson.response);

      const cleanJson = extractJsonText(rawText);
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Malformed JSON output";
        throw new MalformedModelOutputError(
          `Model did not produce valid JSON: ${message}`,
        );
      }

      if (!Check(schema, parsed)) {
        throw new MalformedModelOutputError(
          "Model output does not conform to requested structured schema",
        );
      }

      return parsed as Static<T>;
    } catch (error) {
      if (timedOut) {
        throw new InferenceTimeoutError(
          `Inference request timed out after ${timeoutMs}ms`,
        );
      }
      if (options?.signal?.aborted) {
        throw new InferenceCancelledError("Inference request was cancelled");
      }
      if (
        error instanceof InferenceDependencyError ||
        error instanceof MalformedModelOutputError ||
        error instanceof InferenceTimeoutError ||
        error instanceof InferenceCancelledError
      ) {
        throw error;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Inference network request failed";
      throw new InferenceDependencyError(
        `Inference service unavailable: ${message}`,
      );
    } finally {
      clearTimeout(timer);
      if (options?.signal !== undefined) {
        options.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }
}

export interface CloudInferenceClientOptions extends InferenceClientOptions {
  apiKey?: string;
  provider?: "huggingface" | "nvidia";
}

export class NemotronInferenceClient implements InferenceClient {
  readonly modelVersion: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly temperature: number;
  private readonly fetcher: typeof fetch;

  constructor(options?: CloudInferenceClientOptions) {
    const isNvidiaProvider =
      options?.provider === "nvidia" ||
      process.env.INFERENCE_PROVIDER === "nvidia" ||
      Boolean(process.env.NVIDIA_API_KEY && !process.env.HF_TOKEN);

    this.baseUrl = (
      options?.baseUrl ??
      process.env.INFERENCE_BASE_URL ??
      (isNvidiaProvider
        ? "https://integrate.api.nvidia.com/v1"
        : "https://router.huggingface.co/v1")
    ).replace(/\/+$/, "");

    this.modelVersion =
      options?.model ??
      process.env.INFERENCE_MODEL ??
      (isNvidiaProvider
        ? "nvidia/nemotron-3.5-lightning"
        : "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16");

    this.apiKey =
      options?.apiKey ??
      process.env.HF_TOKEN ??
      process.env.HUGGINGFACE_API_KEY ??
      process.env.NVIDIA_API_KEY ??
      process.env.NVAPI_KEY ??
      "";

    this.temperature = options?.temperature ?? 0;
    this.fetcher = options?.fetcher ?? fetch;
  }

  async generateStructured<T extends TSchema>(
    prompt: string,
    schema: T,
    options?: GenerationOptions,
  ): Promise<Static<T>> {
    const timeoutMs =
      options?.timeoutMs ?? foundationPolicy.limits.modelTimeoutMs;
    const controller = new AbortController();

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => {
      controller.abort();
    };

    if (options?.signal !== undefined) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        throw new InferenceCancelledError(
          "Inference cancelled before execution",
        );
      }
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      const body = {
        model: this.modelVersion,
        messages: [
          {
            role: "system",
            content:
              "You are a deterministic data analysis planner. Return strictly valid JSON that conforms to the schema provided. Do not enclose your response in backticks or markdown fences, and do not add any conversational text.",
          },
          {
            role: "user",
            content: `${prompt}\n\nRequired JSON Schema:\n${JSON.stringify(schema)}`,
          },
        ],
        temperature: this.temperature,
        response_format: { type: "json_object" },
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await this.fetcher(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new InferenceDependencyError(
          `Inference service returned status ${response.status}${errorText ? `: ${errorText.slice(0, 300)}` : ""}`,
        );
      }

      const responseJson = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };

      const messageContent = responseJson.choices?.[0]?.message?.content;
      if (typeof messageContent !== "string") {
        throw new MalformedModelOutputError(
          "Model did not produce a text message response",
        );
      }

      const cleanJson = extractJsonText(messageContent);
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Malformed JSON output";
        throw new MalformedModelOutputError(
          `Model did not produce valid JSON: ${message}`,
        );
      }

      if (!Check(schema, parsed)) {
        throw new MalformedModelOutputError(
          "Model output does not conform to requested structured schema",
        );
      }

      return parsed as Static<T>;
    } catch (error) {
      if (timedOut) {
        throw new InferenceTimeoutError(
          `Inference request timed out after ${timeoutMs}ms`,
        );
      }
      if (options?.signal?.aborted) {
        throw new InferenceCancelledError("Inference request was cancelled");
      }
      if (
        error instanceof InferenceDependencyError ||
        error instanceof MalformedModelOutputError ||
        error instanceof InferenceTimeoutError ||
        error instanceof InferenceCancelledError
      ) {
        throw error;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Inference network request failed";
      throw new InferenceDependencyError(
        `Inference service unavailable: ${message}`,
      );
    } finally {
      clearTimeout(timer);
      if (options?.signal !== undefined) {
        options.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }
}

export function createInferenceClient(
  options?: InferenceClientOptions,
): InferenceClient {
  const hasHfToken = Boolean(
    process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY,
  );
  const hasNvidiaKey = Boolean(
    process.env.NVIDIA_API_KEY || process.env.NVAPI_KEY,
  );
  const provider = process.env.INFERENCE_PROVIDER?.toLowerCase();
  const baseUrl = options?.baseUrl ?? process.env.INFERENCE_BASE_URL ?? "";

  const isHf =
    provider === "huggingface" ||
    hasHfToken ||
    baseUrl.includes("huggingface.co");
  const isNvidia =
    provider === "nvidia" ||
    (hasNvidiaKey && !hasHfToken) ||
    baseUrl.includes("nvidia.com");

  if (isHf || isNvidia) {
    return new NemotronInferenceClient({
      ...options,
      provider: isNvidia ? "nvidia" : "huggingface",
    });
  }

  return new OllamaInferenceClient(options);
}
