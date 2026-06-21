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

Configured tooling (an earlier note here wrongly claimed "none" — verify against `package.json`, don't trust this line blindly): **Biome** (`biome.json` — lint + format; match the file's existing style, don't bulk-reformat unrelated code), an **`e2e/`** WebDriver harness (`tauri-driver` + `msedgedriver` driving the **built desktop binary** — `npm test` runs the smoke suite, `npm run screenshots` the marketing shots; both need a compiled `.exe` + Edge/WebView2, so it is **not** a headless or quick dev gate), and a **Playwright headless renderer smoke** (`scripts/headless-smoke.mjs`, plus `scripts/book-smoke.mjs`). **The headless smoke IS the renderer gate and it RUNS in this dev container** (a recurring wrong claim is that there's "no renderer gate / it's not runnable here" — false; run it). To run: boot `python -m justwrite_server.cli serve --port 17495` (background) + `npm run dev:vite` (:1420, background), then `node scripts/headless-smoke.mjs` — it drives headless Chromium over every hash route and asserts ZERO JS errors. Chromium is prebuilt at `/opt/pw-browsers` (the script auto-finds it; override with `JW_CHROME`). **Run it to verify any renderer/GUI change.** Compile checks are `npm run build:vite` + `cd src-tauri && cargo check`; the **`e2e/`** WebDriver harness (`tauri-driver` + `msedgedriver` driving the **built `.exe`** — `npm test`, `npm run screenshots`; needs a compiled binary + Edge/WebView2) is the packaged-desktop check, not the quick gate. The Python **`server/`** (server-mode migration — see `docs/plans/2026-06-18-jw-server-migration.md`) uses **pytest + ruff**.

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
> The current cutover state + the active plan docs (authoritative:
> `docs/plans/2026-06-20-shared-ai-stack-plan.md`) live in `MORNING_RECAP.md`,
> not here.

## Architecture

### Layout

- `src/renderer/` — Vite root for the Vue 3 + Pinia renderer. Vite's `root` is `src/renderer/`, not the repo root.
- `src-tauri/` — Rust crate. `main.rs` calls `justwrite_lib::run()`; all `#[tauri::command]`s live in `lib.rs`.
- `dist/` — Vite output, consumed by Tauri as `frontendDist`.

### IPC bridge (Tauri ↔ renderer)

`src/renderer/src/services/tauri-bridge.js` is a side-effect import in `main.js`. It detects `window.__TAURI_INTERNALS__` and populates `window.justwrite` with:

```
window.justwrite.project = { save, open, saveTo }
window.justwrite.images  = { save, read, delete }
```

These mirror Rust commands in `src-tauri/src/lib.rs` one-for-one (`project_save`, `project_save_to`, `project_open`, `images_save`, `images_read`, `images_delete`). When `window.justwrite` is undefined (plain `vite dev` in a browser), project data still persists to the server via `projectApi`; only images fall back to inline data-URL records. **Do not call `invoke()` from views or stores — go through `window.justwrite`** so the browser-only path keeps working.

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
- Deletes are **soft** — `removeXxx` actions move the entity to `state.trash[kind]` and fire an Undo toast via `uiStore`. `TrashView` handles restore / permanent delete.
- Undo/redo is **snapshot-based and in-memory only** (not persisted across reloads): every mutating action calls `this._record(actionId)` before mutating, which deep-clones `HISTORY_SLICES` onto `_past` (limit `HISTORY_LIMIT`). Durable rollback comes from the Tauri **disk autosave** (`$APPDATA/projects/<id>.autosave.json`, rotating) + manual Export backup — not from history.
- Keystroke-grain actions (in `COALESCED_ACTIONS`: `setChapterBody`, `setChapterTitle`, inline title edits, etc.) coalesce into one history entry per ~600ms quiescent window. When adding a new high-frequency mutator, add it to `COALESCED_ACTIONS` or the undo buffer fills instantly.
- `_past` and `_future` are wrapped in `markRaw()` so Vue does not make snapshots reactive.

