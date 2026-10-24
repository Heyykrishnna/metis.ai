import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";

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
const metadata = randomBytes(24).toString("hex");
const fixture = randomBytes(24).toString("hex");
const reader = randomBytes(24).toString("hex");
await writeFile(
  outputs[0],
  `METADATA_DB_PASSWORD=${metadata}\nFIXTURE_DB_PASSWORD=${fixture}\nFIXTURE_READER_PASSWORD=${reader}\nFIXTURE_DATABASE_URL=postgres://metis_fixture_admin:${fixture}@127.0.0.1:55433/metis_analytics_fixture\n`,
  { mode: 0o600, flag: "wx" },
);
await writeFile(
  outputs[1],
  `NODE_ENV=development\nHOST=127.0.0.1\nPORT=3001\nLOG_LEVEL=info\nDATABASE_URL=postgres://metis_metadata:${metadata}@127.0.0.1:55432/metis_metadata\n`,
  { mode: 0o600, flag: "wx" },
);
process.stdout.write(
  "Created local .env and backend/.env with generated development credentials; values were not printed\n",
);
