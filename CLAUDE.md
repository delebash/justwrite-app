# JustWrite

A novel-writing app: **a Quasar app (Vue 3) — Electron for the desktop, Capacitor for the phone —
with a Node (Fastify + SQLite) server** — plain JavaScript since 2026-10-08 (the family's move off
Tauri and Python, then onto Quasar the same day: the kit's `docs/app-structure.md` §Q is the
layout, `../just-llm-runner/template/` the reference app). Persistence is server-owned SQLite — the renderer
holds no durable data. The whole AI/LLM stack is shared with the sibling apps: `just-llm-runner`
(its JavaScript package `server/`, `@delebash/llm-runner`, beside this repo) + `@delebash/llm-ui`
(Vue).

**Writing only.** All audio — Studio, TTS, audiobook export, speaker analysis, voice casting — lives
in JustVoice, which JustWrite drives over an HTTP contract (JW hands JV the prose; JV does its own
casting and narration). Do not reintroduce any of it here.

The family rules every family repo follows: @../just-llm-runner/docs/family-rules.md

## Commands

```bash
npm install            # the renderer + the server/ workspace; then once: cd src-electron && npm install
                       # (the kit ../just-llm-runner and ../just-sqlite-sync sit beside this repo)
npm run dev            # the desktop app: Quasar's dev server (:1420) + the Electron window; its server on data/
npm run build          # the installer for the current OS (electron-builder → dist/electron/Packaged)
npm run dev:spa        # Renderer only, in a browser tab (no desktop shell; data still via the server)
npm run server         # the server alone (headless) on :17495, on data/
npm run build:spa      # Renderer build only (dist/spa) — a COMPILE check, not a substitute for the smoke
npm run build:unpacked # the desktop app unpackaged (dist/electron/UnPackaged), without the server package
npm run build          # the installer — and the UnPackaged app with its server, what the e2e drives

npm run test:fast      # quick gate: renderer vitest + build:spa + server vitest
npm run test:unit      # renderer vitest only
npm run test:server    # server vitest only (server/tests/, on Electron's Node)
npm run i18n:report    # locale coverage — MISSING must always be zero
node ../just-llm-runner/scripts/check-family.js   # the family guard — must pass before a commit
```

**Server code runs on Electron's own Node.** Every npm script that runs the server or its tests
goes through `scripts/node24.js` (Electron as Node: the runtime the server ships on), never a bare
`node` from PATH, which may be another version.

**The dev data folder is `data/` in the checkout** — the desktop app, `npm run server` and the
bench all resolve it through the kit's one ladder (JUSTWRITE_DATA_DIR, else the Change-folder
pointer, else `data/` beside the app). It moved there from `src-tauri/target/debug/data` on
2026-10-08, with every saved path into it rewritten; the 2026-08-15 headless root it replaced is
kept aside as `data-old-2026-08-15/`.

**The headless smoke IS the renderer gate, and it runs here.** A recurring wrong claim is that
there is no renderer gate or that it cannot run in this environment — false. `npm run test:fast`
does NOT clear a renderer or GUI change; run the smoke:

```bash
npm run smoke     # builds dist/spa, snapshots your data, starts a scratch server (:17496) that
                  # serves that build, drives every hash route, asserts zero JS errors
```

Any new Playwright script must reuse `findChrome()` from `tests/lib/smoke-common.js` (it handles
Windows, macOS and Linux layouts) or set `JW_CHROME`. Never hardcode a browser path.

**Never touch the user's live `:1420` / `:17495`.** Use an isolated server and a temp data dir.

## Invariants that bite

- **JW must run headless** — `npm run server` (installed: `justwrite-server serve`) + a browser is the whole app, no desktop shell (`server/src/app.js` mounts the built UI — `dist/spa`, the app folder when packaged — after the routers). So the server is REQUIRED and owns all persistence. Rationale in `docs/dev/ARCHITECTURE.md`.
- **A new mutating store action must be added to `ACTION_DOMAINS`** — an unmapped action warns and records nothing, so undo silently skips it. Keystroke-grain mutators also go in `COALESCED_ACTIONS` or the undo buffer fills instantly.
- **`project` is one monolithic Pinia store on purpose** — it owns snapshot-based undo/redo across all entities. That is JustWrite's sanctioned exception to per-domain stores.
- **The kit's `Ui*` controls take one `intent` prop** that encodes role AND style — never add `severity` / `outlined` / `text`.
- **`i18n/locales/en.json` is the world** for user-facing English. Reuse an existing key before minting a new one; `MISSING` in `i18n:report` must stay zero.
- **NOTHING hardcoded** — every value, threshold, name, mapping, flag and preset lives in the DB, seeded and user-editable. Code is only the engine.
- **No JSON blobs in SQL** — relational data gets real columns and rows. JSON only for genuinely freeform data, with a cited reason.
- The **`@renderer` alias** is `src/`. Prefer relative imports within a directory, `@renderer/...` across the tree.
- The renderer dev server is fixed at `http://localhost:1420`; `quasar.config.js` (`devServer.port`) and `src/boot/jw.js` (`devPorts`) reference that port — keep them in lock-step.
- **Quasar's shape** (app-structure §Q): start-up code is the boot file `src/boot/jw.js` (there is no `main.js`); `src/App.vue` is the root (the shell `AppShell.vue`, or the connection-error screen); the desktop main is `src-electron/electron-main.js`; the server is its own package (`server/package.json`, `justwrite-server`, an npm workspace) and also holds the editor schema the renderer imports as `justwrite-server/editor/…`.

