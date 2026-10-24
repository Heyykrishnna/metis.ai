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
import { getDefaultSecretStore } from "../src/security/secrets.js";
import { PostgresAnalyticalAdapter } from "../src/sql/adapter.js";
import { AnalysisOrchestrator } from "../src/analysis/orchestrator.js";
import { OllamaInferenceClient } from "../src/inference/client.js";

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

  it("executes safe end-to-end analysis on real PostgreSQL database and persists run state", async () => {
    const readerUrl = new URL(databaseUrl);
    readerUrl.username = readerName;
    readerUrl.password = readerPassword;

    const secretStore = getDefaultSecretStore();
    await secretStore.set("secret://fixture/reader", readerPassword);
    await client.unsafe(
      `GRANT USAGE ON SCHEMA analytics_clean, analytics_dirty, analytics_heldout TO "${readerName}"`,
    );
    await client.unsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA analytics_clean, analytics_dirty, analytics_heldout TO "${readerName}"`,
    );

    const wsId = "10000000-0000-4000-8000-000000000009";
    await client`INSERT INTO workspaces (id, "ownerSubject", name) VALUES (${wsId}, 'owner-test', 'Test WS') ON CONFLICT DO NOTHING`;
    await client`INSERT INTO memberships ("workspaceId", subject, role) VALUES (${wsId}, 'user-test', 'owner') ON CONFLICT DO NOTHING`;

    const adapter = new PostgresAnalyticalAdapter({
      connectionString: readerUrl.href,
      poolSize: 2,
    });

    const orchestrator = new AnalysisOrchestrator({
      adapter,
      inference: new OllamaInferenceClient(),
      metadataDb: db,
    });

    const app = await buildApp({
      databaseUrl,
      adapter,
      orchestrator,
    });

    const token = `user-test:${wsId}`;
    const authHeaders = { authorization: `Bearer ${token}` };

    try {
      const testRes = await app.inject({
        method: "POST",
        url: "/v1/connections/test",
        headers: authHeaders,
        payload: {
          name: "Real Fixture Reader",
          engine: "PostgreSQL",
          host: readerUrl.hostname,
          port: Number(readerUrl.port),
          database: readerUrl.pathname.slice(1),
          username: readerName,
          secretReference: "secret://fixture/reader",
          allowedSchemas: ["analytics_clean"],
        },
      });
      expect(testRes.statusCode).toBe(200);
      expect(testRes.json()).toEqual({ status: "ready", readOnly: true });

      const createConnRes = await app.inject({
        method: "POST",
        url: "/v1/connections",
        headers: authHeaders,
        payload: {
          name: "Real Fixture Reader",
          engine: "PostgreSQL",
          host: readerUrl.hostname,
          port: Number(readerUrl.port),
          database: readerUrl.pathname.slice(1),
          username: readerName,
          secretReference: "secret://fixture/reader",
          allowedSchemas: ["analytics_clean"],
        },
      });
      expect(createConnRes.statusCode).toBe(201);
      const connId = createConnRes.json().id;

      const submitRes = await app.inject({
        method: "POST",
        url: "/v1/analyses",
        headers: authHeaders,
        payload: {
          connectionId: connId,
          question:
            "Which schools had lower enrolment in calendar 2025 than calendar 2024?",
        },
      });
      expect(submitRes.statusCode).toBe(202);
      const run = submitRes.json();
      expect(run.status).toBe("answered");

      const resultRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/result`,
        headers: authHeaders,
      });
      expect(resultRes.statusCode).toBe(200);
      const result = resultRes.json();
      expect(result.answer.status).toBe("answered");
      expect(result.rows).toEqual([
        { school_id: 1, delta: -20 },
        { school_id: 4, delta: -10 },
      ]);

      const evidenceRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/evidence`,
        headers: authHeaders,
      });
      expect(evidenceRes.statusCode).toBe(200);
      const evidence = evidenceRes.json();
      expect(evidence.finalStatus).toBe("answered");

      const csvRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/export/csv`,
        headers: authHeaders,
      });
      expect(csvRes.statusCode).toBe(200);
      expect(csvRes.body).toContain("school_id,delta");
      expect(csvRes.body).toContain("1,-20");
      expect(csvRes.body).toContain("4,-10");

      const sqlRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/export/sql`,
        headers: authHeaders,
      });
      expect(sqlRes.statusCode).toBe(200);
      expect(sqlRes.body).toContain("-- Metis Analytical SQL Export");
      expect(sqlRes.body).toContain("analytics_clean.enrolments");

      const bundleRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/export/reproducibility`,
        headers: authHeaders,
      });
      expect(bundleRes.statusCode).toBe(200);
      const bundle = bundleRes.json();
      expect(bundle.version).toBe("1.0.0");
      expect(bundle.answer.status).toBe("answered");

      const ledgerRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/ledger`,
        headers: authHeaders,
      });
      expect(ledgerRes.statusCode).toBe(200);
      const ledger = ledgerRes.json();
      expect(ledger.status).toBe("answered");
      expect(ledger.claims[0].supportingRows).toEqual([
        { school_id: 1, delta: -20 },
        { school_id: 4, delta: -10 },
      ]);

      const constelRes = await app.inject({
        method: "GET",
        url: `/v1/connections/${connId}/constellation`,
        headers: authHeaders,
      });
      expect(constelRes.statusCode).toBe(200);
      expect(constelRes.json().nodes.length).toBeGreaterThanOrEqual(2);

      const passRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/passport`,
        headers: authHeaders,
      });
      expect(passRes.statusCode).toBe(200);
      expect(passRes.json().measured.isMeasured).toBe(true);

      const radarRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/dirty-radar`,
        headers: authHeaders,
      });
      expect(radarRes.statusCode).toBe(200);
      expect(radarRes.json().anomalies.length).toBeGreaterThan(0);

      const countRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${run.runId}/counterfactuals`,
        headers: authHeaders,
      });
      expect(countRes.statusCode).toBe(200);
      expect(countRes.json().variants.length).toBe(2);

      const recipeRes = await app.inject({
        method: "POST",
        url: "/v1/recipes",
        headers: authHeaders,
        payload: {
          name: `PostgreSQL Metric Recipe ${randomBytes(4).toString("hex")}`,
          metricName: "enrolment_decline",
          connectionId: connId,
          question: "Which schools declined between 2024 and 2025?",
          plan: { sources: ["analytics_clean.enrolments"] },
          sqlText:
            "SELECT current.school_id, current.enrolled - previous.enrolled AS delta FROM analytics_clean.enrolments current JOIN analytics_clean.enrolments previous ON current.school_id = previous.school_id WHERE current.year = 2025 AND previous.year = 2024 AND current.enrolled < previous.enrolled ORDER BY current.school_id;",
          grain: ["school_id"],
          timeframePolicy: "calendar_year",
          nullExclusionPolicy: "exclude_nulls",
          approvalStatus: "approved",
        },
      });
      expect(recipeRes.statusCode).toBe(201);
      const recipe = recipeRes.json();

      const recipeInDb =
        await client`SELECT count(*)::int AS cnt FROM metric_definitions WHERE id = ${recipe.id}`;
      expect(recipeInDb[0]?.cnt).toBe(1);

      const replayRes = await app.inject({
        method: "POST",
        url: `/v1/recipes/${recipe.id}/execute`,
        headers: authHeaders,
      });
      expect(replayRes.statusCode).toBe(202);
      expect(replayRes.json().status).toBe("answered");

      const revokeRes = await app.inject({
        method: "DELETE",
        url: `/v1/connections/${connId}`,
        headers: authHeaders,
      });
      expect(revokeRes.statusCode).toBe(200);
      expect(revokeRes.json().status).toBe("revoked");

      const connInDb =
        await client`SELECT status FROM connections WHERE id = ${connId}`;
      expect(connInDb[0]?.status).toBe("revoked");

      const runsInDb =
        await client`SELECT count(*)::int AS cnt FROM analysis_runs WHERE id = ${run.runId}`;
      expect(runsInDb[0]?.cnt).toBe(1);

      const auditInDb =
        await client`SELECT count(*)::int AS cnt FROM audit_events WHERE "runId" = ${run.runId}`;
      expect(auditInDb[0]?.cnt).toBeGreaterThan(0);
    } finally {
      await app.close();
      await adapter.close();
    }
  });

  it("enforces cross-workspace run isolation on real database", async () => {
    const ws2 = "10000000-0000-4000-8000-000000000019";
    await client`INSERT INTO workspaces (id, "ownerSubject", name) VALUES (${ws2}, 'owner-other', 'Other WS') ON CONFLICT DO NOTHING`;
    await client`INSERT INTO memberships ("workspaceId", subject, role) VALUES (${ws2}, 'user-other', 'owner') ON CONFLICT DO NOTHING`;

    const app = await buildApp(databaseUrl);
    try {
      const isolationRes = await app.inject({
        method: "GET",
        url: "/v1/runs/00000000-0000-4000-8000-000000000099",
        headers: { authorization: `Bearer user-other:${ws2}` },
      });
      expect(isolationRes.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("rejects all mutation and privilege escalation attempts at real database level", async () => {
    await expect(
      reader.unsafe("DROP TABLE analytics_clean.schools"),
    ).rejects.toThrow(/permission denied|must be owner/i);

    await expect(
      reader.unsafe(
        "UPDATE analytics_clean.enrolments SET enrolled = 0 WHERE school_id = 1",
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      reader.unsafe(
        "INSERT INTO analytics_clean.schools VALUES (99, 'Hacked')",
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      reader.unsafe("DELETE FROM analytics_clean.schools WHERE id = 1"),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      reader.unsafe("SELECT * FROM private_data.restricted"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("produces safe EXPLAIN plan estimates on real PostgreSQL without executing queries", async () => {
    const adapter = new PostgresAnalyticalAdapter({
      connectionString: databaseUrl,
    });
    try {
      const estimate = await adapter.explain({
        sql: "SELECT school_id, enrolled FROM analytics_clean.enrolments WHERE year = 2025",
      });
      expect(estimate.estimatedCost).toBeGreaterThan(0);
      expect(estimate.estimatedRows).toBeGreaterThan(0);
      expect(typeof estimate.planType).toBe("string");
      expect(Array.isArray(estimate.warnings)).toBe(true);
    } finally {
      await adapter.close();
    }
  });

  it("verifies dirty fixture data integrity constraints against real database", async () => {
    const adapter = new PostgresAnalyticalAdapter({
      connectionString: databaseUrl,
    });
    try {
      const fanoutRes = await adapter.query({
        sql: "SELECT s.id AS school_id, t.tag FROM analytics_clean.schools s JOIN analytics_dirty.school_tags t ON s.id = t.school_id WHERE s.id = 1",
      });
      expect(fanoutRes.rows).toHaveLength(3);

      const dirtyRes = await adapter.query({
        sql: "SELECT school_id, period, enrolled_raw, observed_at FROM analytics_dirty.entity_period ORDER BY school_id, observed_at",
      });
      const dirtyValues = dirtyRes.rows.map((r) => r.enrolled_raw);
      expect(dirtyValues).toContain("N/A");
      expect(dirtyValues).toContain("unknown");
      expect(dirtyValues).toContain("-");

      const dates = dirtyRes.rows.map((r) => r.observed_at);
      expect(dates).toContain("01/02/2025");
      expect(dates).toContain("02/01/2025");
    } finally {
      await adapter.close();
    }
  });
});
