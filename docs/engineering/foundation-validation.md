# Foundation validation evidence

Execution date: 24 October 2026. Implementation branch: `builds/project-foundation`. Starting point: `145d97d1e117c2c177c6ae834e5aff6e3cc54398`. The foundation gate is evaluated against the implementation scope below; this report does not certify later product phases.

## Baseline

- Backend typecheck, three existing tests and production build passed.
- Frontend lint passed; the original build failed because Google Fonts could not be fetched. The implementation replaces the network fonts with system fonts.
- Docker is installed but its daemon is unavailable. Real database checks use an isolated local PostgreSQL 18.6 cluster.
- The repository's broad `skills` ignore rule also excluded `.agents/skills`. It now ignores only root aliases, allowing the restored canonical collection to be tracked.

## Final check record

| Check                        | Result                 | Evidence                                                                                                                                                           |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clean-copy installs          | Passed                 | Fresh `npm --prefix backend ci` and `npm --prefix frontend ci`; both audits reported zero vulnerabilities                                                          |
| Backend quality              | Passed                 | `npm --prefix backend run check`: lint, formatting, strict types, 39 unit/contract tests, OpenAPI drift check, production build                                    |
| Frontend quality             | Passed                 | `npm --prefix frontend run check`: ESLint, formatting, route/type generation, strict types, four client tests, generated-type drift check, production build        |
| Real DB and recovery         | Passed                 | `node scripts/test-database.mjs`: 15 integration cases on initial database and 15 after dump/restore; cluster stopped/removed                                      |
| HTTP startup                 | Passed                 | `node scripts/smoke.mjs`: built API health and production web app on temporary localhost ports; both stopped                                                       |
| Fixture/model/docs integrity | Passed                 | `node scripts/check-foundation.mjs`: pinned local-only model configuration, fixture hashes, distinct held-out cases and existing relative documentation references |
| Skills synchronization       | Passed                 | `node scripts/skills.mjs`: 38 canonical aliases, 103 hashes; all 103 resources also compared with shared source                                                    |
| Compose syntax               | Passed                 | `docker compose config --quiet` with generated local configuration                                                                                                 |
| Environment preservation     | Passed                 | Initial setup generated mode-0600 files; a second setup attempt failed safely with both file hashes unchanged                                                      |
| Dependency security          | Passed                 | Both application audits report zero vulnerabilities after the scoped development esbuild override                                                                  |
| Diff, ignore and secrets     | Passed                 | `git diff --check`; staged paths reviewed; local environments and phase plans remain ignored                                                                       |
| Container startup            | Not run                | Docker daemon unavailable; native PostgreSQL and HTTP startup tested instead                                                                                       |
| Live inference/hardware      | Deferred by user scope | Configuration only; no weight download, runtime execution or model-quality claim                                                                                   |
| GitHub-hosted CI             | Not run                | Workflow configured; no push/run performed by this task                                                                                                            |

The clean-copy check uses a separate temporary checkout without original dependencies, build output, environment files or skill aliases. It installs both lockfiles, recreates aliases/environment, checks/builds both apps, initializes disposable PostgreSQL, applies migrations, resets fixtures, tests permissions and recovery, and starts/stops both built apps. Changed contracts/role tests are rerun after review fixes.

## Standards

The independent standards reviewer found one issue: test roles were cluster-global and could affect an existing role on a shared server. The fix uses unique integration role names, records which roles were created, and cleans up only those roles. Fixture setup uses per-database names, validates ownership/privilege flags, preserves existing credentials, and performs role provisioning transactionally. The reviewer confirmed the finding resolved; no remaining actionable finding within that scope.

## Spec

The independent specification reviewer found two issues: early-terminal evidence could not represent missing execution artifacts, and the bundle omitted assumptions. The fix distinguishes answered/non-answer bundles, represents absent artifacts as explicit nulls, preserves question/assumptions/available plan, and regenerates OpenAPI/client types. Five regression cases cover these behaviors. The reviewer confirmed both findings resolved.

Review result: Standards 1 finding resolved; Spec 2 findings resolved. Neither axis has an unresolved reported finding. G0 is complete for the foundation scope, with model configuration only as explicitly requested. G1-G5 remain unverified.

## Known boundaries

The user authorized model configuration only: hardware/inference smoke checks are deliberately deferred to Phase 1. Authentication, encrypted secret-store integration, query policy/execution, deterministic verification services, retention enforcement, and a product analyst UI remain later-phase work. Database ownership constraints and shape contracts do not replace those services.

The Docker Compose configuration is supplied, but container startup cannot be certified without a running Docker daemon. PostgreSQL initialization/migration/permissions and repeatable local application startup are validated separately. GitHub CI status has not been inspected by this session. No deployment or push was performed by this session. Clean installation still reports upstream deprecation notices for Drizzle’s legacy loader chain and the existing frontend ESLint 9 line; these are not audit vulnerabilities and were not hidden or bypassed. Track compatible upstream migrations during maintenance.

## Neon synchronization update

The user subsequently selected Neon as application metadata storage. Its pooled URL and derived direct migration URL are in ignored `backend/.env`, mode 0600; no credential is in tracked source or frontend configuration. The read-only preflight found zero public tables. The additive migration then applied successfully and both direct migration verification and pooled runtime verification reported 13 tables, 92 columns and one exact matching migration hash. The API initialized against Neon, answered its health request and closed its pool successfully.

The metadata driver now uses node-postgres with certificate verification and channel binding enabled; analytical fixture tooling retains Postgres.js. Runtime uses the pooler, migrations use the direct endpoint. New regressions cover TLS configuration, downgrade rejection, schema drift, API connection lifecycle and migration URL validation. Disposable tests remain local and never reset the Neon database. Compose metadata is now an explicit optional profile; default environment setup expects a supplied Neon URL, with `--local-metadata` reserved for isolated offline development.

The Neon-specific reviews additionally caught hostname-normalization and local-mode migration-target issues, plus a stale network-boundary statement. All were fixed, regression-tested and independently confirmed resolved. Across both review rounds: Standards 2 findings resolved; Spec 4 findings resolved.
