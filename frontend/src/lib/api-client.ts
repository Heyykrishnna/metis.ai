import type { components } from "../generated/api";

export type Health = components["schemas"]["Health"];
export type Connection = components["schemas"]["Connection"];
export type ConnectionInput = components["schemas"]["ConnectionInput"];
export type ConnectionTest = components["schemas"]["ConnectionTest"];
export type Run = components["schemas"]["Run"];
export type Result = components["schemas"]["Result"];
export type EvidenceBundle = components["schemas"]["EvidenceBundle"];
export type TruthLedger = components["schemas"]["TruthLedger"];
export type SchemaConstellation = components["schemas"]["SchemaConstellation"];
export type DirtyRadarReport = components["schemas"]["DirtyRadarReport"];
export type CounterfactualReport =
  components["schemas"]["CounterfactualReport"];
export type QueryCostPassport = components["schemas"]["QueryCostPassport"];
export type Recipe = components["schemas"]["Recipe"];
export type RecipeInput = components["schemas"]["RecipeInput"];
export type RecipeExecuteResponse =
  components["schemas"]["RecipeExecuteResponse"];
export type Feedback = components["schemas"]["Feedback"];
export type EffectivePolicy = components["schemas"]["EffectivePolicy"];
export type PolicySimulateInput = components["schemas"]["PolicySimulateInput"];
export type PolicySimulateResult =
  components["schemas"]["PolicySimulateResult"];
export type ConversationContextResponse =
  components["schemas"]["ConversationContextResponse"];
export type SchemaDriftDiff = components["schemas"]["SchemaDriftDiff"];
export type SchemaMapping = components["schemas"]["SchemaMapping"];
export type SchemaMappingRequest =
  components["schemas"]["SchemaMappingRequest"];
export type ImpactPreviewResponse =
  components["schemas"]["ImpactPreviewResponse"];
export type AuditEvent = components["schemas"]["AuditEvent"];
export type AuditListResponse = components["schemas"]["AuditListResponse"];
export type GovernanceReviewTask =
  components["schemas"]["GovernanceReviewTask"];
export type GovernanceReviewsResponse =
  components["schemas"]["GovernanceReviewsResponse"];
export type GovernanceReadinessResponse =
  components["schemas"]["GovernanceReadinessResponse"];
export type RecipePublishInput = components["schemas"]["RecipePublishInput"];

function resolveUrl(path: string, baseUrl?: string): string {
  if (baseUrl) {
    return new URL(path, baseUrl).toString();
  }
  if (typeof window !== "undefined") {
    return `/api/backend${path.startsWith("/") ? path : `/${path}`}`;
  }
  const defaultServerBase =
    process.env.METIS_API_URL ?? "http://127.0.0.1:3001";
  return new URL(path, defaultServerBase).toString();
}

async function fetchJson<T>(
  path: string,
  options?: RequestInit,
  baseUrl?: string,
): Promise<T> {
  const url = resolveUrl(path, baseUrl);
  const headers = new Headers(options?.headers);
  headers.set("Accept", "application/json");
  if (options?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody && typeof errBody === "object" && "message" in errBody) {
        errorDetail = String(errBody.message);
      }
    } catch {
      void 0;
    }
    throw new Error(errorDetail);
  }

  return (await response.json()) as T;
}

export async function getHealth(
  baseUrl?: string,
  signal?: AbortSignal,
): Promise<Health> {
  let response: Response;
  const target = baseUrl
    ? new URL("/health", baseUrl).toString()
    : resolveUrl("/health");

  try {
    response = await fetch(target, {
      headers: { Accept: "application/json" },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
    });
  } catch {
    if (signal?.aborted) {
      throw new DOMException("Request cancelled", "AbortError");
    }
    throw new Error("API unavailable");
  }

  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Invalid API health response");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("status" in body) ||
    body.status !== "ok"
  ) {
    throw new Error("Invalid API health response");
  }

  return { status: "ok" };
}

export async function getConnections(): Promise<Connection[]> {
  return fetchJson<Connection[]>("/v1/connections");
}

