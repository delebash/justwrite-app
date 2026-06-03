# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active work

PrimeVue has been fully removed in favor of a custom-component layer (`src/renderer/src/components/ui/Jw*.vue`) backed by Reka UI, TanStack Vue Table, Floating UI, and vue-sonner. See **UI components** below for the conventions, and `MIGRATION.md` for historical phase notes.

## Commands

```bash
npm install            # JS deps (first run only)
npm run dev            # Tauri dev — boots Vite + native window. First run compiles the Rust crate (slow); subsequent runs are fast.
npm run build          # Packaged app for the current OS
npm run dev:vite       # Renderer only, in a plain browser tab (no Tauri APIs — falls back to IndexedDB / data-URLs)
npm run build:vite     # Renderer build only (Tauri invokes this via `beforeBuildCommand`)
```

No test runner, linter, or formatter is configured. Don't invent a `npm test` script.

The Rust crate is built by the Tauri CLI; Vite never sees it. The renderer dev server is fixed at `http://localhost:1420` and `tauri.conf.json` references that URL — keep them in lock-step.

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

These mirror Rust commands in `src-tauri/src/lib.rs` one-for-one (`project_save`, `project_save_to`, `project_open`, `images_save`, `images_read`, `images_delete`). When `window.justwrite` is undefined (plain `vite dev` in a browser), the renderer falls back to IndexedDB / data-URL paths. **Do not call `invoke()` from views or stores — go through `window.justwrite`** so the browser-only path keeps working.

When adding a new Tauri command:
1. Add the `#[tauri::command]` function in `src-tauri/src/lib.rs` and register it in the `invoke_handler![]` list.
2. Add a matching method to `window.justwrite.*` in `tauri-bridge.js`.
3. If it needs a new plugin permission, update `src-tauri/capabilities/default.json` (currently grants `core:default`, `dialog:default`, `fs:default`).


### State (Pinia stores)

All in `src/renderer/src/stores/`:

- `project` — every entity (chapters, characters + extras, locations, objects, groups, notes, strands, worldbuilding, architecture), images, events, trash, and chapter bodies. Owns persistence and undo/redo.
- `ui` — sidebar, selections, toasts.
- `ai` — provider registry (OpenAI-compatible endpoints).
- `studio` — cast, scripts, per-chapter rendered audio, render queue.
- `sessions` — per-day word count log feeding Home + Analysis Pace.

**Project store invariants worth knowing before mutating it:**

- Persists the whole snapshot to IndexedDB under key `justwrite:project` on every change (via the `services/storage.js` adapter — a sync, cache-backed wrapper over `idb-keyval`).
- Deletes are **soft** — `removeXxx` actions move the entity to `state.trash[kind]` and fire an Undo toast via `uiStore`. `TrashView` handles restore / permanent delete.
- Undo/redo is **snapshot-based**: every mutating action calls `this._record(actionId)` before mutating, which deep-clones `HISTORY_SLICES` onto `_past`. Limit: 100 in-memory, last 10 persisted as a debounced tail at IndexedDB key `justwrite:project:history`.
- Keystroke-grain actions (in `COALESCED_ACTIONS`: `setChapterBody`, `setChapterTitle`, inline title edits, etc.) coalesce into one history entry per ~600ms quiescent window. When adding a new high-frequency mutator, add it to `COALESCED_ACTIONS` or the undo buffer fills instantly.
- `_past` and `_future` are wrapped in `markRaw()` so Vue does not make snapshots reactive.

### AI providers

One client class — **`OpenAICompatClient`** (`services/openai-compat.js`) — speaks `/v1/chat/completions`, `/v1/audio/speech`, `/v1/audio/voices`, `/v1/models`. Used identically for the OpenAI cloud, any OpenAI-compatible local LLM server (Ollama, LM Studio, llama.cpp, …), and any OpenAI-compatible local TTS server added in Settings → AI providers.

**Web Speech** (`services/webSpeech.js`) is a special provider marked `realtimeOnly` — voices come from the OS, preview plays live, and the render pipeline (`services/render.js`) skips realtime-only voices with a "preview-only" reason rather than attempting to file-render.

### Audio / Studio pipeline

`Studio` view has three tabs (Cast / Script / Render). Pipeline lives across several services:

1. **Cast** — voice library, smart-cast LLM call. State in `studio.cast`.
2. **Script** — LLM speaker analysis per chapter, persisted as `studio.scripts[chapterId]`. `studio.speakersByChapter` is a derived `Map<chapterId, Set<characterId>>` used by Search (folded into chapter body), Outline (speaker chips), and Analysis (cast-presence heatmap).
3. **Render** — per-line TTS → WAV concat → download. Rendered chapter audio is pushed into `studio.chapterAudio` so `ExportView` can collect it.
4. **M4B export** (`services/m4b.js`) — per-chapter WAVs → AAC, muxed `.m4b` with chapter markers via lazy-loaded `ffmpeg.wasm`.

`ffmpeg.wasm` needs `SharedArrayBuffer`, which needs cross-origin isolation. The COOP/COEP/CORP headers are set in **both** `vite.config.js` (`server.headers`) and `tauri.conf.json` (`app.security.headers`). Keep them in sync.

### Manuscript export

`services/export/manuscript.js` builds a normalized manuscript model that feeds three lazy-loaded adapters: `pdf.js` (pdfmake — TOC + part covers + optional cover image), `docx.js` (live TOC that auto-refreshes on open), `epub.js` (hand-rolled EPUB 3 with nav doc, OPF spine, cover xhtml, JSZip-packaged). Cover image (set in Settings → Project) is stored as an `imageStore` record on `project.project.coverImage`.

### Image storage

`services/imageStore.js` is the renderer-side facade. When `window.justwrite` exists, images are written via `images_save` to `$APPDATA/JustWrite/images/` and the renderer stores only the absolute path (read back through `images_read` which returns a data URL). Without Tauri, falls back to inline data-URL records stored in the project snapshot (IndexedDB-backed).

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
