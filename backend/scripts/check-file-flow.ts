import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Check } from "typebox/value";
import { buildApp } from "../src/app.js";
import { env } from "../src/config.js";
import {
  FileAnalysisSchema,
  FilePreviewSchema,
} from "../src/contracts/files.js";

if (!env.DATABASE_URL || !process.env.METIS_LOCAL_TOKEN)
  throw new Error("Run the configured local setup first.");
const headers = { authorization: `Bearer ${process.env.METIS_LOCAL_TOKEN}` };
const source = Buffer.from(
  "region,revenue\nNorth,0.1\nNorth,0.2\nSouth,20\nSouth,\n",
);
let app = await buildApp(env.DATABASE_URL);
let id: string | undefined;
try {
  const upload = await app.inject({
    method: "POST",
    url: "/v1/files",
    headers,
    payload: {
      name: `integration-${randomUUID()}.csv`,
      contentBase64: source.toString("base64"),
    },
  });
  assert.equal(upload.statusCode, 201, "File upload must persist successfully");
  const preview: unknown = upload.json();
  assert(Check(FilePreviewSchema, preview));
  id = preview.file.id;
  assert.equal(preview.file.compression, "br");
  assert.equal(preview.file.rowCount, 4);
  const original = await app.inject({
    method: "GET",
    url: `/v1/files/${id}/content`,
    headers,
  });
  assert.deepEqual(
    original.rawPayload,
    source,
    "Restored bytes must exactly match the original upload",
  );
  const overview = await app.inject({
    method: "POST",
    url: `/v1/files/${id}/analyses`,
    headers,
    payload: { question: "explain this data" },
  });
  assert.equal(overview.statusCode, 200);
  const overviewBody: unknown = overview.json();
  assert(Check(FileAnalysisSchema, overviewBody));
  assert.equal(overviewBody.result.answer.status, "answered");
  const schemaAnalysis = await app.inject({
    method: "POST",
    url: `/v1/files/${id}/analyses`,
    headers,
    payload: {
      question:
        "Help me understand the tables, columns, and relationships in my data.",
    },
  });
  assert.equal(schemaAnalysis.statusCode, 200);
  const schemaBody: unknown = schemaAnalysis.json();
  assert(Check(FileAnalysisSchema, schemaBody));
  assert.equal(schemaBody.result.answer.status, "answered");
  assert.equal(schemaBody.result.rows.length, 2);
  const skew = await app.inject({
    method: "POST",
    url: `/v1/files/${id}/analyses`,
    headers,
    payload: { question: "Is revenue left or right skewed?" },
  });
  assert.equal(skew.statusCode, 200);
  const skewBody: unknown = skew.json();
  assert(Check(FileAnalysisSchema, skewBody));
  assert.equal(skewBody.result.answer.status, "answered");
  assert.match(
    skewBody.result.answer.status === "answered"
      ? skewBody.result.answer.answerText
      : "",
    /right-skewed/i,
  );
  assert.equal(skewBody.result.rows[0]?.shape, "right-skewed");
  const total = await app.inject({
    method: "POST",
    url: `/v1/files/${id}/analyses`,
    headers,
    payload: { question: "What is the total revenue grouped by region?" },
  });
  assert.equal(total.statusCode, 200);
  const result: unknown = total.json();
  assert(Check(FileAnalysisSchema, result));
  assert.equal(result.result.answer.status, "answered");
  assert.equal(result.method, "deterministic");
  assert.deepEqual(result.result.rows, [
    {
      region: "North",
      value: "0.3",
      included_rows: 2,
      excluded_empty_rows: 0,
    },
    {
      region: "South",
      value: "20",
      included_rows: 1,
      excluded_empty_rows: 1,
    },
  ]);
  await app.close();
  app = await buildApp(env.DATABASE_URL);
  const restored = await app.inject({
    method: "GET",
    url: `/v1/files/${id}`,
    headers,
  });
  assert.equal(restored.statusCode, 200, "Files must survive API restarts");
  const history = await app.inject({
    method: "GET",
    url: "/v1/file-analyses",
    headers,
  });
  assert.equal(history.statusCode, 200);
  const invalid = await app.inject({
    method: "GET",
    url: `/v1/files/${id}`,
    headers: { authorization: "Bearer invalid-credential" },
  });
  assert.equal(
    invalid.statusCode,
    401,
    "Untrusted identities must not access persisted files",
  );
  process.stdout.write(
    "File flow passed: Neon Brotli storage, byte-exact download, full-file overview, right-skew answer, grouped totals, restart persistence, history and access denial.\n",
  );
} finally {
  if (id) {
    const deletion = await app.inject({
      method: "DELETE",
      url: `/v1/files/${id}`,
      headers,
    });
    assert.equal(
      deletion.statusCode,
      200,
      "Synthetic check file must be removed",
    );
  }
  await app.close();
}
