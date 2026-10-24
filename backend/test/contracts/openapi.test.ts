import { describe, expect, it } from "vitest";
import { openApiDocument } from "../../src/contracts/openapi.js";

it("marks available product routes as implemented", () => {
  expect(
    openApiDocument.paths["/v1/analyses"].post["x-implementation-status"],
  ).toBe("implemented");
  expect(openApiDocument.paths["/health"].get["x-implementation-status"]).toBe(
    "implemented",
  );
});

describe("access contracts", () => {
  it("requires bearer authorization for analysis and evidence", () => {
    expect(openApiDocument.paths["/v1/analyses"].post.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(
      openApiDocument.paths["/v1/runs/{runId}/evidence"].get.security,
    ).toEqual([{ bearerAuth: [] }]);
  });
});

it("documents file path identifiers and byte-exact downloads", () => {
  expect(openApiDocument.paths["/v1/files/{fileId}"].parameters).toContainEqual(
    expect.objectContaining({ name: "fileId", in: "path", required: true }),
  );
  expect(
    openApiDocument.paths["/v1/files/{fileId}/content"].get.responses["200"]
      .content,
  ).toHaveProperty("application/octet-stream");
  expect(openApiDocument.paths["/v1/capabilities"].get.security).toEqual([
    { bearerAuth: [] },
  ]);
});