export async function createConnection(
  input: ConnectionInput,
): Promise<Connection> {
  return fetchJson<Connection>("/v1/connections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function testConnection(
  input: ConnectionInput,
): Promise<ConnectionTest> {
  return fetchJson<ConnectionTest>("/v1/connections/test", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeConnection(
  connectionId: string,
): Promise<Connection> {
  return fetchJson<Connection>(`/v1/connections/${connectionId}`, {
    method: "DELETE",
  });
}

export async function getSchemaConstellation(
  connectionId: string,
): Promise<SchemaConstellation> {
  return fetchJson<SchemaConstellation>(
    `/v1/connections/${connectionId}/constellation`,
  );
}

export async function submitAnalysis(payload: {
  connectionId: string;
  question: string;
  parentRunId?: string | null;
  sqlOverride?: string;
}): Promise<Run> {
  return fetchJson<Run>("/v1/analyses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getRun(runId: string): Promise<Run> {
  return fetchJson<Run>(`/v1/runs/${runId}`);
}

export async function getRunResult(runId: string): Promise<Result> {
  return fetchJson<Result>(`/v1/runs/${runId}/result`);
}

export async function getRunEvidence(runId: string): Promise<EvidenceBundle> {
  return fetchJson<EvidenceBundle>(`/v1/runs/${runId}/evidence`);
}

export async function getTruthLedger(runId: string): Promise<TruthLedger> {
  return fetchJson<TruthLedger>(`/v1/runs/${runId}/ledger`);
}

export async function getDirtyRadar(runId: string): Promise<DirtyRadarReport> {
  return fetchJson<DirtyRadarReport>(`/v1/runs/${runId}/dirty-radar`);
}

export async function reviewRadarAnomaly(
  runId: string,
  anomalyId: string,
  reviewState: "accepted" | "rejected",
): Promise<{ anomalyId: string; reviewState: string; updated: boolean }> {
  return fetchJson<{
    anomalyId: string;
    reviewState: string;
    updated: boolean;
  }>(`/v1/runs/${runId}/dirty-radar/reviews/${anomalyId}`, {
    method: "POST",
    body: JSON.stringify({ reviewState }),
  });
}

export async function getCounterfactuals(
  runId: string,
): Promise<CounterfactualReport> {
  return fetchJson<CounterfactualReport>(`/v1/runs/${runId}/counterfactuals`);
}

export async function getQueryCostPassport(
  runId: string,
): Promise<QueryCostPassport> {
  return fetchJson<QueryCostPassport>(`/v1/runs/${runId}/passport`);
}

export async function getRecipes(): Promise<Recipe[]> {
  return fetchJson<Recipe[]>("/v1/recipes");
}

export async function createRecipe(input: RecipeInput): Promise<Recipe> {
  return fetchJson<Recipe>("/v1/recipes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function executeRecipe(
  recipeId: string,
): Promise<RecipeExecuteResponse> {
  return fetchJson<RecipeExecuteResponse>(`/v1/recipes/${recipeId}/execute`, {
    method: "POST",
  });
}

export async function submitFeedback(
  payload: Feedback,
): Promise<{ id: string }> {
  return fetchJson<{ id: string }>("/v1/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getRunContext(
  runId: string,
): Promise<ConversationContextResponse> {
  return fetchJson<ConversationContextResponse>(`/v1/runs/${runId}/context`);
}

export async function getEffectivePolicy(
  role?: string,
): Promise<EffectivePolicy> {
  const query = role ? `?role=${encodeURIComponent(role)}` : "";
  return fetchJson<EffectivePolicy>(`/v1/policies/effective${query}`);
}

export async function simulatePolicy(
  input: PolicySimulateInput,
): Promise<PolicySimulateResult> {
  return fetchJson<PolicySimulateResult>("/v1/policies/simulate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getExportUrl(
  runId: string,
  format: "csv" | "sql" | "reproducibility",
): string {
  return `/api/backend/v1/runs/${runId}/export/${format}`;
}

export async function getConnectionDrift(
  connectionId: string,
): Promise<SchemaDriftDiff> {
  return fetchJson<SchemaDriftDiff>(`/v1/connections/${connectionId}/drift`);
}

export async function getImpactPreview(
  connectionId: string,
): Promise<ImpactPreviewResponse> {
  return fetchJson<ImpactPreviewResponse>(
    `/v1/connections/${connectionId}/impact-preview`,
  );
}

export async function getConnectionMappings(
  connectionId: string,
): Promise<SchemaMapping[]> {
  return fetchJson<SchemaMapping[]>(`/v1/connections/${connectionId}/mappings`);
}

export async function createSchemaMapping(
  connectionId: string,
  input: SchemaMappingRequest,
): Promise<SchemaMapping> {
  return fetchJson<SchemaMapping>(`/v1/connections/${connectionId}/mappings`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function approveSchemaMapping(
  connectionId: string,
  mappingId: string,
): Promise<SchemaMapping> {
  return fetchJson<SchemaMapping>(
    `/v1/connections/${connectionId}/mappings/${mappingId}/approve`,
    {
      method: "POST",
    },
  );
}

export async function reviewRecipe(recipeId: string): Promise<Recipe> {
  return fetchJson<Recipe>(`/v1/recipes/${recipeId}/review`, {
    method: "POST",
  });
}

export async function publishRecipe(
  recipeId: string,
  input?: RecipePublishInput,
): Promise<Recipe> {
  return fetchJson<Recipe>(`/v1/recipes/${recipeId}/publish`, {
    method: "POST",
    body: input ? JSON.stringify(input) : undefined,
  });
}

export async function retireRecipe(recipeId: string): Promise<Recipe> {
  return fetchJson<Recipe>(`/v1/recipes/${recipeId}/retire`, {
    method: "POST",
  });
}

export async function getAuditEvents(query?: {
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditListResponse> {
  const params = new URLSearchParams();
  if (query?.category) params.set("category", query.category);
  if (query?.limit !== undefined) params.set("limit", String(query.limit));
  if (query?.offset !== undefined) params.set("offset", String(query.offset));
  const queryString = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<AuditListResponse>(`/v1/audit/events${queryString}`);
}

export function getAuditExportUrl(format: "json" | "csv" = "json"): string {
  return `/api/backend/v1/audit/export?format=${format}`;
}

export async function getGovernanceReviews(): Promise<GovernanceReviewsResponse> {
  return fetchJson<GovernanceReviewsResponse>("/v1/governance/reviews");
}

export async function getGovernanceReadiness(): Promise<GovernanceReadinessResponse> {
  return fetchJson<GovernanceReadinessResponse>("/v1/governance/readiness");
}
