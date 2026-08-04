# Architecture notes

Detail behind the invariants in `CLAUDE.md`. Open the section you need; none of this has to be
loaded to start work. The "why it's built this way" narrative lives in `docs/dev/ARCHITECTURE.md`;
per-task history lives in `docs/plans/*`.

## Layout

- The REPO ROOT is the Vite root (`index.html` at top level; the Vue 3 + Pinia renderer lives in `src/`). This line once pointed at a `src/renderer/` nesting that no longer exists.
- `src-tauri/` — Rust crate. `main.rs` calls `justwrite_lib::run()`; all `#[tauri::command]`s live in `lib.rs`.
- `dist/` — Vite output, consumed by Tauri as `frontendDist`.

The Rust crate is built by the Tauri CLI; Vite never sees it. The renderer dev server is fixed at
`http://localhost:1420` and `tauri.conf.json` references that URL — keep them in lock-step.

## IPC bridge (Tauri ↔ renderer)

`src/services/tauri-bridge.js` is a side-effect import in `main.js`. It detects
`window.__TAURI_INTERNALS__` and populates `window.justwrite`:

```
window.justwrite.shell   = { pickDirectory, openExternal, saveFile }
window.justwrite.storage = { getRoot, relocate }   // the portable data root (Rust storage_*)
```

These mirror Rust commands in `src-tauri/src/lib.rs` one-for-one (`pick_directory`, `open_external`,
`shell_save_file`, `storage_get_root`, `storage_relocate`). The legacy file-based
`window.justwrite.project` save/open and the `project_save`/`project_open` Rust commands were
removed 2026-07-13 — per-project backup and transfer live in Settings → Backups via
`services/bookTransfer.js`, and persistence is server-owned.

The **data root** is a portable, user-settable folder holding ALL app data (projects DB, images, AI
engine, models, logs); `storage_relocate` moves it and respawns the server (see
`docs/plans/2026-07-02-portable-data-root-and-engine-install.md`).

When `window.justwrite` is undefined (plain `vite dev` in a browser), project data still persists to
the server via `projectApi`, and images upload via `imageStore` (inline data-URL fallback only when
the server is unreachable). **This is why renderer code must never call `invoke()` directly** — go
through `window.justwrite` so the browser-only path keeps working.

Adding a new Tauri command:

1. Add the `#[tauri::command]` function in `src-tauri/src/lib.rs` and register it in `invoke_handler![]`.
2. Add a matching method to `window.justwrite.*` in `tauri-bridge.js`.
3. If it needs a new plugin permission, update `src-tauri/capabilities/default.json` (currently grants `core:default`, `dialog:default`, `fs:default`).

The fs plugin scope allows `$APPDATA/images/*` and `$APPDATA/projects/*`. Saving project files
elsewhere requires widening the scope in `tauri.conf.json`.

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

Full design: `docs/plans/2026-07-10-page-related-undo.md` (#235). History is partitioned into 13
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
(2026-07-13, moved off Rust: the Python server writes a rotating `<data-root>/projects/<id>.autosave.json`,
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
by `install_llm` on the Python `server/`:

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
`just-llm-runner/docs/plans/2026-07-15-preset-one-source-rewrite.md`. The 2026-07-14 plan's Unit-2
reasoning BACKEND stands; its task-tier language is superseded. The whole-system open-work tracker
is `docs/dev/TASKS.md`, which points at
`just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md` (§A–J) for detail.

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
- **`v-for="t in …"` shadows the setup `t`.** Inside such a loop use `$t`, never the destructured `t` — `build:vite` will not catch the shadowing.
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
`just-ai-help/` project folder deleted (`9886174`) — and its Python successor is
**`../just_ai_i18n_docgen`** (same one-resolver design: committed per-project
`config.json` / `<lang>.accepted.json` / `<lang>.notes.json`, machine state
gitignored). The principle stands: `locales/` holds only locale files (app assets
that ship); the reviewer artefacts are the TOOL's memory, and deleting the tool's
folder leaves the app building and running in every language it has.

## Test harness detail

Measured 2026-07-15. The five gates total roughly 2.6 minutes — vitest 3 s, `build:vite` 2 s, server
pytest 46 s, runner pytest 45 s, headless smoke 61 s (3 s boot plus 58 s driving 25 routes). Cargo
check and Biome/ruff are not in that figure. Tests were never the bottleneck; don't skip them.

The server suite went from 147 s to 46 s by running on all cores with nothing skipped. **The full
reasoning, the statement census, the safety argument and the rejected alternative live in ONE
place** — the `[tool.pytest.ini_options]` comment in `server/pyproject.toml`. Read it there before
optimising or "fixing" the parallelism; a duplicated count elsewhere is how a wrong one propagated
once already. Debug serially with `pytest -n 0`.

The shared **runner** has no venv of its own — `llm_runner` is editable-installed into THIS
project's venv, so its suite runs on the same interpreter, from the runner repo:

```bash
cd ../just-llm-runner && ../justwrite-app/.venv/Scripts/python.exe -m pytest -q
```

Harnesses in the repo:

- **vitest** (`vitest.config.js`, node environment) — pure-JS service and composable tests such as the embedApi ensure-cache and modelMeta suites. Complements, never replaces, the headless smoke.
- **Playwright headless renderer smoke** (`tests/smoke/headless-smoke.js`, plus `tests/smoke/book-smoke.js`) — THE renderer gate. See `CLAUDE.md` for how to run it and the `findChrome()` rule.
- **`e2e/` WebDriver harness** (`tauri-driver` + `msedgedriver` driving the built desktop binary) — `npm test` runs the smoke suite, `npm run screenshots` the marketing shots. Both need a compiled `.exe` plus Edge/WebView2, so this is the packaged-desktop check, not a quick dev gate.
- **Python `server/`** — pytest plus ruff (server-mode migration: `docs/plans/archive/2026-06-18-jw-server-migration.md`).
