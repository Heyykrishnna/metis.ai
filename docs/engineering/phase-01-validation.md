# Phase 1 validation evidence

Execution date: 24 October 2026. Implementation branch: `builds/project-foundation`. Scope: Phase 1 safe vertical slice (backend, analysis services, and integration checks; frontend directory untouched per explicit user instruction).

## Baseline and delivery summary

Phase 1 completes the end-to-end safe vertical slice against controlled fixtures and real database instances:

- **Destination security and secret management**: Outbound destination enforcement according to D02 (blocking link-local, cloud metadata services, and unauthorized private subnets) and AES-256-GCM encrypted secret references (`src/security/destinations.ts`, `src/security/secrets.ts`).
- **Workspace authentication and tenant boundary**: Server-enforced Bearer authentication and workspace membership validation on all protected endpoints (`src/security/auth.ts`).
- **AST SQL safety policy**: Single read-only SELECT enforcement, allowed schema filtering, denial of system schemas (`pg_catalog`, `information_schema`) and dangerous functions (`src/sql/safety.ts`).
- **PostgreSQL analytical adapter**: Bounded connection pool (max 5), statement timeout (5000ms), row cap (1000 rows), cancellation propagation via `AbortSignal`, least-privilege read-only mode, and credential sanitization (`src/sql/adapter.ts`).
- **Schema discovery and bounded profiling**: Discovers tables, columns, data types, constraints, and keys within approved schemas, bounded sampling, sensitive value masking, and deterministic schema hashing (`src/analysis/schema.ts`).
- **Replaceable structured inference client**: HTTP client with deadlines, cancellation, TypeBox schema validation, and categorized errors for outages, malformed JSON, schema violations, timeouts, and cancellations (`src/inference/client.ts`).
- **Deterministic verification engine**: Independent validation of result shape, grain uniqueness, null constraints, and coverage partitions (`src/analysis/verification.ts`).
- **Analysis orchestrator**: Bounded workflow stages (`parsing` through `verifying` and `challenging`), handling all seven terminal statuses (`answered`, `needs_clarification`, `abstained`, `blocked_by_policy`, `execution_failed`, `timed_out`, `cancelled`), SSE progress events, and metadata persistence (`src/analysis/orchestrator.ts`).
- **REST API routes**: Complete implementations for connection testing, registration, listing, analysis submission, run retrieval, progress event streaming, cancellation, result, evidence, and feedback (`src/routes/`).

## Final check record

| Check                       | Result | Evidence                                                                                                                                                                                      |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend quality             | Passed | `npm --prefix backend run check`: 0 oxlint warnings/errors, Prettier format check, strict TypeScript compilation, 79 Vitest unit tests across 19 files, OpenAPI drift check, production build |
| Frontend quality            | Passed | `npm --prefix frontend run check`: ESLint, Prettier, route typegen, strict TypeScript, 28 Vitest tests, contracts check, Next.js production build                                             |
| Real DB integration         | Passed | `node scripts/test-database.mjs`: 17 integration tests on fresh PostgreSQL 18 cluster and 17 tests after dump/restore                                                                         |
| HTTP startup smoke          | Passed | `node scripts/smoke.mjs`: built API health and production web app on ephemeral localhost ports                                                                                                |
| Fixture and model integrity | Passed | `node scripts/check-foundation.mjs`: verified model parameters, frozen fixture digests, held-out splits, and 41 local links                                                                   |
| Skills synchronization      | Passed | `node scripts/skills.mjs`: 38 canonical aliases and 103 file hashes verified                                                                                                                  |
| Dependency security         | Passed | `npm --prefix backend audit` and `npm --prefix frontend audit`: 0 vulnerabilities                                                                                                             |

## Terminal status coverage

| Terminal status       | Verification scenario                                                                 | Result                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `answered`            | Known-answer fixture: school enrolment decline in calendar 2025 vs 2024               | Verified (Schools 1 and 4 with deltas -20 and -10; 4 included, 2 excluded, 6 denominator) |
| `needs_clarification` | Ambiguous date formatting ("01/02/2025" vs "02/01/2025") or calendar vs academic year | Verified (focused prompt and nextAction provided)                                         |
| `abstained`           | Missing comparison period (fiscal year 2010) or missing entities                      | Verified (safe abstention without invented figures)                                       |
| `blocked_by_policy`   | Query attempting to access forbidden schema `private_data` or dangerous functions     | Verified (blocked before reaching adapter; zero data leaked)                              |
| `execution_failed`    | Database syntax/execution error with exhausted repairs                                | Verified (safe error categorization and state persistence)                                |
| `timed_out`           | Query/inference duration exceeding total budget                                       | Verified (aborts gracefully with timed_out terminal status)                               |
| `cancelled`           | Client abort signal cancellation                                                      | Verified (cancellation reaches client and driver, releasing resources)                    |

## Known boundaries

Per user explicit instruction, the `frontend/` directory was preserved without modification. All backend services, contracts, schemas, integration tests, and verification scripts are complete and operational.
