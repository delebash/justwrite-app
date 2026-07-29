# AGENTS.md

Contributor-facing conventions for working in this codebase — equally for human
contributors and AI coding assistants (Claude Code, Cursor, Copilot, etc.).
This is the *how we do things* file. The *what's where* primer lives in
[`CLAUDE.md`](CLAUDE.md). The *why it's built this way* lives in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

When a new contributor's AI session runs in this repo it sees `CLAUDE.md` and
`AGENTS.md` automatically. The conventions below assume that.

---

## 1. RichEditor has two variants — keep them in sync

There is ONE editor component, `src/renderer/src/components/RichEditor.vue`,
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
open-state refs per surface (e.g. `highlightOpen` vs `highlightBubbleOpen`) or
they render in both places at once.

The `.comment-mark` style is scoped to `.tiptap-content`. Read mode unwraps
comment spans via `readBody()` in `ChaptersView.vue` — keep that behaviour if
you touch the read-mode pipeline.

---

## 2. Every AI chat-stream call routes through `runAiStream`

All AI chat-stream features call `runAiStream({ feature, messages, signal,
onDelta, ... })` from `services/aiStream.js`. The wrapper owns:

- Provider/model resolution (`ai.providerForFeature()`)
- `AbortSignal` threading
- `friendlyAiError` wrapping
- `recordUsage` to the cost ledger
- Registration with the global AI Tasks store (see
  [Architecture → AI task panel](docs/ARCHITECTURE.md#ai-task-panel))

Callers only write prompts. Don't roll your own `fetch` + SSE parse loop —
the cost dashboard will have holes, the Cancel button will no-op, and the
user will see raw OpenAI error strings on auth failures.

**Pass `task: { label, meta }`** (or `task: true`) when you want the call to
appear in the global header status panel. **Pass `usageFeature`** when one
feature has multiple sub-actions worth tracking separately in the ledger
(`writerAI` does this: `feature: "writerAI"`, `usageFeature: actionKey`).

**Per-call loading state derives from the global store**, not from local refs:

```js
const myTask = computed(() =>
  aiTasks.runningTasks.find((t) => t.feature === "X" && t.meta?.kind === scope)
);
const loading = computed(() => !!myTask.value);
```

That's what fixes the "stuck on Analyzing…" bug from local refs that don't
reset on remount.

**Out of scope:** embedding calls (`client.embed()` in `rag/indexer.js`,
`rag/chat.js`) stay native — the wrapper is chat-stream only.

**Canonical reference:** `services/writerAI.js` and
`services/analysis/critique.js` for call-site shape.

---

## 3. Kit primitives — intentional raw-HTML exceptions

Use the kit's `UiButton` / `UiInput` / `UiTextarea` / `UiCheckbox` / `UiSelect` /
`UiNumber` / `UiTag` / `UiTable` from `@delebash/llm-ui` instead of raw HTML
controls. (The old local `Jw*` fork was fully converged into that kit in
2026-06-24 — the names below were updated to match; the reasoning is unchanged.)
Several places in the codebase deliberately do NOT use the primitives — don't
blindly migrate them when sweeping for compliance:

**Title-style inline-editable inputs** — flat borderless `<input>` styled to
look like editable text (transparent border idle, hover border, accent ring on
focus, font inherited). `UiInput` would draw a real field box and break the
flat-text feel. Examples: `WorldbuildingView .wb-title`, `NotesView .note-title`,
`ArchitectureView .arch-title`, `PlotBoardView .strand-name`,
`StrandsView .beat-label` and `.beat-note`.

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

The codebase has two ways to make a destructive action safe. **Trash + the
store's automatic undo-toast IS the recovery** — confirming on top of that
is double-prompting.

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
- **Permanent** — `TrashView`'s "Delete forever" (explicit purge AFTER the
  soft-delete)
- **Not in `HISTORY_SLICES`** — action mutates state outside `stores/project.js`
  HISTORY\_SLICES (see lines 318-325 there for the current list)

**Use `ui.showToast({ message })` (no dialog) when ALL of these apply:**

- Single entity (not bulk)
- Action is in `HISTORY_SLICES` (Ctrl/⌘Z reverts it)
- No cascade beyond what the store's `removeXxx` already handles

If the store action already fires its own undo toast (most `removeXxx` do —
they trash AND toast through `_toast()`), DO NOT add a duplicate toast in the
view. Just call the action.

**Why:** `confirmDialog` on every undoable action is friction that trains
users to dismiss confirmations reflexively — which is exactly when the rare
irreversible one slips through. The 2026-06-04 sweep relaxed 13 sites and
kept 22.

**Reference callsites:** `CharactersView deleteCharacter` for a typical
entity-delete; `PlotBoardView handleRemoveBeat` for the in-undo-history-only
pattern.

---

## 5. Click-outside dismissal — use a backdrop, not document listeners

When building a dismissible popover/panel/menu, do NOT reach for
`document.addEventListener("click", outsideHandler)`. It produces false
positives that are surprisingly hard to fully exempt:

- Reka UI's Select/Dialog portals teleport content outside the original DOM
  tree, so `parentRef.contains(e.target)` returns false for clicks the user
  perceives as "inside."
- `event.composedPath()` checks aren't reliable either — Vue render scheduling
  and Reka's pointer-down-outside detection cause subtle target re-targeting
  and timing races.
- Adding exemption selectors (`[role="listbox"]`,
  `[data-reka-popper-content-wrapper]`, sonner toasts, ...) becomes
  whack-a-mole.

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
above. Reka-portaled content (Select dropdowns at z-index 999, modals via
`DialogPortal`) sits far above the backdrop and intercepts its own clicks
naturally.

Esc-to-close still uses a `keydown` listener (that one is rock-solid).

**Reference shipper:** `AiFeatureChip.vue` (the chip + popover for
provider/model routing).

**Scope: this rule governs DROPDOWNS and POPOVERS, not slide-in PANELS.**
(Narrowed 2026-07-19 — it previously read as universal, and named `ChatPanel.vue`
a "known exception" to be migrated to the backdrop pattern.)

Slide-in panels — Ask-the-book, AI tasks, the Help drawer — use the shared kit
composable `usePanelDismiss` (`@delebash/llm-ui`) instead, which IS a
document-level `mousedown` + `keydown` handler. The backdrop pattern is wrong
for them for a concrete reason: a full-inset backdrop **swallows** the click
that dismisses. That is exactly what a dropdown wants, and exactly what a panel
does not — with the chat panel open you must be able to click a nav item and
have it both close the panel *and* navigate, in one click. A backdrop would
close the panel and eat the navigation. Panels also stay open while you keep
working behind them, which a click-blocking overlay contradicts.

Two consequences worth knowing:

- It listens on **`mousedown`, not `click`**: Reka's Select removes dropdown
  content from the DOM synchronously on selection, so by the time a `click`
  bubbles to `document`, `target.closest()` walks a detached tree and returns
  `null`.
- Its exemption selectors live in ONE place (the composable), so "don't add more
  exemption selectors" now means *don't add them at the call site* — a new
  exemption is either a kit-wide portal case or a genuinely panel-specific one
  passed via the `exempt` option, and both are visible in a single file.

Panel triggers carry **`data-panel-toggle`** (one vocabulary since 2026-07-19;
the old `data-chat-toggle` / `data-ai-status-toggle` names are gone) so the
handler doesn't close a panel just before its own trigger re-opens it.

Full reasoning + the user's rulings:
`just-llm-runner/docs/plans/2026-07-19-panel-dismiss-and-no-dim.md`.

---

## 6. Update `docs/` in the same commit as user-facing changes

When committing a new feature or meaningfully changing existing user-facing
behavior, update the relevant page(s) in `docs/` as part of the same change.

**Why:** `docs/` is user-facing documentation that ships with the app
(rendered in-app via `HelpView.vue`) AND syncs to the marketing site via
`docs.tar.gz` at release time (see
[Architecture → Marketing site & docs flow](docs/ARCHITECTURE.md#marketing-site--docs-flow)).
Out-of-date docs reach real users.

**How to apply:**

- Before committing, scan `docs/` for pages describing the affected surface:
  - New AI action → `docs/writing.md` or `docs/writer-lab.md`
  - New entity behavior → `docs/story-bible.md`
  - New shortcut → `docs/keyboard-shortcuts.md`
  - Studio/audio changes → `docs/audio-studio.md`
- If a page exists, update it. If no page covers the surface and the feature
  is substantial, propose a new page.
- Pure internal refactors, bug fixes that don't change user-visible behavior,
  dev-tool changes, and `CLAUDE.md` / `AGENTS.md` edits don't need doc
  updates.
- Roadmap docs (`docs/roadmap.md`, `docs/ai-features-roadmap.md`) are
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

**Why:** the descriptions in `docs/ai-features-roadmap.md` (Tier 1 entries —
Resume briefing, Foreshadowing tracker, Reader-knowledge tracker) explain
*why a writer would care*, not just what the button does. That's the quality
bar.

**Where this applies:** feature pages (`writing.md`, `story-bible.md`,
`brainstorm.md`, `audio-studio.md`, `writer-lab.md`, `markers.md`,
`notes-and-search.md`, ...).

**Where it doesn't:** reference-only pages where "problem" framing would be
silly (`keyboard-shortcuts.md`, `ai-providers.md` setup, `backups-and-data.md`
mechanics). Use judgment.

**Length per feature:** a few sentences per beat, not paragraphs. Tight.

---

## 8. User-facing pages vs `/debug/` siblings

User-facing pages (sidebar-linked) should NOT expose AI testing affordances
like provider pickers, per-model overrides, or multi-column compare. Those
belong on a parallel `/debug/<name>` page that shares the same base controls
via an extracted component.

**Reference pattern:**

- `/writer-lab` (user) runs one call against the default LLM
- `/debug/writer-lab` has the columns + model pickers
- Both import a shared base component for the input + action picker

**How to apply** when adding any AI-driven feature with a UI:

- Default: build the user surface against `useAiStore().llmProvider` (no
  picker).
- When AI testing affordances are needed (per-model comparison, raw prompt
  inspection, etc.), build a `/debug/<name>` page that imports the same base
  component and adds the testing chrome.
- Extract the shared input + action picker into a component so the two pages
  don't drift.
- Services should accept `{ provider, model }` overrides so the debug surface
  can target specific models — the user surface just omits them.

Speaker Lab (`/speaker-lab` and `/debug/speaker-lab`) follows the same shape.

---

## Process expectations

These aren't enforced — they're the project's working agreements.

- **No test runner is configured.** Don't invent `npm test`. A clean `npm run
  build` + a clean `cd src-tauri && cargo check` is the bar before claiming
  code works.
- **No formatter or linter.** Match the file's existing style; don't reformat
  unrelated code in your diff.
- **Commits are atomic and self-explanatory.** Code + relevant doc update +
  any same-feature service edits in one commit, with a message that explains
  WHY, not what. See `git log --oneline -20` for tone.
- **Don't run `git add -A`** — add explicit paths so a forgotten secret,
  build artifact, or local-only config can't slip in.
- **Risky / irreversible actions check in first.** Force pushes, dropped
  tables, `rm -rf`, modifying CI pipelines, deleting branches, anything that
  affects shared state beyond your local checkout.
