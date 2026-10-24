# Phase 2 validation evidence

Execution date: 24 October 2026. Implementation branch: `builds/project-foundation`. Scope: Phase 2 SQL safety and deterministic verification (backend services, SQL security engine, EXPLAIN plan estimator, deterministic verification suite, and adversarial database integration; frontend directory untouched per explicit user instruction).

## Baseline and delivery summary

Phase 2 completes the SQL safety, adversarial AST allowlist, and deterministic integrity verification requirements:

- **Adversarial AST allowlist and SQL policy enforcement**: Comprehensive dialect-aware AST validation rejecting all write CTEs (`WITH w AS (DELETE / UPDATE / INSERT ...)`), `SELECT INTO` table creation, multi-statement queries, transaction controls (`BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`), role/session modifications (`SET ROLE`, `SET SESSION AUTHORIZATION`), locking syntax (`FOR UPDATE`, `FOR SHARE`), forbidden system schemas (`pg_catalog`, `information_schema`), unauthorized private schemas (`private_data`), dangerous file/OS/network/XML functions (`pg_read_file`, `dblink`, `query_to_xml`, etc.), and null byte injections (`src/sql/safety.ts`).
- **Safe advisory EXPLAIN plan estimation**: Implemented `explain(query: AnalyticalQuery)` in `PostgresAnalyticalAdapter` executing pure `EXPLAIN (FORMAT JSON)` without query execution, traversing the plan tree to capture cost, row estimates, sequential scans on large relations, and generating advisory warnings (`src/sql/adapter.ts`, `src/sql/connectors.ts`).
- **Deterministic verification suite**: Expanded verification engine with independently justified checks:
  - `check-shape`: Result columns align with declared grain and planned measures.
  - `check-grain`: Uniqueness check on declared grain keys; detects duplicate entity/period keys.
  - `check-fanout`: Identifies 1-to-many and many-to-many multiplication (e.g. 3x multiplier when joining multi-valued attributes without grouping).
  - `check-sentinel-values`: Dirty value radar flagging unreviewed sentinel strings (`"N/A"`, `"unknown"`, `"-"`, `""`, `"null"`).
  - `check-ambiguous-dates`: Detects ambiguous date formats (such as `"01/02/2025"` vs `"02/01/2025"`) requiring user clarification.
  - `check-null-policy`: Fails on null identifiers in grain and identifies unhandled measure nulls.
  - `check-coverage`: Verifies partition consistency (`included + excluded === denominator`) with explicit exclusion rationale.
  - `check-aggregation-invariants`: Validates mathematical consistency, finite numeric values, and non-negative counts (`src/analysis/verification.ts`).
- **Hard gate enforcement**: All safety, authorization, and critical integrity failures act as hard blockers resulting in non-answer terminal states (`blocked_by_policy`, `abstained`, `needs_clarification`, `execution_failed`, `timed_out`, `cancelled`) with safe, actionable reasons.
- **Tenant and workspace isolation hardening**: Enforced strict workspace boundaries across all routes (`/v1/connections`, `/v1/analyses`, `/v1/runs/:runId`, `/v1/runs/:runId/events`, `/v1/runs/:runId/result`, `/v1/runs/:runId/evidence`, `/v1/runs/:runId/cancel`, `/v1/feedback`). Mismatched tokens consistently return 404 with zero cross-tenant information leakage.
- **Concurrency and cancellation safety**: Verified stage budgets, timeouts, and cancellation race handling; cancellation cannot be overwritten by subsequent execution completions.

## Final check record

| Check                       | Result | Evidence                                                                                                                                                                                       |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend quality             | Passed | `npm --prefix backend run check`: 0 oxlint warnings/errors, Prettier format check, strict TypeScript compilation, 114 Vitest unit tests across 23 files, OpenAPI drift check, production build |
| Real DB integration         | Passed | `node scripts/test-database.mjs`: 20 integration tests on fresh PostgreSQL 18 cluster and 20 tests after dump/restore                                                                          |
| HTTP startup smoke          | Passed | `node scripts/smoke.mjs`: built API health and production web app on ephemeral localhost ports                                                                                                 |
| Fixture and model integrity | Passed | `node scripts/check-foundation.mjs`: verified model parameters, frozen fixture digests, held-out splits, and 41 local links                                                                    |
| Skills synchronization      | Passed | `node scripts/skills.mjs`: 38 canonical aliases and 103 file hashes verified                                                                                                                   |
| Dependency security         | Passed | `npm --prefix backend audit`: 0 vulnerabilities                                                                                                                                                |

