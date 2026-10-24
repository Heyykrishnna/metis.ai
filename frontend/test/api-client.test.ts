import { afterEach, expect, it, vi } from "vitest";
import { getHealth } from "../src/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

it("rejects a successful HTTP response with an invalid health contract", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ status: "unknown", secret: "not-for-display" }),
      ),
  );
  await expect(getHealth("http://127.0.0.1:3001")).rejects.toThrow(
    "Invalid API health response",
  );
});

it("returns validated health from the implemented API", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
  );
  await expect(getHealth("http://127.0.0.1:3001")).resolves.toEqual({
    status: "ok",
  });
});

it("keeps internal server error text out of client errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("private-database-password", { status: 503 }),
      ),
  );
  await expect(getHealth("http://127.0.0.1:3001")).rejects.toThrow(
    "API request failed (503)",
  );
});

it("provides a safe network failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("private-host:password")),
  );
  await expect(getHealth("http://127.0.0.1:3001")).rejects.toThrow(
    "API unavailable",
  );
});
