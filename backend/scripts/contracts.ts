import { readFile, writeFile } from "node:fs/promises";
import { openApiDocument } from "../src/contracts/openapi.js";

const target = new URL("../../docs/api/openapi.json", import.meta.url);
const contents = `${JSON.stringify(openApiDocument, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== contents) {
    throw new Error(
      "OpenAPI document is stale. Run npm run contracts:generate.",
    );
  }
} else {
  await writeFile(target, contents);
}
