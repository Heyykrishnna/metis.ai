# Phase 4 validation evidence

Execution date: 24 October 2026. Implementation branch: `builds/project-foundation`. Scope: Phase 4 Distinctive analytical features (Schema Constellation, Dirty-Value Radar, Counterfactual Comparison, Query Cost Passport, Saved Analysis Recipes, multi-tenant isolation, and real PostgreSQL database integration; frontend directory untouched per explicit user instruction).

## Baseline and delivery summary

Phase 4 delivers the five distinctive analytical features defined in PRD sections 5-6 and `project-phases/phase-04-distinctive-features.md`, with complete type safety, tenant isolation, and verifiable evidence:

- **4A. Schema Constellation (`src/analysis/constellation.ts`, `src/routes/connections.ts`)**:
  - Generates accessible graph topology for discovered schemas within configured bounds (up to 50 tables, 100 edges).
  - Explicitly distinguishes declared foreign keys (`confidence: "declared"`, `isAuthoritative: true`) from column-name join inferences (`confidence: "inferred_name"`, `isAuthoritative: false`).
  - Edge metadata explicitly notes that join inferences are candidate joins, not authoritative proof, preventing unjustified confidence on ambiguous or renamed schemas.
  - Endpoints enforce tenant isolation (`GET /v1/connections/:connectionId/constellation`), returning 404 on mismatched workspaces.

- **4B. Dirty-Value Radar (`src/analysis/radar.ts`, `src/routes/analyses.ts`)**:
  - Deterministically scans result and sample datasets for data quality anomalies across three primary categories: sentinel strings (`"N/A"`, `"unknown"`, `"-"`, `""`, `"null"`), ambiguous calendar dates where day and month are both $\le 12$ (e.g. `01/02/2025`), and duplicate entity-period observations violating grain.
  - Generates structured anomaly reports with rule ID, observed pattern, sample count, sampling method, prevalence estimate, and proposed remediation mapping.
  - Tracks review lifecycle states (`unreviewed`, `accepted`, `rejected`) via `POST /v1/runs/:runId/dirty-radar/reviews/:anomalyId`.
  - Unreviewed mappings never mutate underlying tables or silently rewrite queries, preserving full data provenance.

- **4C. Counterfactual Comparison (`src/analysis/counterfactual.ts`, `src/routes/analyses.ts`)**:
  - Runs explicitly defined alternative domain interpretations (calendar year Jan-Dec vs academic year Sep-Aug) side by side under identical policy and budget bounds.
  - Evaluates predicate differences, entity grain, row counts, denominator coverage, and metric deltas.
  - Detects material semantic discrepancies (`isMaterialDifference: true`) and surfaces transparent stakeholder clarification recommendations rather than picking an unevidenced preferred answer.

- **4D. Query Cost Passport (`src/analysis/passport.ts`, `src/routes/analyses.ts`)**:
  - Provides rigorous, auditable cost and resource accounting for every completed analysis run.
  - Explicitly distinguishes measured runtime telemetry (`isMeasured: true` for execution duration, row counts, returned bytes, and model calls) from advisory planner estimates (`isEstimated: true` for optimizer cost, estimated rows, and plan types).
  - Documents foundation policy limits (statement timeout, maximum row count, model call quota) and certifies that advisory plan estimates cannot relax policy gates or override safety limits.

- **4E. Saved Analysis Recipes (`src/routes/recipes.ts`, `src/contracts/features.ts`)**:
  - Enables analysts to save, inspect, list, and re-execute reviewed analysis recipes (`POST /v1/recipes`, `GET /v1/recipes`, `GET /v1/recipes/:recipeId`, `POST /v1/recipes/:recipeId/execute`).
  - Persists metric definition, grain, timeframe policy, null/exclusion rules, SQL text, owner, version, and approval status (`draft`, `approved`, `archived`) to memory and PostgreSQL `metric_definitions` table.
  - On replay (`POST /v1/recipes/:recipeId/execute`), recipes re-authorize the target connection and validate SQL against currently allowed schemas. Queries targeting unauthorized or private schemas (`private_data.restricted`) are immediately rejected with 403 Forbidden. Revoked connections return 404.

## Final check record

| Check                       | Result | Evidence                                                                                                                                                                                       |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend quality             | Passed | `npm --prefix backend run check`: 0 oxlint warnings/errors, Prettier format check, strict TypeScript compilation, 128 Vitest unit tests across 26 files, OpenAPI drift check, production build |
| Real DB integration         | Passed | `node scripts/test-database.mjs`: 20 integration tests on fresh PostgreSQL cluster and 20 tests after dump/restore                                                                             |
| HTTP startup smoke          | Passed | `node scripts/smoke.mjs`: built API health and production web app on ephemeral localhost ports                                                                                                 |
| Fixture and model integrity | Passed | `node scripts/check-foundation.mjs`: verified model parameters, frozen fixture digests, held-out splits, and 41 local links                                                                    |
| Skills synchronization      | Passed | `node scripts/skills.mjs`: 38 canonical aliases and 103 file hashes verified                                                                                                                   |
| Dependency security         | Passed | `npm --prefix backend audit`: 0 vulnerabilities                                                                                                                                                |

## Phase 4 verification suite coverage

| Suite                              | Observable expected behavior                                                                                                          | Result                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 4A. Schema Constellation           | Distinguishes declared foreign keys from candidate join inferences; marks candidate joins as unauthoritative; bounds graph size       | Verified (`test/distinctive-features.test.ts`) |
| 4B. Dirty-Value Radar              | Scans sentinels, ambiguous dates, and duplicate grain; manages review states (`unreviewed`, `accepted`, `rejected`)                   | Verified (`test/distinctive-features.test.ts`) |
| 4C. Counterfactual Comparison      | Side-by-side calendar vs academic year evaluation; flags material differences and advises user clarification                          | Verified (`test/distinctive-features.test.ts`) |
| 4D. Query Cost Passport            | Distinguishes measured runtime stats from advisory plan estimates; confirms advisory estimates cannot relax policy limits             | Verified (`test/distinctive-features.test.ts`) |
| 4E. Saved Analysis Recipes         | Saves, retrieves, and executes recipes; re-authorizes connection and blocks queries targeting unauthorized schemas with 403           | Verified (`test/distinctive-features.test.ts`) |
| Real PostgreSQL Recipe Integration | Persists recipes into PostgreSQL `metric_definitions` table; executes verified recipes against disposable PostgreSQL database         | Verified (`test/database.integration.test.ts`) |
| Cross-Tenant Isolation             | Endpoints for Constellation, Radar, Counterfactuals, Passport, and Recipes return 404 when requested by unauthorized workspace tokens | Verified (`test/distinctive-features.test.ts`) |

## Known boundaries

Per user explicit instruction, the `frontend/` directory was preserved without modification. All backend distinctive features, schema engines, data quality scanners, counterfactual analyzers, cost passports, recipe lifecycles, and database integration suites are fully operational, tested, and verified.
