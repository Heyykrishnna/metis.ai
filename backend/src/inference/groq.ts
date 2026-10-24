import "dotenv/config";

export type QuestionClassification = "statistical" | "algorithmic";

export interface ClassificationResult {
  classification: QuestionClassification;
  reason: string;
}

export interface StatisticalFilter {
  column: string;
  operator: string;
  value: string;
}

export interface StatisticalContext {
  metrics: string[];
  dimensions: string[];
  operations: string[];
  filters: StatisticalFilter[];
  guidance: string;
}

export interface GroqClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

const STATISTICAL_PATTERN =
  /\b(?:sum|total|totals|average|avg|mean|minimum|min|maximum|max|skew|skewed|skewness|count|counts|distribution|stddev|standard\s+deviation|variance|median|mode|percentile|quantile|correlation|regression|trend|trends|decline|declining|increase|increasing|growth|rate|proportion|ratio|percentage|outlier|outliers|anomaly|anomalies|pattern|patterns|compare|comparison)\b/i;

const SCHEMA_PATTERN =
  /\b(?:tables?,?\s+columns?,?\s+and\s+relationships?|tables?\s+and\s+columns?|columns?\s+and\s+tables?|understand\s+(?:the\s+)?tables?|help\s+me\s+understand\s+(?:the\s+)?tables?|database\s+schema|schema\s+overview|table\s+structure|data\s+structure|column\s+types|field\s+types|relationships?\s+in\s+my\s+data)\b/i;

