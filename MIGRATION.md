# PrimeVue migration — "Path B"

Status of the ongoing migration swapping JustWrite's hand-rolled UI primitives
for [PrimeVue](https://primevue.org), themed by the custom `JustWriteEditorial`
preset. **This file is the source of truth for migration progress — update it in
the same commit that lands a phase.** (It exists because earlier phases were only
recorded in commit messages, so a later session couldn't tell what was left.)

## Ground rules / how it's wired

- Theme: `src/renderer/src/services/primevue-preset.js` — Aura base, tokens point
  at the app's CSS custom properties (`--surface`, `--accent`, `--ink`, …) so
  light / dark / custom-hue all just work.
- Components are registered **per file** (`import X from "primevue/x"`), not globally.
- PrimeVue's CSS sits in a `primevue` cascade layer; the app's own rules in
  `src/renderer/src/assets/styles/tokens.css` are **unlayered**, so they win over
  PrimeVue without `!important`. Put chrome PrimeVue tokens can't express there.

## Done

- **Phase 1 — Settings forms** (commit `5f2fef4`)
  `SettingsView` + `SettingsProviderForm`: native inputs → InputText / InputNumber /
  Checkbox / Select / Textarea / Button (~62 primitives). Kept native: file inputs,
  color-picker overlays, segmented tiles, bespoke combobox / voices multi-select.

- **Phase 2 — DataTable sweep** (commit `12cdead`)
  Settings AI-usage tables, Analysis style table, TrashView, Studio Cast voice
  library → PrimeVue DataTable. Search results deliberately skipped (grouped-snippet
  list, not a tabular shape).

- **Phase 3 — Overlays ("dialog/toast service swap")**
  - `AppModal.vue` → thin wrapper over PrimeVue `<Dialog>`, **API-compatible** (same
    `eyebrow` / `title` / `wide` / `noPadding` props + header/footer/default slots,
    still `v-if + @close`). Its ~10 consumers needed zero edits. Internal `visible`
    ref → emits `close` when it flips false.
  - `AppDialog.vue` (prompt/confirm host for `services/dialog.js`) → PrimeVue Dialog +
    Button + InputText/Select; kept per-field values / `requireMatch` / enter-to-submit /
    focus+select.
  - `Toast.vue` → PrimeVue `<Toast>`. Store delegates through `services/toastBridge.js`
    (`pushToast` / `clearToasts`); `ToastService` registered in `main.js`.
    `ui.showToast/dismissToast` signatures unchanged, so all callers work as-is; the
    `action` / "Undo" button rides as a custom field on the message, rendered via the
    `#message` slot. Dead `ui.toast` state + manual timers removed.
  - Chrome (header divider, sticky footer, content scroll, widths, mask blur, toast
    pill) lives in `tokens.css`, keyed on `.app-modal` / `.app-dialog` / `.p-toast`.
    Added a `dialog` token block to the preset.

- **Phase 4 — Entity-editor forms**
  Native `input` / `textarea` / `checkbox` → InputText / InputNumber / Textarea /
  Checkbox across the CRUD editors. The binding pattern: `:value` + `@input=fn($event.target.value)`
  → `:model-value` + `@update:model-value=fn($event)`; `fluid` on every control (`.input`
  was width:100%); inline `style=""` preserved verbatim. **CharactersView.vue is the
  reference** (richest: role/age/one-liner/motivation/arc/voice/backstory).
  - Converted: Characters (9), Events Edit/New (InputText + Textarea each), Locations /
    Objects / Notes (1 InputText each), Relations (3 Checkbox), Architecture (1 Textarea).
  - **Left native by design** (and this is the rule going forward): the bespoke borderless
    heading inputs (`.character-name`, `.location-name`, `.object-name`, `.note-title`,
    `.strand-name`/`.strand-blurb`, `.group-name`, `.arch-title`, beat label/note/select)
    — they're styled as editable titles (`appearance:none`, transparent), so PrimeVue
    chrome would fight them. Strands & Groups had ONLY these → 0 conversions. Also native:
    DateTimePicker and the other domain widgets.

- **Phase 5 — Button sweep** *(complete — 5a + 5b)*
  Every app button is now a PrimeVue `<Button>`; the bespoke button CSS is fully gone.
  **CharactersView.vue is the reference** (pane-actions). Mapping used:
  `ghost` to `severity="secondary" text`, `primary`(ink) to `severity="contrast"`,
  `accent` to default (no severity), plain to `severity="secondary"`,
  outline to `severity="secondary" outlined`, `danger` to `severity="danger"`,
  `sm` to `size="small"`. Icon+text kept as the default slot (NOT the `label` prop).
  - **5a** — ~123 `<button class="btn …">` across ~33 files.
  - **Holdouts swept later** (the "one button system" pass): RichEditor comment popover (5),
    SpeakerLabView (9), the Sidebar collapse toggle (1); plus the other bespoke button
    classes `.btn-outline`/`.btn-primary` (PlotBoardView, 4) and `.btn-ghost`
    (SettingsProviderForm, 4). The two Settings file-picker `<label class="btn">`s became
    `<Button as="label">` (PrimeVue styling on a label, still wraps the hidden file input).
  - **5b done** — deleted the global `.btn` block from tokens.css + all dead scoped `.btn`
    rules (ChaptersView, EventsTimelineView, SettingsView) and the `.btn-outline`/`.btn-primary`
    scoped rules. Only explanatory comments mention `.btn` now.
  - **Two readability root-causes fixed along the way** (tokens applied wrong before): (1) an
    unlayered global `button { color: inherit }` was overriding PrimeVue's label-colour token
    → split to `button:not(.p-button)` so PrimeVue buttons own their label colour (the dark
    `contrast` severity was rendering ink-on-ink — invisible). (2) the severity ramp's
    text/outlined variant painted the label in the *fill* colour; added an `fg` override so
    neutral `secondary` ghost/text buttons use `--ink-2`, not near-white.

## Phase 6 — Opportunistic components *(evaluated; declined as a forced sweep)*

Each candidate was inspected against the "adopt where they help, not a forced sweep"
bar and did NOT clear it:

- **Tabs** — StudioView's tabs are bespoke info-dense cards (icon + name + a live
  substat, e.g. "12/15 cast · 3 unassigned"); ChaptersView's mode switcher and
  EditorSettingsModal use deliberate `seg`/`seg-toggle` segmented controls. PrimeVue
  Tabs would drop the substats and the editorial styling — a downgrade. Left native.
- **Tooltip** — 210 native `title=` across 43 files. Native tooltips are fine; a full
  swap is a forced sweep and a partial one is arbitrary. Not done. (If styled tooltips
  are ever wanted, the bounded, defensible scope is icon-ONLY action buttons whose
  label lives only in `title` — register the `Tooltip` directive in main.js and apply
  `v-tooltip` there.)
- **ConfirmPopup** — would replace the working, consistent `confirmDialog()` / AppDialog
  with a different anchored-popover UX. A redesign, not a migration. Not done.
- **Menu/Popover** — the only dropdown-ish surfaces are excluded (Sidebar, RichEditor),
  domain widgets (StatusSelect), or bespoke (PlotBoard template menu, TitleBar). Nothing
  converted cleanly.

**Net:** the migration's real value shipped in P1–P5 (forms, tables, overlays, buttons).
P6 is intentionally a near-no-op; revisit only if a specific component is wanted.

### Staying native (non-goals)
RichEditor (TipTap owns it), ImportView file inputs, SpeakerLabView (older
Quote-Attribution lab), command palette, Sidebar nav, segmented appearance tiles.
