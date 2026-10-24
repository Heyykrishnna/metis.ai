import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionFixtureReader, resetAnalytics } from "../scripts/fixtures.js";
import { buildApp } from "../src/app.js";
import { verifyMetadataSchema } from "../src/db/verify.js";
import { createMetadataDb } from "../src/db/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "TEST_DATABASE_URL is required for database integration tests",
  );
const parsedUrl = new URL(databaseUrl);
if (!/^\/metis_[a-z0-9_]+_test$/.test(parsedUrl.pathname))
  throw new Error(
    "Integration tests require a dedicated metis_*_test database",
  );
const { db, pool } = createMetadataDb(databaseUrl);
const client = postgres(databaseUrl);
let reader: ReturnType<typeof postgres>;
const readerPassword = randomBytes(24).toString("hex");
const readerName = `metis_test_reader_${randomBytes(8).toString("hex")}`;
const createdRoles = new Set<string>();

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  await resetAnalytics(client);
  const provisioned = await provisionFixtureReader(
    client,
    readerPassword,
    readerName,
  );
  if (provisioned.created) createdRoles.add(provisioned.name);
  const readerUrl = new URL(databaseUrl);
  readerUrl.username = readerName;
  readerUrl.password = readerPassword;
  reader = postgres(readerUrl.href, { max: 1, onnotice: () => undefined });
}, 30000);

afterAll(async () => {
  try {
    if (reader !== undefined) await reader.end();
    for (const name of createdRoles) {
      await client.unsafe(`DROP OWNED BY "${name}"`);
      await client.unsafe(`DROP ROLE "${name}"`);
    }
  } finally {
    await client.end();
    await pool.end();
  }
});

