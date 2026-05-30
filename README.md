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

## License

Your code, your terms. Voices, models, and APIs are subject to their providers' terms.
