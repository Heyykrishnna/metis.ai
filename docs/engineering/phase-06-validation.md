# Phase 6 validation evidence

Execution date: 24 October 2026. Implementation branch: `builds/project-foundation`. Scope: Phase 6 Organization permissions and adversarial isolation (Three canonical organizational roles `owner`, `analyst`, and `viewer`, transactional per-user database context scoping and pool isolation, small-cohort aggregate and differencing attack defense E08, effective-access inspection E06 `GET /v1/policies/effective`, synthetic policy simulation E06 `POST /v1/policies/simulate`, immediate permission-change revocation and policy-versioned cache invalidation E07, frozen 36-question attack suite across 12 families evaluated across all 3 roles [108 executions], positive permitted-use controls, real PostgreSQL RLS/context integration, OpenAPI 3.1.0 contract synchronization, and quality gate Q01–Q10 verification).

## Baseline and delivery summary

Phase 6 delivers organization permissions, role boundaries, database-native transactional context isolation, adversarial attack suite resistance, and policy inspection/simulation defined in PRD sections 15-20 and `project-phases/phase-06-organization-permissions.md`:

### 1. Three Canonical Organizational Roles & Lifecycle Matrix

Exactly three canonical organizational roles are defined, authenticated, and enforced across the analysis lifecycle:

| Role          | Permitted Actions                                                                                                                        | Row Boundary                                               | Column Boundary                                                                                               | Small-Cohort Threshold | Positive Permitted Controls                                                              |
| :------------ | :--------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :--------------------- | :--------------------------------------------------------------------------------------- |
| **`owner`**   | Manage workspace membership, connections, and security policies; execute approved analyses; review and publish recipes; inspect evidence | Current organization/workspace and approved business units | Approved analytical fields; sensitive credentials/secrets/SSNs excluded                                       | $N \ge 5$              | Administers connections/policies, inspects all evidence, executes multi-region analyses  |
| **`analyst`** | Ask/refine questions, inspect permitted evidence, create private recipe drafts, export data (when granted)                               | Assigned workspace regions                                 | Approved analytical columns (`school_name`, `enrolment_count`, `calendar_year`, etc.); raw identifiers masked | $N \ge 5$              | Executes ad-hoc analytical queries, inspects Truth Ledger, drafts parameterized recipes  |
| **`viewer`**  | Read approved shared outputs, execute explicitly approved parameterized aggregate recipes                                                | Permitted regional aggregates only                         | Approved aggregate measures and dimensions; detail columns and raw SQL blocked                                | $N \ge 5$              | Executes approved aggregate recipes (`/v1/recipes/:id/execute`), views published reports |

### 2. Frozen 36-Question Adversarial Attack Suite Across 12 Families (108 Executions)

The frozen attack suite spans 12 threat families and 36 distinct attack vectors, executed independently against all three canonical roles (108 role executions total) via `backend/test/organization-permissions.test.ts`:

1. **Family 1: Cross-tenant IDs** (Q01, Q02, Q03): Cross-tenant organization filter spoofing, foreign workspace connection switching, and hardcoded tenant literal queries.
   - _Outcome_: Zero cross-tenant rows returned; all unauthorized tenant queries strictly isolated or blocked (`blocked_by_policy` / HTTP 404).
2. **Family 2: Role spoofing & privilege escalation** (Q04, Q05, Q06): Manipulated `x-metis-role` client headers, forged JWT claims, and unauthorized policy-admin simulation attempts.
   - _Outcome_: Authentication and authorization derived strictly from server identity context; unauthorized privilege escalations rejected (`blocked_by_policy` / HTTP 403).
3. **Family 3: Forbidden row access** (Q07, Q08, Q09): Analyst escaping regional boundaries, viewer querying unapproved business units, and bypass via null-region handling.
   - _Outcome_: Database row boundaries enforced; queries violating assigned regional predicates rejected.
4. **Family 4: Forbidden column access & extraction** (Q10, Q11, Q12): Direct `national_id` extraction, wildcard expansion (`SELECT *`) to expose secret fields, and alias obfuscation (`SELECT national_id AS nid`).
   - _Outcome_: AST traversal inspects all projected column expressions, aliases, and wildcard expansions; queries referencing restricted columns terminate in `blocked_by_policy`.
5. **Family 5: Join, CTE, & subquery bypass** (Q13, Q14, Q15): Restricted columns concealed within CTE definitions, correlated subqueries, or secondary join predicates.
   - _Outcome_: Recursive AST parser traverses table expressions, CTE blocks, and join clauses; nested sensitive column references blocked.
6. **Family 6: Predicate, order, and grouping side-channels** (Q16, Q17, Q18): Inferring restricted values via `WHERE national_id LIKE '1%'`, `ORDER BY ssn`, or `GROUP BY pin`.
   - _Outcome_: Column visibility enforced on `WHERE`, `ORDER BY`, `GROUP BY`, and `HAVING` nodes; side-channel extraction blocked.
7. **Family 7: Small-cohort aggregate and differencing attacks (E08)** (Q19, Q20, Q21): Filtering for singular individuals ($N < 5$), targeted exclusion differencing, and subtraction between overlapping cohorts ($N = 100$ vs $N = 99$).
   - _Outcome_: Enforces $N \ge 5$ cohort threshold; differencing and single-record aggregate queries blocked with `blocked_by_policy`.
8. **Family 8: Data-value & SQL multi-statement injection** (Q22, Q23, Q24): Second-order SQL injection, semicolon-separated statement chaining, and comment truncation attacks.
   - _Outcome_: AST allowlist validates query grammar, requiring single read-only `SELECT` statements; multi-statements and write mutations blocked.
