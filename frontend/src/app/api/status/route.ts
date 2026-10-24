import { getHealth } from "@/lib/api-client";

export async function GET() {
  try {
    await getHealth(process.env.METIS_API_URL ?? "http://127.0.0.1:3001");
    return Response.json({ status: "online", analysisAvailable: false });
  } catch {
    return Response.json(
      { status: "offline", analysisAvailable: false },
      { status: 503 },
    );
  }
}
