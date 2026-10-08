# JustWrite

A desktop writing app for novels that connects to any **OpenAI-compatible** AI provider — Ollama, LM Studio, OpenAI, or anything else that speaks the standard.

Built with **Electron + Vite + Vue 3 + Pinia**, and a local **Node (Fastify) server** that holds all the data — plain JavaScript end to end (since 2026-10-08; it was Tauri + Rust + Python before).

User docs live in `docs/`. The marketing site at <https://delebash.github.io/justwrite-website/> mirrors them for each release.

---

## Quick start

```bash
npm install            # JS deps (the kit checkout ../just-llm-runner sits beside this repo)
npm run dev            # Vite HMR + the desktop window (Electron), its server on the dev data folder data/
npm run build          # The installer for the current OS, in release/
```

A fresh install opens on the welcome screen; **Try tutorial project** loads *The Ninth Facet*, a complete sample book, so you can click through every screen immediately.

---

## Features

Seven rooms, one house — organised by what part of the work you're in.

### ✶ Manuscript — the desk where you write

- **TipTap-based rich-text editor.** Bold, italic, headings, lists, links, tables, images.
- **Parts → Chapters → Scenes.** Write inside scenes; chapters and parts are containers.
- **Three view modes per chapter.** Edit (single scene), Card view (scenes as a corkboard), Read (continuous prose, no scene titles).
- **Continuous mode.** Stitch every scene in the chapter into one editable document with visible scene breaks.
- **Whole-book mode.** Read or revise the entire manuscript as one continuous page.
- **Focus mode.** Hide everything but the prose.
- **Two page layouts.** Full-bleed or a traditional sheet with running head and folio.
- **Markers.** Drop pins in the prose while drafting — fix-later, verify, weak passage, loose thread, TODO, idea — collected on their own manuscript-wide page with one-click jumps back.
- **Resume briefings + end-of-session recaps.** Walk back into a chapter with a summary of where you left off and what's next.
- **Find and replace** across the whole project, with snippet preview and one-click jump (⌘F).
- **Smart quotes, em-dashes, smart ellipses** on the fly.
- **Drag-to-reorder** for scenes, chapters, parts.
- **`@`-mentions.** Type `@` to link characters, locations, objects, groups, or strands directly into the prose.

### ✶ Story world — the world around the book

- **Characters** with wants, needs, the lie they tell, the truth they deny, a three-act arc, voice + dialect notes, and an image.
- **Character consistency audit.** AI flags contradictions between the profile and what the prose actually does.
- **Relationship arc tracker.** How each pair-bond evolves chapter by chapter.
- **Locations** with kind, status, tags, and "appears in scenes" backlinks.
- **Objects** for significant props (relics, letters, instruments, heirlooms).
- **Groups** that bundle characters / locations / objects / strands into factions, families, crews.
- **Architecture documents.** Three permanent slots — **Premise** (one paragraph), **Fabula** (cause-and-effect chronology), **Setting** (world + time-period context).
- **Worldbuilding wiki.** Free-form articles in six categories (Geography, History, Cultures, Languages, Factions, Lore & myth), tagged and cross-referenced.
- **Notes** for anything that doesn't fit a structured surface.
- **Per-entity event timelines** that link back to scenes.
- **Relations graph.** A force-directed map of who is in what with whom — edges drawn automatically from shared scenes, groups, and mentions.
- **Find-new-entities sweep.** AI surfaces characters and places the prose mentions but the Story Bible hasn't met.

### ✶ Plot — the bones of the story

- **Narrative strands** tracked across multi-beat arcs.
- **Plot Board.** Strands × chapters grid. Drag beats, click empty cells to add, links back to scenes.
- **Plot templates.** Three-Act, Save the Cat, Hero's Journey, Story Circle — scaffolded with one click.
- **Beat-sheet overlay.** Map your existing chapters onto any chosen structural framework.
- **Plot-hole audit.** AI walks the manuscript looking for setups without payoffs, character actions out of profile, and optional world-rule breaks.
- **Dangling-thread tracker.** Lists foreshadowing the book never came back to.
- **Scene-level linking** to characters, places, objects, and strands.
- **Per-scene status** (To do · Draft · Revise · Done) surfaced everywhere as colour-coded donuts.

