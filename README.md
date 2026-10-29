# JustWrite

A desktop writing app for novels. AI is optional, and you choose where it runs: the **built-in engine** (llama.cpp, bundled) runs a model on your own computer, or add a provider — OpenAI, Anthropic, Gemini, Ollama, LM Studio, or anything that speaks the OpenAI API.

Built with **Electron + Vite + Vue 3 + Pinia**, and a local **Node (Hono) server** that holds all the data — plain JavaScript end to end (since 2026-10-08; it was Tauri + Rust + Python before).

User docs live in `docs/`. The marketing site at <https://delebash.github.io/justwrite-website/> mirrors them for each release.

---

## Quick start

```bash
npm install            # the renderer + the server/ workspace (the kit ../just-core and the sync
                       # engine ../just-sqlite-sync sit beside this repo — see Setup)
cd src-electron && npm install && cd ..   # once: the desktop app's own packages
npm run dev            # Vite HMR + the desktop window (Electron), its server on the dev data folder data/
npm run build          # The installer for the current OS, in dist/electron/Packaged/
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

- **A built-in local engine.** llama.cpp comes with the app: **Quick Setup** checks your computer, picks a model that fits it, downloads it and runs it — private, free, nothing else to install.
- **Any provider.** OpenAI, Anthropic and Gemini through their own SDKs; DeepSeek, xAI, Mistral and OpenRouter; Ollama, LM Studio, vLLM, or any OpenAI-compatible server.
- **Per-feature model picker.** Use one model for chat, another for critique, another for entity sweeps.
- **Ask-the-book chat.** Hybrid BM25 + vector retrieval with citations back to the chapters the answer came from.
- **Talk to a character.** Converse with anyone in your cast in their own voice, with story-world knowledge — and **Save to sheet** turns an answer into fields on their sheet.
- **Draft with AI on the story-world pages.** Describe a character, location, object or group in a line; the AI drafts the sheet and you keep the fields you want.
- **Draft from plan.** With AI scene drafting on for a book, a scene's Summary becomes a drafted scene — and the AI's words keep a violet ink until you make them yours.
- **In-editor bubble actions.** Rewrite, expand, tighten, continue from cursor — or generate three alternatives side by side.
- **Guided continue.** Continue the prose with a specific brief.
- **Voice canon.** A "match my style" fingerprint sampled from chapters you choose, injected into every generation.
- **Unstuck — five ways out.** A stuck-on-this-chapter diagnostic that offers five distinct ways forward.
- **Brainstorm pane.** Names, titles, plot twists, next beats — fifteen-to-twenty options per click, thumbs-up to steer.
- **Marketing pack.** Logline, blurbs, synopsis, pitch, comp titles — generated in one pass from the same chapter digest.
- **Multi-reader panel.** Four reader personas (genre reader / literary critic / agent intern / book-club reader) react to a chapter in parallel.
- **AI-tells scanner.** Deterministic — flags stock verbs, body-language clichés, hedges. No LLM call, no token spend.
- **Sensory research pack.** Smell, sound, touch, taste, period detail — fifteen specific phrases in twenty seconds.
- **The Lab.** Under **Routing by feature**, each AI feature's prompt, model and preset — tried on samples, tuned, then put in production.
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

- **Local first.** Your books live in a database in JustWrite's data folder, on your computer. No account, no upload, no server lock-in.
- **Soft delete + Trash.** Every deletion is undoable; Trash holds items indefinitely until you empty it.
- **Undo / redo per page.** Up to 1,000 steps for each part of the book (the manuscript, characters, notes, …), so undoing on one page never undoes another's newer change. ⌘Z / ⌘⇧Z. It lasts while the app is open; a chapter's **Versions** keep what outlasts a restart.
- **Autosave.** Every change persists through the app's local server within seconds — the renderer holds no data of its own.
- **Backups.** A JSON copy on disk within seconds of every change, a full backup (database and files) whenever you ask, and any one book as a `.zip` to move or share.
- **Your other devices.** **Settings → Sync** keeps your books on your other computers; **Settings → Server** lets a browser on another device open JustWrite.
- **English and Spanish.** Every screen, with dates and numbers in the interface's language.

---

## Setup

### Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| **Node 24+** | The renderer build, the scripts, npm | <https://nodejs.org/> |
| **The kit** | `../just-core` beside this repo — the shared server package (`file:../just-core/packages/core`) and Vue kit (the vite alias) | `git clone https://github.com/delebash/just-core ../just-core` then `cd ../just-core/packages/core && npm install` and `cd ../ui && npm install` |
| **The sync engine** | `../just-sqlite-sync` beside this repo — the server's sync (`file:../just-sqlite-sync`) | `git clone https://github.com/delebash/just-sqlite-sync ../just-sqlite-sync` then `cd ../just-sqlite-sync && npm install` |
| **gh CLI** | Triggering the release workflow only | <https://cli.github.com/> + `gh auth login` |

