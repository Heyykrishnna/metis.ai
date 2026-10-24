import { createHash } from "node:crypto";
import { readFile, access, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) =>
  JSON.parse(await readFile(join(root, path), "utf8"));
const model = await readJson("inference/model.json");
if (
  model.provider === "openrouter" ||
  model.provider === "huggingface" ||
  model.provider === "nvidia"
) {
  const activeParams = model.activeParameterCount ?? model.parameterCount;
  assert(
    activeParams > 0 && activeParams <= 8_000_000_000,
    "Model exceeds parameter budget",
  );
  assert(typeof model.checkpoint === "string" && model.checkpoint.length > 0);
  assert(typeof model.model === "string" && model.model.length > 0);
  assert(typeof model.license === "string" && model.license.length > 0);
  assert(new URL(model.baseUrl).protocol.startsWith("http"));
} else {
  assert(
    model.parameterCount > 0 && model.parameterCount <= 8_000_000_000,
    "Model exceeds parameter budget",
  );
  assert.match(model.upstreamRevision, /^[a-f0-9]{40}$/);
  assert.match(model.artifactDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(model.dataBoundary, "local-only");
  assert.equal(new URL(model.baseUrl).hostname, "127.0.0.1");
  assert.equal(model.license, "Apache-2.0");
}
const fixtures = await readJson("tests/fixtures/analytics/manifest.json");
for (const [name, expected] of Object.entries(fixtures.files)) {
  const contents = await readFile(join(root, "tests/fixtures/analytics", name));
  assert.equal(
    createHash("sha256").update(contents).digest("hex"),
    expected,
    `Fixture changed: ${name}`,
  );
}
const cases = await readJson("tests/fixtures/analytics/cases.json");
const developmentIds = new Set(cases.development.map((entry) => entry.id));
assert.equal(developmentIds.size, cases.development.length);
for (const entry of cases.heldOut)
  assert(!developmentIds.has(entry.id), "Held-out cases overlap development");
async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith(".md")) results.push(path);
  }
  return results;
}
const documents = [
  join(root, "README.md"),
  ...(await markdownFiles(join(root, "docs"))),
  ...(await markdownFiles(join(root, "inference"))),
  ...(await markdownFiles(join(root, ".agents/skills"))),
];
let checkedLinks = 0;
for (const path of documents) {
  const content = (await readFile(path, "utf8"))
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "");
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:[a-z]+:|#)/i.test(target) || target.includes("<")) continue;
    await access(join(dirname(path), target.split("#")[0]));
    checkedLinks++;
  }
}
process.stdout.write(
  `Verified model configuration, frozen fixtures, held-out split and ${checkedLinks} local documentation links\n`,
);