### AI providers

LLM calls currently route through a server-side gateway — `OpenAICompatClient`
(`services/openai-compat.js`) → `/v1/llm/{providerId}/chat/completions|embeddings|models|ping`
on the Python `server/` (server injects the held key + proxies; Ollama native
when applicable). This is **migrating to the shared `just-llm-runner` dispatch**
(`/v1/ai/*`) as part of the AI-stack convergence — current cutover state in
`MORNING_RECAP.md`. No TTS here — audio lives in JustVoice.

### Manuscript export

`services/export/manuscript.js` builds a normalized manuscript model that feeds three lazy-loaded adapters: `pdf.js` (pdfmake — TOC + part covers + optional cover image), `docx.js` (live TOC that auto-refreshes on open), `epub.js` (hand-rolled EPUB 3 with nav doc, OPF spine, cover xhtml, JSZip-packaged). Cover image (set in Settings → Project) is stored as an `imageStore` record on `project.project.coverImage`.

### Image storage

`services/imageStore.js` is the renderer-side facade. When `window.justwrite` exists, images are written via `images_save` to `$APPDATA/JustWrite/images/` and the renderer stores only the absolute path (read back through `images_read` which returns a data URL). Without Tauri, falls back to inline data-URL records stored in the project snapshot (which is itself server/SQLite-backed).

**Caveat:** `images_save` ships bytes as JSON `number[]` over IPC. Fine for reference photos; if uploads grow to multi-MB range, switch to a Tauri Channel.

### Routing & shortcuts

Hash router (`createWebHashHistory`) — see `router/index.js` for the full route list. Global shortcuts: ⌘F focuses search, ⌘\ toggles sidebar, ⌘Z / ⌘⇧Z (or ⌘Y) undo/redo (disabled inside the rich editor — TipTap owns its own history there).

## Conventions

- **The `@renderer` alias** resolves to `src/renderer/src/` (see `vite.config.js`). Prefer relative imports for files in the same directory, `@renderer/...` for cross-tree imports.
- **Don't bypass the bridge.** Renderer code calling `invoke()` directly will break the browser-only dev path.
- **Bundle icons** live in `src-tauri/icons/` (full set: `icon.icns`, `icon.ico`, desktop PNGs, plus Windows Store / android / ios). If you regenerate them, the canonical command is `cargo tauri icon <source.png>` from `src-tauri/`.
- **fs plugin scope** allows `$APPDATA/images/*` and `$APPDATA/projects/*`. Saving project files elsewhere requires widening the scope in `tauri.conf.json`.

## UI components

All app-level UI primitives live in `src/renderer/src/components/ui/`. They share one design contract — a single `intent` prop encodes BOTH semantic role AND visual style, never separate `severity` + boolean modifiers. New visual variants get added as intents, not as `outlined` / `text` props.

### Components

| Component | Replaces | What it does |
|---|---|---|
| `JwButton` | PrimeVue Button | Single intent prop. `size="small"` for compact toolbars. `as="label"` for file-picker buttons. `<template #icon>` for leading icons. |
| `JwInput` | PrimeVue InputText | Plain `<input>` wrapper with `:size`, `:invalid`, standard v-model. |
| `JwTextarea` | PrimeVue Textarea | Same as JwInput, plus `auto-resize` that grows with content (custom JS, ~15 lines). |
| `JwCheckbox` | PrimeVue Checkbox | Binary v-model only. Custom box renders with accent fill when checked. |
| `JwSelect` | PrimeVue Select | Reka UI primitives. Arrow-key nav, type-ahead, Esc-close, screen-reader semantics, Floating-UI positioning — free. |
| `JwTag` | PrimeVue Tag | Soft-tint chip in the intent colour. |
| `JwTable` | PrimeVue DataTable | TanStack Vue Table inside. `:columns` array of defs, slot per `accessorKey` for cell rendering. Sort, global filter, pagination. |
| `JwNumber` | PrimeVue InputNumber | `Intl.NumberFormat`-driven locale-aware grouping; cursor stays sane while typing; reformats on blur. Up/Down keys step. |

