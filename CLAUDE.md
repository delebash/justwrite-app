# JustWrite — agent instructions

**A writing app (novels / manuscripts). Tauri 2 + Vue 3 renderer + Python (FastAPI + SQLite) server.** Writing-only — all audio (Studio, TTS, audiobook export) lives in the separate **JustVoice** app, which JustWrite drives over an HTTP contract (JW hands JV the prose; JV does its own casting + narration). Do **not** reintroduce TTS, speaker analysis, voice casting, or audio rendering here.

## Read first (every session)

- **Global rules:** `~/.claude/CLAUDE.md` — the two PRIORITY rules + RULES #0–8 + the shared Vue 3 + Tauri 2 app standard. They govern; this file does NOT restate them.
- **`MORNING_RECAP.md`** (this repo) — current + future tasks and the live list of active plan docs. Read it before acting; don't re-litigate decisions recorded there.
- The memory index (auto-loaded) — open a specific memory file when the task touches it.

## Commands

```bash
npm install            # JS deps (first run only)
npm run dev            # Tauri dev — boots Vite + native window. First run compiles the Rust crate (slow); subsequent runs are fast.
npm run build          # Packaged app for the current OS
npm run dev:vite       # Renderer only, in a plain browser tab (no Tauri APIs — project data still uses the server; images fall back to data-URLs)
npm run build:vite     # Renderer build only (Tauri invokes this via `beforeBuildCommand`)
```

Configured tooling (an earlier note here wrongly claimed "none" — verify against `package.json`, don't trust this line blindly): **Biome** (`biome.json` — lint + format; match the file's existing style, don't bulk-reformat unrelated code), a **vitest unit harness** (`vitest.config.js`, node environment — `npm run test:unit`; pure-JS service/composable tests like the embedApi ensure-cache + modelMeta suites; it complements, never replaces, the headless smoke below), an **`e2e/`** WebDriver harness (`tauri-driver` + `msedgedriver` driving the **built desktop binary** — `npm test` runs the smoke suite, `npm run screenshots` the marketing shots; both need a compiled `.exe` + Edge/WebView2, so it is **not** a headless or quick dev gate), and a **Playwright headless renderer smoke** (`scripts/headless-smoke.mjs`, plus `scripts/book-smoke.mjs`). **The headless smoke IS the renderer gate and it RUNS in this dev container** (a recurring wrong claim is that there's "no renderer gate / it's not runnable here" — false; run it). To run: boot `python -m justwrite_server.cli serve --port 17495` (background) + `npm run dev:vite` (:1420, background), then `node scripts/headless-smoke.mjs` — it drives headless Chromium over every hash route and asserts ZERO JS errors. Chromium is prebuilt — the binary is at `/opt/pw-browsers/chromium-<ver>/chrome-linux/chrome` (**a versioned dir**, e.g. `chromium-1194`; **NOT** `/opt/pw-browsers/chromium/`). The smoke's `findChrome()` auto-locates it; **any new Playwright script must reuse that `findChrome()` (copy it from `scripts/headless-smoke.mjs`) or set `JW_CHROME` — never hardcode the path** (a hardcoded `/opt/pw-browsers/chromium/...` silently falls over to the missing headless-shell build and the launch fails). **Run it to verify any renderer/GUI change.** Compile checks are `npm run build:vite` + `cd src-tauri && cargo check`; the **`e2e/`** WebDriver harness (`tauri-driver` + `msedgedriver` driving the **built `.exe`** — `npm test`, `npm run screenshots`; needs a compiled binary + Edge/WebView2) is the packaged-desktop check, not the quick gate. The Python **`server/`** (server-mode migration — see `docs/plans/2026-06-18-jw-server-migration.md`) uses **pytest + ruff**.

The Rust crate is built by the Tauri CLI; Vite never sees it. The renderer dev server is fixed at `http://localhost:1420` and `tauri.conf.json` references that URL — keep them in lock-step.

## Shared app standard + JustWrite specifics

JustWrite follows the shared **Vue 3 + Tauri 2 app standard** in the global
`~/.claude/CLAUDE.md` (folder layout · `tokens.css`+`styles.css` · vue-router ·
origin-aware `services/serverApi.js` + `VITE_SERVER_URL` · per-domain Pinia
stores · `services/appearance.js` · Biome · server-side seed · connection-gate
boot). Don't restate it here — this section is JustWrite-specific only. Sibling
app: JustVoice. When a surface exists in both, they must match unless a
documented reason below says otherwise.

