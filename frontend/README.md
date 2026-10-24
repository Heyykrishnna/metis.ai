# Metis workspace frontend

A light, responsive analytics workspace with locally hosted Poppins, calm sage and lavender accents, and sticky workspace navigation. From the repository root, use Node 24 or later:

```sh
npm run setup
npm run dev
```

Open `http://127.0.0.1:3005`. The server-side proxy connects to the API at `http://127.0.0.1:3001`. Setup synchronizes `METIS_API_URL` and `METIS_BACKEND_TOKEN` in ignored `frontend/.env.local`. Database credentials stay in the backend. Never use `NEXT_PUBLIC_*` for secrets.

## Available behavior

- Upload or drop CSV, JSON, TXT and Markdown files; preview tables and inspect columns and missing values.
- Persist original file bytes with Brotli compression in Neon. Reload stored files and their saved answers after refresh, download byte-exact originals, or delete a file and its associated analyses.
- Select a file and ask a question. Table operations include structure, counts, numeric aggregates, left/right skewness, grouping and filters. Text answers are verified source excerpts. Unsupported requests produce clarification or abstention; inference outages are visible.
- Inspect structured file answers, supporting row previews, readable calculation definitions and source evidence. Clarifications show the actual unresolved question, selectable source fields and a labeled reply form.
- Open the Schema tab to inspect all source fields or run a full-file schema profile with observed types, nullability and empty counts. Data-coverage bars reflect measured nonempty rows/cells; they are not model confidence probabilities.
- Inspect computed rows, source hashes, methods, definitions and limitations. File calculations do not claim to have executed SQL.
- Use search (`Cmd/Ctrl+K`), responsive navigation, question drafts, bookmarks and refinement. Browser storage contains at most 100 question metadata records; result rows are restored from the authenticated API rather than stored in localStorage.
- Follow reported analysis stages in a collapsible thinking panel. Completed answers retain their result summary and available evidence; clarification, policy blocks and failures remain distinct. File requests show their pending activity until the response arrives. No intermediate file stages or model reasoning are simulated.
- Searching orbs indicate pending file uploads, analysis requests and workspace synchronization. They stop when the corresponding request completes or fails. File inputs are disabled during upload, and the drawer and panel motions respect reduced motion preferences.
- Inspect actual API, storage and inference readiness. The proxy keeps the workspace credential on the server, bounds requests and returns safe dependency errors.

Limits are 10 files per uploader, 5 MiB per file, 10,000 records and 100 columns. Preview limits are 100 rows or 20,000 text characters. Numeric calculations use all validated table records. Text inference currently searches the first 18,000 characters. See [the integration guide](../docs/engineering/integration.md) for runtime boundaries, local authentication and verification.

## Component provenance

The composer, selection tools, code viewer, file dropzone and activity panel adapt DevClub UI's [AI Input](https://ui.devclubxnst.com/components/ai-input), [Selection AI Editor](https://ui.devclubxnst.com/components/editor), [Code Block](https://ui.devclubxnst.com/components/code-block), [File Dropzone](https://ui.devclubxnst.com/components/file-dropzone), [Thinking Panel](https://ui.devclubxnst.com/components/thinking-panel) and [Orb](https://ui.devclubxnst.com/components/orb). Official registry sources were inspected on 24–25 October 2026. The original MIT notice is retained in [licenses/devclub-ui.txt](licenses/devclub-ui.txt).

The adaptations use native React controls and the existing lightweight SVG icon set. The prompt editor keeps real controlled text, grows with the question, supports Enter/Shift+Enter and provides selection-based keep/quote actions. The SQL viewer preserves executed SQL, adds line numbers, wrapping and clipboard feedback, and escapes source text through React. It does not execute edited queries or show reference IDs as SQL. The upstream editor's simulated AI responses and remote sources are omitted; submitted questions use the existing real backend integration.

The thinking panel retains the upstream expandable activity timeline and source chip pattern. The upload area adapts the upstream fanned-file interaction. Both share Motion's spring settings (stiffness 340, damping 28, mass 0.8). DevClub's dynamically loaded `thinking-orbs` component renders the searching animation with a sage tint during real pending work; reduced motion pauses it. No synthetic upload percentages or staged delays are introduced. Poppins is self-hosted through `next/font/local`; its SIL Open Font License is retained in [licenses/poppins.txt](licenses/poppins.txt).

The visual direction follows the supplied Dribbble video: white surfaces, quiet separators, compact outline icons, a centered composer and consistent spacing. Sage selection states, lavender activity and pastel template icons provide calm color. Sparkle decorations and the database connection banner are omitted; connections remain manageable through the page toolbar. The sticky header stays above content and below navigation drawers and dialogs. Shared spacing variables align the header and content across desktop and mobile. Overview summaries use the loaded workspace history; no sample dashboard metrics are introduced.

## Verification

```sh
npm run check
npm audit --omit=dev
```

`check` runs lint, formatting, TypeScript, unit tests, API contract consistency, and the production build. The live file check in the integration guide exercises actual Neon persistence and local inference. Browser verification is reported separately from automated checks.
