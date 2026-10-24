import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.WEB_URL ?? "http://127.0.0.1:3005";
const source = Buffer.from("region,revenue\nNorth,0.1\nNorth,0.2\nSouth,20\n");
async function request(path, method = "GET", payload) {
  const response = await fetch(new URL(`/api/backend${path}`, base), {
    method,
    headers: { "Content-Type": "application/json" },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(90000),
  });
  assert(
    response.ok,
    `Frontend proxy ${method} ${path} returned ${response.status}`,
  );
  return response;
}
let id;
try {
  const uploaded = await (
    await request("/v1/files", "POST", {
      name: `web-integration-${randomUUID()}.csv`,
      contentBase64: source.toString("base64"),
    })
  ).json();
  id = uploaded.file.id;
  assert.equal(uploaded.file.compression, "br");
  assert.deepEqual(
    Buffer.from(await (await request(`/v1/files/${id}/content`)).arrayBuffer()),
    source,
  );
  const analysis = await (
    await request(`/v1/files/${id}/analyses`, "POST", {
      question: "What is the total revenue grouped by region?",
    })
  ).json();
  assert.equal(analysis.result.answer.status, "answered");
  assert.deepEqual(analysis.result.rows, [
    { region: "North", value: "0.3", included_rows: 2, excluded_empty_rows: 0 },
    { region: "South", value: "20", included_rows: 1, excluded_empty_rows: 0 },
  ]);
  const history = await (await request("/v1/file-analyses")).json();
  assert(
    history.some(
      (item) =>
        item.id === analysis.id && item.sourceHash === uploaded.file.sha256,
    ),
  );
} finally {
  if (id) await request(`/v1/files/${id}`, "DELETE");
}

process.stdout.write(
  "Frontend proxy flow passed: upload, Neon Brotli persistence, byte-exact download, real model calculation, saved history and deletion.\n",
);
