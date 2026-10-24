import { randomBytes } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { parseEnv } from "node:util";

const backendFile = new URL("../backend/.env", import.meta.url);
const frontendFile = new URL("../frontend/.env.local", import.meta.url);
const source = await readFile(backendFile, "utf8");
const values = parseEnv(source);
if (!values.DATABASE_URL)
  throw new Error("The existing backend database configuration is required.");
const token = values.METIS_LOCAL_TOKEN ?? randomBytes(32).toString("hex");
if (!values.METIS_LOCAL_TOKEN)
  await writeFile(
    backendFile,
    `${source.trimEnd()}\nMETIS_LOCAL_TOKEN=${token}\n`,
    { mode: 0o600 },
  );
let webSource = "";
try {
  webSource = await readFile(frontendFile, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const lines = webSource
  .split(/\r?\n/)
  .filter((line) => !/^(METIS_BACKEND_TOKEN|METIS_API_URL)=/.test(line));
await writeFile(
  frontendFile,
  `${lines.filter(Boolean).join("\n")}\nMETIS_API_URL=http://127.0.0.1:${process.env.API_PORT ?? values.PORT ?? "3001"}\nMETIS_BACKEND_TOKEN=${token}\n`,
  { mode: 0o600 },
);
await Promise.all([chmod(backendFile, 0o600), chmod(frontendFile, 0o600)]);
process.stdout.write(
  "Local workspace credentials synchronized. Existing Neon configuration preserved.\n",
);
