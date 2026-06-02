# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active work

A PrimeVue UI migration ("Path B") is in progress. **See [MIGRATION.md](MIGRATION.md) for phase-by-phase status and what's next** — read it before continuing migration work, and update it in the same commit that lands a phase.

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
