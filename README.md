# [metis.ai](http://metis.ai)

An evidence-grounded AI data analyst for messy, unfamiliar databases.

Business data is often locked behind undocumented schemas, inconsistent values, and SQL. Dashboards only answer questions that were designed in advance. Generic text-to-SQL systems can return answers that look right and are not.

metis.ai turns a natural-language question into a validated analytical result. It discovers relevant schema, interprets imperfect data, generates safe SQL, verifies the output, and shows the evidence behind every claim. When the evidence is insufficient, it asks a focused question or abstains.

## Promise

- Ask analytical questions in natural language without exploring every table by hand.
- Work with unfamiliar schemas and messy values through discovery, not hardcoded assumptions.
- Receive answers backed by executable SQL, source references, calculations, assumptions, and checks.
- Keep the database safe with least-privilege access and independent query policy.
- Know when the system cannot answer reliably, and what is missing.

## How an answer is shown

Every completed analysis is an inspectable record, not a chat reply:

- **Answer** — the claim, derived only from executed results
- **Definition** — metric, grain, time window, and comparison used
- **Evidence** — SQL, source fields, row counts, and exclusions
- **Checks** — join fanout, grain, null coverage, and related invariants
- **Limitations** — what was missing, blocked, or left unresolved

If a definition is ambiguous, metis.ai asks one focused question instead of guessing. If verification fails, it abstains.

## Principles

**Evidence before fluency.** A well-written answer is not a correct answer.

**Least privilege.** The model proposes queries. Policy and database permissions decide what can run.

**Explicit semantics.** Metric definitions, date windows, grain, null handling, and exclusions stay visible.

**Bounded autonomy.** Every stage has a budget, a retry limit, a timeout, and a terminal state.

## Stack

| Layer                | Choice                                  |
| -------------------- | --------------------------------------- |
| Frontend             | Next.js, React, TypeScript              |
| API                  | Node.js LTS, TypeScript, Fastify        |
| Validation           | TypeBox                                 |
| Application metadata | Neon PostgreSQL, Drizzle                |
| Analytical SQL       | Connector adapters and a SQL AST parser |
| Logging              | Pino                                    |
| Tests                | Vitest                                  |

Inference runs as a separate service using a compliant open-weight model of at most 8B parameters. A job queue is not part of the core path; add one only when a long-running workflow needs durable workers.

## Getting started

Requires Node.js 24 or later, npm and Ollama. The existing ignored `backend/.env` supplies Neon configuration; no additional database connection is needed for uploaded-file questions.

```bash
npm run setup
npm run dev
```

Setup installs the locked dependencies, synchronizes a server-only local workspace credential and applies additive database migrations. Development startup verifies the Neon schema, reuses the configured API when healthy, starts Ollama when needed and runs the frontend. The default addresses are `http://127.0.0.1:3005` for the workspace and `http://127.0.0.1:3001` for the API. Use `WEB_PORT` and `API_PORT` to choose other ports.

The configured local Qwen model must be installed in Ollama; see [inference configuration](inference/README.md). On this machine it has been installed and tested. See [the integration guide](docs/engineering/integration.md) for the supported workflow, limits and verification commands.

## Working file workflow

Upload CSV, JSON, TXT or Markdown, select it as the source and ask a question. Files persist in Neon as Brotli-compressed original bytes with SHA-256 integrity checks. Table questions use validated plans and server-side calculations over all validated records. Answers, evidence and history survive refresh. Unsupported or ambiguous questions receive a clarification or abstention. External SQL analysis requires a separately configured read-only analytical adapter; the metadata owner connection is never reused for arbitrary analytical queries.

## Validation

```bash
npm run check
node scripts/test-database.mjs
npm --prefix backend run test:files:live
```

`check` runs lint, formatting, TypeScript, behavior tests, contract consistency and production builds for both applications. The database runner uses a disposable local PostgreSQL database and tests backup/restore. The live file check creates a synthetic file in the configured Neon database, verifies exact download, model-planned calculations and restart persistence, then deletes its own file. It requires the configured local model to be running.

Earlier phase reports describe their scoped fixtures and evaluations; they are not a guarantee that arbitrary questions can be answered. [The foundation guide](docs/engineering/foundation.md) retains isolated fixture setup and recovery procedures.

The local delivery plan remains in the Git-ignored `project-phases/` folder. Canonical skills under `.agents/skills` are tracked; `skills/` contains ignored aliases. Do not use fixture administrator credentials for analytical queries.

Application metadata now uses Neon. Keep pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED` in ignored backend environment configuration; use `npm --prefix backend run db:check` to verify schema synchronization. See [Neon connection details](docs/engineering/foundation.md#neon-metadata-connection).
