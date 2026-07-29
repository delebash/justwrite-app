# The shared UI kit — `@delebash/llm-ui`

Reference for the shared component kit. Open when building or changing UI; `CLAUDE.md` keeps only
the rules that bite.

All UI primitives and shells come from `@delebash/llm-ui` (Vite alias → `../just-llm-runner/ui/src`).
There is no local `components/ui/` directory — the `Jw*` forks were fully converged into the kit's
`Ui*` family in 2026-06-24, matching JustVoice. Never re-fork a primitive locally; a capability gap
gets promoted into the kit so both apps share it.

The kit owns the design contract: a single `intent` prop encodes BOTH semantic role AND visual
style. Never add `severity` / `outlined` / `text` props — new visual variants become new intents in
the kit.

## Primitives

| Kit component | What it does |
|---|---|
| `UiButton` | Single `intent` prop. `size="small"` for compact toolbars. `as="label"` for file-picker buttons. `<template #icon>` for leading icons. |
| `UiInput` / `UiTextarea` | `<input>`/`<textarea>` wrappers; `:invalid`, v-model; Textarea `auto-resize`. |
| `UiCheckbox` / `UiToggle` | Binary v-model (checkbox = inline/multi-select; toggle = on/off setting). |
| `UiSelect` | Reka UI Select — arrow-key nav, type-ahead, Esc-close, a11y, Floating-UI. `:options` (`{label,value}` or strings), empty-value sentinel, `width` cap. |
| `UiTag` / `UiChip` | Soft-tint status badge / interactive selection chip. |
| `UiField` | Labelled form row. |
| `UiNumber` | `Intl.NumberFormat` locale-aware grouping (follows `setUiLocale`); reformats on blur; Up/Down step. |
| `UiTable` | TanStack Vue Table — `:columns`, slot per column `id` for cells, sort/global-filter/pagination, `#empty`, `@row-click`. Needs the `@tanstack/vue-table` peer dep (in `package.json` + `resolve.dedupe`). |
| `UiColorPicker` | Swatch → popover preset grid + native custom color. Pass `:presets` (JW uses `services/categoricalColors.js` `PRESET_COLORS`). |
| `UiProgress` | Determinate (`:value`/`:max`) or indeterminate sweep. Token-styled, `role="progressbar"`. |
| `DownloadBar` | THE one download bar (2026-07-15): renders a `createDownloadTask` (props `{title, role, task}`) — Cancel-while-running, Retry-on-cancelled-or-error, "Ready ✓", the shared `UiProgress`, an error line. Every download (engine, model-load, embed) reuses it. |

## Shells and services

- `AppModal` — body-scrolling modal (eyebrow/title/wide/noPadding/closable/`dismissable`/`maxWidth`/`draggable` plus `header`/`header-extra`/`footer` slots). Backdrop locked unless `dismissable`. Drags by the header (position resets on reopen); the overlay neither dims nor blurs.
- `AppDialog` + `promptDialog()` / `confirmDialog()` (`dialog.js`) — imperative prompt/confirm host built on `AppModal`. Default labels via `configureDialog({labels})`, wired in `main.js` from `en.json`.
- `HelpDrawer` + `HelpTrigger` + `openHelp`/`closeHelp` (`help.js`) — the `?` affordance and slide-in docs panel. JW wires the content adapter and `onOpenFull`/`onOpenWeb` via `configureHelp()` in `main.js`; the docs corpus stays JW-local (`services/helpDocs.js`).
- `Toast` + `pushToast`/`clearToasts` (`toastBridge.js`) — vue-sonner host; `ui.showToast({message, action})` delegates to it. JW themes `.ui-toaster` in `styles.css`.
- `tooltipDirective` (`v-tooltip.bottom="'text'"`, registered in `main.js`), `Breadcrumb`, `EmptyState`, `ConnectionError` (props: appName/serverUrl/need/devHint), `Icon`.
- `usePanelDismiss(isOpen, panelEl, close, {exempt})` — THE panel Esc and click-outside close (2026-07-19). PANELS ONLY; modals keep `AppModal`'s locked backdrop. Toggle triggers carry `data-panel-toggle`.

Both modal wrappers are Reka UI Dialog primitives — focus trap, scroll lock, Esc and ARIA come
free. `AppModal` blocks backdrop click by default; `AppDialog` is dismissable.

## The shared AI task queue

Moved out of JW in 2026-07-06 (Decision 22): `useAiTasksStore` (the global in-flight registry —
Pinia is a kit peer dep, JW provides the instance), `runAiFeature` / `runAiFeatureStream` (wrappers
over `/v1/ai/run` and `/v1/ai/stream` with task-panel registration and cancel), `friendlyAiError`,
and the surfaces `AiTaskStrip` (inline progress strip, `#extra-stats` slot), `AiStatusPanel`
(slide-in panel) and `AiStatusButton` (TitleBar chip — its title-bar chrome stays host-owned via
the `.titlebar-*` button rules).

## The model-picker family