Electron comes in through `npm install` (a devDependency); the server runs on Electron's own Node
(`scripts/node24.js`), so nothing else is needed — no Python, no Rust.

### One-time

```bash
npm install            # the renderer + the server/ workspace
cd src-electron && npm install   # the desktop app's own packages (Electron)
cd e2e && npm install  # only if you'll run the screenshots or the e2e smoke
```

---

## NPM scripts

Run from the repo root unless noted.

| Script | What it does |
|---|---|
| `npm run dev` | The desktop app — Quasar's dev server on :1420 with hot reload, and the Electron window pointed at it; the window's server runs on the dev data folder `data/`. |
| `npm run build` | The installer for the current OS (Quasar's Electron mode, electron-builder). Outputs to `dist/electron/Packaged/` — on Windows `JustWrite Setup <version>.exe`, with `win-unpacked/` beside it. |
| `npm run dev:spa` | Renderer only, in a plain browser tab at `http://localhost:1420` — no desktop shell; data still flows through the server (start it yourself: `npm run server`). |
| `npm run server` | The server alone (headless) on :17495, on the dev data folder `data/` (`--port`, `--host`, `--data-dir` after `--`). |
| `npm run build:spa` | Renderer build only (`dist/spa/` — what the headless server serves). |
| `npm run build:unpacked` | The desktop app built but not packaged (`dist/electron/UnPackaged/`), without its server package installed — so it runs only against a server you start. The e2e harness needs `npm run build`. |
| `npm run build:android` | The Android app (Quasar's Capacitor mode). |
| `npm run bump <version>` | Sets the version with `npm version` in `package.json`, `server/package.json` (the server answers with it) and `package-lock.json` together. **Does not commit or tag** — you do. See [Release process](#release-process). |
| `npm run release [version]` | Triggers the GitHub Actions release build via `gh workflow run`. Requires the tag to already exist on origin. Interactive `[y/N]` confirm. |
| `npm run release:windows` · `:macos` · `:linux` | Same as `release` but builds a single platform. |
| `npm run screenshots` | Runs the e2e screenshot capture (same as `cd e2e && npm run capture`). Drives the desktop app on the built UI over a copy of your data, writes PNGs to `../justwrite-website/public/screenshots/`. Requires `npm run build` first. |
| `npm test` | Runs the e2e smoke suite (delegates to `npm test --prefix e2e`). Drives the desktop app (the built UI, your real data) through the major routes and asserts each surface renders. Requires `npm run build` first. |
| `npm run test:unit` · `test:server` · `test:fast` | vitest over the renderer · vitest over the server (`server/tests/`, on Electron's Node) · the quick gate chaining both plus `build:spa`. |
| `npm run i18n:lint` · `i18n:report` · `i18n:pseudo` | i18n-only eslint rules · locale coverage report (MISSING must stay zero) · pseudo-locale build. |
| `npm run bench` (`:gpu`, `:cpu`) · `npm run smoke` · `npm run dup` | LLM bench harness · scripted smoke · jscpd duplicate scan. |

> Linting is **biome** (`biome.json`, checker only — the formatter is deliberately off) plus the i18n eslint config; run them by hand, nothing hooks the dev loop.

---

## E2E harness (smoke tests + screenshots)

Lives in `e2e/`. Automation over the real desktop app — Electron, the built UI from `app://` — through Playwright's Electron driver (`playwright-core`) — see [`e2e/README.md`](e2e/README.md) for the full story.

### Prereqs (one-time)

```bash
cd e2e && npm install        # playwright-core; no browser download, no driver binary
npm run build                # from the repo root — the harness drives the BUILT desktop app (with its server)
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

Drives the desktop app through a fixed list of routes (`TARGETS` in `e2e/capture-direct.js`), then the newer features with real answers from your local model (`FEATURES`), and writes PNGs straight into the marketing site's `public/screenshots/` folder. Rebuild it first with `npm run build` if the renderer has drifted.

It never touches your data: it copies your data folder, imports the bundled sample book **The Salt-Iron Road** into the copy, opens the app on the copy, and deletes the copy at the end. The copy borrows your installed engine and models, because the features run the real AI — which uses the graphics card, so check nothing else needs it first.

| Variable | Default |
|---|---|
| `JW_SHOTS_DIR` | the website checkout's `public/screenshots/` beside this repo |
| `JW_SHOTS_BOOK` | `server/samples/The Salt-Iron Road.zip` |
| `JW_DATA_ROOT` | the data folder the app uses |
| `JW_SHOTS_PORT` | 17504 — the copy's server while it imports the book |
| `JW_SHOTS_ONLY` | every picture — or a comma list of names (`sheet-draft,ask-the-book`) to retake just those |

`node e2e/capture-direct.js --no-ai` takes the page pictures only, without the model.

Close JustWrite — `npm run dev` included — and don't start it while the capture runs. The app it drives takes JustWrite's own port (17495); a JustWrite started meanwhile stops the capture's server as its own, and the capture's window would then be working on your real books.

#### Re-capture with a different theme

`capture-direct.js` clicks the named preset tile in Settings → Appearance before the capture loop runs, so every shot reflects a chosen theme. Default is **Fine Press**.

```bash
JW_THEME="Fine Press"   npm run screenshots   # default
JW_THEME="Studio"       npm run screenshots
JW_THEME="Ivory Press"  npm run screenshots
JW_THEME="Calm Modern"  npm run screenshots
JW_THEME="Editorial"    npm run screenshots
```

The theme name has to match the preset's visible `<b>` label exactly. It changes the copy's settings only.

#### Capture gotchas

- **The harness drives whatever `dist/electron/UnPackaged/` was last built.** Run `npm run build` before capturing if you've changed renderer code.
- **Close JustWrite first.** The app the capture opens starts its server on the same port (:17495); with JustWrite open it stops at the connection page.
- **A step that fails** leaves `capture-failed.png` beside the pictures — what the app showed at that moment.

---

## Release process

Manual release, triggered by `gh workflow run`. Pushes and tags do **not** build by themselves.

```bash
# 1. Bump the version (package.json, server/package.json, package-lock.json)
npm run bump 1.2.0

# 2. Commit, tag, push (the bump script does NOT do this)
git add package.json server/package.json package-lock.json
git commit -m "release: v1.2.0"
git tag v1.2.0
git push && git push origin v1.2.0

# 3. Dispatch the build
npm run release              # all platforms
npm run release:windows      # or one
```

What the workflow does (see `.github/workflows/release.yml`):

1. Builds .dmg (macOS universal), .exe (Windows, NSIS), .AppImage + .deb (Linux) with Quasar's Electron mode (electron-builder) on per-platform runners — each checks out the kit (`delebash/just-core`) and the sync engine (`delebash/just-sqlite-sync`) beside the app, at the commits the app was tested with.
2. Starts each packaged app as a user would, and its server on its own through `justwrite-server`; opens the AppImage on the current Ubuntu LTS (`scripts/start-packaged.js`, the family template's).
3. Only when every check passed: creates / updates GitHub Release `v<version>` with the binaries and the update feed attached.
4. Packs `docs/` into `docs.tar.gz` and attaches it to the release.
5. Fires a `repository_dispatch` at the marketing-site repo so it rebuilds with the new docs.

Watch with `gh run watch` or open the workflow runs page. A full all-platform build is roughly 9-15 min wall time.

> **`WEBSITE_DISPATCH_TOKEN`** secret in repo settings drives step 5. Without it, the workflow logs a skip and the marketing site won't refresh automatically — push a no-op commit to the marketing repo to trigger it manually.

---

## Project structure

```
justwrite-app/                 ← a Quasar app (the family layout: the kit's docs/app-structure.md §Q)
├── CLAUDE.md                  ← instructions for Claude Code (project context, conventions)
├── README.md
├── docs/                      ← user-facing docs (the in-app Help corpus; docs.tar.gz on release)
│   ├── dev/                   ← TASKS.md (live tracker) · IDEAS.md · architecture notes
│   └── plans/                 ← dated plan/history docs (archive/ = closed history)
├── biome.json                 ← the linter (checker only; formatter off)
├── package.json               ← the renderer; npm workspace "server"
├── quasar.config.js           ← the ONE build config: the renderer, the desktop app, the phone app
├── index.html                 ← the CSP and the static boot plate
├── scripts/
│   ├── node24.js              ← runs a script on Electron's own Node (the server's runtime)
│   ├── smoke.js               ← `npm run smoke`: the renderer gate
│   ├── bump.js                ← version bumper (npm version: package.json, server/, the lock)
│   └── release.js             ← wraps gh workflow run
├── src-electron/              ← the desktop app (Quasar's Electron mode; own package.json)
│   ├── electron-main.js       ← the kit's runDesktopApp with this app's settings
│   ├── electron-preload.js    ← the kit's preload
│   └── electron-assets/icons/ ← app and tray icons
├── src-capacitor/             ← the phone app (Quasar's Capacitor mode)
├── build/launcher/            ← the headless launcher, installed beside the exe
├── e2e/                       ← screenshot capture + smoke tests (own package.json)
│   ├── capture-direct.js
│   ├── lib/driver.js
│   └── tests/smoke.test.js
├── server/                    ← the data server (Node, Hono, :17495) — ALL persistence; its own
│   │                            package (justwrite-server), which the desktop app installs
│   ├── src/                   ← serve.js (the entry) · app.js · api/ · database/ · editor/ (the
│   │                            editor schema, shared with the renderer)
│   ├── samples/               ← the bundled books: the tutorial (The Ninth Facet) and The Salt-Iron Road
│   └── tests/                 ← vitest suite
├── src/                       ← the Vue renderer
│   ├── boot/                  ← start-up: i18n.js (vue-i18n) · jw.js (wires the kit's UI; boots
│   │                            stores off the server)
│   ├── App.vue                ← the root: a bare <router-view>
│   ├── layouts/MainLayout.vue ← the chrome: q-layout — the title bar, the sidebar (q-drawer), the page
│   ├── pages/                 ← one <Name>Page.vue per route (each a q-page); ConnectionErrorPage at /offline
│   ├── router/                ← index.js (the router) · routes.js (the pages under the layout)
│   ├── css/                   ← tokens.css · app.scss · quasar.variables.scss (the kit's theme); the fonts are the kit's
│   ├── i18n/                  ← vue-i18n setup + locales/ (en, es)
│   ├── stores/                ← project, ui, ai, sessions (Pinia)
│   ├── services/              ← native.js (the desktop shell's calls) · rag/ · export/ · …
│   └── components/
└── data/                      ← the dev data folder (gitignored): the database, models, logs
```

---

## How the desktop shell is reached

The renderer reaches the desktop shell through ONE file, `src/services/native.js`: ordinary
exports (`pickDirectory`, `pickFile`, `saveFile`, `storageGetRoot`, `storageRelocate`,
`setKeepRunning`, `setTrayLabels`, the openers, `onShellEvent` for the tray), each calling the
kit's preload object `window.appShell`. The shell itself is the kit's shared Electron main
module (`@delebash/core/shell`); `src-electron/electron-main.js` only names this app's settings.
Outside the desktop app (a browser tab on `npm run dev:spa`, or the headless server's UI) every call
answers the browser's way — null or a no-op — and the renderer falls back to downloads and
file inputs.

A new shell command is added to the kit (its `COMMANDS` list in `server/src/shell/main.js` and
`preload.js`), then exported once from `native.js`.

---

## AI providers

AI runs through the family's **shared LLM stack** (`../just-core`): the server
mounts its providers/routing/usage API (`/v1/llm-providers`, `/v1/ai/*`) with
official-SDK adapters per vendor (OpenAI · Anthropic · Gemini) plus the
OpenAI-compatible shape for local servers, and the renderer consumes the shared
`@delebash/ui` views (providers & models · routing by feature · usage) via a
Vite source alias. A bundled llama.cpp runner downloads, tunes, and serves local
GGUF models — no separate install. Add any OpenAI-compatible provider (Ollama, LM
Studio, vLLM, …) via **Add provider** on the AI Settings page. (The old
single-client `openai-compat.js` era ended with the 2026-06 gateway retirement.)

---

## Working with Claude Code

This repo is set up to be developed with [Claude Code](https://claude.com/claude-code), Anthropic's CLI. The same flow works for the [Claude Code GitHub Action](https://github.com/anthropics/claude-code-action) and for human contributors who want a sense of the conventions.

### Project context

- **`CLAUDE.md`** at the repo root is the agent's project brief: the server-owns-the-data split, the commands and gates, the invariants that bite (undo domains, coalesced keystroke actions, the kit's controls, i18n), and the family rules. Read it before changing code; the live tracker is `docs/dev/TASKS.md`.
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
| **Add a new AI feature** | Say which row of **Routing by feature** it belongs under. AI calls go through the kit's AI-call convention (`withAiTask` from `@delebash/ui`; the kit's `docs/app-structure.md` §8) — don't roll a new stream loop. |
| **Refresh screenshots after a UI change** | `Re-run npm run screenshots after rebuilding, then commit the diffs to ../justwrite-website.` Optionally pass `JW_THEME=<preset>` to capture in a different look. |
| **Deep audit / refactor pass** | `Use a workflow for a deep audit refactor.` The keyword *workflow* opts in to multi-agent orchestration — runs Biome / depcheck / jscpd / madge in parallel, triages findings against the actual code, applies safe fixes, hands back a punch list. |
| **Cut a release** | `Smoke test, bump to 1.2.0, full release.` Triggers `e2e/npm test`, the bump script, the commit/tag/push, and `npm run release` end-to-end. |
| **Update the marketing site** | The sibling repo `justwrite-website/` (Astro + GitHub Pages) consumes `docs.tar.gz` from each release and renders `src/components/Inside.astro` + `Screenshots.astro` for feature copy and gallery. Claude knows to commit screenshots there, not here. |

### Code conventions Claude follows

- **Plain JS, not TypeScript.** No `tsconfig.json`, no migration to TS unless explicitly asked.
- **`src/services/native.js`, not `window.appShell`.** Every desktop-shell call goes through that one file, which answers the browser's way outside the desktop app.
- **The kit's `Ui*` controls, not raw HTML** — one `intent` prop for role and style, and a `width` prop that sizes a field to what it holds.
- **`confirmDialog` only for irreversible actions.** Undoable mutations show a toast naming what changed and lean on the undo history.
- **Real screenshots, not invented mockups.** Use the e2e harness for visuals.

### Checking a change

A change is done when the gates in `CLAUDE.md` pass: `npm run test:fast`, the headless smoke (`npm run smoke`) for anything the app shows, the click-through flows (`npm run test:flows`), and the family guard. Claude doesn't add linters, formatters, test runners or TypeScript configs without being asked.

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

MIT — see [`LICENSE`](LICENSE); the code it bundles from others keeps its own licence ([`NOTICE.md`](NOTICE.md)). Models and APIs are subject to their providers' terms.
