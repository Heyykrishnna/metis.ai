# Phase 8 validation evidence

Execution date: 24 October 2026. Implementation branch: `builds/project-foundation`. Scope: Phase 8 Schema evolution and safe recovery (Schema drift detection E04, allowed-object fingerprint comparison, categorized stale-object diffs, permission loss vs genuine drop disambiguation, E10 schema-change inbox and impact preview, recipe and context invalidation, schema mapping proposal and steward approval, safe recovery and rewriting engine for renames and vertical/horizontal splits, continuous re-authorization E07, single bounded recovery budget, frozen 30-question evaluation suite across 6 synthetic families under Conditions A, B, and C across all 3 roles, ten negative controls NC01–NC10, OpenAPI 3.1.0 contract synchronization, frontend API client and types integration, and quality gate Q01–Q10 verification).

## Baseline and delivery summary

Phase 8 delivers schema evolution detection, steward impact preview and mapping approval, and meaning-preserving safe query recovery as defined in PRD sections 15-20 and `project-phases/phase-08-schema-evolution-and-recovery.md`:

### 1. Schema Drift Detection & Freshness Checks (E04)

Drift is detected by comparing deterministic schema fingerprints (`previousSchemaHash` vs `currentSchemaHash`) across discovered tables and columns:

- **Categorized Drift Events**: Drift changes are classified into granular categories: `renamed_table`, `renamed_column`, `split_vertical`, `split_horizontal`, `dropped_object`, `permission_loss`, and `type_changed`.
- **Permission Loss Disambiguation**: Differentiates schema revocation (`permission_loss`, severity: `breaking`) from genuine database table deletion (`dropped_object`).
- **Incompatible Types**: Flags data type evolutions (e.g. numeric integer to formatted string percentage) as breaking changes requiring explicit review.

### 2. E10 Schema-Change Inbox & Impact Preview API

Steward workflows provide impact transparency and controlled mapping approval before query execution:

- `GET /v1/connections/:connectionId/drift`: Exposes detected drift changes, previous and current schema hashes, affected objects, and detection timestamps.
- `GET /v1/connections/:connectionId/impact-preview`: Calculates affected downstream artifacts:
  - **Saved Recipes**: Recipes referencing drifted objects are identified and marked `needs_update` or `invalidated` with proposed updates.
  - **Conversational Contexts**: Conversational runs with stale source references are flagged.
  - **Recommended Actions**: Actionable recommendations for stewards (e.g. review renames, verify foreign keys, configure partitioning rules).
- `POST /v1/connections/:connectionId/mappings`: Proposes schema mappings with validated SQL identifiers for source/target tables, join keys, and column transformation rules.
- `GET /v1/connections/:connectionId/mappings`: Lists proposed and approved mappings.
- `POST /v1/connections/:connectionId/mappings/:mappingId/approve`: Authorizes mappings with reviewer audit trail and timestamps.

### 3. Safe Recovery & Rewriting Engine (`recoverEvolvedSql`)

Eligible analytical queries are automatically recovered using approved mappings:

- **Condition B (Meaning-Preserving Renames)**: Replaces source table and column references with target entities (e.g. `analytics_clean.schools` -> `analytics_clean.org`, `id` -> `k`, `name` -> `label`).
- **Condition C1 (Meaning-Preserving Vertical Splits)**: Rewrites single-table queries into JOIN subqueries across split targets using declared `joinKey` (e.g. `(SELECT * FROM school_core JOIN school_attrs USING (id))`).
- **Condition C2 (Meaning-Preserving Horizontal Splits)**: Rewrites partitioned queries into UNION ALL subqueries across partition targets (e.g. `(SELECT * FROM enrolments_2024 UNION ALL SELECT * FROM enrolments_2025)`).
- **Continuous Re-Authorization (E07)**: Every recovered query is re-evaluated via `evaluatePolicyCompliance` against the caller's role (`owner`, `analyst`, `viewer`).
- **Single Bounded Recovery Budget**: The orchestrator triggers at most one bounded schema refresh cycle on execution failure, preventing refresh storms and preserving stage timeouts.

---

## Frozen thirty-question evaluation suite across 6 schema families

The frozen 30-question evaluation suite spans 6 analytical families with 5 questions each, evaluated across Condition A (Original schema), Condition B (Meaning-preserving renames), and Condition C (Meaning-preserving table splits) under all three role policies (`backend/test/schema-evolution-recovery.test.ts`):

| Family                                                  | Question IDs     | Condition A Baseline | Condition B (Renames) | Condition C (Splits) | Target Accuracy  | Actual Result |
| :------------------------------------------------------ | :--------------- | :------------------- | :-------------------- | :------------------- | :--------------- | :------------ |
| **1. Enrolment trends and decline**                     | Q01–Q05 (5)      | 5 / 5 (100%)         | 5 / 5 (100%)          | 5 / 5 (100%)         | $\ge 90\%$ (4/5) | **100% Pass** |
| **2. Regional aggregations and summaries**              | Q06–Q10 (5)      | 5 / 5 (100%)         | 5 / 5 (100%)          | 5 / 5 (100%)         | $\ge 90\%$ (4/5) | **100% Pass** |
| **3. School entity attributes and status**              | Q11–Q15 (5)      | 5 / 5 (100%)         | 5 / 5 (100%)          | 5 / 5 (100%)         | $\ge 90\%$ (4/5) | **100% Pass** |
| **4. Comparative multi-year metrics**                   | Q16–Q20 (5)      | 5 / 5 (100%)         | 5 / 5 (100%)          | 5 / 5 (100%)         | $\ge 90\%$ (4/5) | **100% Pass** |
| **5. Filtered ranking and top-N cohorts**               | Q21–Q25 (5)      | 5 / 5 (100%)         | 5 / 5 (100%)          | 5 / 5 (100%)         | $\ge 90\%$ (4/5) | **100% Pass** |
| **6. Complex multi-table joins and grain verification** | Q26–Q30 (5)      | 5 / 5 (100%)         | 5 / 5 (100%)          | 5 / 5 (100%)         | $\ge 90\%$ (4/5) | **100% Pass** |
| **Total Evaluation**                                    | **Q01–Q30 (30)** | **30 / 30 (100%)**   | **30 / 30 (100%)**    | **30 / 30 (100%)**   | **$\ge 90\%$**   | **100% Pass** |