**JustWrite's justified differences:** dev port **1420**; a single monolithic
`project` Pinia store — it owns snapshot-based undo/redo across all entities, the
one sanctioned exception to per-domain stores.

> **AI/LLM stack is shared** — `just-llm-runner` (Python) + `@delebash/llm-ui`
> (Vue), consumed by both apps; only TTS and each app's feature catalog differ.
> The current cutover state lives in `MORNING_RECAP.md`; OPEN AI-stack work lives in
> `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md` (THE one ledger,
> sections A–I), and the **current AI-routing / preset model** is
> `just-llm-runner/docs/plans/2026-07-02-preset-model-a-resets.md`
> (Plan A — the task owns the preset; 2-tier cascade: task preset → global default).
> The old roadmap (`2026-06-28-MASTER-PLAN.md`, bannered fully historical 2026-07-08)
> and the other `docs/plans/*` are history/evidence. Not here.

## Architecture

### Layout

- `src/renderer/` — Vite root for the Vue 3 + Pinia renderer. Vite's `root` is `src/renderer/`, not the repo root.
- `src-tauri/` — Rust crate. `main.rs` calls `justwrite_lib::run()`; all `#[tauri::command]`s live in `lib.rs`.
- `dist/` — Vite output, consumed by Tauri as `frontendDist`.

### IPC bridge (Tauri ↔ renderer)

`src/renderer/src/services/tauri-bridge.js` is a side-effect import in `main.js`. It detects `window.__TAURI_INTERNALS__` and populates `window.justwrite` with:

```
window.justwrite.project = { save, open }
window.justwrite.shell   = { pickDirectory, openExternal, saveFile }
window.justwrite.storage = { getRoot, relocate }   // the portable data root (Rust storage_*)
```

These mirror Rust commands in `src-tauri/src/lib.rs` one-for-one (`project_save`, `project_open`, `pick_directory`, `storage_get_root`, `storage_relocate`). The **data root** is a portable, user-settable folder holding ALL app data (projects DB + images + AI engine + models + logs); `storage_relocate` moves it and respawns the server (see `docs/plans/2026-07-02-portable-data-root-and-engine-install.md`). When `window.justwrite` is undefined (plain `vite dev` in a browser), project data still persists to the server via `projectApi`, and images upload to the server via `imageStore` (inline data-URL fallback only when the server is unreachable). **Do not call `invoke()` from views or stores — go through `window.justwrite`** so the browser-only path keeps working.

When adding a new Tauri command:
1. Add the `#[tauri::command]` function in `src-tauri/src/lib.rs` and register it in the `invoke_handler![]` list.
2. Add a matching method to `window.justwrite.*` in `tauri-bridge.js`.
3. If it needs a new plugin permission, update `src-tauri/capabilities/default.json` (currently grants `core:default`, `dialog:default`, `fs:default`).


### State (Pinia stores)

All in `src/renderer/src/stores/`:

- `project` — every entity (chapters, characters + extras, locations, objects, groups, notes, strands, worldbuilding, architecture), images, events, trash, and chapter bodies. Owns persistence and undo/redo.
- `ui` — sidebar, selections, toasts.
- `ai` — provider registry (OpenAI-compatible endpoints).
- `sessions` — per-day word count log feeding Home + Analysis Pace.

**Project store invariants worth knowing before mutating it:**

