import { describe, expect, it } from "vitest";
import { openApiDocument } from "../../src/contracts/openapi.js";

it("marks future product routes as planned rather than implemented", () => {
  expect(
    openApiDocument.paths["/v1/analyses"].post["x-implementation-status"],
  ).toBe("planned");
  expect(openApiDocument.paths["/health"].get["x-implementation-status"]).toBe(
    "implemented",
  );
});

describe("planned access contracts", () => {
  it("requires bearer authorization for analysis and evidence", () => {
    expect(openApiDocument.paths["/v1/analyses"].post.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(
      openApiDocument.paths["/v1/runs/{runId}/evidence"].get.security,
    ).toEqual([{ bearerAuth: [] }]);
  });
});
