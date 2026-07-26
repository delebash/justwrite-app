# Editor expansion — the executor plan (rows 3 → 2 → 1-spike → 4)  — NOT LAUNCHED

Executor: an Opus coding agent. Every decision is CLOSED here — the executor codes,
verifies, commits, reports. Any case this plan does not decide: STOP, collect it in the
report's OPEN QUESTIONS, do not improvise. Source research (read it first):
`docs/plans/2026-07-26-writers-editor-gap-research.md` — this plan implements its
recommended order 3 → 2 → 1 → 4 (name generation was struck: it already exists in
Brainstorm). **Written 2026-07-26 on the user's order ("write an execution plan for opus
but dont execute yet"); it launches only on the user's later go.**

## STEP 0 — the wait-gates (all THREE, no exceptions)

1. **No renderer edits while ANY bench runs.** Editing files under `src/renderer/` or
   `E:\Dev\Web\just-llm-runner\ui\` triggers a Vite hot-reload that killed two bench runs
   on 2026-07-26. Before the first edit, confirm with the planner (or the launch prompt)
   that no bench is running. If unsure: STOP and ask.
2. **The i18n Phase 1a batch must already be merged on the branch** (its three view
   commits convert `SettingsView.vue`, which STEP 4 below edits). `git -C
   E:\Dev\Web\justwrite-app pull` first; verify `SettingsView.vue` contains `$t(`
   conversions near the fields you will touch. If Phase 1a is NOT merged: STOP and report.
3. Run the gates once BEFORE changing anything (`npm run test:unit`, `npm run build:vite`)
   and record the baseline (test count currently 431 — trust the run, not this number).

## Standing rules for this batch

- Repo `E:\Dev\Web\justwrite-app`, branch `claude/book-layout-chat-history-ui-5yjjr9`.
  One commit per step, pushed after each. End commit messages with:
  `Co-Authored-By: Claude Opus <noreply@anthropic.com>`.
- NEVER: touch `bench/**`, `server/**`, `E:\Dev\Web\just-llm-runner/**` (the kit), any
  running process, or the seed/feature catalog. This batch is renderer-only + one build
  script + one committed asset + one npm dep (STEP 3a only).
- Match surrounding code style (Biome exists — no bulk reformatting). Comments only where
  the code can't say it (match the codebase's density).
- **Strings:** in files already converted to i18n (SettingsView after Phase 1a), new
  user-facing strings are `$t()` keys in `en.json` following that file's existing
  namespaces. In files NOT yet converted (RichEditor.vue, HomeView.vue), new user-facing
  strings are plain English — the i18n coverage sweep converts them later (this is the
  i18n plan's own "match the file's current pattern" rule, applied forward).
- Gates after EVERY step, before its commit: `npm run test:unit` green + `npm run
  build:vite` compiles. The headless smoke runs ONCE at the end of the batch (STEP 5) —
  not per step — because it needs ports 1420/17495 free; if either port is busy, SKIP it
  and say so in the report (never kill the process holding the port).
- UI primitives come from `@delebash/llm-ui` (`UiButton`/`UiCheckbox`/`UiProgress`…);
  panels use `usePanelDismiss`; never `invoke()` directly; no new `.btn-*` classes.

## STEP 1 — prose highlights (research row 3)

Surface the analysis catalogs the app already owns as toggleable editor decorations.

1. **Export the catalogs from their one source (no copies — T3):**
   - `services/analysis/styleMetrics.js`: add named exports for the existing internals —
     `FILTER_RE` (the filter-words regex, built at ~line 25) and a new
     `dialogueRanges(text)` returning `[{from,to}]` character ranges inside paired
     straight/curly quotes, factored FROM the existing `dialogueWords` quote logic
     (~line 136-145) so both share the same pair-matching (refactor `dialogueWords` to
     use it; `chapterMetrics`/`bookMetrics` results must be byte-identical — the vitest
     suite covers these, keep it green).
   - `services/analysis/aiTellScanner.js`: export the pattern catalog (the 44-entry
     `{p, kind, blurb}` array, currently module-internal) as `TELL_PATTERNS`. Do not
     change its content.
   - The adverb rule: styleMetrics detects -ly adverbs with an exclusion set (~line 28).
     Export a predicate `isAdverbCandidate(word)` built from that same set — factor the
     existing detection through it rather than duplicating the list.
2. **New TipTap extension** inside `RichEditor.vue` (follow the file's existing custom
   Extension pattern — `FontSize` at :120, `Indent` at :149): `ProseHighlights`, a
   ProseMirror plugin producing inline decorations over the doc text for each ENABLED
   category: `ph-filter` (FILTER_RE matches), `ph-adverb` (words passing
   `isAdverbCandidate`), `ph-tell` (TELL_PATTERNS `p` phrases, case-insensitive),
   `ph-dialogue` (dialogueRanges). Recompute debounced ~300 ms after doc changes and on
   toggle changes; whole-doc scan is acceptable (chapters are a few thousand words).
   Decorations only — never marks (must not touch the document or undo history).
3. **CSS:** four classes in RichEditor's style block using existing token tints (soft
   background tints, distinct hues; follow how `.comment-mark` is styled — do NOT invent
   new hex values; use `var(--…)` tokens already in `tokens.css`; if no fitting token
   exists for a hue, list it in OPEN QUESTIONS rather than hardcoding).
4. **UI:** one toolbar popover "Highlights" next to the existing find toggle (follow the
   toolbar button pattern at ~:1625): four `UiCheckbox` rows — Filter words · Adverbs ·
   Crutch phrases · Dialogue — all OFF by default. State = four new booleans
   (`highlightFilter`, `highlightAdverbs`, `highlightTells`, `highlightDialogue`) in
   `services/editorSettings.js` `DEFAULT_EDITOR_SETTINGS`, patched via the ui store's
   existing `editorSettings` mechanism (ui.js:331 pattern) so they persist like every
   other editor setting. The popover is a panel → `usePanelDismiss`, trigger carries
   `data-panel-toggle`.
5. **Vitest:** unit tests for `dialogueRanges` (straight + curly + unclosed quote) and
   `isAdverbCandidate` (an -ly adverb, an excluded word, a non-ly word). COMMIT:
   `feat(editor): prose highlights — filter words, adverbs, crutch phrases, dialogue as toggleable decorations`.

## STEP 2 — thesaurus (research row 2)

Local instant synonyms + a Brainstorm deep-link. No new AI action, no server changes.

1. **Data pipeline:** `scripts/build-thesaurus.mjs` (node, run manually — NOT wired into
   any npm lifecycle): downloads the public-domain Moby Thesaurus data from the
   `github.com/words/moby` repo (FIRST verify the raw file's exact path in that repo —
   expected a `words.txt`-style "root,syn,syn,…" one-entry-per-line file; if the repo's
   data shape is materially different, STOP → OPEN QUESTIONS), parses it to
   `{ root: [synonyms…] }`, writes `src/renderer/public/thesaurus-en.json.gz`
   (gzip via node `zlib`). Commit BOTH the script and the generated asset; record raw +
   gzipped sizes in the report. Header comment in the script: source URL, license
   (public domain), regeneration command.
2. **Runtime service:** `src/renderer/src/services/thesaurus.js` — `async ensureLoaded()`
   (fetches the asset once, decompresses via native `DecompressionStream("gzip")`, builds
   an in-memory `Map`; concurrent calls share one promise) and
   `synonymsFor(word) -> string[]` (lowercase exact lookup; returns `[]` when absent; no
   stemming, no fuzzy — exact only). Vitest for the parse/lookup with a tiny inline
   fixture (do not load the real asset in tests).
3. **UI:** context-menu item **Synonyms** in RichEditor's ctx menu (follow the `ctx-item`
   button pattern; place it in the cut/copy/paste group, above the comment item). Enabled
   when the caret/selection resolves to a single word: helper `wordAt(selection)` that
   expands a caret to word boundaries via the ProseMirror doc text (multi-word selection →
   disabled). Click → a popover panel (`usePanelDismiss`) anchored like the comment
   popover (`commentState` pattern at ~:1380): shows up to 40 synonyms as clickable
   chips — clicking replaces the word in the doc (one transaction; TipTap's own history
   handles undo) — plus a loading state while `ensureLoaded()` runs, an empty state
   ("No entries for this word."), and a footer link **"More alternatives in Brainstorm →"**
   which navigates to `/brainstorm` with query `{ category: "free", seed: 'Alternatives
   for "<word>" in: <its full sentence>' }`.
4. **BrainstormView:** on mount, read `route.query.category` + `route.query.seed` — if
   present, set the existing `category` / `seed` refs (BrainstormView.vue:65-66) and do
   NOT auto-run (the user presses Generate). No other Brainstorm changes.
5. COMMIT: `feat(editor): local Moby thesaurus — synonyms in the context menu + Brainstorm deep-link`.

## STEP 3a — the Harper spike (research row 1 — SPIKE ONLY in this batch)

Prove harper.js works in our stack and produce numbers. **Integration (3b) is GATED on
the planner's review of this report — do NOT build it in this batch.**

1. `npm i harper.js@2.4.0` (pin EXACTLY — the API is labeled early-access).
2. A probe script `tests/probes/harper-spike.js` (follow the existing probe pattern in
   `tests/probes/` — reuse `findChrome` from `tests/lib/smoke-common.js`, never a
   hardcoded browser path): a minimal page that dynamically imports harper.js's
   **WorkerLinter** (try the `slimBinary` variant first; fall back to default and note
   which worked), then measures and prints: (a) init time; (b) lint time for a ~3,000-word
   English text with seeded errors ("Their going to the libary tomorow and she dont
   care"); (c) whether each seeded error is flagged with a suggestion; (d)
   `importWords(["Xanthea","Vorlag"])` then re-lint text containing those names — are they
   clean?; (e) approximate added bundle/asset weight (report the size of the wasm/asset
   files the import pulled). No renderer files change in this step.
3. Report ALL numbers + a PASS/FAIL per check. STOP after reporting — whether the results
   look good or bad, 3b is the planner's call. COMMIT (probe + lockfile):
   `chore(spike): harper.js 2.4.0 probe — init/lint timings, importWords, asset weight`.

## STEP 3b — Harper integration (GATED — do not execute in this batch)

Recorded here so the whole design is in one place; it runs only in a later batch after
the planner reviews 3a: `services/harperLint.js` (the ONE thin wrapper: WorkerLinter
singleton, `lint(text)`, `importWords(list)`, version-pinned); a `HarperLint` ProseMirror
decoration plugin (squiggle class `.harper-lint`, wavy underline via tokens, debounced
per-paragraph linting); right-click on a flagged span prepends its suggestions to the ctx
menu (apply = replace transaction); the entity feed — a watcher over the project store's
characters(+extras)/locations/objects/groups names + worldbuilding titles, tokenized,
debounced 2 s, batched into `importWords`; the editor setting "Spell check" becomes a
three-option segmented Off / Native / Smart — **default stays Native** (the user flips
the default only if they choose); when Smart is active the native `spellcheck` attr is
set false (no double squiggles).

## STEP 4 — session writing target (research row 4)

1. **Model:** `sessionTarget: 0` added to the project defaults block
   (`stores/project.js:506` area, beside `wordsGoal`; `0` = off). It rides the existing
   snapshot persistence untouched — verify with a save/reload in the smoke, and if any
   server-side shape check strips it, STOP → OPEN QUESTIONS (do NOT edit `server/**`).
2. **Settings:** in Settings → Project, a `UiNumber` row "Session target (words/day)"
   directly under the Words-goal row (SettingsView.vue:715 pattern —
   `setMetaNumber('sessionTarget', v)`). String via `$t()` (the file is converted by
   Phase 1a; mint the key in its namespace per the i18n plan's naming rule).
3. **Home:** in HomeView's goal-ring block (~:292), when `sessionTarget > 0`, ONE added
   line under the ring: a small `UiProgress` (`:value="sessions.todayWords"`,
   `:max="P.sessionTarget"`) captioned `today · {todayWords} / {sessionTarget}` (plain
   English — HomeView is not yet i18n-converted). Nothing added when the target is 0
   (don't-cram: one line, only when armed). HomeShelfView is deliberately NOT touched.
4. COMMIT: `feat(home): session writing target — words/day field + today bar`.

## STEP 5 — batch verification + the report (the deliverable)

1. Full gates: `npm run test:unit` + `npm run build:vite`. The headless smoke
   (`node tests/smoke/headless-smoke.js` with the server + `npm run dev:vite` up, ports
   free — else SKIP and say so). Plus one targeted probe per shipped step (highlights
   toggle shows a `ph-filter` decoration; the synonyms popover opens on a known word;
   the session-target bar renders when the field is set) — follow the existing
   `tests/probes/*` harness.
2. Report: per step — files touched, what shipped vs the plan, gate outputs, probe
   results, the thesaurus asset sizes, the FULL Harper spike numbers, every commit sha,
   and OPEN QUESTIONS. Do not start 3b even if time remains — the planner reviews this
   batch's diff first.
