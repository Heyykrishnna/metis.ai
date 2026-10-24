# Metis workspace frontend

A light, responsive analytics workspace with no gradients. Run with Node 24 or later:

```sh
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. The status route checks the backend at `http://127.0.0.1:3001`. Set the server-only `METIS_API_URL` in `frontend/.env.local` to change this address. Never put database credentials or secrets in `NEXT_PUBLIC_*` variables.

## Available behavior

- Responsive navigation, workspace overview, keyboard search (`Cmd/Ctrl+K`), templates, and session settings.
- CSV and JSON table previews, TXT/Markdown previews, source selection, schema field lists, and deterministic format/missing-value checks.
- File picker and drag/drop, per-file error messages, duplicate detection, removal, and bounded parsing: 10 files, 5 MB each, 10,000 records and 100 columns per table. Previews show at most 100 rows or 20,000 text characters. File values are treated as text, never HTML. CSV blank lines are ignored; JSON must be an array of objects. Column values are retained as text rather than inferred database types.
- Question drafts, bookmarks, refinement, filtering, plain-text question export, and clearing local history. The most recent 100 drafts and their source filenames persist in browser storage. Files remain in session memory and disappear on refresh; a draft's source name does not reconnect a file.
- Actual backend health status through a server-side route with a bounded request timeout and safe errors.

## Integration boundary

The backend currently exposes `/health`. Connection management, authentication, analysis execution, inference, SQL/results, verified analytical evidence, feedback, and database discovery are not implemented APIs. The frontend explicitly identifies questions as unexecuted drafts and presents unavailable states for those services. It never fabricates answers, claims, query results, or a database connection. Neon metadata credentials stay on the backend. Local file checks are separate from verified analytical claims.

## Component provenance

The controlled composer and file dropzone are compact adaptations of DevClub UI's [AI Input](https://ui.devclubxnst.com/components/ai-input) and [File Dropzone](https://ui.devclubxnst.com/components/file-dropzone), retrieved from their public registries on 24 October 2026. They retain the controlled prompt/attachment layout, local picker/drag-drop pattern, file-size formatting, and upload presentation, adapted to Metis with native controls and CSS transitions. Voice capture, model menus, remote imagery, simulated upload progress, gradients, GSAP, and Motion are omitted. The original MIT notice is preserved in [licenses/devclub-ui.txt](licenses/devclub-ui.txt).

## Verification

```sh
npm run check
npm audit --omit=dev
```

`check` runs lint, formatting, TypeScript, unit tests, API contract consistency, and the production build. Browser checks cover navigation, prompt drafts/bookmarks, file import/preview/validation, keyboard dialogs, and responsive layout.