describe("disposable PostgreSQL foundation", () => {
  it("migrates an empty database and can apply the same migration again", async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
    const tables = await client<
      { name: string }[]
    >`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    expect(tables.map((table) => table.name)).toEqual([
      "analysis_runs",
      "audit_events",
      "connections",
      "evidence_items",
      "execution_records",
      "feedback",
      "memberships",
      "metric_definitions",
      "query_candidates",
      "question_intents",
      "schema_snapshots",
      "verification_reports",
      "workspaces",
    ]);
  });

  it("returns independently calculated declines through least-privilege access", async () => {
    const query = await readFile(
      new URL("../../tests/fixtures/analytics/declines.sql", import.meta.url),
      "utf8",
    );
    expect([...(await reader.unsafe(query))]).toEqual([
      { school_id: 1, delta: -20 },
      { school_id: 4, delta: -10 },
    ]);
  });

  it("resets fixtures without changing the known-answer result", async () => {
    await client`UPDATE analytics_clean.enrolments SET enrolled = 999 WHERE school_id = 1 AND year = 2025`;
    await resetAnalytics(client);
    const rows =
      await client`SELECT enrolled FROM analytics_clean.enrolments WHERE school_id = 1 AND year = 2025`;
    expect([...rows]).toEqual([{ enrolled: 80 }]);
  });

  it("denies writes even outside a read-only transaction", async () => {
    await expect(
      reader`UPDATE analytics_clean.enrolments SET enrolled = 0`,
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      reader`CREATE TABLE public.unauthorized (id int)`,
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("denies private data, metadata and privilege escalation", async () => {
    await expect(
      reader`SELECT * FROM private_data.restricted`,
    ).rejects.toMatchObject({ code: "42501" });
    await expect(reader`SELECT * FROM public.workspaces`).rejects.toMatchObject(
      { code: "42501" },
    );
    await expect(
      reader.unsafe("CREATE ROLE metis_unauthorized SUPERUSER"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      reader.unsafe(`SET ROLE "${parsedUrl.username}"`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("enforces workspace consistency for connection-linked runs", async () => {
    await client`INSERT INTO workspaces (id, "ownerSubject", name) VALUES ('10000000-0000-4000-8000-000000000001', 'owner-a', 'A'), ('10000000-0000-4000-8000-000000000002', 'owner-b', 'B')`;
    await client`INSERT INTO connections (id, "workspaceId", name, "hostReference", "allowedSchemas", "secretReference") VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'fixture', 'fixture-host', ARRAY['analytics_clean'], 'secret://fixture/reader')`;
    await expect(
      client`INSERT INTO analysis_runs ("workspaceId", "connectionId", question, "modelVersion", "expiresAt") VALUES ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'test', 'test-model', now() + interval '1 day')`,
    ).rejects.toMatchObject({ code: "23503" });
    await client`DELETE FROM workspaces WHERE id IN ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')`;
  });

  it("reports valid-school coverage independently of decline count", async () => {
    const rows =
      await client`SELECT count(*)::int AS valid FROM analytics_clean.enrolments a JOIN analytics_clean.enrolments b USING (school_id) WHERE a.year = 2024 AND b.year = 2025 AND a.enrolled IS NOT NULL AND b.enrolled IS NOT NULL`;
    expect([...rows]).toEqual([{ valid: 4 }]);
  });

  it("contains the intended dirty-data and fanout scenarios", async () => {
    const duplicates =
      await client`SELECT school_id, count(*)::int AS count FROM analytics_dirty.entity_period GROUP BY school_id, period HAVING count(*) > 1`;
    expect([...duplicates]).toEqual([{ school_id: 1, count: 2 }]);
    const tags =
      await client`SELECT count(*)::int AS count FROM analytics_dirty.school_tags WHERE school_id = 1`;
    expect([...tags]).toEqual([{ count: 3 }]);
  });

  it("keeps renamed-schema evaluation cases reproducible", async () => {
    const rows =
      await client`SELECT a.org_k, a.n - b.n AS delta FROM analytics_heldout.obs a JOIN analytics_heldout.obs b USING (org_k) WHERE a.yr = 2025 AND b.yr = 2024 AND a.n < b.n`;
    expect([...rows]).toEqual([{ org_k: 91, delta: -50 }]);
  });

  it("refuses fixture reset outside a named disposable database", async () => {
    const guardUrl = new URL(databaseUrl);
    guardUrl.pathname = "/postgres";
    const guard = postgres(guardUrl.href, { max: 1 });
    try {
      await expect(resetAnalytics(guard)).rejects.toThrow(
        "Fixture operations require a dedicated",
      );
    } finally {
      await guard.end();
    }
  });

  it("refuses to take over a pre-existing requested role", async () => {
    await expect(
      provisionFixtureReader(
        client,
        randomBytes(24).toString("hex"),
        readerName,
      ),
    ).rejects.toThrow(
      "Existing reader role is not owned by this fixture setup",
    );
  });

  it("reuses only its database-scoped role without rotating existing credentials", async () => {
    const first = await provisionFixtureReader(client, readerPassword);
    if (first.created) createdRoles.add(first.name);
    const second = await provisionFixtureReader(client, readerPassword);
    expect(second).toEqual({ name: first.name, created: false });
    expect(second.name).not.toBe(readerName);
  });

  it("verifies the generated metadata schema through the application driver", async () => {
    await expect(verifyMetadataSchema(pool)).resolves.toMatchObject({
      tables: 13,
    });
  });

  it("detects schema drift rather than declaring an incomplete schema synchronized", async () => {
    await pool.query(
      "ALTER TABLE workspaces RENAME COLUMN name TO incorrect_name",
    );
    try {
      await expect(verifyMetadataSchema(pool)).rejects.toThrow(
        "Metadata column mismatch: workspaces.name",
      );
    } finally {
      await pool.query(
        "ALTER TABLE workspaces RENAME COLUMN incorrect_name TO name",
      );
    }
  });

  it("starts and closes the API with a configured metadata connection", async () => {
    const app = await buildApp(databaseUrl);
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
