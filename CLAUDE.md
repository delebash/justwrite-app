# JustWrite

A novel-writing app: **Tauri 2 + Vue 3 renderer + Python (FastAPI + SQLite) server.** Persistence is
server-owned SQLite — the renderer holds no durable data. The whole AI/LLM stack is shared with the
sibling app JustVoice: `just-llm-runner` (Python) + `@delebash/llm-ui` (Vue).

**Writing only.** All audio — Studio, TTS, audiobook export, speaker analysis, voice casting — lives
in JustVoice, which JustWrite drives over an HTTP contract (JW hands JV the prose; JV does its own
casting and narration). Do not reintroduce any of it here.

## Commands

```bash
npm install            # JS deps (first run only)
npm run dev            # Tauri dev — Vite + native window. First run compiles the Rust crate (slow).
npm run build          # Packaged app for the current OS
npm run dev:vite       # Renderer only, in a browser tab (no Tauri APIs; data still via the server)
npm run build:vite     # Renderer build only — a COMPILE check, not a substitute for the smoke

npm run test:fast      # quick gate (~53s): vitest + build:vite + server pytest
npm run test:unit      # vitest only (429 tests, ~8s)
npm run test:server    # server pytest only (121 tests, ~38s, parallel)
npm run i18n:report    # locale coverage — MISSING must always be zero
```

**Never put bare `python` in a script.** Every npm script that needs an interpreter goes through
`scripts/py.js`, which prefers this project's venv and falls back to PATH. Bare `python` resolves to
a stock `F:\Python312` with none of this project's dependencies, which is what made
`npm run test:server` die with `unrecognized arguments: -n` and took `test:fast` down with it.

**The headless smoke IS the renderer gate, and it runs here.** A recurring wrong claim is that
there is no renderer gate or that it cannot run in this environment — false. `npm run test:fast`
does NOT clear a renderer or GUI change; run the smoke:

```bash
python -m justwrite_server.cli serve --port 17495   # background
npm run dev:vite                                     # :1420, background
node tests/smoke/headless-smoke.js                   # drives every hash route, asserts zero JS errors
```

Any new Playwright script must reuse `findChrome()` from `tests/lib/smoke-common.js` (it handles
Windows, macOS and Linux layouts) or set `JW_CHROME`. Never hardcode a browser path.

**Never touch the user's live `:1420` / `:17495`.** Use an isolated server and a temp data dir.

## Invariants that bite

- **Don't call `invoke()` from views or stores** — go through `window.justwrite` (`services/tauri-bridge.js`), or the browser-only dev path breaks.
- **A new mutating store action must be added to `ACTION_DOMAINS`** — an unmapped action warns and records nothing, so undo silently skips it. Keystroke-grain mutators also go in `COALESCED_ACTIONS` or the undo buffer fills instantly.
- **`project` is one monolithic Pinia store on purpose** — it owns snapshot-based undo/redo across all entities. That is JustWrite's sanctioned exception to per-domain stores.
- **Import `Ui*` primitives from `@delebash/llm-ui`.** There is no local `components/ui/` directory and no `Jw*` components; never re-fork one locally. A capability gap gets promoted into the kit. The single `intent` prop encodes role AND style — never add `severity` / `outlined` / `text`.
- **`i18n/locales/en.json` is the world** for user-facing English. Reuse an existing key before minting a new one; `MISSING` in `i18n:report` must stay zero.
- **NOTHING hardcoded** — every value, threshold, name, mapping, flag and preset lives in the DB, seeded and user-editable. Code is only the engine.
- **No JSON blobs in SQL** — relational data gets real columns and rows. JSON only for genuinely freeform data, with a cited reason.
- The **`@renderer` alias** is `src/renderer/src/`. Prefer relative imports within a directory, `@renderer/...` across the tree.
- The renderer dev server is fixed at `http://localhost:1420` and `tauri.conf.json` references that URL — keep them in lock-step.

## Product and design rules

- **The seed ships FACTS and RULES.** The machine supplies MEASUREMENTS, the pair (model × machine) owns the numbers, and the user or the wizard supplies CHOICES. No measurement rows in the product seed, and no auto-anything behind the user's back.
- **DB policy: drop and reseed, no migrations** (pre-release — `docs/plans/2026-06-18-unified-storage-no-idb.md`). Additive-only schema changes need no reset; `create_all` picks up new tables on boot.
- **Don't cram.** Hierarchy and breathing room on every surface: one short lede sentence at most on a working surface (detail goes behind the help affordance), one fact shown once, one primary thing on screen per mode.
- **No naming popups.** Creating or renaming a thing never goes through a name-popup — every entity opens its one add/edit form directly, where the name is a plain field editable at any time, and the form refuses to save until its required assignments are set.
- **Design against precedent.** Before UI-design work, name in writing the existing precedent surface in this app plus a real-world reference. The user's reference screenshots are the spec.

## User docs ship from `docs/`

**`docs/*.md` IS the in-app help corpus.** `services/helpDocs.js` bundles those files via
`import.meta.glob("../../../../docs/*.md")`, `docs/toc.json` indexes them, and the same folder is
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
match each file's existing style and never bulk-reformat unrelated code. Scope is
`src/renderer/src/**/*.{js,vue}`. The Python server uses **ruff**. i18n linting is a separate
`eslint.i18n.config.mjs` carrying i18n rules only.

## Where to look

| For | Read |
|---|---|
| Open work across all repos | `docs/dev/TASKS.md` (live tracker) · `docs/dev/IDEAS.md` (backlog) |
| How we do things (conventions) | `AGENTS.md` |
| Why it's built this way | `docs/dev/ARCHITECTURE.md` |
| Stores, undo domains, IPC bridge, AI stack, export, images, i18n rules, test harnesses | `docs/dev/architecture-notes.md` |
| Kit primitives, button intents, sizes, theming, download tasks | `docs/dev/ui-kit.md` |
| Per-task history and evidence | `docs/plans/*` |

Read the branch and working-tree state from git, never from a doc — that line goes stale within
hours and has been relayed as fact more than once.

**Known-bad on the user's Windows box** (don't chase these):
`test_hardware.py::test_pci_gpus_linux_lspci_name_match` and
`test_lifecycle.py::test_ensure_model_ready_loads_then_returns` fail (pre-existing);
`test_lifecycle.py::test_ensure_model_ready_raises_on_failed_load` is flaky. A fourth failure is not
"known" — investigate it.
