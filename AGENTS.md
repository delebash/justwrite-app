# JustWrite — instructions for any AI working in this repo

A novel-writing app: **a Quasar app (Vue 3) — Electron for the desktop, Capacitor for the phone —
with a Node (Hono + SQLite) server** — plain JavaScript since 2026-10-08 (the family's move off
Tauri and Python, then onto Quasar the same day: the kit's `docs/app-structure.md` §Q is the
layout, `../just-core/template/` the reference app). Persistence is server-owned SQLite — the renderer
holds no durable data. The whole AI/LLM stack is shared with the sibling apps: `just-core`
(its JavaScript package `server/`, `@delebash/core`, beside this repo) + `@delebash/ui`
(Vue).

**Writing only.** All audio — Studio, TTS, audiobook export, speaker analysis, voice casting — lives
in JustVoice, which JustWrite drives over an HTTP contract (JW hands JV the prose; JV does its own
casting and narration). Do not reintroduce any of it here.

Claude Code reads this file through CLAUDE.md's `@AGENTS.md`; Codex, Cursor and the other tools read it
directly and follow no `@` imports — so it holds everything itself, the family rules included (the
family's design, the user, 2026-10-17).

## Commands

```bash
npm install            # the renderer + the server/ workspace; then once: cd src-electron && npm install
                       # (the kit ../just-core and ../just-sqlite-sync sit beside this repo)
npm run dev            # the desktop app: Quasar's dev server (:1420) + the Electron window; its server on data/
npm run dev:spa        # Renderer only, in a browser tab (no desktop shell; data still via the server)
npm run server         # the server alone (headless) on :17495, on data/
npm run build:spa      # Renderer build only (dist/spa) — a COMPILE check, not a substitute for the smoke
npm run build:unpacked # the desktop app unpackaged (dist/electron/UnPackaged), without the server package
npm run build          # the installer for the current OS (dist/electron/Packaged) and the UnPackaged app with its server, what the e2e drives

npm run test:fast      # quick gate: renderer vitest + build:spa + server vitest + i18n:docs
npm run i18n:docs      # each doc's lede: front-matter matches its lede.<slug> key (docgen's extract --check)
npm run test:unit      # renderer vitest only
npm run test:server    # server vitest only (server/tests/, on Electron's Node)
npm run test:flows     # click-through tests of the built UI, AI stubbed, 1280 + 390 px (tests/flows/)
npm run eval           # every Lab sample on a real model (uses the GPU — ask JustVoice first)
npm run i18n:report    # key coverage of the English catalogs — MISSING must always be zero
node ../just-core/scripts/check-family.js   # the family guard — must pass before a commit
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
- **`i18n/locales/en.json` is the world** for user-facing English. Reuse an existing key before minting a new one; `MISSING` in `i18n:report` must stay zero. A new key goes into `en.json` only: other languages fill through docgen and show English until then (2026-10-13).
- **NOTHING hardcoded** — every value, threshold, name, mapping, flag and preset lives in the DB, seeded and user-editable. Code is only the engine.
- **No JSON blobs in SQL** — relational data gets real columns and rows. JSON only for genuinely freeform data, with a cited reason.
- The **`@renderer` alias** is `src/`. Prefer relative imports within a directory, `@renderer/...` across the tree.
- The renderer dev server is fixed at `http://localhost:1420`; `quasar.config.js` (`devServer.port`) and `src/boot/jw.js` (`devPorts`) reference that port — keep them in lock-step.
- **Quasar's shape** (app-structure §Q): the renderer is laid out as Quasar's CLI creates a project — start-up code in boot files (`src/boot/i18n.js`, `src/boot/jw.js`; there is no `main.js`), `src/App.vue` a bare `<router-view>`, the chrome `src/layouts/MainLayout.vue` (q-layout: the title bar, the sidebar as q-drawer), the screens `src/pages/<Name>Page.vue` (each a q-page), the stylesheets `src/css/` (listed in `quasar.config.js > css`), the connection-error screen its own route (`/offline`); the desktop main is `src-electron/electron-main.js`; the server is its own package (`server/package.json`, `justwrite-server`, an npm workspace) and also holds the editor schema the renderer imports as `justwrite-server/editor/…`.

## Product and design rules

- **The seed ships FACTS and RULES.** The machine supplies MEASUREMENTS, the pair (model × machine) owns the numbers, and the user or the wizard supplies CHOICES. No measurement rows in the product seed, and no auto-anything behind the user's back.
- **DB policy: drop and reseed, no migrations** (pre-release; the 2026-06-18 ruling — now stated in `docs/dev/ARCHITECTURE.md` §Storage policy, history in `docs/plans/archive/2026-06-18-unified-storage-no-idb.md`). Additive-only schema changes need no reset: the kit's `createTables` adds new tables and the `ADDED_COLUMNS` columns on boot.
- **Don't cram.** Hierarchy and breathing room on every surface: one short lede sentence at most on a working surface (detail goes behind the help affordance), one fact shown once, one primary thing on screen per mode.
- **No naming popups before a data screen.** "+ New" for anything with its own page (a character, an article…) opens that page directly — never a popup asking its name first; the name is a plain field there, editable at any time, and the form refuses to save until its required assignments are set. A popup that only takes a name, with no other data (a status, a chat's name, a quick "new …" that stays in a picker), is fine (the user, 2026-10-29; verbatim in `docs/dev/TASKS.md`, Standing rulings).
- **Design against precedent.** Before UI-design work, name in writing the existing precedent surface in this app plus a real-world reference. The user's reference screenshots are the spec.

## User docs ship from `docs/`

**`docs/*.md` IS the in-app help corpus.** `services/helpDocs.js` bundles those files via
`import.meta.glob("../../docs/*.md")`, `docs/toc.json` indexes them, and the same folder is
packed into `docs.tar.gz` at release for the marketing site — one source of truth for in-app help
and the website. Editing `docs/writing.md` changes what users read in both places.

So a user-visible change updates its doc in the same commit, however small: a new field, setting,
button or error message the user meets. A brand-new doc also needs a `docs/toc.json` entry or it
will not appear, and a `lede:` front-matter line — its one-line summary in Help and the command
palette, which docgen's `extract` turns into `lede.<slug>` in `en.json` so it translates (run it
after writing or changing a lede; `npm run i18n:docs` fails while they're out of step). The glob is
**non-recursive** — `docs/plans/*` and `docs/dev/*` are internal and never ship.

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

---

## 1. RichEditor has two variants — keep them in sync

There is ONE editor component, `src/components/RichEditor.vue`,
exposed via the `variant` prop:

- `manuscript` — scene/chapter editor
- `inline` — Architecture, Strands, Objects, Locations, Groups, etc.

New features and toolbar controls should work in BOTH variants unless there's
a concrete reason not to. Toolbar button sets are centralized in
`services/editorToolbars.js` (`EDITOR_TOOLBAR_FULL` / `DOC` / `SLIM`) — add
new controls there, not as per-view inline arrays. When in doubt, default to
enabling for both variants and gate explicitly only when you can name the
reason.

Dropdowns that exist in both the toolbar AND the bubble menu need separate
open-state refs per surface (e.g. `textColorOpen` vs `textColorBubbleOpen`) or
they render in both places at once.

The `.comment-mark` style is scoped to `.tiptap-content`. Read mode unwraps
comment spans via `readBody()` in `ChaptersPage.vue` — keep that behaviour if
you touch the read-mode pipeline.

---

## 2. Every AI call goes through the kit's `runAiFeature`

A screen runs an AI feature with the kit's `runAiFeature({ action, feature, variables, signal, meta,
task })` (`@delebash/ui`; the kit's `docs/app-structure.md` §19, "Run a chat feature"). Behind it the
server's `runAction` resolves the feature's route and preset; the call carries the `AbortSignal`, and
`task: { label, meta }` shows it in the AI task panel. A long server job is `runServerJob` inside
`withAiTask` (§19). Callers only compose the prompt's variables — the composers in
`src/services/analysis/` and `src/services/storyContext.js` — never a `fetch` and stream loop of
their own: the task panel would miss the call and Cancel would do nothing.

**A surface's loading state comes from the kit's task store**, not a local ref: `useSurfaceTask(feature,
meta)` (`@delebash/ui`) is that surface's running task, so a page left and opened again still shows
its call running.

---

## 3. Kit primitives — intentional raw-HTML exceptions

Use the kit's `UiButton` / `UiInput` / `UiTextarea` / `UiCheckbox` / `UiSelect` /
`UiNumber` / `UiTag` / `UiTable` from `@delebash/ui` instead of raw HTML
controls. (The old local `Jw*` fork was fully converged into that kit in
2026-06-24 — the names below were updated to match; the reasoning is unchanged.)
Several places in the codebase deliberately do NOT use the primitives — don't
blindly migrate them when sweeping for compliance:

**Title-style inline-editable inputs** — flat borderless `<input>` styled to
look like editable text (transparent border idle, hover border, accent ring on
focus, font inherited). `UiInput` would draw a real field box and break the
flat-text feel. A page's own name is the kit's `PaneHeader` with `editable` (one definition
for every page header since 2026-10-11); the raw ones left are inside page bodies:
`PlotBoardPage .strand-name`, `StrandsPage .beat-label` and `.beat-note`.

**Sidebar chrome (`.nav-item`, `.rail-toggle`, `.rail-item`, `.project-switcher`,
`.project-menu-*`)** — these are layout-specific structures whose grid
templates, full-width footers, parent-selector reveal animations, and custom
font tokens are part of the form factor. The 2026-06-04 sweep migrated the
`nav-add`/`part-action`/`chapter-chev`/`chapter-add-scene`/`wb-cat-chev`
buttons inside the sidebar to `<UiButton intent="ghost">` with bespoke classes
applied for dimensions; the items listed above stayed raw with explicit
reasons. Sidebar overrides for the migrated set live in `Sidebar.vue`'s
`<style>` block (e.g. `.ui-btn.chapter-chev { padding: 0; color: var(--muted) }`).

**RichEditor toolbar (`.tb-btn` family)** — a parallel button family with
distinct scale and CSS-only `data-tip` tooltips. Reused by the focus-mode
strip and the find bar. Not a violation.

**Native `<input type="file">`** — no Jw equivalent exists; OS file picker
semantics are needed.

**Native checkbox inside a wrapping `<label>`** when the label is structurally
needed (e.g. wrapping a color swatch).

**`DateTimePicker` internals** — its own month `<select>` and number inputs
are private low-level controls inside a custom widget that presents a single
high-level `model-value` to consumers.

**`UiTable`'s pager `<select>`** for page size — replacing would create a
circular import.

**Decision question when migrating:** does this raw control carry distinctive
visual styling that's part of the layout, OR is it a generic form control
that should adopt the design system? If the former, leave it.

---

## 4. Destructive actions — `confirmDialog` vs toast-undo

The codebase has two ways to make a destructive action safe. **Trash + Ctrl/⌘Z IS the
recovery** — a removal is soft (it goes to Trash) and undoable, with no delete toast (the store's
QC-37 toast law: the row visibly leaves); confirming on top of that is double-prompting.

**Use `confirmDialog()` when ANY of these apply:**

- **Bulk** — deleting N items at once (empty Trash, clear all entities,
  `clearCast`)
- **Cascade** — deleting one entity destroys children that aren't restorable
  separately (`deletePart` orphans chapters; `deleteStrand` drops all beats;
  `deleteWbCat` moves articles)
- **External state** — writes to or deletes from the file system (project
  files, exports, snapshot files, cover images)
- **Ledger / settings wipe** — reset usage ledger, reset workspace,
  factory-reset appearance, restore from autosave (overwrites snapshot)
- **Permanent** — `TrashPage`'s "Delete forever" (explicit purge AFTER the
  soft-delete)
- **Not undoable** — the action isn't in `stores/project.js`'s `ACTION_DOMAINS`, so Ctrl/⌘Z
  can't revert it

**Use no dialog when ALL of these apply:**

- Single entity (not bulk)
- The action is in `ACTION_DOMAINS` (Ctrl/⌘Z reverts it)
- No cascade beyond what the store's `removeXxx` already handles

Don't add a toast of your own in the view: just call the store's `removeXxx`.

**Why:** `confirmDialog` on every undoable action is friction that trains
users to dismiss confirmations reflexively — which is exactly when the rare
irreversible one slips through. The 2026-06-04 sweep relaxed 13 sites and
kept 22.

**Reference callsites:** `CharactersPage deleteCharacter` for a typical
entity-delete; `PlotBoardPage handleRemoveBeat` for the in-undo-history-only
pattern.

---

## 5. Click-outside dismissal — use a backdrop, not document listeners

When building a dismissible popover/panel/menu, do NOT reach for
`document.addEventListener("click", outsideHandler)`. It produces false
positives that are surprisingly hard to fully exempt:

- Popups and dialogs (Quasar's QMenu, QSelect's list, QDialog) teleport their
  content outside the original DOM tree, so `parentRef.contains(e.target)`
  returns false for clicks the user perceives as "inside."
- `event.composedPath()` checks aren't reliable either — Vue render scheduling
  and the popups' own outside-click handling cause subtle target re-targeting
  and timing races.
- Adding exemption selectors (`[role="listbox"]`, `.q-menu`,
  `.q-notifications`, ...) becomes whack-a-mole.

**Use a transparent backdrop with z-index hit-testing instead:**

```vue
<div v-if="open" class="my-backdrop" @click="open = false" />
<div v-if="open" class="my-popover">…</div>
```

```css
.my-backdrop {
  position: fixed; inset: 0;
  z-index: 69;          /* one less than the popover */
  background: transparent;
}
.my-popover {
  position: absolute; /* or fixed */
  z-index: 70;          /* one greater than the backdrop */
}
```

Render the backdrop **inline** (NOT teleported) so it shares the popover's
stacking context — z-index hit-testing then guarantees the popover stays
above. Portaled content (select lists and menus at z-index 999, modals on
QDialog's root) sits far above the backdrop and intercepts its own clicks
naturally.

Esc-to-close still uses a `keydown` listener (that one is rock-solid).

**Reference shipper:** `AiFeatureChip.vue` (the chip + popover for
provider/model routing).

**Scope: this rule governs DROPDOWNS and POPOVERS, not slide-in PANELS.**
(Narrowed 2026-07-19 — it previously read as universal, and named `ChatPanel.vue`
a "known exception" to be migrated to the backdrop pattern.)

Slide-in panels — Ask-the-book, AI tasks, the Help drawer — use the shared kit
composable `usePanelDismiss` (`@delebash/ui`) instead, which IS a
document-level `mousedown` + `keydown` handler. The backdrop pattern is wrong
for them for a concrete reason: a full-inset backdrop **swallows** the click
that dismisses. That is exactly what a dropdown wants, and exactly what a panel
does not — with the chat panel open you must be able to click a nav item and
have it both close the panel *and* navigate, in one click. A backdrop would
close the panel and eat the navigation. Panels also stay open while you keep
working behind them, which a click-blocking overlay contradicts.

Two consequences worth knowing:

- It listens on **`mousedown`, not `click`**: a popup can take its content out
  of the DOM on the press that picks from it (Reka's Select did, synchronously),
  so by the time a `click` bubbles to `document`, `target.closest()` walks a
  detached tree and returns `null`.
- Its exemption selectors live in ONE place (the composable), so "don't add more
  exemption selectors" now means *don't add them at the call site* — a new
  exemption is either a kit-wide portal case or a genuinely panel-specific one
  passed via the `exempt` option, and both are visible in a single file.

Panel triggers carry **`data-panel-toggle`** (one vocabulary since 2026-07-19;
the old `data-chat-toggle` / `data-ai-status-toggle` names are gone) so the
handler doesn't close a panel just before its own trigger re-opens it.

Full reasoning + the user's rulings:
`just-core/docs/plans/archive/2026-07-19-panel-dismiss-and-no-dim.md`.

---

## 6. Update `docs/` in the same commit as user-facing changes

When committing a new feature or meaningfully changing existing user-facing
behavior, update the relevant page(s) in `docs/` as part of the same change.

**Why:** `docs/` is user-facing documentation that ships with the app
(rendered in-app by the kit's Help drawer through `services/helpDocs.js`) AND syncs to the marketing site via
`docs.tar.gz` at release time (see
[Architecture → Marketing site & docs flow](docs/dev/ARCHITECTURE.md#marketing-site--docs-flow)).
Out-of-date docs reach real users.

**How to apply:**

- Before committing, scan `docs/` for pages describing the affected surface:
  - New AI action → `docs/writing.md` or `docs/ai-features.md`
  - New entity behavior → `docs/story-bible.md`
  - New shortcut → `docs/keyboard-shortcuts.md`
- If a page exists, update it. If no page covers the surface and the feature
  is substantial, propose a new page.
- Pure internal refactors, bug fixes that don't change user-visible behavior,
  dev-tool changes, and `CLAUDE.md` / `AGENTS.md` edits don't need doc
  updates.
- The roadmap (`docs/roadmap.md`) is
  direction-not-promise and don't need to be kept in sync with shipped code —
  leave those alone unless explicitly asked.
- The doc update goes in the same commit as the code change, not a follow-up.

---

## 7. Doc voice — writer-problem first

When writing or updating any feature page in `docs/`, frame each feature with
three beats, in this order:

1. **The writer's problem in their own voice.** A short quoted line like
   *"I've written myself to a stopping point and have no momentum to push
   through."* Concrete, first-person, the actual moment-of-use frustration.
   Not "writers sometimes need…"
2. **Why this feature solves it / when to reach for it.** What gap it fills,
   when it's the right tool, where it falls short. Opinionated when
   warranted.
3. **How it works / how to use it.** The concrete mechanism — buttons,
   inputs, outputs, what to expect.

**Why:** the descriptions in `docs/plans/archive/2026-06-05-ai-features-roadmap.md` (Tier 1 entries —
Resume briefing, Foreshadowing tracker, Reader-knowledge tracker) explain
*why a writer would care*, not just what the button does. That's the quality
bar.

**Where this applies:** feature pages (`writing.md`, `story-bible.md`,
`brainstorm.md`, `markers.md`,
`notes-and-search.md`, ...).

**Where it doesn't:** reference-only pages where "problem" framing would be
silly (`keyboard-shortcuts.md`, `ai-providers.md` setup, `backups-and-data.md`
mechanics). Use judgment.

**Length per feature:** a few sentences per beat, not paragraphs. Tight.

---

## Process expectations

These aren't enforced — they're the project's working agreements.

- **The gates are `npm run test:fast` and `npm run smoke`** (Commands, above) —
  run them before claiming code works.
- **Biome lints; nothing formats** (Tooling, above). Match the file's existing style; don't
  reformat unrelated code in your diff.
- **Commits are atomic and self-explanatory.** Code + relevant doc update +
  any same-feature service edits in one commit, with a message that explains
  WHY, not what. See `git log --oneline -20` for tone.
- **Don't run `git add -A`** — add explicit paths so a forgotten secret,
  build artifact, or local-only config can't slip in.
- **Risky / irreversible actions check in first.** Force pushes, dropped
  tables, `rm -rf`, modifying CI pipelines, deleting branches, anything that
  affects shared state beyond your local checkout.

## Where to look

| For | Read |
|---|---|
| Open work across all repos | `docs/dev/TASKS.md` (live tracker) · `docs/dev/IDEAS.md` (backlog) |
| How we do things (conventions) | the numbered sections above |
| Why it's built this way | `docs/dev/ARCHITECTURE.md` |
| Stores, undo domains, IPC bridge, AI stack, export, images, i18n rules, test harnesses | `docs/dev/architecture-notes.md` |
| Kit primitives, button intents, sizes, theming, download tasks | `docs/dev/ui-kit.md` |
| Measured performance (tunes, boot, bands, A/Bs — distilled) | `docs/dev/measured-performance.md` |
| RAG design decisions (cards, pinning, templates) | `docs/dev/rag-design.md` |
| The LLM bench harness | `docs/dev/bench.md` |
| Per-task history and evidence | `docs/plans/*` — live plans only; closed history in `docs/plans/archive/` |

Read the branch and working-tree state from git, never from a doc — that line goes stale within
hours and has been relayed as fact more than once.

---

## The family rules

A copy of the kit's `docs/family-rules.md`, kept identical by a check — edit the kit's file, never
this copy.

<!-- family-rules:start -->
# Family rules

The rules every family repo follows: JustWrite, JustVoice, docgen and this kit. Each repo's
CLAUDE.md imports this file; a repo's own rules stay in its CLAUDE.md. How an app is laid out is
the kit's [`docs/app-structure.md`](https://github.com/delebash/just-core/blob/main/docs/app-structure.md)
§Q; the reference app is the kit's [`template/`](https://github.com/delebash/just-core/tree/main/template).

- **No hardcoded values a user might want to change.** Thresholds, limits, names and presets live
  in the database (seeded, editable in Settings), not in code, so changing one never needs a code
  change.
- **The server owns the data.** An app's data is one SQLite database that only its server reads
  and writes; the screen holds no durable data and asks the server. The desktop window, the
  browser tab of a headless server, the phone and other apps calling the API must all see the
  same data.
- **Nothing hand-rolled that Quasar or the kit ships.** The kit's `Ui*` controls sit on Quasar's
  components; apps use the `Ui*` API, and a shape the kit doesn't have uses Quasar's own component
  before anything hand-rolled. Before building a control, dialog, task or service, look in the kit
  (`packages/ui/src/index.js`, `packages/ui/src/common/index.js`, `packages/core/`), in the app's
  own `src/services/`, and for a screen that already has the same shape, and reuse it. A gap is
  filled in the kit so every app gets it. Copies drift and share bugs.
- **Code copied from another project keeps its licence notice** and gets an entry in the repo's
  `NOTICE.md`. MIT, Apache and BSD licences all require it.
- **Every AI engine and model goes through the kit, the way llama.cpp does.** Its builds are
  seeded rows, its models catalog rows in the kit's cache, its features routed by a preset, its
  graphics-card use booked with the kit's VRAM arbiter, its screens the kit's. An engine the kit
  doesn't have yet is a kit gap: it goes into the kit first and the app is built on it — never
  inside the app.
- **A fork is brought up to date before we work on it.** Before any work on a fork we keep (today
  our audio.cpp, github.com/delebash/audio.cpp; any fork a later app takes on), merge its upstream
  into our branch, build it, and test the merged build in the app that runs it — the real app on its
  real data (JustVoice: `npm run dev`) — then start the work. (The user, 2026-10-29: "before we do
  any work on audio cpp nextime we should update the fork and test it in our app … this should be
  true for any forks for futre apps that we may use".)
- **Modern ES modules everywhere.** `.js` files with standard `import` — app and kit code,
  scripts, tests and tools alike — never `require`, `createRequire`, `.mjs` or `.cjs`. The only
  CommonJS is what a platform forces, named with its doc: Electron's sandboxed preload
  (electronjs.org/docs/latest/tutorial/esm) and Capacitor's `.js` config
  (quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor).
<!-- family-rules:end -->
