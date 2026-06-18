# Cross-App Architecture Decision — JustWrite-facing summary

**2026-06-18.** Canonical record lives in the **JustVoice** repo:
`docs/plans/2026-06-18-cross-app-runner-and-jw-backend-decision.md`
(spans both apps). This is the JW-facing summary.

## What this means for JustWrite

- **JW stays a client-side app for now.** No external API consumers, so
  no Python server yet. Documents stay in **IndexedDB** (the current
  store). Optional later upgrade: the **Tauri SQL plugin** (SQLite via
  Rust, *no backend process*) — only if the whole-snapshot persistence
  model starts to hurt on large projects.
- **Local LLM** comes from **one shared Python runner package** (the
  same code JustVoice uses), run in JW as a **lazy sidecar** — spawned
  only when local LLM is first used, so the editor always opens even if
  the sidecar fails. Inference calls go **direct to `llama-server`**;
  the runner only detects hardware, downloads llama.cpp + GGUF, computes
  VRAM-fit flags, and supervises the server.
- **Runner language = Python, not Rust.** (Rust was only attractive while
  JW had to be Python-free; that's no longer a constraint.)
- **Online/cloud + "point at Ollama"** remain plain provider entries
  (the built-in runner is *additional*, not a replacement).

## Deferred (revisit trigger)

- **JW → Python + SQLite server (full backend):** only when JW goes
  **multi-client (Android/web)**. At that point, grow the existing lazy
  Python sidecar into the full server. Until Android is *committed*
  (currently a "maybe"), keep JW client-side.

## Audio note (unchanged from prior plans)

Audio/TTS/STT belongs to **JustVoice**, not JW. Keep
`services/export/justvoice.js` (the JW→JV handoff). Voice removal from JW
follows the 2026-06-16 plan's §4 audit (resolve Edge-TTS / Web-Speech
gaps in JV first).