## Product and design rules

- **The seed ships FACTS and RULES.** The machine supplies MEASUREMENTS, the pair (model × machine) owns the numbers, and the user or the wizard supplies CHOICES. No measurement rows in the product seed, and no auto-anything behind the user's back.
- **DB policy: drop and reseed, no migrations** (pre-release; the 2026-06-18 ruling — now stated in `docs/dev/ARCHITECTURE.md` §Storage policy, history in `docs/plans/archive/2026-06-18-unified-storage-no-idb.md`). Additive-only schema changes need no reset; `create_all` picks up new tables on boot.
- **Don't cram.** Hierarchy and breathing room on every surface: one short lede sentence at most on a working surface (detail goes behind the help affordance), one fact shown once, one primary thing on screen per mode.
- **No naming popups.** Creating or renaming a thing never goes through a name-popup — every entity opens its one add/edit form directly, where the name is a plain field editable at any time, and the form refuses to save until its required assignments are set.
- **Design against precedent.** Before UI-design work, name in writing the existing precedent surface in this app plus a real-world reference. The user's reference screenshots are the spec.

## User docs ship from `docs/`

**`docs/*.md` IS the in-app help corpus.** `services/helpDocs.js` bundles those files via
`import.meta.glob("../../docs/*.md")`, `docs/toc.json` indexes them, and the same folder is
packed into `docs.tar.gz` at release for the marketing site — one source of truth for in-app help
and the website. Editing `docs/writing.md` changes what users read in both places.

So a user-visible change updates its doc in the same commit, however small: a new field, setting,
button or error message the user meets. A brand-new doc also needs a `docs/toc.json` entry or it
will not appear. The glob is **non-recursive** — `docs/plans/*` and `docs/dev/*` are internal and
never ship.

**`docs/` root is USER docs only — a dev doc there ships to users.** Anything written for us, not
for a writer using the app, belongs in `docs/dev/` (notes, trackers, backlogs, architecture) or
`docs/plans/` (per-task history). This is not a style preference: a file dropped in `docs/` root is
bundled into the app's Help by the glob and packed into the public `docs.tar.gz`, so
`docs/TASKS.md` put the open-work tracker in the Help sidebar between "Models" and "Appearance"
(fixed 2026-07-31 by moving TASKS/IDEAS/ARCHITECTURE/bench to `docs/dev/`).
`helpTargets.test.js` now fails if a doc appears in `docs/` root without a `toc.json` entry.

## Tooling

**Biome** (`biome.json`) is the linter — `"formatter": { "enabled": false }`, so it does not format;
match each file's existing style and never bulk-reformat unrelated code. The config is the
family's one `biome.json` (byte-identical in every app): `src/`, `scripts/`, `electron/`, `server/src/`
and `server/tests/`. i18n linting is a separate
`eslint.i18n.config.js` carrying i18n rules only.

## Where to look

**Before researching anything — reading code to answer a question, measuring, briefing an agent — read the subject's section of `docs/dev/RESEARCH.md`** (what is already known, with the proof; the shared stack's facts are in `../just-llm-runner/docs/dev/RESEARCH.md`; the family rule, 2026-10-04). Research isn't done until its facts land there.

| For | Read |
|---|---|
| Open work across all repos | `docs/dev/TASKS.md` (live tracker) · `docs/dev/IDEAS.md` (backlog) |
| How we do things (conventions) | `AGENTS.md` |
| Why it's built this way | `docs/dev/ARCHITECTURE.md` |
| Stores, undo domains, IPC bridge, AI stack, export, images, i18n rules, test harnesses | `docs/dev/architecture-notes.md` |
| Kit primitives, button intents, sizes, theming, download tasks | `docs/dev/ui-kit.md` |
| Measured performance (tunes, boot, bands, A/Bs — distilled) | `docs/dev/measured-performance.md` |
| RAG design decisions (cards, pinning, templates) | `docs/dev/rag-design.md` |
| The LLM bench harness | `docs/dev/bench.md` |
| Per-task history and evidence | `docs/plans/*` — live plans only; closed history in `docs/plans/archive/` |

Read the branch and working-tree state from git, never from a doc — that line goes stale within
hours and has been relayed as fact more than once.

**Known-bad on the user's Windows box** (don't chase these):
`test_hardware.py::test_pci_gpus_linux_lspci_name_match` and
`test_lifecycle.py::test_ensure_model_ready_loads_then_returns` fail (pre-existing);
`test_lifecycle.py::test_ensure_model_ready_raises_on_failed_load` is flaky. A fourth failure is not
"known" — investigate it.