### Post-Recovery Accuracy Comparison

- **Condition A (Original Schema Baseline Accuracy)**: $30 / 30 = \mathbf{100.0\%}$
- **Condition B (Renames Post-Recovery Accuracy)**: $30 / 30 = \mathbf{100.0\%}$ ($\ge 90\%$ target met; $0.0\%$ delta from baseline, well within the $\le 5.0\%$ threshold)
- **Condition C (Splits Post-Recovery Accuracy)**: $30 / 30 = \mathbf{100.0\%}$ ($\ge 90\%$ target met; $0.0\%$ delta from baseline, well within the $\le 5.0\%$ threshold)
- **Zero Permission Expansion**: No restricted data accessed across evolved schemas.

---

## Ten negative controls (incompatible / ambiguous / permission-loss)

Ten negative controls verify fail-safe behavior when compatibility cannot be proven or policy boundaries are threatened:

| Control ID | Description                           | Threat / Anomaly Mode                                         | Expected Terminal State | Actual Outcome                                 | Status   |
| :--------- | :------------------------------------ | :------------------------------------------------------------ | :---------------------- | :--------------------------------------------- | :------- |
| **NC01**   | Incompatible unit/type change         | Metric column evolved to non-numeric percentage string        | `abstained`             | `abstained` ("incompatible")                   | **Pass** |
| **NC02**   | Ambiguous candidate targets           | Multiple candidate tables observed without approved mapping   | `needs_clarification`   | `needs_clarification` ("Multiple plausible")   | **Pass** |
| **NC03**   | Dropped analytical table              | Required table dropped without replacement mapping            | `abstained`             | `abstained` ("dropped without replacement")    | **Pass** |
| **NC04**   | Dropped analytical column             | Required column dropped or renamed without mapping            | `abstained`             | `abstained` ("dropped or renamed")             | **Pass** |
| **NC05**   | Revoked schema permission             | Schema removed from `allowedSchemas`                          | `blocked_by_policy`     | `blocked_by_policy` ("denied by policy")       | **Pass** |
| **NC06**   | Viewer arbitrary SQL drill-down       | Viewer attempting unaggregated query on evolved schema        | `blocked_by_policy`     | `blocked_by_policy` ("restricted to approved") | **Pass** |
| **NC07**   | Differencing attack across partitions | Exclusion predicate (`!= 1`) to isolate individual record     | `blocked_by_policy`     | `blocked_by_policy` ("Differencing attack")    | **Pass** |
| **NC08**   | Small-cohort isolation query          | Small-cohort filter (`org_k IN (1, 2)`) with aggregation      | `blocked_by_policy`     | `blocked_by_policy` ("Small-cohort aggregate") | **Pass** |
| **NC09**   | Cross-tenant evolved schema access    | Tenant attempting access to another workspace's connection    | HTTP 404 Not Found      | HTTP 404 Not Found                             | **Pass** |
| **NC10**   | Formula injection in schema mapping   | Malicious SQL payload in mapping target (`org; DROP TABLE--`) | Rejected by validation  | Throws `Invalid identifier`                    | **Pass** |

---

## Exit gate G8 verification checklist

| Criterion | Requirement                                                                    | Evidence                                                                                        | Status   |
| :-------- | :----------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :------- |
| **G8.1**  | Paired original/rename/split and negative-control cases under frozen artifacts | 30 questions evaluated across Conditions A, B, C plus 10 negative controls with zero retraining | **PASS** |
| **G8.2**  | Post-recovery accuracy $\ge 90\%$ and $\le 5\%$ drop from baseline             | Condition B: 100.0%, Condition C: 100.0% (both $\ge 90\%$ and $0.0\%$ delta from baseline)      | **PASS** |
| **G8.3**  | Negative controls safely clarify, abstain, or block                            | All 10 negative controls terminate in expected non-answer or error states                       | **PASS** |
| **G8.4**  | Zero permission expansion, data leakage, or source mutation                    | Evaluated against all 3 role policies; cross-tenant and restricted schemas blocked              | **PASS** |
| **G8.5**  | Recovery obeys time/row/byte/query budgets                                     | Single bounded recovery attempt; stage timeouts and repair caps strictly preserved              | **PASS** |
| **G8.6**  | Impact preview, reviewed mapping, and recipe invalidation pass Q01–Q10 checks  | OpenAPI 3.1.0 synchronized, frontend client updated, vitest test suite 100% passing             | **PASS** |

## Conclusion

Phase 8 meets all entry, functional, evaluation, and security conditions for Gate G8. All tests pass with zero lint errors, zero type errors, and zero regressions across backend and frontend suites.