### Button intents

| Intent | Look | Use for |
|---|---|---|
| `primary` | solid accent | Main affordance — Save, Create, Edit, Quick Write |
| `secondary` | outlined neutral | Supporting action — Cancel, Test |
| `ghost` | text only | Quiet utility — list-row icons, "Delete" on lists |
| `danger` | solid red | Destructive — Discard, Remove, Reset workspace |
| `success` | solid green | Positive — Confirm, Apply |
| `info` | solid blue | Informational |
| `accent2` | solid gold | User's second accent — Resume CTA, etc. (UI label = "Accent 2"; code-facing intent = `accent2`. They're the same thing.) |

### Size rule

- **Inline list-row / card-header utility actions** → `size="small"` (Add provider, Test/Edit per provider row, list-row Delete icons)
- **Standalone / destination CTAs / empty-state actions** → no `size` prop (regular). Includes destructive actions like Reset workspace and dashboard CTAs like the Home page's Quick Write.

When in doubt: if the button sits in a toolbar with other small chips, it's small; if it's the main reason the user is on this surface, it's regular.

### Theming knobs (user-tunable in Settings → Appearance)

Three button-level knobs ride on the CSS custom properties at the top of `tokens.css` and flow into every JwButton:

- **`btnRadius`**: `sharp` (2px) · `standard` (6px) · `rounded` (10px) · `pill` (999px)
- **`btnDensity`**: `compact` · `comfy`
- **`btnLabelCase`**: `default` (sentence) · `uppercase` (auto-tracks letter-spacing)

Adding more knobs follows the same pattern: token in `tokens.css` → defaults injected by `services/appearance.js` → segmented-button UI in `SettingsView.vue` → key registered in `PRESET_KEYS` (`stores/ui.js`).

### Other UI pieces

- **`services/tooltip.js`** — `v-tooltip.bottom="'text'"` directive (Floating UI under the hood). Registered globally in `main.js`.
- **`services/toastBridge.js`** + **`components/Toast.vue`** — `ui.showToast({ message, action })` from anywhere. Sonner under the hood; theming uses our tokens.
- **`components/AppModal.vue`** — shell wrapper for body-scrolling modals (eyebrow/title/wide/noPadding/closable + footer slot). Used by ~11 consumers.
- **`components/AppDialog.vue`** — imperative prompt/confirm host driven by `services/dialog.js`. Use `promptDialog()` / `confirmDialog()` from any view.

Both modal wrappers are Reka UI Dialog primitives — focus trap, scroll lock, Esc, ARIA come free. `AppModal` blocks backdrop click; `AppDialog` allows it (cancels).

### Three-tier architecture

When adding new UI behavior, place it correctly:

1. **CSS classes / tokens** for purely visual variants — colors, padding, density. In `tokens.css`. No JS.
2. **Directives / composables** for cross-cutting behavior with no UI surface — `v-tooltip` (Floating UI), `v-auto-resize` (Textarea grow), etc.
3. **Components** for anything with non-trivial state, focus management, or markup — the Jw* family, AppModal, AppDialog.

Don't reach for a component when a class would do. Don't reach for a class when behavior needs JS — make a directive instead. Reserve components for the things that genuinely need them.

### Don't

- **Don't add new PrimeVue components.** It's fully out of `package.json`. Build with the Jw* layer.
- **Don't roll new `.btn-*` classes.** Use `<JwButton>`.
- **Don't add `severity` / `outlined` / `text` props to JwButton.** The single-`intent` API is intentional; visual style is baked into the intent.
- **Don't bypass the bridge.** `ui.showToast`, `promptDialog`, `confirmDialog` — always through the helpers, never directly into the component.
