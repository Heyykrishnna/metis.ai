import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

function runTests(databaseUrl) {
  const result = spawnSync(
    "npm",
    ["--prefix", "backend", "run", "test:integration"],
    {
      stdio: "inherit",
      env: { ...process.env, TEST_DATABASE_URL: databaseUrl },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error("Database integration checks failed");
}

if (process.env.TEST_DATABASE_URL) {
  runTests(process.env.TEST_DATABASE_URL);
} else {
  const directory = mkdtempSync(join(tmpdir(), "metis-foundation-"));
  const dataDirectory = join(directory, "data");
  const executable = (name) =>
    process.env.PG_BINDIR ? join(process.env.PG_BINDIR, name) : name;
  let started = false;
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Cannot allocate a PostgreSQL test port");
  const port = String(address.port);
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  try {
    execFileSync(
      executable("initdb"),
      [
        "-D",
        dataDirectory,
        "-U",
        "metis_test_admin",
        "--auth-local=trust",
        "--auth-host=trust",
        "--no-locale",
        "-E",
        "UTF8",
      ],
      { stdio: "pipe" },
    );
    execFileSync(
      executable("pg_ctl"),
      [
        "-D",
        dataDirectory,
        "-l",
        join(directory, "server.log"),
        "-o",
        `-h 127.0.0.1 -p ${port} -k ${directory}`,
        "-w",
        "start",
      ],
      { stdio: "pipe" },
    );
    started = true;
    execFileSync(
      executable("createdb"),
      [
        "-h",
        "127.0.0.1",
        "-p",
        port,
        "-U",
        "metis_test_admin",
        "metis_foundation_test",
      ],
      { stdio: "pipe" },
    );
    const sourceUrl = `postgres://metis_test_admin@127.0.0.1:${port}/metis_foundation_test`;
    runTests(sourceUrl);
    const backup = join(directory, "foundation.dump");
    execFileSync(
      executable("pg_dump"),
      ["--dbname", sourceUrl, "--format=custom", "--file", backup],
      { stdio: "pipe" },
    );
    execFileSync(
      executable("createdb"),
      [
        "-h",
        "127.0.0.1",
        "-p",
        port,
        "-U",
        "metis_test_admin",
        "metis_recovery_test",
      ],
      { stdio: "pipe" },
    );
    const recoveryUrl = `postgres://metis_test_admin@127.0.0.1:${port}/metis_recovery_test`;
    execFileSync(
      executable("pg_restore"),
      ["--dbname", recoveryUrl, "--no-owner", "--no-privileges", backup],
      { stdio: "pipe" },
    );
    runTests(recoveryUrl);
    process.stdout.write(
      "Backup/restore and repeated integration checks passed\n",
    );
  } finally {
    if (started)
      execFileSync(
        executable("pg_ctl"),
        ["-D", dataDirectory, "-m", "fast", "-w", "stop"],
        { stdio: "pipe" },
      );
    rmSync(directory, { recursive: true, force: true });
  }
}