### ✶ AI — models, on your terms

- **Any OpenAI-compatible endpoint.** Add OpenAI, Ollama, LM Studio, llama.cpp, vLLM, Claude (via Anthropic's OpenAI-compatible API), or your own server.
- **Per-feature model picker.** Use one model for chat, another for critique, another for entity sweeps.
- **Ask-the-book chat.** Hybrid BM25 + vector retrieval with citations back to the chapters the answer came from.
- **Talk to a character.** Converse with anyone in your cast in their own voice, with story-world knowledge.
- **In-editor bubble actions.** Rewrite, expand, tighten, continue from cursor — or generate three alternatives side by side.
- **Guided continue.** Continue the prose with a specific brief.
- **Voice canon.** A "match my style" fingerprint sampled from chapters you choose, injected into every generation.
- **Unstuck — five ways out.** A stuck-on-this-chapter diagnostic that offers five distinct ways forward.
- **Brainstorm pane.** Names, titles, plot twists, next beats — fifteen-to-twenty options per click, thumbs-up to steer.
- **Marketing pack.** Logline, blurbs, synopsis, pitch, comp titles — generated in one pass from the same chapter digest.
- **Multi-reader panel.** Four reader personas (genre reader / literary critic / agent intern / book-club reader) react to a chapter in parallel.
- **AI-tells scanner.** Deterministic — flags stock verbs, body-language clichés, hedges. No LLM call, no token spend.
- **Sensory research pack.** Smell, sound, touch, taste, period detail — fifteen specific phrases in twenty seconds.
- **Writer Lab.** Every prompt and parsed result exposed for inspection.
- **Usage ledger.** Per-feature token + cost estimates.

### ✶ Reflection — two views of the work

- **Home dashboard.** Today's session, streak, fortnight, cadence — and a button that drops you back into the chapter you were last in.
- **Analysis dashboard.** Project KPIs, 30-day pace chart, 53-week writing-year heatmap, milestones, status donuts, narrative-strand distribution, character-presence heatmap.
- **Story-tension timeline.** AI scores the rise and fall across chapters.
- **Voice-drift report.** Flags chapters reading off-style, with per-chapter Explain.
- **Reverse outline (StorySnap).** Summarises what each chapter actually does versus what you remember it doing.
- **Reader-knowledge map.** Where the reader sits relative to the POV character — aligned, ahead (dramatic irony), behind (reader confused), or neutral — chapter by chapter. For mystery, thriller, and unreliable-narrator work.

### ✶ Import & export — what goes in, what comes out

- **Import** DOCX, EPUB, ODT, Markdown, plain text. Chapter auto-detection, image extraction, smart-quote normalisation.
- **Import as notes.** Bring research into the Notes section instead of the manuscript.
- **Entity sweep on import** (optional) to surface new characters and places.
- **Export PDF.** TOC, part covers, optional cover image.
- **Export DOCX.** Live auto-refreshing table of contents.
- **Export EPUB 3.** Nav doc, OPF spine, cover xhtml, JSZip-packaged.
- **Strip scene markers on export** when you prefer.

### ✶ Appearance — the room, set up your way

- **Five theme presets.** Studio (Geist + teal), Fine Press (Fraunces + oxblood), Ivory Press (cream paper, italic headings), Calm Modern (clean defaults), Editorial (Newsreader + indigo).
- **Light, dark, or follow the system.**
- **Four font pairings** with per-surface overrides.
- **Accent and gold hue sliders.** Tune the colour without leaving the app.
- **Surface tints, paper tints, ink palettes** (warm / cool / sepia / auto).
- **Button knobs.** Radius (sharp · standard · rounded · pill), density (compact · comfy), label-case (sentence · uppercase).
- **UI scale.**
- **Save your mix as a custom preset.**

### ✶ Cross-cutting

- **Local first.** Your manuscript is a file on your computer. No account, no upload, no server lock-in.
- **Soft delete + Trash.** Every deletion is undoable; Trash holds items indefinitely until you empty it.
- **Project-wide undo / redo.** 100 steps in-memory, last 10 persisted. ⌘Z / ⌘⇧Z.
- **Autosave.** Every change persists through the app's local server within seconds — the renderer holds no data of its own.
- **Backups.** Export the whole project as a single JSON snapshot at any time; restore from one with a click.
- **i18n-ready.** All UI strings flow through vue-i18n; locale-aware number formatting.

---

## Setup

### Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| **Node 24+** | The renderer build, the scripts, npm | <https://nodejs.org/> |
| **The kit** | `../just-llm-runner` beside this repo — the shared server package (`file:../just-llm-runner/server`) and Vue kit (the vite alias) | `git clone https://github.com/delebash/just-llm-runner ../just-llm-runner` then `cd ../just-llm-runner/server && npm install` |
| **gh CLI** | Triggering the release workflow only | <https://cli.github.com/> + `gh auth login` |

Electron comes in through `npm install` (a devDependency); the server runs on Electron's own Node
(`scripts/node24.mjs`), so nothing else is needed — no Python, no Rust.

### One-time

```bash
npm install            # also: cd e2e && npm install (if you'll run screenshots/smoke tests)
```

---

## NPM scripts

Run from the repo root unless noted.

| Script | What it does |
|---|---|
| `npm run dev` | The desktop app — a Vite dev server on :1420 with hot reload, and the Electron window pointed at it; the window's server runs on the dev data folder `data/`. |
| `npm run build` | The installer for the current OS (electron-builder). Outputs to `release/` — on Windows `JustWrite Setup <version>.exe`, with `release/win-unpacked/` beside it. |
| `npm run dev:vite` | Renderer only, in a plain browser tab at `http://localhost:1420` — no desktop shell; data still flows through the server (start it yourself: `npm run server`). |
| `npm run server` | The server alone (headless) on :17495, on the dev data folder `data/` (`--port`, `--host`, `--data-dir` after `--`). |
| `npm run build:vite` | Renderer build only (`dist/` — what the window loads and the headless server serves). `npm run build` runs it first. |
| `npm run preview:vite` | Serves the built renderer over Vite preview — handy for sanity-checking the bundle. |
| `npm run bump <version>` | Updates the version in `package.json` (the one place it lives). **Does not commit or tag** — you do. See [Release process](#release-process). |
| `npm run release [version]` | Triggers the GitHub Actions release build via `gh workflow run`. Requires the tag to already exist on origin. Interactive `[y/N]` confirm. |
| `npm run release:windows` · `:macos` · `:linux` | Same as `release` but builds a single platform. |
| `npm run screenshots` | Runs the e2e screenshot capture (same as `cd e2e && npm run capture`). Drives the desktop app on the built UI, writes PNGs to `../justwrite-website/public/screenshots/`. Requires `npm run build:vite` first. |
| `npm test` | Runs the e2e smoke suite (delegates to `npm test --prefix e2e`). Drives the desktop app (the built UI, your real data) through the major routes and asserts each surface renders. Requires `npm run build:vite` first. |
| `npm run test:unit` · `test:server` · `test:fast` | vitest over the renderer · vitest over the server (`server/tests/`, on Electron's Node) · the quick gate chaining both plus `build:vite`. |
| `npm run i18n:lint` · `i18n:report` · `i18n:pseudo` | i18n-only eslint rules · locale coverage report (MISSING must stay zero) · pseudo-locale build. |
| `npm run bench` (`:gpu`, `:cpu`) · `npm run smoke` · `npm run dup` | LLM bench harness · scripted smoke · jscpd duplicate scan. |

> Linting is **biome** (`biome.json`, checker only — the formatter is deliberately off) plus the i18n eslint config; run them by hand, nothing hooks the dev loop.

---

## E2E harness (smoke tests + screenshots)

Lives in `e2e/`. Automation over the real desktop app — Electron, the built UI from `app://` — through Playwright's Electron driver (`playwright-core`) — see [`e2e/README.md`](e2e/README.md) for the full story.

### Prereqs (one-time)

```bash
cd e2e && npm install        # playwright-core; no browser download, no driver binary
npm run build:vite           # from the repo root — the harness drives the BUILT UI
```

### Smoke tests

```bash
cd e2e && npm test
```

Launches the desktop app on your real data, runs `tests/*.test.js`, asserts the major routes render. Used as the green-light gate before a release. The theme test's clicks are undone: the suite puts your `ui` settings back when it ends.

### Screenshots

```bash
npm run screenshots          # from repo root
# or:
cd e2e && npm run capture
```

Drives the desktop app through a fixed list of routes (`TARGETS` in `e2e/capture-direct.js`) and writes PNGs straight into the marketing site's `public/screenshots/` folder. Rebuild the UI first with `npm run build:vite` if the renderer has drifted.

#### Re-capture with a different theme

`capture-direct.js` clicks the named preset tile in Settings → Appearance before the capture loop runs, so every shot reflects a chosen theme. Default is **Fine Press**.

```bash
JW_THEME="Fine Press"   npm run screenshots   # default
JW_THEME="Studio"       npm run screenshots
JW_THEME="Ivory Press"  npm run screenshots
JW_THEME="Calm Modern"  npm run screenshots
JW_THEME="Editorial"    npm run screenshots
```

The theme name has to match the preset's visible `<b>` label exactly. The change persists (it is your real settings), so subsequent app launches keep that look until you switch again.

#### Capture gotchas

- **The harness drives whatever `dist/` was last built.** Run `npm run build:vite` before capturing if you've changed renderer code.
- **Don't have JustWrite open** while capturing — both would run a server on :17495 over the same data folder.

---

## Release process

Manual release, triggered by `gh workflow run`. Pushes and tags do **not** build by themselves.

```bash
# 1. Bump the version (package.json)
npm run bump 1.2.0

# 2. Commit, tag, push (the bump script does NOT do this)
git add package.json
git commit -m "release: v1.2.0"
git tag v1.2.0
git push && git push --tags

# 3. Dispatch the build
npm run release              # all platforms
npm run release:windows      # or one
```

What the workflow does (see `.github/workflows/release.yml`):

1. Builds .dmg (macOS universal), .exe (Windows, NSIS), .AppImage + .deb (Linux) with electron-builder on per-platform runners — each checks out the kit (`delebash/just-llm-runner`) beside the app.
2. Creates / updates GitHub Release `v<version>` with the binaries attached.
3. Packs `docs/` into `docs.tar.gz` and attaches it to the release.
4. Fires a `repository_dispatch` at the marketing-site repo so it rebuilds with the new docs.

Watch with `gh run watch` or open the workflow runs page. A full all-platform build is roughly 9-15 min wall time.

> **`WEBSITE_DISPATCH_TOKEN`** secret in repo settings drives step 4. Without it, the workflow logs a skip and the marketing site won't refresh automatically — push a no-op commit to the marketing repo to trigger it manually.

---

## Project structure

```
justwrite-app/
├── CLAUDE.md                  ← instructions for Claude Code (project context, conventions)
├── README.md
├── docs/                      ← user-facing docs (the in-app Help corpus; docs.tar.gz on release)
│   ├── dev/                   ← TASKS.md (live tracker) · IDEAS.md · architecture notes
│   └── plans/                 ← dated plan/history docs (archive/ = closed history)
├── biome.json                 ← the linter (checker only; formatter off)
├── package.json
├── vite.config.js             ← vite root is the REPO root; aliases @delebash/llm-ui → ../just-llm-runner/ui/src
├── index.html
├── scripts/
│   ├── dev.mjs                ← `npm run dev`: Vite, then the Electron window pointed at it
│   ├── node24.mjs             ← runs a script on Electron's own Node (the server's runtime)
│   ├── bump.js                ← version bumper (package.json)
│   └── release.js             ← wraps gh workflow run
├── electron/main.js           ← the desktop app: the kit's runDesktopApp with this app's settings
├── build/                     ← installer icons, tray icon, the headless launcher (launcher/)
├── e2e/                       ← screenshot capture + smoke tests (own package.json)
│   ├── capture-direct.js
│   ├── lib/driver.js
│   └── tests/smoke.test.js
├── server/                    ← the data server (Node, Fastify, :17495) — ALL persistence
│   ├── src/                   ← serve.js (the entry) · app.js · api/ · database/
│   └── tests/                 ← vitest suite
├── src/                       ← the Vue renderer (no src/renderer nesting)
│   ├── main.js                ← Vue entry; wires the kit's UI; boots stores off the server
│   ├── App.vue
│   ├── router/index.js
│   ├── i18n/                  ← vue-i18n setup + locales/ (en, es)
│   ├── styles/                ← tokens.css · styles.css (fonts.css stays at src/)
│   ├── stores/                ← project, ui, ai, sessions (Pinia)
│   ├── services/              ← native.js (the desktop shell's calls) · rag/ · export/ · …
│   ├── components/
│   └── views/
└── data/                      ← the dev data folder (gitignored): the database, models, logs
```

---

## How the desktop shell is reached

The renderer reaches the desktop shell through ONE file, `src/services/native.js`: ordinary
exports (`pickDirectory`, `pickFile`, `saveFile`, `storageGetRoot`, `storageRelocate`,
`setKeepRunning`, `setTrayLabels`, the openers, `onShellEvent` for the tray), each calling the
kit's preload object `window.appShell`. The shell itself is the kit's shared Electron main
module (`@delebash/llm-runner/shell`); `electron/main.js` only names this app's settings. Outside
the desktop app (a browser tab on `npm run dev:vite`, or the headless server's UI) every call
answers the browser's way — null or a no-op — and the renderer falls back to downloads and
file inputs.

A new shell command is added to the kit (its `COMMANDS` list in `server/src/shell/main.js` and
`preload.cjs`), then exported once from `native.js`.

---

## AI providers

AI runs through the family's **shared LLM stack** (`../just-llm-runner`): the server
mounts its providers/routing/usage API (`/v1/llm-providers`, `/v1/ai/*`) with
official-SDK adapters per vendor (OpenAI · Anthropic · Gemini) plus the
OpenAI-compatible shape for local servers, and the renderer consumes the shared
`@delebash/llm-ui` views (providers & models · routing by feature · usage) via a
Vite source alias. A bundled llama.cpp runner downloads, tunes, and serves local
GGUF models — no separate install. Add any OpenAI-compatible provider (Ollama, LM
Studio, vLLM, …) via **Add provider** on the AI Settings page. (The old
single-client `openai-compat.js` era ended with the 2026-06 gateway retirement.)

---

## Working with Claude Code

This repo is set up to be developed with [Claude Code](https://claude.com/claude-code), Anthropic's CLI. The same flow works for the [Claude Code GitHub Action](https://github.com/anthropics/claude-code-action) and for human contributors who want a sense of the conventions.

### Project context

- **`CLAUDE.md`** at the repo root is the agent's project brief: the thin-client/server split, the IPC bridge contract, the Pinia store invariants (snapshot-based undo, soft delete, coalesced keystroke actions), the shared-kit rules, the export adapters, and the "Don't" list. Read it before changing renderer code; the live tracker is `docs/dev/TASKS.md`.
- **`docs/`** is user-facing reference, mirrored to the marketing site. When you ship a feature, update the relevant doc in the same commit (this is enforced by repo convention, not by hooks).

### Recommended workflow

```bash
# Start a session in the repo
claude

# Or with the Claude Code extension in VS Code / JetBrains —
# it picks up CLAUDE.md automatically.
```

A few patterns that work well here:

| Task | How to ask |
|---|---|
| **Add a new view** | Sketch what it should show. Claude will scaffold the Vue file, wire the route, add a sidebar entry, and update `docs/` if it's a user-facing surface. |
| **Add a new AI feature** | Mention which provider/feature key in `ai.featureRouting` it routes through. The AI-call pattern is `runAiStream` from `services/aiStream.js` — don't roll a new stream loop. |
| **Refresh screenshots after a UI change** | `Re-run npm run screenshots after rebuilding, then commit the diffs to ../justwrite-website.` Optionally pass `JW_THEME=<preset>` to capture in a different look. |
| **Deep audit / refactor pass** | `Use a workflow for a deep audit refactor.` The keyword *workflow* opts in to multi-agent orchestration — runs Biome / depcheck / jscpd / madge in parallel, triages findings against the actual code, applies safe fixes, hands back a punch list. |
| **Cut a release** | `Smoke test, bump to 1.2.0, full release.` Triggers `e2e/npm test`, the bump script, the commit/tag/push, and `npm run release` end-to-end. |
| **Update the marketing site** | The sibling repo `justwrite-website/` (Astro + GitHub Pages) consumes `docs.tar.gz` from each release and renders `src/components/Inside.astro` + `Screenshots.astro` for feature copy and gallery. Claude knows to commit screenshots there, not here. |

### Code conventions Claude follows

- **Plain JS, not TypeScript.** No `tsconfig.json`, no migration to TS unless explicitly asked.
- **`window.justwrite`, not `invoke()`.** The browser-only dev path breaks if you bypass the bridge.
- **`Jw*` components, not raw HTML.** Exceptions exist (title inputs, sidebar chrome, `.tb-btn` family, DateTimePicker internals) and are listed in `CLAUDE.md`.
- **`confirmDialog` only for irreversible actions.** Undoable mutations show a toast naming what changed and lean on the undo history.
- **Real screenshots, not invented mockups.** Use the e2e harness for visuals.

### What Claude *won't* do without being asked

- Run `git commit`. Commits stay manual.
- Run tests or drive the app in a browser to verify. A clean compile check is fine; behaviour verification is the human's job.
- Add new linters, formatters, test runners, or TS configs.

---

## Code audit & refactor

Four dev-only tools are wired into devDependencies for periodic cleanup. None run automatically.

| Tool | What it finds | When to reach for it |
|---|---|---|
| **Biome** | Unused imports, dead variables, suspicious patterns. Auto-fixes most of what it flags. | After heavy iteration when imports and locals drift out of sync. |
| **depcheck** | `package.json` deps that nothing imports — and the reverse (imports of packages not declared). | Before a release, or after ripping out a feature. |
| **jscpd** | Copy-paste detector. Surfaces duplicated blocks with file:line citations. | When you suspect a helper should be extracted but don't know where the copies live. |
| **madge** | Circular dependencies and orphan files in the renderer. | When import errors get weird, or when untangling a module. |

### Light audit — run by hand

```bash
npx biome check src/        # lint findings (add --apply for safe auto-fixes)
npx depcheck                              # unused / missing deps
npx jscpd src/               # writes a report to ./report/
npx madge --circular src/    # circular deps only
npx madge --orphans src/     # files not imported anywhere
```

Read the output, fix what's obvious, skip what isn't. Biome's `--apply` is safe to run blind; the other three are read-only.

### Deep audit — hand it to Claude Code

For a full pass — run all four tools, triage findings against the actual code (catches false positives like dynamic imports), apply the safe fixes, and produce a punch list of judgment calls — ask Claude Code to **"use a workflow for a deep audit refactor"**. The keyword *workflow* opts in to multi-agent orchestration: the audit fans out across parallel subagents instead of one agent reading every report end-to-end. Expect a few minutes wall-time and substantial token use; you get a structured report back instead of triaging hundreds of raw findings yourself.

---

## License

Your code, your terms. Models and APIs are subject to their providers' terms.