export class GroqClient {
  private readonly explicitApiKey?: string;
  private readonly explicitModel?: string;
  private readonly explicitBaseUrl?: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options?: GroqClientOptions) {
    this.explicitApiKey = options?.apiKey;
    this.explicitModel = options?.model;
    this.explicitBaseUrl = options?.baseUrl;
    this.timeoutMs = options?.timeoutMs ?? 15000;
    this.fetcher = options?.fetcher ?? fetch;
  }

  get apiKey(): string {
    return this.explicitApiKey ?? process.env.GROQ_API_KEY ?? "";
  }

  get configuredModel(): string {
    return (
      this.explicitModel ?? process.env.GROQ_MODEL ?? "openai/gpt-oss-120b"
    );
  }

  get model(): string {
    return this.configuredModel;
  }

  get baseUrl(): string {
    return (
      this.explicitBaseUrl ??
      process.env.GROQ_BASE_URL ??
      "https://api.groq.com/openai/v1"
    );
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  isLive(): boolean {
    if (process.env.NODE_ENV === "test" && !process.env.GROQ_LIVE_TEST) {
      return false;
    }
    return this.isConfigured();
  }

  private async callChatCompletion(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    jsonMode = false,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Groq API returned HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const raw = body.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        throw new Error("Groq API returned empty response content");
      }

      return raw
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .replace(/[\u00A0\u202F]/g, " ");
    } finally {
      clearTimeout(timer);
    }
  }

  async classify(
    question: string,
    context?: { columns?: string[]; tables?: string[] },
  ): Promise<ClassificationResult> {
    if (SCHEMA_PATTERN.test(question)) {
      return {
        classification: "algorithmic",
        reason:
          "Query focuses on schema exploration, tables, columns, and structural relationships.",
      };
    }

    if (!this.isLive()) {
      return this.fallbackClassify(question);
    }

    try {
      const contextSummary = [
        context?.tables?.length
          ? `Available tables: ${context.tables.join(", ")}`
          : "",
        context?.columns?.length
          ? `Available columns: ${context.columns.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("; ");

      const raw = await this.callChatCompletion(
        [
          {
            role: "system",
            content:
              "You are a strict query classifier for Metis. Classify whether the user query is 'statistical' or 'algorithmic'.\n" +
              "- 'statistical': Involves mathematical calculations, aggregates (sum, avg, min, max, count with metrics), skewness, distributions, trends, comparisons, growth/decline rates, anomalies, or quantitative metrics.\n" +
              "- 'algorithmic': Involves data structure, schema exploration (tables, columns, relationships), literal row inspection, simple record retrieval, or metadata lookup without statistical computation.\n" +
              'Output JSON only: {"classification": "statistical" | "algorithmic", "reason": "brief explanation"}',
          },
          {
            role: "user",
            content: `Query: ${question}\n${contextSummary ? `Context: ${contextSummary}` : ""}`,
          },
        ],
        true,
      );

      const parsed = JSON.parse(raw) as {
        classification?: string;
        reason?: string;
      };

      if (
        parsed.classification === "statistical" ||
        parsed.classification === "algorithmic"
      ) {
        return {
          classification: parsed.classification,
          reason: parsed.reason ?? "Classified by Groq agent",
        };
      }

      return this.fallbackClassify(question);
    } catch {
      return this.fallbackClassify(question);
    }
  }

  private fallbackClassify(question: string): ClassificationResult {
    if (SCHEMA_PATTERN.test(question)) {
      return {
        classification: "algorithmic",
        reason: "Schema exploration and table/column relationship inspection.",
      };
    }

    if (STATISTICAL_PATTERN.test(question)) {
      return {
        classification: "statistical",
        reason:
          "Query requests quantitative aggregation or statistical metrics.",
      };
    }

    return {
      classification: "algorithmic",
      reason: "Standard lookup or algorithmic processing.",
    };
  }

  async contextualizeStatisticalQuery(params: {
    question: string;
    columns?: string[];
    tables?: string[];
    sampleData?: unknown;
  }): Promise<StatisticalContext> {
    const fallback: StatisticalContext = {
      metrics: [],
      dimensions: [],
      operations: [],
      filters: [],
      guidance:
        "Execute standard statistical calculations based on verified data.",
    };

    if (!this.isLive()) {
      return fallback;
    }

    try {
      const prompt =
        `Question: ${params.question}\n` +
        (params.tables?.length
          ? `Tables: ${JSON.stringify(params.tables)}\n`
          : "") +
        (params.columns?.length
          ? `Columns: ${JSON.stringify(params.columns)}\n`
          : "") +
        (params.sampleData
          ? `Sample: ${JSON.stringify(params.sampleData).slice(0, 2000)}\n`
          : "");

      const raw = await this.callChatCompletion(
        [
          {
            role: "system",
            content:
              "You are a statistical reasoning planner for Metis. Analyze the statistical question and provide structured operational context for the calculation algorithm and Qwen model.\n" +
              'Output JSON matching: {"metrics": string[], "dimensions": string[], "operations": string[], "filters": [{"column": string, "operator": string, "value": string}], "guidance": string}',
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        true,
      );

      const parsed = JSON.parse(raw) as Partial<StatisticalContext>;
      return {
        metrics: Array.isArray(parsed.metrics)
          ? parsed.metrics.map(String)
          : [],
        dimensions: Array.isArray(parsed.dimensions)
          ? parsed.dimensions.map(String)
          : [],
        operations: Array.isArray(parsed.operations)
          ? parsed.operations.map(String)
          : [],
        filters: Array.isArray(parsed.filters)
          ? (parsed.filters as StatisticalFilter[])
          : [],
        guidance:
          typeof parsed.guidance === "string" && parsed.guidance.length > 0
            ? parsed.guidance
            : fallback.guidance,
      };
    } catch {
      return fallback;
    }
  }

  async synthesizeStatisticalAnswer(params: {
    question: string;
    statisticalContext?: StatisticalContext;
    calculatedResults: {
      columns: string[];
      rows: Record<string, unknown>[];
      summary?: string;
    };
    originalAnswerText?: string;
  }): Promise<string> {
    const fallback =
      params.originalAnswerText ??
      `Calculated ${params.calculatedResults.rows.length} records.`;

    if (!this.isLive() || params.calculatedResults.rows.length === 0) {
      return fallback;
    }

    try {
      const rowSnippet = params.calculatedResults.rows.slice(0, 25);
      const prompt =
        `User Question: ${params.question}\n` +
        `Calculated Columns: ${JSON.stringify(params.calculatedResults.columns)}\n` +
        `Exact Calculated Rows (${params.calculatedResults.rows.length} total, showing up to 25): ${JSON.stringify(rowSnippet)}\n` +
        (params.calculatedResults.summary
          ? `Computation Summary: ${params.calculatedResults.summary}\n`
          : "") +
        (params.statisticalContext?.guidance
          ? `Analysis Scope: ${params.statisticalContext.guidance}\n`
          : "");

      const synthesized = await this.callChatCompletion([
        {
          role: "system",
          content:
            "You are a senior statistical intelligence communicator for Metis AI. " +
            "A user asked a statistical question, and our verified computational engine calculated the exact numbers from the source data.\n" +
            "Your task: Present a professional, concise, and structured answer explaining the statistical findings.\n" +
            "CRITICAL RULES:\n" +
            "1. Strictly adhere to the supplied calculated numbers. Never invent, alter, or hallucinate metrics, totals, or percentages.\n" +
            "2. Highlight key takeaways, group breakdowns, or distributions clearly.\n" +
            "3. Use Markdown formatting (bullet points, bold highlights, or small tables if appropriate).\n" +
            "4. Keep the explanation lucid, focused, and directly answering the question.",
        },
        {
          role: "user",
          content: prompt,
        },
      ]);

      return synthesized.length > 0 ? synthesized : fallback;
    } catch {
      return fallback;
    }
  }

  async synthesizeSchemaAnswer(params: {
    question: string;
    datasetName: string;
    tables: Array<{
      name: string;
      rowCount?: number;
      columns: Array<{ name: string; type: string; nullable?: boolean }>;
    }>;
    relationships: Array<{
      source: string;
      target: string;
      type: string;
      description?: string;
    }>;
    originalAnswerText?: string;
  }): Promise<string> {
    const fallback =
      params.originalAnswerText ??
      `Dataset ${params.datasetName} contains ${params.tables.length} tables.`;

    if (!this.isLive() || params.tables.length === 0) {
      return fallback;
    }

    try {
      const prompt =
        `User Question: ${params.question}\n` +
        `Dataset: ${params.datasetName}\n` +
        `Tables & Columns: ${JSON.stringify(params.tables)}\n` +
        `Relationships: ${JSON.stringify(params.relationships)}\n`;

      const synthesized = await this.callChatCompletion([
        {
          role: "system",
          content:
            "You are a senior data architect for Metis AI. " +
            "The user asked to understand the tables, columns, and relationships in their data. " +
            "Present a comprehensive, clear, and well-organized architectural breakdown explaining:\n" +
            "1. Tables overview (table names and record counts).\n" +
            "2. Columns & Data Types (key fields, metrics, dimensions).\n" +
            "3. Relationships & Keys (primary identifiers and foreign key / join relationships between tables).\n" +
            "4. How to best query and explore this dataset.\n" +
            "Keep the response structured with clean Markdown sections and bullet points.",
        },
        {
          role: "user",
          content: prompt,
        },
      ]);

      return synthesized.length > 0 ? synthesized : fallback;
    } catch {
      return fallback;
    }
  }
}

export const groqClient = new GroqClient();
