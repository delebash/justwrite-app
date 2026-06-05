# JustWrite

A desktop writing app for novels, with an audio studio that connects to any **OpenAI-compatible** AI provider — Ollama, LM Studio, OpenAI, or anything else that speaks the standard.

Built with **Tauri 2 + Vite + Vue 3 + Pinia** (JavaScript renderer, Rust backend).

---

## Quick start

```bash
# 1. Install JS deps
npm install

# 2. Install Rust (once) — https://www.rust-lang.org/tools/install
#    Then install the Tauri CLI if it's missing:
cargo install tauri-cli --version "^2.0"   # optional — also runs via npx

# 3. Dev (Vite HMR + a native window)
npm run dev

# 4. Build a packaged app for the current OS
npm run build
```

The app opens on a seed project ("The Cartographer's Daughter") so you can click through every screen immediately.

> **First run is slow.** Tauri compiles the Rust crate the first time. Subsequent dev launches are fast.

---

## Project structure

```
justwrite-app/
├── package.json
├── vite.config.js
├── src/
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.js          ← Vue entry; imports the Tauri bridge
│           ├── App.vue
│           ├── router/index.js
│           ├── assets/styles/tokens.css
│           ├── domain/seed.js
│           ├── stores/          ← project, ui, ai, studio, sessions
│           ├── services/
│           │   ├── tauri-bridge.js   ← exposes window.justwrite
│           │   ├── openai-compat.js  ← unified HTTP client
│           │   ├── llm.js, tts.js, render.js, webSpeech.js
│           │   ├── search.js, analysis.js
│           │   ├── imageStore.js
│           │   ├── m4b.js
│           │   └── export/{manuscript,pdf,docx,epub}.js
│           ├── components/
│           └── views/
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    ├── capabilities/default.json   ← plugin permissions
    └── src/
        ├── main.rs                 ← `fn main()` -> justwrite_lib::run()
        └── lib.rs                  ← #[tauri::command]s + Builder
```

---

## How the IPC bridge works

The renderer never calls `invoke()` directly. `src/renderer/src/services/tauri-bridge.js` is a side-effect import in `main.js`. When running inside Tauri it populates `window.justwrite`:

```js
window.justwrite = {
  project: { save, open, saveTo },
  images:  { save, read, delete },
};
```

The Rust commands live in `src-tauri/src/lib.rs` and mirror the JS contract one-for-one (`project_save`, `images_save`, …). Outside Tauri (e.g. plain `npm run dev:vite` in a browser tab), `window.justwrite` stays undefined and the renderer falls back to its localStorage paths.

---

## AI providers

JustWrite uses one client class for everything: **`OpenAICompatClient`** (`src/renderer/src/services/openai-compat.js`).

Pre-configured presets in Settings → **AI & Audio engines**:

| Preset                        | Base URL                            | Notes                                                                                                                |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| OpenAI-compatible (local)     | `http://localhost:11434/v1`         | Generic LLM endpoint. Point at Ollama, LM Studio, llama.cpp, etc. — change the URL to whatever local server you run. |
| OpenAI                        | `https://api.openai.com/v1`         | LLM + TTS. Add your API key.                                                                                         |
| Claude (Anthropic)            | `https://api.anthropic.com/v1`      | LLM only, via Anthropic's OpenAI-compatible endpoint. Add your `sk-ant-...` key. Default model: `claude-haiku-4-5`.   |
| Kokoro (local TTS)            | `http://localhost:8880/v1`          | Small, fast local TTS via Kokoro-FastAPI.                                                                            |
| Chatterbox                    | `http://localhost:8004/v1`          | Local TTS + voice cloning (devnen/Chatterbox-TTS-Server). Drop reference WAV or MP3 files into the server's `./voices/` folder; they appear in JustWrite's cast picker by filename. |

Add any other OpenAI-style provider — including local TTS servers — via **Add provider**.

---

## Feature inventory

See `STATE.md` for the full list. Highlights:

- TipTap rich-text editor across Chapters, Notes, Worldbuilding, Architecture
- Full-text search with snippet highlighting (⌘F)
- Analysis dashboard fed by a real session log
- Soft delete + restore (Trash) with undo toast
- Project-wide undo/redo (100 steps in-memory, 10 persisted)
- Studio audiobook pipeline: cast → speaker analysis → per-line TTS → WAV concat
- M4B export with chapter markers (ffmpeg.wasm)
- Manuscript export: PDF, DOCX, EPUB (with cover image)
- Image storage via Tauri commands (writes to AppData/images/, falls back to data URLs in the browser)

---

## Code audit & refactor

Four dev-only tools are wired into `package.json` for periodic cleanup. None run automatically — the project has no linter or formatter in the loop on purpose (writing prose is the priority).

| Tool | What it finds | When to reach for it |
|---|---|---|
| **Biome** | Unused imports, dead variables, suspicious patterns. Auto-fixes most of what it flags. | After heavy iteration when imports and locals drift out of sync. |
| **depcheck** | `package.json` deps that nothing imports — and the reverse (imports of packages not declared). | Before a release, or after ripping out a feature. |
| **jscpd** | Copy-paste detector. Surfaces duplicated blocks with file:line citations. | When you suspect a helper should be extracted but don't know where the copies live. |
| **madge** | Circular dependencies and orphan files in the renderer. | When import errors get weird, or when untangling a module. |

### Light audit — run by hand

```bash
npx biome check src/renderer/src/        # lint findings (add --apply for safe auto-fixes)
npx depcheck                              # unused / missing deps
npx jscpd src/renderer/src/               # writes a report to ./report/
npx madge --circular src/renderer/src/    # circular deps only
npx madge --orphans src/renderer/src/     # files not imported anywhere
```

Read the output, fix what's obvious, skip what isn't. Biome's `--apply` is safe to run blind; the other three are read-only.

### Deep audit — hand it to Claude Code

For a full pass — run all four tools, triage findings against the actual code (catches false positives like dynamic imports), apply the safe fixes, and produce a punch list of judgment calls — ask Claude Code to **"use a workflow for a deep audit refactor"**. The keyword *workflow* opts in to multi-agent orchestration: the audit fans out across parallel subagents instead of one agent reading every report end-to-end. Expect a few minutes wall-time and substantial token use; you get a structured report back instead of triaging hundreds of raw findings yourself.

---

## License

Your code, your terms. Voices, models, and APIs are subject to their providers' terms.
