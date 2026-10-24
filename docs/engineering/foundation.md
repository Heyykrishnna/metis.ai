# Phase 0 foundation

This document owns the implemented foundation decisions and operating instructions. The ignored `project-phases/` folder owns the local delivery checklist. The product is still a foundation: analysis, authentication, secret-store integration, policy enforcement and verification services are Phase 1/2 work; planned OpenAPI operations are not implemented routes.

## Architecture and decisions

| Decision                  | Phase 0 choice                                                                | Rationale and constraint                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                   | Node.js 24, separate npm applications and lockfiles                           | Preserve the established layout and backend TypeScript 7; frontend Node types now match the runtime                                                                                                      |
| Initial analytical engine | PostgreSQL; SELECT and approved read-only CTEs planned                        | Existing driver/parser support; additional dialects require independent security/integration validation                                                                                                  |
| Metadata                  | Drizzle schema and versioned `backend/drizzle` migrations                     | Keep configured migration path; 13 tables represent the PRD domain with composite workspace references                                                                                                   |
| Identity boundary         | External authenticated subject, workspace membership and owner                | A subject is supplied only by future validated server auth; never trust a client-supplied workspace as authorization                                                                                     |
| Connection secrets        | `secret://` references only in metadata                                       | The future local secret store must encrypt credentials with an externally supplied key; credentials never enter inference/frontend/logs                                                                  |
| Network boundary          | Neon metadata over verified TLS; local-only synthetic analytics and inference | Workspace/run/evidence/connection metadata may reside in Neon; source query results are not persisted by default. Future connector policy must restrict approved hosts and egress; inference stays local |
| API contracts             | Backend TypeBox -> OpenAPI 3.1 -> frontend generated declarations             | Runtime shapes and client types share one source; CI fails on stale generated artifacts                                                                                                                  |
| Lifecycle                 | Seven terminal outcomes with explicit allowed transitions                     | A late result cannot reopen cancelled/completed work; clarification starts a linked child run                                                                                                            |
| Limits/retention          | `backend/src/policy.ts`, version 1.0.0                                        | Initial conservative configuration; enforcement and workload tuning are subsequent phases                                                                                                                |
| Skills                    | Canonical tracked `.agents/skills`; ignored `skills/` symlinks                | One implementation per skill, hash-pinned source snapshot, no independently edited mirrors                                                                                                               |
| Inference                 | Pinned local Qwen2.5-Coder configuration                                      | Model setup only, per the user's instruction; no weight download, inference execution, quality or hardware readiness claim                                                                               |

The metadata schema prevents mismatched workspace references. It does not provide an authentication implementation or a blanket tenant-isolation guarantee. Queries must still be scoped and authorized in the application; database RLS/least-privilege application roles require separate validation before production.

## Local setup

Requires Node.js 24 and npm. PostgreSQL 18 is the tested database family. Docker Compose is provided for separate metadata/analytics instances; a local PostgreSQL installation can run the disposable integration suite without Docker.

```bash
npm --prefix backend ci
npm --prefix frontend ci
node scripts/skills.mjs --link
node scripts/local-env.mjs
docker compose up -d --wait analytics
npm --prefix backend run db:migrate
npm --prefix backend run fixtures:reset
```

Before setup, supply `DATABASE_URL` through your shell or secret manager using the Neon pooled URL. `DATABASE_URL_UNPOOLED` may supply the direct migration URL; setup derives the direct Neon hostname when omitted. Never put either credential-bearing URL in tracked documentation or frontend environment variables.

`local-env.mjs` creates `.env` and `backend/.env` with fresh random development passwords and restrictive file permissions. It refuses to overwrite either existing file and never prints credentials. For an existing environment, configure missing variable names manually from `.env.example`; preserve existing values. Generated environment files are ignored.

Neon is the configured application metadata database. The optional `local-metadata` Compose profile is only for disposable/offline development (`node scripts/local-env.mjs --local-metadata` in a fresh checkout, then `docker compose --profile local-metadata up -d --wait`). It does not replace existing Neon configuration.

Compose can bind optional metadata to `127.0.0.1:55432` and synthetic analytics to `127.0.0.1:55433`. The databases have separate instances, volumes and administrator credentials. Use the database-scoped restricted reader username printed by fixture setup for analysis, never the fixture administrator. Setup preserves existing reader credentials and refuses unrelated roles; integration tests use unique names and remove only roles they created. Fixture reset changes only the dedicated `metis_*_fixture`/`metis_*_test` databases and recreates synthetic schemas; never point it at real user data. Run the reset command from a checkout whose fixtures are verified.

Run the API and web app in separate terminals:

```bash
npm --prefix backend run dev
npm --prefix frontend run dev
```

API: `http://127.0.0.1:3001/health`. Web app: `http://localhost:3000`. Missing inference/metadata does not prevent the current health-only development API from starting. Production configuration requires a PostgreSQL `DATABASE_URL`; dependency readiness is a later product endpoint.

## Configuration and privacy

Backend variables: `DATABASE_URL_UNPOOLED` (direct migration connection), `NODE_ENV` (`development`, `test`, `production`), `HOST`, `PORT` (1-65535), `LOG_LEVEL` (Pino levels), and `DATABASE_URL` (Neon pooled PostgreSQL URI at runtime). Validation errors identify the variable without printing its value. Empty/invalid values are rejected. Local fixture tooling additionally reads `FIXTURE_DATABASE_URL` and the generated `FIXTURE_READER_PASSWORD` from root `.env`.

