import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "../src/app/api/backend/[...path]/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("uses the server credential and preserves original binary downloads", async () => {
  vi.stubEnv("METIS_BACKEND_TOKEN", "server-secret");
  const bytes = new Uint8Array([0, 128, 255, 10]);
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename=data.csv",
      },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const response = await GET(
    new NextRequest("http://localhost/api/backend/v1/files/test/content"),
    { params: Promise.resolve({ path: ["v1", "files", "test", "content"] }) },
  );
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("Content-Disposition")).toContain("data.csv");
  expect(fetchMock.mock.calls[0]?.[1].headers.get("Authorization")).toBe(
    "Bearer server-secret",
  );
  expect(response.headers.get("Authorization")).toBeNull();
});

it("rejects traversal and missing credentials before contacting the backend", async () => {
  vi.stubEnv("METIS_BACKEND_TOKEN", "");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const request = new NextRequest("http://localhost/api/backend/v1/files");
  expect(
    (await GET(request, { params: Promise.resolve({ path: ["..", "files"] }) }))
      .status,
  ).toBe(400);
  expect(
    (await GET(request, { params: Promise.resolve({ path: ["v1", "files"] }) }))
      .status,
  ).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("forwards uploads and masks internal backend failures", async () => {
  vi.stubEnv("METIS_BACKEND_TOKEN", "server-secret");
  const fetchMock = vi
    .fn()
    .mockRejectedValue(new Error("private-host-password"));
  vi.stubGlobal("fetch", fetchMock);
  const body = JSON.stringify({ name: "data.csv", contentBase64: "YQ==" });
  const response = await POST(
    new NextRequest("http://localhost/api/backend/v1/files", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ path: ["v1", "files"] }) },
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private-host-password");
  expect(Buffer.from(fetchMock.mock.calls[0]?.[1].body).toString()).toBe(body);
});

it("does not forward an empty JSON body for file deletion", async () => {
  vi.stubEnv("METIS_BACKEND_TOKEN", "server-secret");
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ deleted: true }));
  vi.stubGlobal("fetch", fetchMock);
  await DELETE(
    new NextRequest("http://localhost/api/backend/v1/files/file-1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ path: ["v1", "files", "file-1"] }) },
  );
  expect(fetchMock.mock.calls[0]?.[1].body).toBeNull();
  expect(fetchMock.mock.calls[0]?.[1].headers.has("Content-Type")).toBe(false);
});
