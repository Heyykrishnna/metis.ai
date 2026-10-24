import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/status/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("reports actual backend health without claiming analysis availability", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
  );
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "online",
    storageAvailable: false,
    analysisAvailable: false,
    inferenceAvailable: false,
  });
});

it("returns a safe offline response without forwarding internal errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("private-host:secret")),
  );
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe(
    '{"status":"offline","storageAvailable":false,"analysisAvailable":false,"inferenceAvailable":false}',
  );
});

it("uses the server-only configured backend URL", async () => {
  vi.stubEnv("METIS_API_URL", "http://127.0.0.1:4321");
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "ok" }));
  vi.stubGlobal("fetch", fetchMock);
  await GET();
  expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
    "http://127.0.0.1:4321/health",
  );
});

it("uses authenticated capabilities for actual service readiness", async () => {
  vi.stubEnv("METIS_BACKEND_TOKEN", "test-server-secret");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ status: "ok" }))
    .mockResolvedValueOnce(
      Response.json({
        storageAvailable: true,
        analysisAvailable: true,
        inferenceAvailable: true,
        model: "local",
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  expect(await (await GET()).json()).toEqual({
    status: "online",
    storageAvailable: true,
    analysisAvailable: true,
    inferenceAvailable: true,
  });
  expect(fetchMock.mock.calls[1]?.[1].headers).toEqual({
    Authorization: "Bearer test-server-secret",
  });
});
