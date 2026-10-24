import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { normalizedDatabaseUrl } from "../backend/src/db/url.ts";

const root = new URL("../", import.meta.url);
const outputs = [new URL(".env", root), new URL("backend/.env", root)];
for (const path of outputs) {
  let exists = true;
  try {
    await access(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    exists = false;
  }
  if (exists)
    throw new Error(
      "Local environment already exists; preserve it and configure missing values manually",
    );
}
const localMetadata = process.argv.includes("--local-metadata");
const configuredUrl = process.env.DATABASE_URL;
if (!localMetadata && !configuredUrl)
  throw new Error(
    "Set DATABASE_URL for Neon, or explicitly use --local-metadata for disposable local development",
  );
const metadata = randomBytes(24).toString("hex");
const runtimeUrl = localMetadata
  ? `postgres://metis_metadata:${metadata}@127.0.0.1:55432/metis_metadata`
  : configuredUrl;
if (!runtimeUrl) throw new Error("DATABASE_URL is required");
let directUrl;
try {
  const runtime = normalizedDatabaseUrl(runtimeUrl);
  directUrl = normalizedDatabaseUrl(
    localMetadata
      ? runtimeUrl
      : (process.env.DATABASE_URL_UNPOOLED ?? runtimeUrl),
  );
  if (
    ![runtime, directUrl].every(
      (url) =>
        ["postgres:", "postgresql:"].includes(url.protocol) &&
        url.hostname &&
        url.pathname.length > 1,
    ) ||
    /[\r\n]/.test(runtimeUrl)
  )
    throw new Error("Invalid database configuration");
} catch {
  throw new Error("Invalid DATABASE_URL or DATABASE_URL_UNPOOLED");
}
if (directUrl.hostname.endsWith(".neon.tech"))
  directUrl.hostname = directUrl.hostname.replace("-pooler.", ".");

const fixture = randomBytes(24).toString("hex");
const reader = randomBytes(24).toString("hex");
await writeFile(
  outputs[0],
  `METADATA_DB_PASSWORD=${metadata}\nFIXTURE_DB_PASSWORD=${fixture}\nFIXTURE_READER_PASSWORD=${reader}\nFIXTURE_DATABASE_URL=postgres://metis_fixture_admin:${fixture}@127.0.0.1:55433/metis_analytics_fixture\n`,
  { mode: 0o600, flag: "wx" },
);
await writeFile(
  outputs[1],
  `NODE_ENV=development\nHOST=127.0.0.1\nPORT=3001\nLOG_LEVEL=info\nDATABASE_URL=${runtimeUrl}\nDATABASE_URL_UNPOOLED=${directUrl.href}\n`,
  { mode: 0o600, flag: "wx" },
);
process.stdout.write(
  "Created ignored environment files with configured metadata and isolated fixture credentials; values were not printed\n",
);
