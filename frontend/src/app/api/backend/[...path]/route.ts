import type { NextRequest } from "next/server";

const DEFAULT_WORKSPACE_AUTH =
  "Bearer analyst-a:00000000-0000-4000-8000-000000000001";

async function proxy(request: NextRequest, params: { path: string[] }) {
  const backendBase = process.env.METIS_API_URL ?? "http://127.0.0.1:3001";
  const subpath = params.path.join("/");
  const url = new URL(`/${subpath}`, backendBase);
  url.search = request.nextUrl.search;

  const headers = new Headers();
  headers.set(
    "Authorization",
    request.headers.get("Authorization") ?? DEFAULT_WORKSPACE_AUTH,
  );
  if (request.headers.get("Content-Type")) {
    headers.set("Content-Type", request.headers.get("Content-Type") as string);
  }
  if (request.headers.get("Accept")) {
    headers.set("Accept", request.headers.get("Accept") as string);
  }

  let body: BodyInit | null = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  try {
    const upstreamResponse = await fetch(url.toString(), {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });

    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("Content-Type");
    if (contentType) {
      responseHeaders.set("Content-Type", contentType);
    }
    const contentDisposition = upstreamResponse.headers.get(
      "Content-Disposition",
    );
    if (contentDisposition) {
      responseHeaders.set("Content-Disposition", contentDisposition);
    }

    const responseBody = await upstreamResponse.arrayBuffer();
    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return Response.json(
      {
        code: "dependency_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Backend analytical service is unreachable",
      },
      { status: 503 },
    );
  }
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
) {
  const params = await props.params;
  return proxy(request, params);
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
) {
  const params = await props.params;
  return proxy(request, params);
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
) {
  const params = await props.params;
  return proxy(request, params);
}