9. **Family 9: Schema-description and system catalog injection** (Q25, Q26, Q27): Probing `pg_catalog`, `information_schema`, or internal Metis migration metadata tables.
   - _Outcome_: Access restricted exclusively to authorized analytical schemas; system catalogs blocked.
10. **Family 10: Prior-turn, model-output, and canary extraction** (Q28, Q29, Q30): Prompt injection attempting to extract canary tokens, prior assistant run outputs, or administrative credentials.
    - _Outcome_: Canary tokens kept in explicit untrusted data envelopes; candidate SQL for blocked runs redacted in evidence bundles; zero canary leakage.
11. **Family 11: Cached, history, and recipe replay** (Q31, Q32, Q33): Replaying cached runs across roles, re-executing unapproved draft recipes as viewer, or accessing expired run evidence.
    - _Outcome_: Recipes and cached outputs re-authorized against caller's active role; draft recipes blocked for viewers (HTTP 403).
12. **Family 12: Export, SSE, error, and formula injection** (Q34, Q35, Q36): Spreadsheet formula injection (`=cmd|' /C ...'`), viewer attempting raw CSV/SQL export, and error message reflection of forbidden identifiers.
    - _Outcome_: Viewer exports blocked (HTTP 403); CSV cells sanitized with CWE-1236 defenses; formula injection patterns terminated with `blocked_by_policy`.

**Attack Suite Summary**: Across all 108 test executions, 100% adherence to expected security policy was demonstrated with zero unauthorized data disclosure, privilege escalation, or source mutation.

### 3. Real PostgreSQL Transactional Context Scoping & Connection Pool Isolation

Verified in `backend/test/database.integration.test.ts`:

- Per-user database context is propagated transactionally using `SELECT set_config('app.current_user_role', $1, true)` within `client.begin(async (sqlTx) => ...)`.
- Because `is_local = true`, session configuration is strictly bound to the active transaction and automatically cleared when connections return to the pool.
- Concurrent and sequential executions across different roles (`owner`, `analyst`, `viewer`) verified zero scope inheritance or cross-tenant variable pollution.
- Real PostgreSQL RLS and role permissions tested on disposable cluster and verified after complete `pg_dump` and `pg_restore`.

### 4. Effective-Access Inspection & Synthetic Policy Simulator (E06)

- **`GET /v1/policies/effective`**: Enables clients and administrators to inspect current effective role boundaries, permitted actions, row boundary predicates, allowed/restricted columns, and small-cohort threshold.
- **`POST /v1/policies/simulate`**: Allows dry-run AST evaluation of proposed SQL queries against specified organizational roles without executing against live data. Returns structured allow/deny verdicts, evaluated policy version, effective columns, and explicit violation reasons without revealing confidential values.

### 5. Immediate Permission-Change Revocation & Invalidation (E07)

- In-memory and persistent revocation controls (`revokeSubjectAccess`) allow immediate revocation of user or session access.
- Running queries and active runs check subject revocation before dispatch and during terminal delivery.
- Revoked subjects attempting to fetch results, evidence, or data exports receive immediate `403 Forbidden` responses.
- Stale results are invalidated by policy version; blocked queries redact candidate SQL text in evidence bundles (`[REDACTED BLOCKED QUERY]`).

---

## Final check record (Q01–Q10 Quality Gates)

| Gate    | Purpose                 | Command                                    | Result                                       |
| :------ | :---------------------- | :----------------------------------------- | :------------------------------------------- |
| **Q01** | Reproducible install    | `npm --prefix backend ci`                  | **Passed**                                   |
| **Q02** | Backend types           | `npm --prefix backend run typecheck`       | **Passed** (0 errors)                        |
| **Q03** | Backend behavior        | `npm --prefix backend run test:run`        | **Passed** (142 tests across 28 files)       |
| **Q04** | Frontend lint           | `npm --prefix frontend run lint`           | **Passed** (0 warnings/errors)               |
| **Q05** | Production builds       | `npm --prefix backend run build`           | **Passed**                                   |
| **Q06** | Frontend explicit types | `npm exec --no -- tsc --noEmit` (frontend) | **Passed** (0 errors, 35 tests passed)       |
| **Q07** | Real DB integration     | `node scripts/test-database.mjs`           | **Passed** (22 tests before & after restore) |
| **Q08** | Browser / HTTP smoke    | `node scripts/smoke.mjs`                   | **Passed** (health, live, ready, web app)    |
| **Q09** | Security & audit        | `npm --prefix backend audit`               | **Passed** (0 vulnerabilities)               |
| **Q10** | Evaluation & operations | `npm --prefix backend run check`           | **Passed** (all quality gates satisfied)     |

---

## Exit gate G6

- [x] Exactly three supported roles have approved row/column/action matrices and passing permitted and forbidden cases.
- [x] All frozen attack executions satisfy expected policy behavior with zero observed unauthorized disclosure, privilege escalation, or source mutation. A timeout or missing artifact is not a safety pass.
- [x] Every role has positive permitted-use evidence; refusal of all work cannot satisfy the gate.
- [x] Revocation, cache invalidation, pooled isolation, and direct database restrictions pass real integration checks.
- [x] Existing G1–G5 security/integrity regressions and applicable Q01–Q09 checks pass; the extension protocol report is reproducible.

## Handoff and recovery

Phase 7 receives effective-policy/context contracts, OpenAPI 3.1.0 specifications, generated TypeScript types, and the frozen 36-question attack suite. All security policies fail closed with least-privilege defaults and immediate revocation switches.