Pino redacts common credentials, authorization/cookie headers and request bodies. Error serialization retains only the error type, excluding stack/message content that may contain private data. Keep log messages static and payloads minimal; redaction is not permission to log arbitrary results or credentials under unrecognized keys.

Limits: schema stage 5 s, model call 20 s, SQL 5 s, total run 45 s, 1,000 result rows/1 MiB, 100 profile rows per table/10 tables, six model calls, two SQL repairs, two active runs per workspace, one concurrent model call, five DB pool connections. Each future stage consumes the remaining total budget. These defaults are not measured performance claims.

Retention defaults: questions/runs 30 days, snapshots 7 days, audit 90 days; raw result persistence disabled, explicitly retained result cache 15 minutes. Expires-at fields model the policy; purge/revocation/export services must enforce it during later implementation. Audit records contain identifiers/actions rather than raw result values.

## Contracts and synchronization

```bash
npm --prefix backend run contracts:generate
npm --prefix frontend run contracts:generate
npm --prefix backend run contracts:check
npm --prefix frontend run contracts:check
node scripts/skills.mjs
node scripts/check-foundation.mjs
```

Backend schemas live in `backend/src/contracts`. `docs/api/openapi.json` is the generated contract publication; frontend consumes `frontend/src/generated/api.d.ts`. Operations explicitly labelled `planned` define future behavior; only `/health` is implemented. No placeholder product routes were registered.

The canonical skills were restored from the local shared collection at revision `76a44ec402ca11c6a3cb63293aff9a95e8fa9684`, excluding macOS metadata. `skills.lock.json` records hashes for 103 files. `scripts/skills.mjs --link` creates missing aliases, preserves existing entries, and verifies all 38 aliases and canonical hashes. Skill edits require review, referenced-resource checks, intentional lock updates, and all aliases must continue to resolve to the same canonical directory.

Frozen synthetic cases live in `tests/fixtures/analytics`: clean two-year results, null/missing periods, duplicates, sentinels, date ambiguity, fanout, restricted objects and a distinct renamed held-out schema. `manifest.json` records hashes. Change fixture version/expected answers only after independent review; held-out expected answers must never enter agent prompts or development tuning.

## Checks and recovery

```bash
npm --prefix backend run check
npm --prefix frontend run check
node scripts/test-database.mjs
node scripts/smoke.mjs
npm --prefix backend audit --audit-level=moderate
npm --prefix frontend audit --audit-level=moderate
```

The database runner uses `TEST_DATABASE_URL` when explicitly provided and otherwise creates/removes its own local PostgreSQL cluster. Set `PG_BINDIR` only if `initdb`, `pg_ctl`, `createdb`, `pg_dump`, and `pg_restore` are outside PATH. External test databases must be named `metis_*_test` and be disposable; role/fixture setup is intentionally destructive only within that test environment. Never use a production URL. Smoke tests start the built API/web apps on temporary localhost ports and stop them after HTTP checks.

Migrations are append-only; `db:push` is an interactive development utility, not the deployment migration process. Apply `db:migrate` against a backed-up metadata database and verify compatibility first. Recovery tests dump a disposable cluster, restore into a separate test database and rerun the checks. Production rollout/restore/retention certification belongs to Phase 5.

Backend lint uses Oxlint because the installed TypeScript 7 compiler falls outside typescript-eslint's supported peer range. Frontend keeps Next.js ESLint. Prettier checks both applications and foundation documents/scripts. A scoped `@esbuild-kit/core-utils` override upgrades its old esbuild to a patched compatible release; migration generation and DB tests verify the used API paths. Do not force-install conflicting peers or use audit's suggested breaking Drizzle downgrade.

The frontend uses system fonts so a clean production build does not require Google Fonts access. Turbopack's root is explicitly the frontend directory. If a restricted environment denies Turbopack worker ports, allow the build's local worker processes and clear only generated `.next` cache before retrying; do not disable checks.

See [validation evidence](foundation-validation.md) for actual results and environmental limits. CI is configured in `.github/workflows/quality.yml`; a local passing run is not evidence that GitHub has executed it.

## Neon metadata connection

The user-provided Neon connection is stored only in ignored `backend/.env`. The API checks connectivity during startup, exposes the Drizzle metadata handle to routes, and closes its pool on shutdown. Pools are bounded to five connections with connection, idle, lifetime and statement limits.

The metadata driver is node-postgres because it supports TLS channel binding; the existing Postgres.js driver remains for analytical fixtures. For Neon hosts, URL TLS parameters are normalized so they cannot override certificate verification; `rejectUnauthorized: true` and channel binding are enabled. The driver selects SCRAM-SHA-256-PLUS when the server offers it. See [driver SSL/channel-binding support](https://node-postgres.com/features/ssl) and [Neon security guidance](https://neon.com/docs/connect/connect-securely).

`DATABASE_URL` is pooled for runtime; `DATABASE_URL_UNPOOLED` is direct for migrations, following [Neon's Drizzle guidance](https://neon.com/docs/guides/drizzle). `db:migrate` refuses pooled migration hosts. No source credentials or provider hostname is hardcoded.

```bash
npm --prefix backend run db:inspect
npm --prefix backend run db:migrate
npm --prefix backend run db:check
```

Inspection reads schema metadata only. Migration applies the reviewed versioned SQL. Verification checks 13 expected tables, column names/types, run-status enum and exact migration hashes. It preserves unrelated objects; it does not claim to detect every possible privilege, index or constraint drift. Synthetic fixture/reset/recovery tests remain restricted to dedicated disposable databases and never target the Neon metadata database.
