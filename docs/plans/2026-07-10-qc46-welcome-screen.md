# QC-46 — the first-run welcome screen ("W-A Paper hero")

**Status: BUILT (2026-07-10).** The user's decision, verbatim (queue doc
`just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md`, "QC-46 DECIDED"):
*"i want the welcome scree as firtst run surface with something about the ai
features and if you want to use then run the quick setup for local use or
connect to an onilne provider, a nice welcome screen hgihtlithng major features
and an easy setup"*. Three mockups (W-A/W-B/W-C) were injected over the live
app and sent; **the user picked "W-A hero"** (the same queue-doc section, "THE
USER'S PICKS") — one centred column: serif wordmark + one-line pitch, the
Start-a-new-project + Try-the-tutorial CTAs, a 3×2 feature grid, then the AI
setup band (Run Quick Setup local / Connect an online provider / the skip
line), and the shows-once footer. This doc records what was built, where, and
the interpretations that were flagged.

## What shipped, file by file

- **`src/renderer/src/views/WelcomeView.vue`** (new) — the W-A layout ported
  from the mockup DOM onto the real kit: `UiButton` (primary/secondary intents
  only), kit `Icon` glyphs instead of the mockup's emoji, all copy through
  `en.json` (`welcome.*`), tokens only (`--bg`, `--font-serif`, `--font-mono`,
  `--ink-2`, `--subtle`, `--border-soft`). The view is a normal router-outlet
  page: a flex child of `.main` that owns the one scroller
  (`flex:1; min-height:0; overflow-y:auto`), so a short window scrolls the
  hero, never the shell.
- **`src/renderer/src/router/index.js`** — `{ path: "/welcome", name:
  "Welcome" }`, deliberately with **no `meta.undoDomains`** (the #235 law: the
  page edits no book data, so ⌘Z / TitleBar undo are inert there).
- **`src/renderer/src/main.js`** — first-run detection: a **run-once
  `router.beforeEach`** registered before `app.use(router)`. On the first
  navigation of a cold load it redirects to `/welcome` iff the target is the
  root (`to.path === "/"`) AND the `welcomeSeen` settings key is falsy. It
  never fires again in the session, so in-app pushes to `/` (e.g. right after
  creating a project) are untouched, and an explicit non-root hash (probes,
  deep-links) passes straight through.
- **`src/renderer/src/services/projectStart.js`** (new) — ONE source for the
  two "start a project" flows (the New-project prompt dialog shape + i18n keys
  + `createProject`, and the open-tutorial flow over `openDemoProject`),
  shared by `Sidebar.vue` (project switcher) and `WelcomeView.vue`. Extracted
  during the build's rules-check (T3: the welcome CTAs must not fork the
  sidebar's flow); each caller runs its own pre-step (Sidebar closes its menu,
  Welcome marks the screen seen) and then calls the shared function.
- **`src/renderer/src/views/AiView.vue`** — passes
  `:auto-open-quick-setup="route.query.quicksetup === '1'"` into the shared
  `AiModelsArea`, so the welcome screen's "Run Quick Setup" deep-link
  (`/ai?quicksetup=1`) opens the wizard.
- **KIT `just-llm-runner/ui/src/views/AiModelsArea.vue`** — a tiny shared
  seam: new Boolean prop `autoOpenQuickSetup` (default false; JustVoice
  inherits it inert). When true, after the initial `loadAll()` resolves it
  awaits `nextTick()` (the QuickSetup mount sits inside
  `v-if="builtinProvider"`, so the template ref is null until the providers
  render) and calls `qsRef.openWizard()` once.
- **`src/renderer/src/views/HelpView.vue`** — the reopen affordance: a
  "Show welcome screen" button in the Help page's header. The shared kit
  `HelpDrawer` has **no host-action extension point** (its config is
  loadDoc/hasDoc/titleForSlug/onOpenFull/onOpenWeb only), and redesigning the
  shared drawer for one host row was out of scope — so the affordance lives on
  JW's own Help page, which the footer copy ("reopen it anytime from Help")
  points at via the sidebar's Help item.
- **`src/renderer/src/i18n/locales/en.json`** — the `welcome.*` namespace
  (all view copy, verbatim from the picked mockup). The New-project dialog
  reuses the existing `sidebar.projectSwitcher.*` keys — not forked.
- **`docs/getting-started.md`** — "Your first project" rewritten: the welcome
  screen is now the first-run surface (the old "you land in a blank Untitled
  project" line was stale the moment this shipped).
- **`scripts/headless-smoke.mjs`** — `#/welcome` added to the hardcoded
  ROUTES list (the smoke does not enumerate routes from the router).

## The seen-flag semantics (interpretation, flagged)

`welcomeSeen` (boolean, in the `/v1/settings` document via
`services/settings.js`) is written **on CTA exit, not on visiting**: all four
CTAs plus the "AI settings" skip-link call `markSeen()` first, then navigate.
So a reload on `/welcome` before choosing shows the screen again
(correct-once semantics), and a reload after any choice boots straight into
the book. Cancelling the New-project dialog still counts as seen (the user
engaged a CTA) — deliberate. Existing users upgrading have no `welcomeSeen`
key, so they see the screen once; their first CTA writes the flag.

## Icon picks (flagged)

The mockup's emoji became kit `Icon` names, mirroring the sidebar's own nav
glyphs: Book (Chapters & scenes), Users (Story bible), Strands (Plot strands &
timeline), Sparkle (AI assistance — the app's AI glyph), Target (Goals &
pace), Export (Export). The Help-page reopen button uses Star.

## Verification

Biome clean (all touched files, both repos) · vitest green · `build:vite`
built · the FULL headless smoke zero JS errors including `#/welcome` · a
scratchpad probe drove the real flow end to end: clear `welcomeSeen` → cold
boot lands on `#/welcome` with the hero rendered → "Try the tutorial project"
lands on the book with `welcomeSeen: true` → reload shows no welcome → the
settings document restored byte-exact; a second probe proved the deep-link
(`#/ai?quicksetup=1` cold boot is NOT intercepted even with the flag absent)
and the QuickSetup wizard auto-open, plus the Help-page reopen round-trip.
