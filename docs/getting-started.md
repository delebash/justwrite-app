# Getting started

This page covers installing JustWrite, opening it for the first time, finding your way around, and (optionally) wiring up AI features. Plan on about ten minutes.

---

## Install

JustWrite is a desktop app. Download the installer for your operating system from the [JustWrite website](https://delebash.github.io/justwrite-website/), run it, and open the app. There is no account to create, no subscription, nothing to register.

The first launch may take a few seconds longer than usual while the app sets up its workspace on your computer.

---

## Your first project

The very first time you open JustWrite, a **welcome screen** greets you. It sums up what the app does — chapters & scenes, the story bible, plot strands & timeline, AI assistance, goals & pace, export — and offers the two ways to begin:

- **Start a new project** — give it a title and (optionally) an author, and you're writing.
- **Try the tutorial project** — opens *The Ninth Facet*, a complete sample novel (more below).

The same screen introduces the optional AI features: **Run Quick Setup** installs a free local model that runs privately on your own PC, **Connect an online provider** points JustWrite at any OpenAI-compatible service, and you can skip both — everything is available later in AI settings. The welcome screen shows once; you can reopen it any time from the **Help** page (sidebar → Help → "Show welcome screen").

A fresh workspace has **no projects yet** — the welcome screen is where the first one is born, and it stays your home screen until one exists. Once you have projects, the sidebar's project switcher at the top of the left rail is where you rename them, create more, and move between them.

### Try tutorial project

If you'd rather explore with a complete example first, the project switcher has a **"Try tutorial project"** item alongside the usual "+ New project" button. It opens *The Ninth Facet* — a real, complete sample novel (a magitech guild-adventure) with characters, locations, objects, groups, worldbuilding, chapters, plot strands, and events — so you can click through every screen without building anything yourself. It is created only when you ask for it, it is a real project you can edit freely, and when you're done you can delete it from the same switcher (the button brings it back fresh any time).

---

## A quick tour

The sidebar on the left is the main map. It is grouped into five sections:

- **Manuscript** — Search, Home, Architecture, Strands, Chapters, Ask the book
- **Story world** — Characters, Locations, Objects, Groups, Worldbuilding
- **Planning** — Plot board, Timeline, Notes, Relations
- **Project** — Analysis, Export, Trash, Settings

Hover any item to see its name. Click to open it. Drag the right edge of the sidebar to resize it; press **Ctrl/⌘ + \\** to hide it entirely (and again to bring it back).

Most sections have a tree under them. Click the chevron next to **Chapters** in the sidebar to see your Parts and chapters. Click the chevron next to **Characters** to see your cast. Each tree has a `+` button to add a new item.

If you're not sure what a pane does, look for the small **`?`** button next to its title. Clicking it opens a help drawer on the right with the docs for that surface — so you can get an answer without leaving the app or switching to a browser tab.

---

## Make a new project

You can have several projects at once.

1. Click the **project name** at the top of the sidebar (it shows the current title and author).
2. Choose **New project** from the dropdown.
3. Give it a title and (optionally) an author name.

JustWrite creates a fresh blank project and switches to it. Switch back at any time from the same dropdown.

---

## Starting from an existing draft

If you already have a manuscript in Word, Markdown, EPUB, or LibreOffice, you do not need to retype it.

Open **Import** from the sidebar's Project section, drag your file onto the page (or use the file picker), and let the parser detect your chapters. You can review and rename them before they are added. See [Import and export](import-and-export.md) for the full walkthrough.

---

## Optional: connect an AI provider

JustWrite's writing tools, "Ask the book" chat, critique, and entity extraction all use AI. None of them are required — you can write an entire novel in JustWrite with zero AI calls. But if you want to use them, you choose the provider.

The choice is yours, and you can have several at once. Common options:

- **OpenAI** (paid, cloud) — writing. Excellent quality. Add your API key in Settings.
- **Anthropic Claude** (paid, cloud) — writing only. Excellent quality, particularly for critique and longer prose work. Add your `sk-ant-…` key.
- **Ollama / LM Studio / llama.cpp** (free, local) — writing only. Runs on your own machine. No internet required, no data leaves your computer, no API bills. The **Quick Setup** wizard on the AI Settings page detects your GPU, downloads the right models for your card, and applies a sensible routing preset in one click — the easiest path to a working local-LLM setup.

To add a provider:

1. Open **AI Settings** in the sidebar.
2. Click **Add provider**.
3. Choose a preset, paste any API key needed, and click **Test** to confirm the connection.

See [AI providers](ai-providers.md) for setup instructions for each engine.

---

## A typical first session

A common rhythm for a writer's first day with the app:

1. Open **Settings → Project** and fill in your book's title, your name, the genre, a deadline, and a word goal.
2. Open **Architecture** and write a paragraph in the **Premise** document — what the book is about in one breath.
3. Open **Characters** and add your protagonist. Fill in Wants / Needs / Lie / Truth (the Motivation panel). You can come back and finish the rest later.
4. Open **Chapters**, add **Chapter 1**, and start writing.

You don't have to do these in this order, and you don't have to do all of them. JustWrite works the same whether you plan first and write later, write first and plan later, or jump between the two.

---

## Where to go next

- **[Core concepts](core-concepts.md)** — what Parts, Chapters, and Scenes actually mean in JustWrite, and how undo + autosave work.
- **[Writing](writing.md)** — the editor in detail.
- **[AI providers](ai-providers.md)** — provider-by-provider setup, if you decided to enable AI.

---

## For developers

JustWrite is open source. The repository lives at **[github.com/delebash/justwrite-app](https://github.com/delebash/justwrite-app)**.

If you want to run from source instead of using a packaged installer:

```bash
git clone https://github.com/delebash/justwrite-app.git
cd justwrite-app
npm install
npm run dev
```

You will need:

- **[Node.js](https://nodejs.org/)** — for the renderer build (Vite + Vue 3).
- **[Rust](https://www.rust-lang.org/tools/install)** — for the Tauri backend.

The first `npm run dev` compiles the Rust crate and is slow; every subsequent launch is fast.

| Command | What it does |
|---|---|
| `npm install` | JS dependencies (first run only) |
| `npm run dev` | Tauri dev — Vite HMR + a native window |
| `npm run build` | Packaged app for the current OS |
| `npm run dev:vite` | Renderer only, in a plain browser tab (no Tauri APIs — project data still uses the server; images fall back to data-URLs) |
| `npm run build:vite` | Renderer build only (Tauri invokes this via `beforeBuildCommand`) |
| `npm run bump <version>` | Update the version number in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` |
| `npm run release` | Trigger the GitHub Actions cross-platform release build (manual only) |
| `npm run release:windows` | Same, but build Windows only — useful for iteration before going full release |
| `npm run release:macos` | Same, macOS only |
| `npm run release:linux` | Same, Linux only |

The architecture and contribution notes live in the repo's `CLAUDE.md` and `README.md`.

### Releasing

The release pipeline is **manual on purpose** — no build runs on push, PR, or tag. Releases are kicked off explicitly with `npm run release`, which calls `gh workflow run release.yml` against the GitHub Actions workflow at `.github/workflows/release.yml`.

The typical flow:

```bash
npm run bump 0.2.0                                  # updates the 3 version files (no commit)
git commit -am "release: v0.2.0"
git tag v0.2.0
git push && git push --tags
npm run release                                     # confirms, then triggers the workflow
```

**Single-platform iteration.** When you're testing on one OS and don't want to spend ~20 min waiting for builds you won't use, target a single platform:

```bash
npm run release:windows     # only spins up the Windows runner
npm run release:macos       # only macOS
npm run release:linux       # only Linux
```

The GitHub Release picks up whichever binaries land first; re-running with a different platform later adds those binaries to the same release.

The workflow runs three jobs:

1. **`build`** — matrix build via [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) on macOS (universal `.dmg`), Windows (`.exe` + `.msi`), and Linux (`.AppImage` + `.deb` + `.rpm`). The matrix is computed dynamically from the `platforms` workflow input (`all` / `windows` / `macos` / `linux`). Creates the GitHub Release and uploads the binaries.
2. **`attach-docs`** — packs the `docs/` folder into `docs.tar.gz` and attaches it to the release. The marketing site treats this as the source of truth for the docs at this version.
3. **`notify-website`** — fires a `repository_dispatch` to [`justwrite-website`](https://github.com/delebash/justwrite-website), which rebuilds and redeploys with the new docs.

**One-time setup for releases:**

- Install [`gh`](https://cli.github.com/) and run `gh auth login`.
- Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope on `justwrite-website`, then add it as a repository secret named `WEBSITE_DISPATCH_TOKEN` on `justwrite-app`. Without it, the build still succeeds — the marketing site just won't auto-rebuild.

**Code signing.** Skipped intentionally. macOS users see a "unidentified developer" Gatekeeper prompt on first launch (right-click → Open to bypass); Windows users may see SmartScreen warnings. Add an Apple Developer Certificate + Windows code-signing cert later if the friction becomes a problem.

**Auto-update.** Not enabled. Users download newer versions manually from the GitHub Releases page.

---

## Before a project exists

With no project loaded, the **Welcome** screen is home — the only other surfaces
that work project-less are AI Settings and Help, and both link back to Welcome.

## Sidebar tricks worth knowing

Each sidebar section has a **filter box** (type to narrow long lists), and items
support **drag-to-reorder** — including parts and chapters, which reorders the
manuscript itself. **Settings → About** shows your runtime, where images are
stored, workspace statistics, and how many items sit in Trash.
