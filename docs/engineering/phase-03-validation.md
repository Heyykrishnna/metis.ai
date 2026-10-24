# Phase 3 validation evidence

Execution date: 24 October 2026. Implementation branch: `builds/project-foundation`. Scope: Phase 3 Analyst workspace and evidence experience (backend services, safe CSV export with formula injection defense, dialect SQL export, Truth Ledger, reproducibility bundle, clarification resumption, connection revocation, and cross-tenant access control; frontend directory untouched per explicit user instruction).

## Baseline and delivery summary

Phase 3 delivers the analytical workspace evidence experience, verifiable audit artifacts, export pipelines, and connection lifecycle controls:

- **Truth Ledger (P1 verifiable link)**: Implemented structured Truth Ledger linking displayed answer claims directly to executed result rows, SQL candidate references, source tables, and granular verification rule evaluations (`src/analysis/orchestrator.ts`, `src/routes/analyses.ts`).
- **Reproducibility bundle**: Complete portable bundle containing the question, intent, schema snapshot identifier, analytical plan, SQL candidate, execution record with duration and row counts, full verification report, answer envelope, assumptions, and exclusions (`src/contracts/analysis.ts`, `src/routes/analyses.ts`).
- **Safe CSV export with CWE-1236 formula injection defense**: Built `serializeToSafeCsv` ensuring spreadsheet formula injection characters (`=`, `+`, `-`, `@`, `\t`, `\r`) are safely escaped with a single quote prefix `'` while preserving legitimate numeric values like `-20` and adhering to RFC 4180 double-quoting and CRLF formatting (`src/security/csv.ts`).
- **Dialect-annotated SQL export**: Generates clean, read-only SQL scripts with header comments detailing the dialect, run ID, snapshot ID, generation timestamp, and execution constraints (`src/routes/analyses.ts`).
- **Connection lifecycle management**: Added connection inspection (`GET /v1/connections/:connectionId`) and revocation (`DELETE /v1/connections/:connectionId`). Both in-memory and PostgreSQL metadata connections transition to `"revoked"` status. Analyses attempted against revoked connections are rejected with 404 (`src/routes/connections.ts`, `src/routes/analyses.ts`).
- **Clarification resumption**: Multi-turn analytical workflows allow ambiguous initial runs (`needs_clarification`) to be resumed by child analyses specifying `parentRunId`. Assumptions capture the lineage (`Clarified from parent run <id>`) and proceed safely through execution and verification (`src/analysis/orchestrator.ts`).
- **Cross-tenant export isolation**: All export endpoints (`/export/csv`, `/export/sql`, `/export/reproducibility`, `/ledger`) and connection routes strictly enforce workspace tenant boundaries, returning 404 on mismatched tokens.
- **Run-linked feedback capture**: Validated feedback submissions (`POST /v1/feedback`) enforce workspace ownership, rating bounds (1-5), feedback categories, and optional comments, returning persistent receipt identifiers (`src/routes/feedback.ts`).

## Final check record

| Check                       | Result | Evidence                                                                                                                                                                                       |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend quality             | Passed | `npm --prefix backend run check`: 0 oxlint warnings/errors, Prettier format check, strict TypeScript compilation, 122 Vitest unit tests across 25 files, OpenAPI drift check, production build |
| Real DB integration         | Passed | `node scripts/test-database.mjs`: 20 integration tests on fresh PostgreSQL cluster and 20 tests after dump/restore                                                                             |
| HTTP startup smoke          | Passed | `node scripts/smoke.mjs`: built API health and production web app on ephemeral localhost ports                                                                                                 |
| Fixture and model integrity | Passed | `node scripts/check-foundation.mjs`: verified model parameters, frozen fixture digests, held-out splits, and 41 local links                                                                    |
| Skills synchronization      | Passed | `node scripts/skills.mjs`: 38 canonical aliases and 103 file hashes verified                                                                                                                   |
| Dependency security         | Passed | `npm --prefix backend audit`: 0 vulnerabilities                                                                                                                                                |

## Phase 3 verification suite coverage

| Suite                                 | Observable expected behavior                                                                                                         | Result                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| CWE-1236 formula injection defense    | Formula characters (`=`, `+`, `-`, `@`, `\t`, `\r`) are escaped with `'`; numbers (`-20`, `+100`) and quotes are correctly formatted | Verified (`test/csv.test.ts`)                                                      |
| Connection revocation lifecycle       | Connection transitions to `"revoked"` in memory and PostgreSQL; revoked connection cannot submit analyses                            | Verified (`test/evidence-experience.test.ts`, `test/database.integration.test.ts`) |
| Clarification resumption              | Ambiguous query triggers `needs_clarification`; child submission with `parentRunId` completes with `answered` and provenance logged  | Verified (`test/evidence-experience.test.ts`)                                      |
| CSV, SQL, and reproducibility exports | Content-Type, Content-Disposition headers, dialect headers, and complete bundle fields verified                                      | Verified (`test/evidence-experience.test.ts`, `test/database.integration.test.ts`) |
| Truth Ledger linkage                  | Claims link to result rows, candidate SQL references, and verification rule checks                                                   | Verified (`test/evidence-experience.test.ts`, `test/database.integration.test.ts`) |
| Cross-tenant export and ledger denial | Unauthorized workspaces guessing run IDs or connection IDs receive 404 with zero data leakage                                        | Verified (`test/evidence-experience.test.ts`, `test/security-adversarial.test.ts`) |
| Real PostgreSQL database persistence  | Analysis runs, execution records, audit events, and revoked connection statuses verified directly in PostgreSQL tables               | Verified (`test/database.integration.test.ts`)                                     |

## Known boundaries

Per user explicit instruction, the `frontend/` directory was preserved without modification. All backend analytical services, export handlers, Truth Ledger models, connection revocation mechanisms, integration tests, and quality gates are fully operational, tested, and verified.