## Adversarial suite coverage

| Suite                           | Observable expected behavior                                                                                                                                                      | Result                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Writes and privilege escalation | All defined disallowed statements (write CTEs, DDL, transaction commands, role changes) fail before execution; real PostgreSQL reader role permissions also reject write attempts | Verified (`test/sql-adversarial.test.ts`, `test/database.integration.test.ts`)          |
| Tenant isolation                | Another workspace cannot test, list, query, stream, cancel, export, or inspect a run or connection; all return 404                                                                | Verified (`test/security-adversarial.test.ts`, `test/database.integration.test.ts`)     |
| Join fanout                     | Injected 1-to-many multiplication (School 1 with 3 tags) detected as a hard gate integrity failure                                                                                | Verified (`test/verification-adversarial.test.ts`, `test/database.integration.test.ts`) |
| Grain and duplicates            | Duplicate entity/period keys detected; arbitrary row selection cannot produce an answer                                                                                           | Verified (`test/verification-adversarial.test.ts`)                                      |
| Missing/dirty values            | Sentinels (`"N/A"`, `"unknown"`, `"-"`) and ambiguous dates follow explicit rules with exclusions and coverage                                                                    | Verified (`test/verification-adversarial.test.ts`)                                      |
| Temporal ambiguity              | Missing periods (School 5) and null measures (School 6) partitioned into explicit coverage exclusions                                                                             | Verified (`test/verification-adversarial.test.ts`)                                      |
| Resource exhaustion             | Total run timeouts and cancellation stop execution within configured budgets                                                                                                      | Verified (`test/concurrency-races.test.ts`)                                             |
| Injection and leakage           | Embedded prompt instructions cannot change permissions; secrets stay out of responses and logs                                                                                    | Verified (`test/security-adversarial.test.ts`)                                          |

## PRD benchmark fault cases

| Case ID                        | Schema              | Injected fault condition                          | Verified outcome                                                                     |
| ------------------------------ | ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `schools-calendar-decline-001` | `analytics_clean`   | Baseline known-answer query                       | Answered: School 1 (-20) and School 4 (-10); 4 valid, 2 excluded, 6 denominator      |
| `missing-period-001`           | `analytics_clean`   | School 5 missing calendar year 2025               | Excluded from comparison with explicit reason recorded in limitations                |
| `null-measure-001`             | `analytics_clean`   | School 6 null enrolment in 2025                   | Excluded from comparison with explicit reason recorded in limitations                |
| `duplicate-period-001`         | `analytics_dirty`   | School 1 duplicate period row                     | Detected by `check-grain` as a hard gate failure                                     |
| `sentinel-values-001`          | `analytics_dirty`   | Unreviewed `"N/A"`, `"unknown"`, `"-"`            | Detected by `check-sentinel-values` as a hard gate failure                           |
| `ambiguous-date-001`           | `analytics_dirty`   | Ambiguous dates `"01/02/2025"` and `"02/01/2025"` | Detected by `check-ambiguous-dates`, triggering `needs_clarification`                |
| `join-fanout-001`              | `analytics_dirty`   | Join with `school_tags` multiplies School 1 by 3x | Detected by `check-fanout` as a hard gate failure                                    |
| `forbidden-object-001`         | `private_data`      | Query referencing `private_data.restricted`       | Denied by AST safety validator before execution; terminal status `blocked_by_policy` |
| `renamed-schema-decline-001`   | `analytics_heldout` | Held-out schema `org` and `obs` tables            | Evaluated independently with preserved fixture hashes                                |

## Known boundaries

Per user explicit instruction, the `frontend/` directory was preserved without modification. All backend services, security validators, advisory EXPLAIN estimators, verification rules, integration tests, and quality gates are operational and verified.
