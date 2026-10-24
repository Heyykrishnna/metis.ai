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

export class OllamaInferenceClient implements InferenceClient {
  readonly modelVersion: string;
  private readonly baseUrl: string;
  private readonly temperature: number;
  private readonly fetcher: typeof fetch;

  constructor(options?: InferenceClientOptions) {
    this.baseUrl =
      options?.baseUrl ??
      process.env.INFERENCE_BASE_URL ??
      "http://127.0.0.1:11434";
    this.modelVersion = options?.model ?? "qwen2.5-coder:7b-instruct-q4_K_M";
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
        format: "json",
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

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
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