C5 (2026-07-06), reshaped by B5-1 (2026-07-09, "per-surface pickers REMOVED"). `useProviderModels`
is THE shared per-provider model-list cache — one cache, one endpoint accessor kit-wide, and
`LuModelPicker` rides it too. `LuFeatureChip` is the presentational per-feature chip, in JW always
mounted `readonly` as a "runs on" provenance chip with no edit popover. `useResolvedRoute` is the
kit cache over `GET /v1/ai/resolved-route` — the SERVER-resolved route a run would use (task preset
→ dispatch fallback). Embeddings go through `embedTexts` / `ensureEmbeddingReady`.

JW-side, `components/AiFeatureChip.vue` is the thin read-only binding over `LuFeatureChip` and
`useResolvedRoute`; clicking it navigates to `/ai`. **Routing is edited ONLY on the Tasks tab and
the Feature Workbench** — there is no per-surface picker, no `useFeaturePin.js`, and no ChatPanel
inline picker (all removed 2026-07-09). The chat services pass NO client-side LLM override; the
server cascade rules. JW's old `ModelPicker.vue`, `useModelList.js` and `services/embedApi.js` are
gone.

## The one download task

The ONE-DOWNLOADER consolidation (2026-07-15). `createDownloadTask(channel)`
(`composables/useDownloadTask.js`) is THE orchestrator for any "POST to start, poll a status URL,
cancel/retry" download — engine install, model load, model download. It returns a reactive
`{state, phase, done, total, rateText, error, label, start/cancel/retry/waiting/fail/reset}`, its
caption reuses `progressCaption` (`downloadRate.js`), and `DownloadBar` renders it. QuickSetup
mounts three (engine, chat, embed).

**One mechanism everywhere (2026-07-21, the user's ruling "same mech, same function").**
`useRunnerModels` no longer hand-rolls progress — the old `loadProgress`/`downloadMap`/`taskFor`
projection is gone. It feeds real `createDownloadTask` instances (a single `loadTask` plus a
per-model `downloadTask` map) from its one `/models` poll via `task.arm()` and `task.apply()`, so
catalog rows and slot cards render the SAME machine and SAME `DownloadBar` as QuickSetup — no
projection, no `compact` bar fork. `cancel()` flips state first so `apply()` freezes the bar; the
catalog sets `task.finalizing` on cancel so Retry stays DISABLED until teardown completes, avoiding
a retry-mid-teardown race. Load and download remain two server channels (`/status` single-model
versus the concurrent `/download/status` map); a "loading" model present in the download map is a
standalone download, otherwise a spawn-load.

**One workflow (2026-07-21).** `useRunnerModels.retryLoad(modelId)` runs the engine check FIRST — if
the engine is missing it installs it (awaiting `createDownloadTask(engineInstallChannel())`, the
same task QuickSetup uses) and THEN loads. Every model-load trigger routes through it: catalog row
"Make default" (`makeDefault`), card "Load now" (`loadAssigned` chat leg), the General dropdown via
`pickSlot`, row Retry, and boot warm in `warmStartup.js` — so no surface dead-ends on
`engine-not-installed`. The in-flight install is exposed as `engineGateTask` (the boot splash
renders its bar; the catalog's engine panel shows it via the `useEngine` poller). Embed stays lazy
via its own `ensure-embedding` endpoint. A raw API load still fails fast server-side — no silent
engine pull.

## Button intents

| Intent | Look | Use for |
|---|---|---|
| `primary` | solid accent | Main affordance — Save, Create, Edit, Quick Write |
| `secondary` | outlined neutral | Supporting action — Cancel, Test |
| `ghost` | text only | Quiet utility — list-row icons, "Delete" on lists |
| `danger` | solid red | Destructive — Discard, Remove, Reset workspace |
| `success` | solid green | Positive — Confirm, Apply |
| `info` | solid blue | Informational |
| `accent2` | solid gold | User's second accent — Resume CTA (UI label "Accent 2"; code-facing intent `accent2`) |

## Size rule

Inline list-row or card-header utility actions → `size="small"`. Standalone actions, destination
CTAs and empty-state actions → no `size` prop. When in doubt: a toolbar alongside other small chips
→ small; the main reason the user is on this surface → regular.

## Theming knobs

User-tunable in Settings → Appearance. Button knobs ride on CSS custom properties set by the shared
appearance engine (`applyAppearance`) and flow into every `UiButton`: `btnRadius`
(sharp/standard/rounded/pill), `btnDensity` (compact/comfy), `btnLabelCase` (default/uppercase).
Fonts: JW maps the kit's semantic `--font-display` and `--font-body` tokens in `tokens.css`
(display = Fraunces serif). Adding a knob means extending the shared engine plus the Appearance
settings UI.

## Three tiers — pick the lowest that works

1. **CSS classes / tokens** for purely visual variants — in `tokens.css`. No JS.
2. **Directives / composables** for cross-cutting behaviour — `v-tooltip` and friends.
3. **Components** for non-trivial state, focus or markup — the kit `Ui*` family and shells.

## Don't

- Don't re-fork primitives locally — import `Ui*` from the kit; promote gaps into the kit.
- Don't add new PrimeVue components. It is out of `package.json`.
- Don't roll new `.btn-*` classes. Use `<UiButton>`.
- Don't add `severity` / `outlined` / `text` props. Visual style is baked into the intent.
- Don't bypass the helpers — `ui.showToast`, `promptDialog`, `confirmDialog`, `openHelp`.
