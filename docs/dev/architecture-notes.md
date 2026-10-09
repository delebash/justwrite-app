# Architecture notes

Detail behind the invariants in `CLAUDE.md`. Open the section you need; none of this has to be
loaded to start work. The "why it's built this way" narrative lives in `docs/dev/ARCHITECTURE.md`;
per-task history lives in `docs/plans/*`.

## Layout

- A Quasar app (the family layout, the kit's `docs/app-structure.md` §Q, since 2026-10-08): `quasar.config.js` is the one build config; the Vue 3 + Pinia renderer lives in `src/`, laid out as Quasar's CLI creates a project (since 2026-10-09): boot files `src/boot/i18n.js` and `src/boot/jw.js` (no `main.js`), `src/App.vue` a bare `<router-view>`, the chrome `src/layouts/MainLayout.vue` (Quasar's q-layout: the title bar in its header, the sidebar as its drawer — Quasar's mobile drawer at phone width), the screens `src/pages/` (each a q-page as tall as the window under the header, `pageFill` from the kit), the stylesheets `src/css/`.
- `src-electron/electron-main.js` — the desktop app (Quasar's Electron mode): the kit's shared Electron main module (`runDesktopApp` from `@delebash/llm-runner/shell`) with this app's settings (id `justwrite`, port 17495, the 400 ms close hold). No logic lives there. It replaced `src-tauri/` on 2026-10-08, then `electron/main.js` with the Quasar move. `src-capacitor/` is the phone app (Quasar's Capacitor mode).
- `server/` — the server, its own package (`justwrite-server`, an npm workspace; the desktop app installs it): `src/` (Node, Hono, SQLite through the kit's SQL helper; `serve.js` is the entry; `editor/` the editor schema the renderer imports as `justwrite-server/editor/…`), `samples/` (the bundled tutorial book). It replaced the Python `server/justwrite_server/` the same day — a port with the same routes and database, checked by a route diff against the Python server.
- `dist/` — Quasar's output: `dist/spa/` (the browser build the headless server serves at `/`), `dist/electron/` (`UnPackaged/` and the installer in `Packaged/`; the window loads the UI from `app://justwrite`).

The renderer dev server is fixed at `http://localhost:1420`; `quasar.config.js` (`devServer.port`)
and `src/boot/jw.js` (`devPorts`) reference that port — keep them in lock-step.

## Calling the shell (Electron ↔ renderer)

`src/services/native.js` holds every call into the desktop shell, as ordinary module exports:
`pickDirectory`, `pickFile`, `saveFile`, `storageGetRoot`, `storageRelocate`, `setKeepRunning`,
`setTrayLabels`, the openers `openUrl` / `openPath` (handed to the kit in the same one-line
`external: { open: openUrl, openPath }` all three apps pass), `onShellEvent` (the tray's pushes),
`shellVersion` (About's runtime line) and `hasShell()`. Each calls the kit's preload object
`window.appShell` (`invoke(command, args)`), which only this file reads; the handlers live in the
kit's `server/src/shell/main.js`. Every native dialog is a shell command rather than a renderer
API — the family shape, so a dialog cannot appear at two different layers across the three apps.
**Commands throw** — callers use `try`/`catch`, and a cancelled dialog resolves `null`.

- **"Is a desktop shell there?"** — `hasShell()` asks the kit's `isDesktopShell()`, ONE
  implementation for the family, and checks `window.appShell`. Never test for a `window.<app>`
  global (`check-family.js` fails any renderer that installs one).
- The renderer talks to its own server with plain `fetch` (the kit's origin-aware transport); the
  server's CORS and CSRF guard allow the window's origin `app://justwrite`.

History: `native.js` replaced `tauri-bridge.js` (a `window.justwrite` global) on 2026-08-14, and
moved from Tauri's `invoke` to the Electron bridge on 2026-10-08. The legacy file-based
`window.justwrite.project` save/open was removed 2026-07-13 — per-project backup and transfer live in
Settings → Backups via `services/bookTransfer.js`, and persistence is server-owned.

The **data root** is a portable, user-settable folder holding ALL app data (projects DB, images, AI
engine, models, logs); `storageRelocate` moves it and restarts the app (Chromium's own files live
under it too). The shell and the server resolve it through the kit's one ladder
(`platform/data_paths.js`); in a checkout it is `<repo>/data`.

Outside the shell (`npm run dev:spa` in a browser), project data still persists to the server via
`projectApi`, and images upload via `imageStore` (inline data-URL fallback only when the server is
unreachable). Gate desktop-only affordances on `hasShell()` so the browser path keeps working.

Adding a new shell command: add it to the kit (`COMMANDS` and its handler in
`server/src/shell/main.js`, and the list in `preload.js`), then one thin export in
`src/services/native.js` — one place names each command string.

The window's Content-Security-Policy is the kit's default plus `https:` images (`cspAdd` in
`src-electron/electron-main.js`: a manuscript can hold an image pasted from the web), and the
family `<meta>` CSP in `index.html` (app-structure §Q.5) applies too.

## Stores

All in `src/stores/`:

- `project` — every entity (chapters, characters and extras, locations, objects, groups, notes, strands, worldbuilding, architecture), images, events, trash, and chapter bodies. Owns persistence and undo/redo. This single monolithic store is JustWrite's sanctioned exception to per-domain stores, because it owns snapshot-based undo/redo across all entities.
- `ui` — sidebar, selections, toasts.
- `ai` — provider registry (OpenAI-compatible endpoints).
- `sessions` — per-day word count log feeding Home and Analysis Pace.

### Persistence

Each project snapshot goes to the **server** (SQLite via `/v1/projects`) through
`services/projectApi.js` (`putSnapshot`/`getSnapshot`); the registry is derived from the projects
table. The active project id lives in the settings document (`services/settings.js` → `/v1/settings`).
There is no client-side IndexedDB — the renderer holds no durable data.

### Soft deletes

`removeXxx` actions move the entity to `state.trash[kind]`. Recovery is ⌘Z on the owner's page
(deletes are tracked history actions) plus `TrashView` restore / permanent delete. No delete toast —
the QC-37 toast law (2026-07-09): the row visibly leaves, and undo never rides an ephemeral surface.

### Undo/redo — page-related, snapshot-based, in-memory only

Full design: `docs/plans/archive/2026-07-10-page-related-undo.md` (#235). History is partitioned into 13
disjoint data domains (`DOMAIN_SLICES`); every recorded action maps to exactly ONE domain
(`ACTION_DOMAINS`; image actions take the owner kind). `this._record(actionId)` deep-clones only
that domain's slices onto `_past[domain]` (trash captured per-kind, images per-entity-key; limit
`HISTORY_LIMIT` per domain), and `undoFor` / `redoFor` / `canUndoFor(domains)` — driven by
`route.meta.undoDomains` in the router — pop the newest entry among the current page's domains.

The four per-entity AI artifacts (`chapterCritiques`, `chapterReaderKnowledge`,
`chapterMultiReader`, `characterAudits`) are top-level keyed maps OUTSIDE the history domains (the
server wire shape matches — `book_io` decomposes and recomposes them as maps); readers get them via
the `allChapters` decoration and the `*For` getters.

**Adding a mutating action:** add it to `ACTION_DOMAINS` — an unmapped action warns and records
nothing. If it is keystroke-grain, add it to `COALESCED_ACTIONS` (`setChapterBody`,
`setChapterTitle`, inline title edits and friends coalesce into one history entry per ~600 ms
quiescent window) or the undo buffer fills instantly.

`_past` and `_future` are wrapped in `markRaw()` so Vue does not make snapshots reactive.

Durable rollback does NOT come from history — it comes from the server-owned disk autosave
(2026-07-13, moved off Rust: the server writes a rotating `<data-root>/projects/<id>.autosave.json`,
or the `autosaveDir` setting, via `POST /v1/projects/{id}/autosave`; the renderer flushes on a 10 s
debounce plus `keepalive` on close, and it runs in browser-dev too) plus manual Export backup.

**The editor-echo law (2026-07-10):** a store-driven content sync must never bounce back into
`_record`. RichEditor's `modelValue` watch sets content with the TipTap-v3 options form
`{ emitUpdate: false }` — a v2-style boolean second argument is silently ignored and emits — and
`applyStitchedChapter` / `setSceneBody` skip both write and record when the incoming content is
identical. Otherwise a ⌘Z revert under an open editor re-records and clears the just-armed redo.

## AI providers — current state

**The legacy gateway is GONE.** This was once documented as current and misled an audit
(corrected 2026-07-06). ALL LLM traffic goes through the shared `just-llm-runner` dispatch mounted
by `installLlm` on the server (`server/src/app.js`):

- feature runs and streaming via `/v1/ai/run` and `/v1/ai/stream`, called through the kit's `runAiFeature` / `runAiFeatureStream` (`@delebash/llm-ui`; JW's old local `services/aiFeature.js` and `aiErrors.js` moved into the kit 2026-07-06, Decision 22), consumed by `services/writerAI.js`, `services/analysis/*` and `services/rag/*`;
- embeddings via `/v1/ai/embeddings` through the kit's `embedTexts` / `ensureEmbeddingReady` (JW's `services/embedApi.js` moved into the kit at C5, 2026-07-06; `services/rag/*` import from `@delebash/llm-ui`);
- routing via `/v1/ai/routing` (`services/routingBackend.js` — JW's read-only pre-mount boot cache);
- the provider LIST via `services/providerBackend.js` (read-only boot cache; provider CRUD lives in the kit's AiModelsArea → ProviderForm).

There is no `services/openai-compat.js` and no `/v1/llm/{providerId}/*` route on the server. The
string `"openai-compat"` in code is a PROVIDER-TYPE id, not a gateway. No TTS here — audio lives in
JustVoice.

AI routing is **one-source** (2026-07-15): each action points at ONE engine preset
(`feature_preset_refs`, seeded full) which owns the model and every tunable including
think/reasoning; the action keeps only its prompt text and JSON contract; one `default_preset_id`
RunnerSetting catches unassigned customs. The current model lives in
`just-llm-runner/docs/plans/archive/2026-07-15-preset-one-source-rewrite.md`. The 2026-07-14 plan's Unit-2
reasoning BACKEND stands; its task-tier language is superseded. The whole-system open-work tracker
is `docs/dev/TASKS.md`, which points at
`just-llm-runner/docs/plans/archive/2026-07-06-outstanding-master-plan.md` (§A–J) for detail.

## Manuscript export

`services/export/manuscript.js` builds a normalized manuscript model feeding three lazy-loaded
adapters: `pdf.js` (pdfmake — TOC, part covers, optional cover image), `docx.js` (live TOC that
auto-refreshes on open) and `epub.js` (hand-rolled EPUB 3 with nav doc, OPF spine, cover xhtml,
JSZip-packaged). The cover image (Settings → Project) is stored as an `imageStore` record on
`project.project.coverImage`.

## Image storage

`services/imageStore.js` is the renderer-side facade. Images upload to the JustWrite server
(`POST /v1/images`) and are referenced by id (rendered via `<img src="…/v1/images/{id}">`); when the
server is unreachable it falls back to inline data-URL records stored in the project snapshot
(itself server/SQLite-backed). The legacy Tauri-FS on-disk path was removed — pre-P4 file records no
longer resolve.

**Caveat:** uploads send image bytes as base64 JSON (`dataBase64`). Fine for reference photos; if
uploads grow into the multi-MB range, switch to a binary or streaming endpoint.

## Routing and shortcuts

Hash router (`createWebHashHistory`) — see `router/index.js` for the full route list, including each
route's `meta.undoDomains` (the #235 page-related-undo map). Global shortcuts: ⌘F focuses search,
⌘\ toggles sidebar, ⌘Z / ⌘⇧Z (or ⌘Y) page-scoped undo/redo — inert on routes with no `undoDomains`,
and disabled inside the rich editor, where TipTap owns its own history.

## i18n detail

`src/i18n/locales/en.json` is the world; the renderer reads it through vue-i18n
(`i18n/index.js`, Composition mode, `globalInjection` so `$t` works in templates without an import).
Coverage is being brought up view by view, so expect raw strings still in unconverted files.

```bash
npm run i18n:lint      # @intlify no-raw-text over src/**/*.vue — finds English still
                       # hard-coded in templates. "warn" during the sweep; flips to "error" once
                       # coverage completes. Config: eslint.i18n.config.js (i18n rules ONLY —
                       # Biome remains the style linter).
npm run i18n:report    # vue-i18n-extract: keys referenced but missing from the catalog, and
                       # catalog keys nobody references. MISSING must always be zero.
npm run i18n:pseudo    # writes locales/qps.json — accented +30%-padded English, to expose
                       # unconverted strings and overflow. NOT registered in the app yet
                       # (i18n/index.js lists locales explicitly); the switcher phase wires it.
```

Rules when adding or converting a string:

- **Reuse before minting.** Search `en.json` for the exact English first — `common.*` (Save, Cancel, Delete, Close…), `nav.*` and the `sidebar.actions.*` dialog cluster already carry a lot of shared vocabulary. Never create a second key for the same English.
- **Semantic keys, namespaced by section** — `settings.<section>.<semanticLeaf>`, e.g. `settings.appearance.editorFontSizeLabel`. The leaf says what the string IS, never the first few words of the sentence (`settings.thisFreesSizeOf` is the wrong shape).
- **Runtime values are interpolations**, never concatenation: `$t('k', { n })` with `{n}` in the value.
- **`v-for="t in …"` shadows the setup `t`.** Inside such a loop use `$t`, never the destructured `t` — `build:spa` will not catch the shadowing.
- **Locale-dependent constant arrays must be `computed()`**, or they freeze at module load and never re-translate when the language changes (see `SECTIONS` in `SettingsView.vue`).
- **Not translated:** thrown `Error` messages, console/debug strings, data values, ids, enum strings, and DB-seeded text (seeded defaults stay English in v1).
- **Kit strings are a separate, later batch** — `@delebash/llm-ui` does not take vue-i18n as a peer dep yet. Don't convert kit components from here.

**Adding a language is dropping `<code>.json` into `i18n/locales/`.** Nothing else — no import,
no list, no label. `i18n/index.js` discovers files with `import.meta.glob` and names each one
with `Intl.DisplayNames`, so the picker shows "Español" and "Français" without a table anywhere.
`i18nLocaleDiscovery.test.js` reads that file as text and fails if a locale code or a label is
ever hardcoded back into it.

Translation tooling for the locale files lives OUTSIDE this repo. The Node tool
(`just-ai-help`) was retired 2026-08-04 — GitHub repo archived, the local
`just-ai-help/` project folder deleted (`9886174`) — and its successor (Python until 2026-10-08, JavaScript since) is
**`../just_ai_i18n_docgen`** (same one-resolver design: committed per-project
`config.json` / `<lang>.accepted.json` / `<lang>.notes.json`, machine state
gitignored). The principle stands: `locales/` holds only locale files (app assets
that ship); the reviewer artefacts are the TOOL's memory, and deleting the tool's
folder leaves the app building and running in every language it has.

## Test harness detail

The gates (2026-10-08, after the move to Node): renderer vitest, `build:spa`, the server's vitest
(`npm run test:server`, about 10 s on Electron's Node), the kit's own suite
(`cd ../just-llm-runner/server && npm test`), the headless smoke (`npm run smoke`) and the e2e over
the desktop app (`npm test`). Tests were never the bottleneck; don't skip them.

Harnesses in the repo:

- **vitest** (`vitest.config.js`, node environment) — pure-JS service and composable tests such as the embedApi ensure-cache suite. Complements, never replaces, the headless smoke.
- **Playwright headless renderer smoke** (`tests/smoke/headless-smoke.js`, plus `tests/smoke/book-smoke.js`) — THE renderer gate; `npm run smoke` boots it on a snapshot of your data. See `CLAUDE.md` for the `findChrome()` rule.
- **`e2e/` desktop harness** (Playwright's Electron driver launching the app on the built UI and your real data) — `npm test` runs the smoke suite, `npm run screenshots` the marketing shots.
- **The server** — `server/tests/*.test.js` (vitest; the port of the Python suite, plus the seed-data comparison) and Biome.

## Additions from the 2026-08-04 code-first audit

**Stores list correction:** `src/stores/` also holds `versions.js` (named chapter
versions — the store behind Version History; `versionDiff.js` renders the diffs).
**Shell calls:** `pickFile` is used by the import and backup-restore flows (the list
above is current as of 2026-10-08).

**Chat sessions (storage model).** Sessions are STORAGE-ONLY — per-request LLM
cost is unchanged; the server keeps a list per project (`api/chat_api.js`:
list/rename/delete). Ids are minted client-side; the title derives from the first
question and a manual rename overrides it permanently; empty sessions are never
persisted; a monotonic hydration token guards scope switches (book ↔ character)
so a stale response can't hydrate the wrong session.

**Sweep draft protocol (v1).** The entity sweep persists RAW per-chapter results
server-side (`api/sweep_draft_api.js`) rather than the merged aggregate — resume
re-merges with the same `mergeProposals`, so a merge-logic fix benefits old
drafts. A chapter re-runs when pending, failed, or its `textHash` changed.

**Editor extension inventory.** `RichEditor.vue` defines four local TipTap
extensions — `fontSize`, `indent`, `pageBreak`, `sceneBoundary` — plus the
`comment` mark; `editorToolbars.js` defines three toolbar profiles (FULL / DOC /
SLIM). The editor-echo law above governs all of them.

**Server lifecycle.** The kit's shell starts the server every launch in an Electron
`utilityProcess`: a stale listener on the port is evicted first, the server says
`ready` over the parent port, and closing sends `stop` (8 s, then a kill) after the
400 ms close hold. Server reuse across launches is VETOED by the user (recorded in
TASKS' standing rulings).

**Analysis service map.** `src/services/analysis/` holds 19 modules; the catalog
features they back: styleMetrics (style table), critique + critiqueStructure,
entityExtraction + entitySweep + sweepDraft, voiceDrift, plotHoles,
reverseOutline, beatSheet, marketingPack, foreshadowingScan, readerKnowledge,
multiReader, characterAudit, characterProfile/Voice, relationshipArc, sensory,
unstuck, linkBackfill (deterministic, no LLM), briefing/recap composers.

**i18n status note.** The runtime language SWITCHER SHIPPED (Appearance section;
`es.json` live); the tooling notes above predate that and read as future tense.