- Persists each project snapshot to the **server** (SQLite via `/v1/projects`) through `services/projectApi.js` (`putSnapshot`/`getSnapshot`; the registry is derived from the projects table). The active project id lives in the settings document (`services/settings.js` → `/v1/settings`). No client-side IndexedDB store — the renderer holds no durable data.
- Deletes are **soft** — `removeXxx` actions move the entity to `state.trash[kind]`; recovery is ⌘Z on the owner's page (deletes are tracked history actions) and `TrashView` restore / permanent delete. No delete toast (the QC-37 toast law, 2026-07-09: the row visibly leaves, and undo never rides an ephemeral surface).
- Undo/redo is **PAGE-RELATED, snapshot-based, in-memory only** (#235, 2026-07-10 — full design: `docs/plans/2026-07-10-page-related-undo.md`): history is partitioned into 13 disjoint data domains (`DOMAIN_SLICES`); every recorded action maps to exactly ONE domain (`ACTION_DOMAINS`; image actions take the owner kind), `this._record(actionId)` deep-clones only that domain's slices onto `_past[domain]` (trash captured per-kind, images per-entity-key; limit `HISTORY_LIMIT` per domain), and `undoFor/redoFor/canUndoFor(domains)` — driven by `route.meta.undoDomains` in the router — pop the newest entry among the current page's domains. The four per-entity AI artifacts (`chapterCritiques`/`chapterReaderKnowledge`/`chapterMultiReader`/`characterAudits`) are top-level keyed maps OUTSIDE the history domains (server wire shape matches — book_io decomposes/recomposes them as maps); readers get them via the `allChapters` decoration + `*For` getters. When adding a mutating action, add it to `ACTION_DOMAINS` (an unmapped action warns and records nothing). Durable rollback comes from the **server-owned disk autosave** (2026-07-13: moved off Rust — the Python server writes a rotating `<data-root>/projects/<id>.autosave.json`, or the `autosaveDir` setting, via `POST /v1/projects/{id}/autosave`; the renderer flushes on a 10s debounce + `keepalive` on close, and it now runs in browser-dev too) + manual Export backup — not from history. **The editor-echo law (2026-07-10):** a store-driven content sync must never bounce back into `_record` — RichEditor's modelValue watch sets content with the TipTap-v3 options form `{ emitUpdate: false }` (a v2-style boolean second arg is silently ignored and emits), and `applyStitchedChapter`/`setSceneBody` skip write + record when the incoming content is identical (otherwise a ⌘Z revert under an open editor re-records and clears the just-armed redo).
- Keystroke-grain actions (in `COALESCED_ACTIONS`: `setChapterBody`, `setChapterTitle`, inline title edits, etc.) coalesce into one history entry per ~600ms quiescent window. When adding a new high-frequency mutator, add it to `COALESCED_ACTIONS` or the undo buffer fills instantly.
- `_past` and `_future` are wrapped in `markRaw()` so Vue does not make snapshots reactive.

### AI providers

**The legacy gateway is GONE (this section previously described it as current —
corrected 2026-07-06 after it misled an audit).** ALL LLM traffic goes through the
shared `just-llm-runner` dispatch mounted by `install_llm` on the Python `server/`:
feature runs + streaming via `/v1/ai/run` + `/v1/ai/stream` — called through the
KIT's `runAiFeature`/`runAiFeatureStream` (`@delebash/llm-ui`; the old JW-local
`services/aiFeature.js`/`aiErrors.js` moved into the kit 2026-07-06, Decision 22),
consumed by `services/writerAI.js`, `services/analysis/*`, and `services/rag/*` —
embeddings via `/v1/ai/embeddings` through the KIT's `embedTexts`/`ensureEmbeddingReady`
(JW's `services/embedApi.js` moved into the kit at C5, 2026-07-06; `services/rag/*`
import from `@delebash/llm-ui`), routing via `/v1/ai/routing`
(`services/routingBackend.js` — JW's read-only pre-mount boot cache), and the provider
LIST via `services/providerBackend.js` (read-only boot cache; provider CRUD lives in
the kit's AiModelsArea → ProviderForm). There is no
`services/openai-compat.js` and no `/v1/llm/{providerId}/*` route on the server; the
string `"openai-compat"` appearing in code is a PROVIDER-TYPE id, not a gateway.
No TTS here — audio lives in JustVoice.

### Manuscript export

`services/export/manuscript.js` builds a normalized manuscript model that feeds three lazy-loaded adapters: `pdf.js` (pdfmake — TOC + part covers + optional cover image), `docx.js` (live TOC that auto-refreshes on open), `epub.js` (hand-rolled EPUB 3 with nav doc, OPF spine, cover xhtml, JSZip-packaged). Cover image (set in Settings → Project) is stored as an `imageStore` record on `project.project.coverImage`.

### Image storage

`services/imageStore.js` is the renderer-side facade. Images are uploaded to the JustWrite server (`POST /v1/images`) and referenced by id (rendered via `<img src="…/v1/images/{id}">`); when the server is unreachable it falls back to inline data-URL records stored in the project snapshot (itself server/SQLite-backed). The legacy Tauri-FS on-disk path was removed — pre-P4 file records no longer resolve.

**Caveat:** uploads send image bytes as base64 JSON (`dataBase64`). Fine for reference photos; if uploads grow to multi-MB range, switch to a binary/streaming endpoint.

### Routing & shortcuts

Hash router (`createWebHashHistory`) — see `router/index.js` for the full route list, including each route's `meta.undoDomains` (the #235 page-related-undo map). Global shortcuts: ⌘F focuses search, ⌘\ toggles sidebar, ⌘Z / ⌘⇧Z (or ⌘Y) page-scoped undo/redo (inert on routes with no `undoDomains`; disabled inside the rich editor — TipTap owns its own history there).

## Conventions

- **The `@renderer` alias** resolves to `src/renderer/src/` (see `vite.config.js`). Prefer relative imports for files in the same directory, `@renderer/...` for cross-tree imports.
- **Don't bypass the bridge.** Renderer code calling `invoke()` directly will break the browser-only dev path.
- **Bundle icons** live in `src-tauri/icons/` (full set: `icon.icns`, `icon.ico`, desktop PNGs, plus Windows Store / android / ios). If you regenerate them, the canonical command is `cargo tauri icon <source.png>` from `src-tauri/`.
- **fs plugin scope** allows `$APPDATA/images/*` and `$APPDATA/projects/*`. Saving project files elsewhere requires widening the scope in `tauri.conf.json`.

## UI components — the shared `@delebash/llm-ui` kit

**All UI primitives + shells now come from the shared kit `@delebash/llm-ui`
(Vite alias → `../just-llm-runner/ui/src`). `src/renderer/src/components/ui/`
is EMPTY** — the `Jw*` forks were fully converged into the kit `Ui*` family
(2026-06-24, matching JustVoice). Import primitives from the kit; never re-fork
them locally. The kit owns the design contract: a single `intent` prop encodes
BOTH semantic role AND visual style (never separate `severity`/`outlined`/`text`);
new visual variants are added as intents in the kit.

### Primitives (all from `@delebash/llm-ui`)

| Kit component | What it does |
|---|---|
| `UiButton` | Single `intent` prop. `size="small"` for compact toolbars. `as="label"` for file-picker buttons. `<template #icon>` for leading icons. |
| `UiInput` / `UiTextarea` | `<input>`/`<textarea>` wrappers; `:invalid`, v-model; Textarea `auto-resize`. |
| `UiCheckbox` / `UiToggle` | Binary v-model (checkbox = inline/multi-select; toggle = on/off setting). |
| `UiSelect` | Reka UI Select — arrow-key nav, type-ahead, Esc-close, a11y, Floating-UI. `:options` (`{label,value}` or strings), empty-value sentinel, `width` cap. |
| `UiTag` / `UiChip` | Soft-tint status badge / interactive selection chip. |
| `UiField` | Labelled form row. |
| `UiNumber` | `Intl.NumberFormat` locale-aware grouping (follows `setUiLocale`); reformats on blur; Up/Down step. |
| `UiTable` | TanStack Vue Table — `:columns`, slot per column `id` for cells, sort/global-filter/pagination, `#empty`, `@row-click`. Needs the `@tanstack/vue-table` peer dep (in `package.json` + `resolve.dedupe`). |
| `UiColorPicker` | Swatch → popover preset grid + native custom color. Pass `:presets` (JW uses `services/categoricalColors.js` `PRESET_COLORS`). |
| `UiProgress` | Progress bar — determinate (`:value`/`:max` → % + label) or indeterminate sweep when the total is unknown. Token-styled, `role="progressbar"`. Used for model-download progress. |

### Shells / services (all from `@delebash/llm-ui`)

- `AppModal` — body-scrolling modal (eyebrow/title/wide/noPadding/closable/`dismissable`/`maxWidth` + `header`/`header-extra`/`footer` slots). Backdrop locked unless `dismissable`.
- `AppDialog` + `promptDialog()`/`confirmDialog()` (`dialog.js`) — imperative prompt/confirm host, built on `AppModal`. Default labels via `configureDialog({labels})` (wired in `main.js` from en.json).
- `HelpDrawer` + `HelpTrigger` + `openHelp`/`closeHelp` (`help.js`) — the `?` affordance + slide-in docs panel. JW wires the content adapter + `onOpenFull`/`onOpenWeb` via `configureHelp()` in `main.js`; the docs corpus stays JW-local (`services/helpDocs.js`).
- `Toast` + `pushToast`/`clearToasts` (`toastBridge.js`) — vue-sonner host; `ui.showToast({message, action})` delegates to it. JW themes the `.ui-toaster` class in `styles.css`.
- `tooltipDirective` (`v-tooltip.bottom="'text'"`, registered in `main.js`), `Breadcrumb`, `EmptyState`, `ConnectionError` (props: appName/serverUrl/need/devHint), `Icon`.
- **The shared AI task queue** (moved from JW 2026-07-06, Decision 22): `useAiTasksStore` (the global in-flight registry — Pinia; `pinia` is a kit peer dep, JW provides the instance), `runAiFeature`/`runAiFeatureStream` (feature-run wrappers over `/v1/ai/run`+`/v1/ai/stream` with task-panel registration + cancel), `friendlyAiError`, and the surfaces `AiTaskStrip` (inline progress strip, `#extra-stats` slot), `AiStatusPanel` (slide-in panel), `AiStatusButton` (TitleBar chip — its title-bar chrome stays host-owned via the `.titlebar-*` button rules).
- **The model-picker family** (C5, 2026-07-06; reshaped by B5-1, 2026-07-09 — §7.2 "per-surface pickers REMOVED"): `useProviderModels` (THE shared per-provider model-list cache — one cache + one endpoint accessor kit-wide; `LuModelPicker` rides it too), `LuFeatureChip` (the presentational per-feature chip — in JW always mounted `readonly`: a "runs on" provenance chip, no edit popover), `useResolvedRoute` (the kit cache over `GET /v1/ai/resolved-route` — the SERVER-resolved route a run would use: task preset → dispatch fallback), and the embeddings client `embedTexts`/`ensureEmbeddingReady` (ensure-resident for the bundled runner + `POST /v1/ai/embeddings`). JW-side: `components/AiFeatureChip.vue` is the thin READ-ONLY binding over `LuFeatureChip` + `useResolvedRoute` (same props as ever — consumers just mount it); clicking it navigates to `/ai`. Routing is edited ONLY on the Tasks tab + Feature Workbench — there is no per-surface picker, no `useFeaturePin.js`, and no ChatPanel inline picker (all removed 2026-07-09); the chat services pass NO client-side LLM override (the server cascade rules). The old JW `ModelPicker.vue`/`useModelList.js`/`services/embedApi.js` are gone.
- Both `AppModal`/`AppDialog`/`HelpDrawer` are Reka UI Dialog primitives — focus trap, scroll lock, Esc, ARIA free.

Both modal wrappers are Reka UI Dialog primitives — focus trap, scroll lock, Esc, ARIA come free. `AppModal` blocks backdrop click by default; `AppDialog` is dismissable (backdrop/Esc cancel).

### Button intents

| Intent | Look | Use for |
|---|---|---|
| `primary` | solid accent | Main affordance — Save, Create, Edit, Quick Write |
| `secondary` | outlined neutral | Supporting action — Cancel, Test |
| `ghost` | text only | Quiet utility — list-row icons, "Delete" on lists |
| `danger` | solid red | Destructive — Discard, Remove, Reset workspace |
| `success` | solid green | Positive — Confirm, Apply |
| `info` | solid blue | Informational |
| `accent2` | solid gold | User's second accent — Resume CTA, etc. (UI label = "Accent 2"; code-facing intent = `accent2`.) |

### Size rule

- **Inline list-row / card-header utility actions** → `size="small"`.
- **Standalone / destination CTAs / empty-state actions** → no `size` prop (regular).

When in doubt: toolbar with other small chips → small; the main reason the user is on this surface → regular.

### Theming knobs (user-tunable in Settings → Appearance)

Button knobs ride on CSS custom properties set by the shared appearance engine
(`@delebash/llm-ui` `applyAppearance`) and flow into every `UiButton`:
`btnRadius` (sharp/standard/rounded/pill) · `btnDensity` (compact/comfy) ·
`btnLabelCase` (default/uppercase). Fonts: JW maps the kit's semantic
`--font-display`/`--font-body` tokens in `tokens.css` (display = Fraunces serif).
Adding a knob: extend the shared engine + the Appearance settings UI.

### Three-tier architecture

1. **CSS classes / tokens** for purely visual variants — in `tokens.css`. No JS.
2. **Directives / composables** for cross-cutting behavior — `v-tooltip`, etc.
3. **Components** for non-trivial state/focus/markup — the kit `Ui*` family + shells.

### Don't

- **Don't re-fork primitives locally.** `components/ui/` is empty on purpose; import `Ui*` from `@delebash/llm-ui`. A capability gap → promote it to the kit (so both apps share it), never a `Jw*` copy.
- **Don't add new PrimeVue components.** It's out of `package.json`.
- **Don't roll new `.btn-*` classes.** Use `<UiButton>`.
- **Don't add `severity`/`outlined`/`text` props.** The single-`intent` API is intentional; visual style is baked into the intent (in the kit).
- **Don't bypass the helpers.** `ui.showToast`, `promptDialog`, `confirmDialog`, `openHelp` — always through the kit helpers.
