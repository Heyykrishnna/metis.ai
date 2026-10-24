import type { NextRequest } from "next/server";

async function proxy(request: NextRequest, params: { path: string[] }) {
  const backendBase = process.env.METIS_API_URL ?? "http://127.0.0.1:3001";
  if (
    params.path.some(
      (part) =>
        part === "." ||
        part === ".." ||
        part.includes("/") ||
        part.includes("\\"),
    )
  )
    return Response.json({ message: "Invalid service path." }, { status: 400 });
  const url = new URL(
    `/${params.path.map(encodeURIComponent).join("/")}`,
    backendBase,
  );
  url.search = request.nextUrl.search;
  const authorization =
    request.headers.get("Authorization") ??
    (process.env.METIS_BACKEND_TOKEN
      ? `Bearer ${process.env.METIS_BACKEND_TOKEN}`
      : null);
  if (!authorization)
    return Response.json(
      {
        message:
          "The local workspace credential is not configured. Run the local setup command.",
      },
      { status: 401 },
    );
  const headers = new Headers({ Authorization: authorization });
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Accept", request.headers.get("Accept") ?? "application/json");
  const length = request.headers.get("Content-Length");
  if (length && Number(length) > 8 * 1024 * 1024)
    return Response.json(
      { message: "The upload exceeds the supported size." },
      { status: 413 },
    );
  try {
    const payload =
      request.method !== "GET" && request.method !== "HEAD"
        ? await request.arrayBuffer()
        : null;
    if (payload && payload.byteLength > 8 * 1024 * 1024)
      return Response.json(
        { message: "The upload exceeds the supported size." },
        { status: 413 },
      );
    const body = payload?.byteLength ? payload : null;
    if (!body) headers.delete("Content-Type");
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const header of ["Content-Type", "Content-Disposition"]) {
      const value = upstream.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }
    return new Response(upstream.status === 204 ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      {
        code: "dependency_unavailable",
        message:
          "The backend is unavailable or the request timed out. Check the local services and retry.",
      },
      { status: 503 },
    );
  }
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, await props.params);
}
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, await props.params);
}
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, await props.params);
}
