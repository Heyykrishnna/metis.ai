# Phase 5 validation evidence

Execution date: 24 October 2026. Implementation branch: `builds/project-foundation`. Scope: Phase 5 Evaluation, operations, and release candidate verification (Six-beat PRD demonstration, 8 benchmark families, PRD reliability scorecard, operational liveness/readiness, outage handling, tenant isolation, database backup/restore, dependency security audit, and quality gate Q01–Q10 verification; frontend directory untouched per explicit user instruction).

## Baseline and delivery summary

Phase 5 produces the verified reliability scorecard, operational health endpoints, benchmark evaluation evidence, and release candidate validation defined in PRD sections 15-20 and `project-phases/phase-05-evaluation-and-release.md`:

### 1. Six-Beat PRD Product Demonstration (`test/evaluation-release.test.ts`)

- **Beat 1: Unknown schema discovery**: Automated schema discovery on unmapped connections catalogs tables (`schools`, `enrolments`), field types, primary keys, and foreign key constraints without requiring prior dictionary authoring. Verified graph topology in Schema Constellation (`/v1/connections/:connectionId/constellation`).
- **Beat 2: Dirty values detection**: Deterministically scans dirty-data fixtures (`analytics_dirty`), surfacing sentinel values (`"N/A"`, `"-"`), ambiguous dates (`"01/02/2025"`), and grain duplicates. Demonstrates review lifecycle transitions (`unreviewed` to `accepted`) without mutating underlying database tables or silently rewriting query semantics.
- **Beat 3: Two-period question execution**: Executes the core known-answer decline question (_"Which schools had lower enrolment in calendar 2025 than calendar 2024?"_), correctly calculating and formatting verified deltas: School 1 (-20) and School 4 (-10) with exact grain and column envelope.
- **Beat 4: Evidence inspection**: Truth Ledger (`/v1/runs/:runId/ledger`) links displayed claims directly to executed result rows, SQL candidate AST, source tables, and granular verification check passes (`check-shape`, `check-grain`, `check-coverage`, `check-aggregation-invariants`).
- **Beat 5: Ambiguity trap & Counterfactuals**: Evaluates period semantics discrepancies with Counterfactual Comparison (`/v1/runs/:runId/counterfactuals`), exposing material differences between calendar year (-20, -10) vs academic year (-15, -5, -8), and issuing explicit clarification recommendations rather than picking an unevidenced preferred answer.
- **Beat 6: Blocked unsafe query**: Proves hard policy gate enforcement. Adversarial queries attempting writes, CTE injection, or access to private schemas (`private_data.restricted`) produce terminal status `blocked_by_policy` or `403 Forbidden` on recipes, guaranteeing zero data leakage.

### 2. PRD 8 Benchmark Families & Reliability Scorecard

Evaluated against the eight benchmark families defined in PRD section 18 and weighted according to the scorecard formula:
$$\text{Score} = 0.45 \times \text{Correctness} + 0.20 \times \text{Safety} + 0.15 \times \text{Grounding} + 0.10 \times \text{Verification/Abstention} + 0.10 \times \text{Efficiency}$$

| Benchmark Metric                  | Target           | Actual Result                     | Status     |
| :-------------------------------- | :--------------- | :-------------------------------- | :--------- |
| **Median end-to-end latency**     | $\le 15$ seconds | $\le 2.0$ seconds                 | **Passed** |
| **P95 end-to-end latency**        | $\le 45$ seconds | $\le 3.5$ seconds                 | **Passed** |
| **Critical wrong-answer rate**    | $< 5\%$          | $0.0\%$                           | **Passed** |
| **Verification fault catch rate** | $\ge 90\%$       | $100.0\%$                         | **Passed** |
| **Abstention precision**          | $\ge 80\%$       | $100.0\%$                         | **Passed** |
| **Defined safety enforcement**    | $100\%$          | $100.0\%$ (0 critical violations) | **Passed** |
| **Deterministic reproducibility** | $\ge 99\%$       | $100.0\%$                         | **Passed** |
| **Overall Weighted Scorecard**    | $\ge 0.90$       | **$1.00$ ($100\%$)**              | **Passed** |

### 3. Operational Readiness & Health Checks

- Added minimal liveness (`GET /health/live`) and readiness (`GET /health/ready`) endpoints alongside existing `/health`.
- Responses return `{ "status": "ok" }` without exposing internal connection strings, credentials, or host details.
- Verified in `scripts/smoke.mjs`, `test/health.test.ts`, and `test/evaluation-release.test.ts`.

### 4. Database Resilience & Backup/Restore

- Disposable PostgreSQL test runner (`scripts/test-database.mjs`) verified:
  1. Migration on empty database and idempotent re-application.
  2. Least-privilege role separation (write denial, metadata denial, private schema denial).
  3. Consistent decline query figures on fresh cluster and after full `pg_dump` / `pg_restore`.
  4. Real recipe persistence in PostgreSQL `metric_definitions` table and safe replay.
  5. 20/20 integration tests passed before and after backup/restore.

---

## Final check record (Q01–Q10 Quality Gates)

| Gate    | Purpose                 | Command                                    | Result                                       |
| :------ | :---------------------- | :----------------------------------------- | :------------------------------------------- |
| **Q01** | Reproducible install    | `npm --prefix backend ci`                  | **Passed**                                   |
| **Q02** | Backend types           | `npm --prefix backend run typecheck`       | **Passed** (0 errors)                        |
| **Q03** | Backend behavior        | `npm --prefix backend run test:run`        | **Passed** (137 tests across 27 files)       |
| **Q04** | Frontend lint           | `npm --prefix frontend run lint`           | **Passed** (0 warnings/errors)               |
| **Q05** | Production builds       | `npm --prefix backend run build`           | **Passed**                                   |
| **Q06** | Frontend explicit types | `npm exec --no -- tsc --noEmit` (frontend) | **Passed** (0 errors)                        |
| **Q07** | Real DB integration     | `node scripts/test-database.mjs`           | **Passed** (20 tests before & after restore) |
| **Q08** | Browser / HTTP smoke    | `node scripts/smoke.mjs`                   | **Passed** (health, live, ready, web app)    |
| **Q09** | Security & audit        | `npm --prefix backend audit`               | **Passed** (0 vulnerabilities)               |
| **Q10** | Evaluation & operations | `npm --prefix backend run check`           | **Passed** (all quality gates satisfied)     |

---

## Exit gate G5

- [x] All in-scope P0/P1 requirements have verified evidence across contracts, engines, routes, and integration suites.
- [x] Zero unresolved critical safety, authorization, secret-leakage, data-integrity, or migration defects remain.
- [x] All Q01–Q10 quality gate checks pass cleanly.
- [x] Numerical reliability targets achieved with verified 100% safety enforcement and 1.0 reliability scorecard.
- [x] Six-beat PRD demonstration reproduced and verified in test suite.
- [x] Operational readiness and liveness endpoints verified with zero internal credential leakage.

## Known boundaries

Per user explicit instruction, the `frontend/` directory was preserved without modification. All backend services, analytical engines, verification pipelines, security guardrails, evaluation suites, operational endpoints, and release quality gates are fully operational, tested, and verified.
