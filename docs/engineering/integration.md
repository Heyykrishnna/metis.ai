# Local application integration

## Start

Use Node 24 or later and the checked-in npm lockfiles. Existing Neon values remain in ignored `backend/.env`; neither the browser nor a new connection dialog needs those credentials.

```bash
npm run setup
npm run dev
```

`setup` installs both applications, generates a local workspace token if absent, synchronizes the server-only frontend environment and applies migrations. `dev` verifies Neon schema synchronization, starts local Ollama if needed, reuses an authenticated API when already running and starts Next.js. Defaults: workspace `http://127.0.0.1:3005`, API `http://127.0.0.1:3001`, inference `http://127.0.0.1:11434`. Override frontend/API ports with `WEB_PORT` and `API_PORT`. Occupied ports fail explicitly. Ctrl+C stops only processes owned by the launcher.

Ollama must contain `qwen2.5-coder:7b-instruct-q4_K_M`, as pinned in `inference/model.json`. On a new machine, install Ollama and run `ollama pull qwen2.5-coder:7b-instruct-q4_K_M`. The launcher does not silently download model weights. This machine's installed model has been exercised against a real question.

## File-to-answer flow

1. Upload CSV, JSON array-of-objects, TXT or Markdown using the workspace.
2. The API validates UTF-8, names, structure and limits, compresses original bytes using Node's Brotli implementation at quality 5, and saves a `bytea` payload in Neon with SHA-256, original/compressed sizes and parsed metadata. No filesystem upload cache is required. Compression may increase the size of very small files.
3. The UI selects the saved file. Questions go through the same-origin Next.js proxy to the authenticated API. No separate SQL connection is needed.
4. Structure, record counts, named sums/averages/minimums/maximums, grouping and left/right skew questions work without a model. For other table questions, local Qwen returns a constrained operation plan. Unsupported statistics such as median, mode or normality abstain even if inference is down. The server validates columns and executes supported filtering, grouping, counts, full-file schema profiling, numeric aggregates and Fisher-Pearson sample skewness over the complete validated file. The model does not supply calculated totals.
5. Text answers contain only passages confirmed to exist in the original document. Missing evidence leads to abstention. Unsupported operations or ambiguous metrics require clarification.
6. Neon stores the question, source hash, method, model identifier and result. Refresh restores files and the latest 50 file analyses. Browser storage retains only draft/bookmark metadata. Clearing browser history does not delete server history. Removing a file cascades deletion of its file analyses.
7. Original downloads decompress the stored bytes and verify exact size and SHA-256 before returning them. Evidence exports include the result and computation definition; file calculations have no fabricated SQL reference.

## Boundaries

- Upload limits: 10 files per uploader, 5 MiB each, 10,000 records, 100 columns. Previews show at most 100 rows or 20,000 text characters. Table computations process all validated rows; returned row/group previews are bounded at 100.
- Numeric aggregates use 50-digit decimal arithmetic and return decimal strings. Empty metric cells are counted and excluded. Nonnumeric metrics require clarification. Skewness uses the Fisher-Pearson sample coefficient (Excel SKEW / pandas default) and answers left-skewed, right-skewed or approximately symmetric; it needs at least three numeric observations. Currency formatting, correlation, causal inference, joins across uploads and arbitrary multistep analyses are unsupported.
- Text inference currently examines at most the first 18,000 characters. Its limitation is shown with the result. Relevant content beyond that window may require a smaller document.
- A valid plan can still misinterpret a question. Definitions, filters, excluded rows and source evidence must be inspected; this integration does not establish universal model accuracy.
- This is a single local workspace. The generated token authenticates a fixed local owner; it is not an organization login or a substitute for production identity management. Keep the UI and API bound to loopback. File queries also enforce workspace/uploader scoping.
- Brotli is lossless compression, not encryption. Neon transport security comes from the existing PostgreSQL connection settings. Bounded source samples are sent to the configured inference endpoint.
- External database SQL analysis needs a configured read-only analytical adapter. A saved connection profile alone does not configure that adapter. Without one, the application returns a safe refusal rather than sample-school answers. The Neon metadata owner is not used as an analytical reader.
- File history retrieval is bounded to 50 recent records; older records remain stored until their file is deleted. No timed file retention policy is configured.

## Verify

```bash
npm run check
node scripts/test-database.mjs
npm --prefix backend run db:check
npm --prefix backend run test:files:live
npm run test:web:live
```

The disposable PostgreSQL runner requires `initdb`, `pg_ctl`, `createdb`, `pg_dump` and `pg_restore` on PATH, or `PG_BINDIR` pointing to their directory. It never targets Neon. The live file check deliberately targets the existing configured Neon database, uploads its own uniquely named synthetic file, verifies byte-exact restoration, full-file overview, grouped decimal totals, API restart persistence and invalid-token denial, and removes only that file. This is an integration check, not a broad question-accuracy benchmark.

See `backend/src/files`, `backend/src/routes/files.ts`, `frontend/src/lib/file-client.ts` and `frontend/src/components/workspace.tsx` for the implementation. The additive `0001` migration creates `file_assets` and `file_analyses` without rewriting existing tables.

The live web check calls the running frontend proxy without a browser credential, verifies upload, byte-exact download, grouped totals and persisted history through Next.js → Fastify → Neon, and cleans up its synthetic file. Start `npm run dev` first; use `WEB_URL` to target a different local frontend address.

## Answer presentation and clarification

File answers show supporting result rows, human-readable calculation/filter definitions, and separate source evidence. Schema requests run deterministic profiling over the complete matching file and report observed integer, decimal, boolean, text, mixed or empty fields and observed nullability. These are not enforced database types or inferred keys. Plans with a nonempty clarification cannot become confirmed answers; older contradictory records are flagged in the UI without altering their stored history. Unsupported statistical requests cannot be answered with an unrelated structure summary.

Data-coverage bars are calculated from included/excluded metric rows or nonempty/empty profile cells. They describe data completeness, not calibrated model confidence or a probability of correctness. Unmeasured coverage is explicitly labeled.
