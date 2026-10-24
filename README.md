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
| Application metadata | PostgreSQL, Drizzle                     |
| Analytical SQL       | Connector adapters and a SQL AST parser |
| Logging              | Pino                                    |
| Tests                | Vitest                                  |


Inference runs as a separate service using a compliant open-weight model of at most 8B parameters. A job queue is not part of the core path; add one only when a long-running workflow needs durable workers.

## Getting started

Requires Node.js 24 or later.

```bash
# API
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
# Web app
cd frontend
npm install
npm run dev
```

The API listens on `http://127.0.0.1:3001`. The web app listens on `http://localhost:3000`.

```bash
cd backend && npm run test:run
```



## Status

This repository is the foundation for metis.ai. The product is specified; the first delivery target is a single reliable vertical slice: connect a database, inspect schema, ask a question, execute safe SQL, and return an evidence-backed answer or a clear refusal.