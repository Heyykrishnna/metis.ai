import { getHealth } from "@/lib/api-client";

export async function GET() {
  const base = process.env.METIS_API_URL ?? "http://127.0.0.1:3001";
  try {
    await getHealth(base);
    let capabilities: {
      storageAvailable: boolean;
      analysisAvailable: boolean;
      inferenceAvailable: boolean;
    } = {
      storageAvailable: false,
      analysisAvailable: false,
      inferenceAvailable: false,
    };
    if (process.env.METIS_BACKEND_TOKEN) {
      try {
        const response = await fetch(new URL("/v1/capabilities", base), {
          headers: {
            Authorization: `Bearer ${process.env.METIS_BACKEND_TOKEN}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        const body: unknown = await response.json();
        if (
          response.ok &&
          typeof body === "object" &&
          body !== null &&
          "storageAvailable" in body &&
          typeof body.storageAvailable === "boolean" &&
          "analysisAvailable" in body &&
          typeof body.analysisAvailable === "boolean" &&
          "inferenceAvailable" in body &&
          typeof body.inferenceAvailable === "boolean"
        )
          capabilities = {
            storageAvailable: body.storageAvailable,
            analysisAvailable: body.analysisAvailable,
            inferenceAvailable: body.inferenceAvailable,
          };
      } catch {
        capabilities = {
          storageAvailable: false,
          analysisAvailable: false,
          inferenceAvailable: false,
        };
      }
    }
    return Response.json({ status: "online", ...capabilities });
  } catch {
    return Response.json(
      {
        status: "offline",
        storageAvailable: false,
        analysisAvailable: false,
        inferenceAvailable: false,
      },
      { status: 503 },
    );
  }
}
