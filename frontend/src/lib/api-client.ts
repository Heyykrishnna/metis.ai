import type { components } from "../generated/api";

type Health = components["schemas"]["Health"];

export async function getHealth(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<Health> {
  let response: Response;
  try {
    response = await fetch(new URL("/health", baseUrl), {
      headers: { Accept: "application/json" },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
    });
  } catch {
    if (signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    throw new Error("API unavailable");
  }
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
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
    body.status !== "ok" ||
    Object.keys(body).length !== 1
  ) {
    throw new Error("Invalid API health response");
  }
  return { status: body.status };
}
