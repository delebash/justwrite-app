# The phone app's UI library — the theming test (2026-10-08)

The decision and its words are in `docs/dev/TASKS.md` ("The phone app's UI library — the
theming test"). This is the record: what was built, how it was measured, what it showed.

## The question

Can a ready-made Vue component library carry JustWrite's own look — the kit's appearance engine
(`../just-llm-runner/ui/src/common/services/appearance.js`, live CSS variables on `<html>`) —
instead of its own (Material, in Quasar's case)? Candidates, as approved: Quasar, Element Plus,
Reka UI. Rewrite size is not a criterion (the user, mid-work).

## What was built

The Locations screen, twice more, beside the real one, on the user's real book (The Ninth Facet):

| Page (dev only) | Library | Install |
|---|---|---|
| `#/locations` | today's kit — already on **Reka UI** for its modal, help drawer and selects (`AppModal`, `HelpDrawer`, `UiSelect`, `UiMultiSelect`, `LuFeatureChip`, `LuModelCatalog`), so this *is* the Reka entry | — |
| `#/ui-test/quasar/locations` | Quasar 2.35.0 | `@quasar/vite-plugin` 2.0.2 in `vite.config.js` as quasar.dev/start/vite-plugin documents; `app.use(Quasar)` + its Sass on the page itself |
| `#/ui-test/element/locations` | Element Plus 2.14.7 | the documented full import (`app.use(ElementPlus)` + `element-plus/dist/index.css`) on the page itself |

Every control on each copy is the library's: buttons, text fields, checkbox, tags, breadcrumbs,
tooltips; the list's search field, facet chips and table with its pager (`EntityIndex`); the
status select and the tag editor (selects); the editor's top toolbar (41 buttons — the editor
copies are generated from `src/components/RichEditor.vue` by a scratch script that re-roots the
imports and swaps the toolbar's `<button class="tb-btn">` for the library's button); the Groups
and Images dialogs, and their prompts (Quasar's Dialog plugin, `ElMessageBox.prompt`). The editor
copies come from [`tools/make-editor-copies.js`](2026-10-08-phone-ui-library-test/tools/make-editor-copies.js)
(`node <it> . quasar element` from the repo root — re-run it if `RichEditor.vue` changes). Kept from
the app: `PaneHeader` (layout chrome), the scene and mention lists (no controls), the Sweep
dialog (a 470-line flow), the editor's bubble menu and find bar.

Files: `src/ui-test/` (`routes.js`, `base.js`, `quasar/`, `element/`); `src/router/index.js`
imports `routes.js` only inside `import.meta.env.DEV`. Open them in a browser on the dev server —
`npm run server` plus `npx vite`, then `http://localhost:1420/#/ui-test/quasar/locations` (see
"Re-running it").

## How each library takes the look

**Quasar** — its Sass variables point at the kit's CSS variables (`quasar/quasar-variables.sass`,
28 lines: `$primary: var(--accent)`, `$button-border-radius: var(--btn-radius)`,
`$button-padding: var(--btn-pad-y) var(--btn-pad-x)`, `$typography-font-family: var(--font-ui)`…).
Quasar does no colour or length maths on them, so its compiled CSS holds `var()` and follows the
engine live. Its own icons (select arrow, chip remove, table sort, pager) are the kit's line icons
through a custom icon set (`quasar/icon-set.js`, 23 lines). Dark mode needs a 4-line bridge:
the engine marks it with `<html data-theme>`, Quasar with its `Dark` plugin.

**Element Plus** — 54 of its CSS variables point at the kit's tokens in one `:root` block
(`element/theme.css` part one, 56 lines). Dark mode follows with no bridge, because the tokens
already switch with `data-theme`. Its select arrow and pager arrows take the kit's icons through
props (`element/kitIcon.js`, 4 lines); its tag-close icon and table sort carets have no prop and
stay its own.

## What had to be overridden

| | Quasar `quasar/theme.css` | Element Plus `element/theme.css` part two |
|---|---|---|
| size | 150 lines, 99 rules | 94 lines, 84 rules |
| its own look turned off | labels UPPERCASE on every button; ripple (`config: { ripple: false }`); the hover/focus overlay (`.q-focus-helper`, 5 places); 40 px dense field heights — select fields only lose them to a 3-class selector; 48 px table rows; bare `h1`–`h6` sized 6 rem…1.25 rem (Sass `$h-tags: ()`); the dialog scrim | fixed control heights (buttons 32/24 px, fields) instead of the density knob's padding; text buttons drawn with no border; sort carets always shown; an empty "No data" popup on the tag field; selects sized by width, not content (the status pill is a fixed 132 px) |
| fights with the app | Quasar's global base (`body`, `h1`–`h6`, `p` margins, utility classes) loads for the whole document | the kit's `button:not(.ui-btn) { color: inherit }` outranks Element Plus's button colours (one line restores them) |
| the rest | restating today's sizes: chips, tags, fields, title input, status pill, table header, toolbar buttons, dialog header, group rows | the same list |

## Measured (Playwright, the app's dev server on `<repo>/data`, 1280 × 820)

- **Every Appearance knob is followed live, on every control, by both libraries** — dark mode,
  accent hue, button radius (pill), button density (compact), label case (UPPERCASE), UI font,
  display font, ink palette — applied through the app's own `applyAppearance` (nothing saved).
  121 checks; the only unequal values are border colours read from elements that don't draw that
  border (the library puts it on a wrapper or a pseudo-element). Script and output:
  [`tools/knobs.js`](2026-10-08-phone-ui-library-test/tools/knobs.js),
  [`results/knobs-summary.txt`](2026-10-08-phone-ui-library-test/results/knobs-summary.txt) (raw
  values: `results/knobs.json`).
- **Side by side, light and dark** — detail page, Groups and Images dialogs, status menu, tag
  field: the same look within a pixel or two (table rows 1 px, header 3 px — the breadcrumb).
  Screenshots: [`shots/`](2026-10-08-phone-ui-library-test/shots/) (real · Quasar · Element Plus,
  left to right).
- **Phone width (390 px): all three pages are unusable alike.** The app's sidebar is a fixed
  280 px column, so the screen gets ~110 px. That is the shell (`App.vue`, `Sidebar.vue`), not a
  control — no library fixes it by being installed. Quasar ships the piece for it: `QDrawer`
  switches to an overlay below a `breakpoint` (`behavior`, `show-if-above`). Element Plus's layout
  pieces (`ElContainer`/`ElAside`, the modal `ElDrawer`) have no breakpoint logic.
- **Not exercised:** tag and status chip colours in the table — no location in the book has a
  tag or a status, and the test wrote nothing to the book.
- **Zero JS errors** on either library page, at both widths, light and dark.
- **The shipped build is unchanged:** `vite build` before and after the setup, 616 files each,
  614 of 615 chunks equal once hashed names are normalised; the one difference is kit code
  another session committed meanwhile (`window.api` dropped from a desktop check). No chunk
  mentions Quasar, Element Plus or `ui-test`.

## Re-running it

Everything needed is in [`2026-10-08-phone-ui-library-test/`](2026-10-08-phone-ui-library-test/)
(copied out of the session scratchpad, which does not survive the session):

1. Start the server and Vite on the dev data: `npm run server` and `npx vite` (port 1420). Not
   `npm run dev`: on 2026-10-08 `scripts/dev.js:15` resolves `vite/bin/vite.js`, which Vite 8 does
   not export (`ERR_PACKAGE_PATH_NOT_EXPORTED`; JustVoice fixed its copy in 00c5e46). Loading the UI warms the default chat model (gemma) on the graphics card;
   the scripts click "Continue without waiting".
2. From the repo root, each takes an output folder (and the location id, `l1` in The Ninth Facet):
   - `node docs/plans/2026-10-08-phone-ui-library-test/tools/probe.js <out>` — errors + list and
     detail screenshots of the three pages at 1280 and 390 px;
   - `… tools/knobs.js <out> l1` — every knob × every control, `summary.txt` + `knobs.json`;
   - `… tools/states.js <out> l1` — dialogs, status menu, tag field, dark mode, phone width;
   - `… tools/compose-side-by-side.js <out>` and `… tools/compose-crops.js <out> <states> x y w h scale`
     — the side-by-side images;
   - `… tools/distdiff.js <before> <after>` and `… tools/distnorm.js <before> <after>` — compare two
     `vite build --outDir` folders (the "shipped build unchanged" check).
   The scripts find the browser through the kit's
   `file:///E:/Dev/Web/just-llm-runner/scripts/lib/exec-resolve.js` (this machine's path) and
   load `playwright` from the repo. Nothing they do writes to the book: knobs go through
   `applyAppearance` (not saved), dialogs and menus are opened and closed, never picked.

## Found along the way

- **Today's status menu has no background** (`StatusSelect.vue`): its scoped `.status-menu` /
  `.status-opt` styles never reach the menu, because Reka's portalled `SelectContent` carries no
  `data-v-*` scope attribute — the items draw over the page text. Present in the `dist/` built
  before this test (15:12). Not fixed (outside the test).
- **A dev-only route list can still reach the packaged build** (Vite 8 / Rolldown): a template
  literal in a route path, or a value the test pages import from the routes module, kept the test
  chunks in `dist/`; a static import of the routes module reshuffled the shipped chunks. Importing
  it with `await import()` inside the `import.meta.env.DEV` branch kept the build identical.
- **Today's toolbar icons are ink, not ink-2**: the same `button:not(.ui-btn)` rule outranks
  `.tb-btn`'s colour.

## What it says

Both libraries can wear JustWrite's look and follow the theme engine live; neither forces
Material on it. The price is the same order for both (~95–150 lines of overrides for one screen,
much of it restating today's sizes). They differ in kind:

- **Element Plus** is built on CSS variables, so the theme maps once and dark mode is free; but
  it is a desktop library — no phone layout pieces.
- **Quasar** needs its Material defaults switched off (uppercase, ripple, overlays, dense heights,
  heading sizes, scrim) and a dark-mode bridge, and its base CSS owns the page; but it is the one
  that brings the phone pieces (the breakpoint drawer, Capacitor mode).
- **Reka UI** (today) keeps the look by definition — the look is ours, Reka only supplies
  behaviour — and has no phone pieces either.

The phone layout is the work in every case: the shell needs a drawer below a breakpoint, and
screens need their own narrow layouts.

**By the approved pick rule** ("the one that passes with the fewest override lines"): both pass —
at phone width each matches today's screen, which is itself unusable there — and Element Plus
has fewer override lines: 94 against Quasar's 150. (The mapping onto the kit's variables costs
about the same: Element Plus 56 + 4, Quasar 28 + 23 + 4.) The rule did not weigh phone layout
pieces, which only Quasar has. The choice is the user's.
