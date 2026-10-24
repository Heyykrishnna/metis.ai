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
- Inspect computed rows, source hashes, methods, definitions and limitations. File calculations do not claim to have executed SQL.
- Use search (`Cmd/Ctrl+K`), responsive navigation, question drafts, bookmarks and refinement. Browser storage contains at most 100 question metadata records; result rows are restored from the authenticated API rather than stored in localStorage.
- Inspect actual API, storage and inference readiness. The proxy keeps the workspace credential on the server, bounds requests and returns safe dependency errors.

Limits are 10 files per uploader, 5 MiB per file, 10,000 records and 100 columns. Preview limits are 100 rows or 20,000 text characters. Numeric calculations use all validated table records. Text inference currently searches the first 18,000 characters. See [the integration guide](../docs/engineering/integration.md) for runtime boundaries, local authentication and verification.

## Component provenance

The controlled composer and file dropzone are compact adaptations of DevClub UI's [AI Input](https://ui.devclubxnst.com/components/ai-input) and [File Dropzone](https://ui.devclubxnst.com/components/file-dropzone), retrieved from their public registries on 24 October 2026. They retain the controlled prompt/attachment layout, local picker/drag-drop pattern, file-size formatting, and upload presentation, adapted to Metis with native controls and CSS transitions. Voice capture, model menus, remote imagery, simulated upload progress, gradients, GSAP, and Motion are omitted. The original MIT notice is preserved in [licenses/devclub-ui.txt](licenses/devclub-ui.txt).

## Verification

```sh
npm run check
npm audit --omit=dev
```

`check` runs lint, formatting, TypeScript, unit tests, API contract consistency, and the production build. The live file check in the integration guide exercises actual Neon persistence and local inference. Browser verification is reported separately from automated checks.
