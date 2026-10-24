# Metis workspace frontend

A light, responsive analytics workspace with no gradients. From the repository root, use Node 24 or later:

```sh
npm run setup
npm run dev
```

Open `http://127.0.0.1:3005`. The server-side proxy connects to the API at `http://127.0.0.1:3001`. Setup synchronizes `METIS_API_URL` and `METIS_BACKEND_TOKEN` in ignored `frontend/.env.local`. Database credentials stay in the backend. Never use `NEXT_PUBLIC_*` for secrets.

## Available behavior

- Upload or drop CSV, JSON, TXT and Markdown files; preview tables and inspect columns and missing values.
- Persist original file bytes with Brotli compression in Neon. Reload stored files and their saved answers after refresh, download byte-exact originals, or delete a file and its associated analyses.
- Select a file and ask a question. Table operations include structure, counts, numeric aggregates, grouping and filters. Text answers are verified source excerpts. Unsupported requests produce clarification or abstention; inference outages are visible.
- Inspect structured file answers, supporting row previews, readable calculation definitions and source evidence. Clarifications show the actual unresolved question, selectable source fields and a labeled reply form.
- Open the Schema tab to inspect all source fields or run a full-file schema profile with observed types, nullability and empty counts. Data-coverage bars reflect measured nonempty rows/cells; they are not model confidence probabilities.
- Inspect computed rows, source hashes, methods, definitions and limitations. File calculations do not claim to have executed SQL.
- Use search (`Cmd/Ctrl+K`), responsive navigation, question drafts, bookmarks and refinement. Browser storage contains at most 100 question metadata records; result rows are restored from the authenticated API rather than stored in localStorage.
- Inspect actual API, storage and inference readiness. The proxy keeps the workspace credential on the server, bounds requests and returns safe dependency errors.

Limits are 10 files per uploader, 5 MiB per file, 10,000 records and 100 columns. Preview limits are 100 rows or 20,000 text characters. Numeric calculations use all validated table records. Text inference currently searches the first 18,000 characters. See [the integration guide](../docs/engineering/integration.md) for runtime boundaries, local authentication and verification.

## Component provenance

The composer, selection tools, code viewer and file dropzone adapt DevClub UI's [AI Input](https://ui.devclubxnst.com/components/ai-input), [Selection AI Editor](https://ui.devclubxnst.com/components/editor), [Code Block](https://ui.devclubxnst.com/components/code-block) and [File Dropzone](https://ui.devclubxnst.com/components/file-dropzone). Official registry sources were inspected on 24 October 2026. The original MIT notice is retained in [licenses/devclub-ui.txt](licenses/devclub-ui.txt).

The adaptations use native React controls, the existing lightweight SVG icon set and CSS transitions. The prompt editor keeps real controlled text, grows with the question, supports Enter/Shift+Enter and provides selection-based keep/quote actions. The SQL viewer preserves executed SQL, adds line numbers, wrapping and clipboard feedback, and escapes source text through React. It does not execute edited queries or show reference IDs as SQL. The upstream editor's simulated AI responses, remote sources, decorative orbs and animation dependencies are omitted; submitted questions use the existing real backend integration.

The visual direction follows the supplied Orva video: white surfaces, neutral gray separators, compact outline icons, a centered composer, quiet typography and consistent spacing. Overview summaries use the loaded workspace history; no sample dashboard metrics are introduced.

## Verification

```sh
npm run check
npm audit --omit=dev
```

`check` runs lint, formatting, TypeScript, unit tests, API contract consistency, and the production build. The live file check in the integration guide exercises actual Neon persistence and local inference. Browser verification is reported separately from automated checks.
