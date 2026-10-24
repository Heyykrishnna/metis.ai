import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("keeps local runtime and migration targets isolated from exported Neon settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metis-env-test-"));
  try {
    await mkdir(join(directory, "scripts"));
    await mkdir(join(directory, "backend/src/db"), { recursive: true });
    await copyFile(
      new URL("../../scripts/local-env.mjs", import.meta.url),
      join(directory, "scripts/local-env.mjs"),
    );
    await copyFile(
      new URL("../src/db/url.ts", import.meta.url),
      join(directory, "backend/src/db/url.ts"),
    );
    const result = spawnSync(
      process.execPath,
      [join(directory, "scripts/local-env.mjs"), "--local-metadata"],
      {
        env: {
          ...process.env,
          DATABASE_URL:
            "postgresql://user:synthetic@EP-EXAMPLE-POOLER.NEON.TECH/db",
          DATABASE_URL_UNPOOLED:
            "postgresql://user:synthetic@EP-EXAMPLE.NEON.TECH/db",
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    const content = await readFile(join(directory, "backend/.env"), "utf8");
    const values = Object.fromEntries(
      content
        .trim()
        .split("\n")
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    expect(values.DATABASE_URL_UNPOOLED).toBe(values.DATABASE_URL);
    expect(new URL(values.DATABASE_URL ?? "").hostname).toBe("127.0.0.1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
