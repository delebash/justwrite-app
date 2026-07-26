# i18n Phase 1a — coverage groundwork + the first three views (EXECUTOR PLAN)

Executor: an Opus coding agent. Every decision is CLOSED here — the executor codes,
verifies, commits, reports. Any case this plan does not decide: STOP, collect it in the
report's OPEN QUESTIONS, do not improvise. The seven governing decisions were blessed by
the user 2026-07-26 ("your rec"): kit=vue-i18n peer dep (LATER batch, not this one) ·
Spanish first (later phase) · ship machine-translated labeled (later) · DB-seeded text
stays English in v1 · server errors map at the friendlyAiError layer (later) · engine by
prototype (later) · **central catalogs — this batch's world is `en.json`**.

## STEP 0 — THE WAIT-GATE (do this FIRST, no exceptions)

A bench is running against the live Vite dev server. Editing ANY file under
`src/renderer/` or `E:\Dev\Web\just-llm-runner\ui\` while it runs triggers a hot-reload
that kills the bench mid-leg (it happened twice today). Before touching ANYTHING:

Poll (every ~2 min) this file until it contains `BENCH DONE` or `BENCH ERROR`:
`C:\Users\danel\AppData\Local\Temp\claude\E--Dev-Web-justwrite-app\5b32e070-f1fb-4178-9117-ff516cfb5db5\tasks\b6q53tt84.output`
Only then begin Step 1. If after 90 minutes it has neither marker and the file has not
grown in the last 30 minutes, report the stall and STOP (do not start editing).

## Standing rules for this batch

- Repo: `E:\Dev\Web\justwrite-app`, branch `claude/book-layout-chat-history-ui-5yjjr9`
  (already checked out). Commit per step with clear messages; push after each commit.
  End commit messages with: `Co-Authored-By: Claude Opus <noreply@anthropic.com>`.
- NEVER: touch `bench/**`, `E:\Dev\Web\just-llm-runner/**` (the kit — later batch),
  `server/**`, run any bench, kill any process, or reformat code beyond the lines you
  change (Biome exists; match surrounding style).
- English strings are moved BYTE-IDENTICAL into `en.json` values. You are not editing
  copy; you are relocating it. Do not fix typos, do not reword.
- Gates after each view (and before each commit): `npm run test:unit` (431 must pass)
  and `npm run build:vite` (must compile). Do NOT run the headless smoke (port may be
  in use).

## STEP 1 — tooling groundwork (new files only; nothing Vite-watched changes yet)

1. `npm i -D @intlify/eslint-plugin-vue-i18n eslint vue-eslint-parser vue-i18n-extract`
   (exact packages; accept their current stable versions).
2. Create `eslint.i18n.config.mjs` at repo root — a MINIMAL flat config whose ONLY job
   is the i18n rules (we lint style with Biome; this config must not duplicate it):
   - parser: vue-eslint-parser over `src/renderer/src/**/*.vue`
   - plugin: `@intlify/vue-i18n`
   - rules: `@intlify/vue-i18n/no-raw-text` = "warn" for now (flips to "error" when
     coverage completes), with options: `attributes` covering
     `{ "/.+/": ["placeholder", "title", "label", "aria-label", "alt"] }`,
     `ignorePattern: "^[\\d\\s\\p{P}]*$"` (numbers/punctuation-only),
     `ignoreNodes: ["Icon"]`.
   - settings `vue-i18n.localeDir`: `src/renderer/src/i18n/locales/*.json`.
3. package.json scripts:
   - `"i18n:lint": "eslint -c eslint.i18n.config.mjs \"src/renderer/src/**/*.vue\""`
   - `"i18n:report": "vue-i18n-extract report --vueFiles \"src/renderer/src/**/*.?(js|vue)\" --languageFiles \"src/renderer/src/i18n/locales/*.json\""`
4. Create `scripts/i18n-pseudo.mjs`: reads `en.json`, writes `qps.json` next to it —
   every leaf value transformed: wrap in `⟦…⟧`, map a–z→àƀćďèƒĝĥìĵķĺmñòƥqŕśťùvŵxýž
   (leave `{…}` interpolation segments and anything between `<` and `>` UNTOUCHED),
   then append `~~~` padding to +30% length. Add script `"i18n:pseudo"`. (It is NOT
   registered in the app in this batch — the switcher phase wires it; the file just
   lands with a header comment saying so.)
5. Run `npm run i18n:lint` (expect a large warning count — record the number in the
   report; it is the baseline) and `npm run i18n:report` (record its missing/unused
   counts). COMMIT: "i18n(phase1): tooling — no-raw-text lint, extract report, pseudo-locale generator".

## STEP 2 — convert three views (the pattern-setting batch)

Order: `src/renderer/src/views/SettingsView.vue` (~200 strings, already half-converted —
follow its OWN existing `$t()` pattern), then `views/ChaptersView.vue` (~99), then
`views/CharactersView.vue` (~92).

MECHANICAL RULES (no judgment calls):
- KEY REUSE FIRST: before minting any key, search `en.json` for an EXACT English match.
  If found (the orphaned `common.*` vocabulary exists for exactly this — Cancel, Save,
  Delete, Close…), use that key. Never create a second key for the same English.
- NEW KEYS: namespace = the view's existing section in `en.json` if one exists (open
  the file and look), else the view's name in camelCase (`settings`, `chapters`,
  `characters`). Leaf = the English's first ≤4 words, camelCased, punctuation dropped
  (`"Delete this chapter?"` → `deleteThisChapter`). On collision within the namespace,
  append `2`, `3`, ….
- Template text nodes → `{{ $t("ns.key") }}`. Literal attributes → bound:
  `:placeholder="$t('ns.key')"`. `v-tooltip.bottom="'text'"` → `v-tooltip.bottom="$t('ns.key')"`.
- Strings with runtime values become interpolations: `Deleted {n} chapters` with
  `$t("ns.key", { n: count })` — the English value keeps `{n}`.
- Script-side strings inside these views (toast messages, confirm text): use the
  pattern the file already uses if it has one; else `import { useI18n } from "vue-i18n"`
  and `const { t } = useI18n()` in setup, then `t("ns.key")`.
- DO NOT CONVERT: console/debug strings, thrown Error messages, data values/ids/enum
  strings, CSS content, strings already `$t()`, aria-hidden decorative glyphs.
- AMBIGUOUS (dynamic-built keys, HTML-embedded strings, anything the rules above don't
  cleanly cover): leave the line untouched, add it to OPEN QUESTIONS with file:line.
  A leftover lint warning is fine — "warn" level exists for exactly this batch.

After EACH view: `npm run test:unit` + `npm run build:vite` green, then
`npm run i18n:report` must show ZERO missing keys (every key you reference exists), then
COMMIT that one view: "i18n(phase1): <View> — N strings to keys (M reused)". Push.

## PLANNER RULINGS — 2026-07-26, issued mid-execution (these AMEND the above)

Three rulings were issued to the executing agent after it held at STEP 0 and escalated.
They are recorded here in full because a future session reading this plan would otherwise
read the superseded rule and get it wrong.

**Ruling 1 — the bench wait.** Wait it out; the bench is NOT expendable (that call belongs
to the user alone and was not given), and the batch is not deferred to a later session.
Once the gate clears the executor proceeds with the whole batch on its own authority — the
launch "go" already given covers execution after the gate.

**Ruling 2 — what "gate cleared" means (tightened).** Proceed only when all three hold:
(a) the watcher signal fired — `BENCH DONE` / `BENCH ERROR` in the task output file, or
`summary.md` appearing in the newest results dir; (b) the newest results dir has stopped
growing, no file mtime change for ~3 minutes — the bench manager may write judging and
summary artifacts after the last leg, but those land only under `bench/results/**`, which
Vite does not watch, so the HMR-kill risk exists only while legs execute; and (c) `git
status` re-run and HEAD/branch re-confirmed, exactly as before the first edit. Then `npm i`
and the batch are fine.

**Ruling 3 — key naming (this overrides the mechanical leaf rule at lines 73-77 above).**
The mechanical "leaf = the English's first ≤4 words, camelCased" rule was written for files
with NO existing key convention, and it must NOT override an established one. SettingsView
HAS an established convention — semantic sub-namespaces of the shape
`settings.<section>.<semanticLeaf>`, e.g. `settings.appearance.editorFontSizeLabel`. Follow
the file's own style: semantic leaf names that say what the string IS
(`settings.storage.modelsCacheFreeBody`), never first-words-of-the-sentence
(`settings.thisFreesSizeOf` is exactly the wrong shape). For ChaptersView and CharactersView,
which have no existing keys, use semantic section namespaces (`chapters.*`, `characters.*`,
sub-grouped where natural); the mechanical first-≤4-words rule survives only as the fallback
for when no obviously better semantic name presents itself. Reuse of an existing key always
beats minting a duplicate. The user holds a veto window on the naming style, so the batch
report must state the ruling was applied and give the minted-vs-reused counts.

**Ruling 4 — OQ1, the pseudo generator: ADOPT `pseudo-localization`.** Take it as a
devDependency rather than hand-rolling the accent map, gated on one verification the executor
runs first. VERIFICATION PERFORMED (2026-07-26): the registry record at
https://registry.npmjs.org/pseudo-localization — package `pseudo-localization` v3.1.2, MIT,
**zero runtime dependencies**, last modified 2026-04-12 — documents
`pseudoLocalizeString(str, { strategy })` as a per-string transform
(`pseudoLocalizeString('hello')` → `ħḗḗŀŀǿǿ`; `strategy: 'bidi'` also available). It offers NO
native placeholder protection, and a direct probe confirmed the failure mode:
`pseudoLocalizeString('Delete {n} autosaves from {dir}?')` returns `… {ƞ} … {ḓīř}?` — the
placeholders are mangled. So the ruling's second branch applies: the package is wrapped inside
our existing protected-segment splitter and called per NON-protected segment, leaving `{…}` and
`<…>` untouched. The accent map is no longer ours to maintain; the script is a thin walker. A
unit assert covers the round-trip (a string containing `{n}` keeps `{n}` intact).

**Ruling 5 — OQ2, the 15 JW-local `appearance.js` strings: DEFER, as a NAMED next-batch item.**
Not a vague "later". Grounds: converting strings that live in a data module needs the
key-in-data pattern (store a `labelKey`, resolve at render), which is a new pattern this batch
should not introduce ad hoc; and the Appearance tab cannot reach full conversion this batch
anyway, because the kit-owned half of its labels is out of scope until the kit batch. One
pattern, decided once, applied to both halves when the kit batch lands. This is refusing a
half-conversion that buys no user-visible completeness — not defer-as-proxy.

**Ruling 6 — OQ3, plurals: CONVERT all 8 sites now**, using vue-i18n's core `|` pipe syntax
(the library's own mechanism, zero new dependency). Leaving 8 known sites unconverted
contradicts the batch's purpose. SHAPE RULE: the WHOLE sentence is the pluralized message
(`"1 chapter selected | {n} chapters selected"`) — never splice a translated plural word into
an untranslated sentence, because translators need the complete sentence per form. The two
whole-sentence sites (ChaptersView.vue:593, CharactersView.vue:54) are exactly that shape. This
introduces the FIRST `|` pipes into `en.json`, so the batch report must flag it for the user's
veto look.

**Ruling 7 — OQ4, the runtime gate: LIFTED, with a port protocol.** The ban's reason expired
with the bench. At the END of the batch (all views converted, all gates green): (1) check what
is listening on :1420 and :17495 and identify the owning process tree. A listener positively
identifiable as the finished bench's leftover autostart may be terminated as teardown of our
own orphan — the bench manager reported DONE, so this is not stopping a running job. A listener
that CANNOT be positively identified as bench-spawned — especially anything under a
JustWrite.exe / Tauri tree — must NOT be touched: skip the smoke, report SKIPPED with the exact
reason and the process evidence, and the runtime gate falls back to the planner. (2) With ports
clear, run the splash-aware headless smoke once, isolated data dir as it already does. (3) The
smoke must OBSERVE the changed surface, not merely pass: for each of the three converted views,
assert that one known converted label renders NON-EMPTY text — `missingWarn:false` makes a bad
key render as empty string, so an empty-string assert catches precisely the failure the other
gates cannot. Name the three asserted labels in the report.

**Commit hygiene (from the checker's T11 note).** Each of the three per-view commits must cite
a doc in its message — cite the CLAUDE.md i18n section or this plan doc. Do not assume the
STEP 1 tooling commit covers them.

## OPEN QUESTIONS raised during execution (planner rules on these)

Recorded here as they were found, so they survive the session. The batch report repeats them.

**OQ1 — the pseudo-locale generator is hand-rolled with no options-considered note.**
STEP 1 item 4 (lines 53-58) specifies writing `scripts/i18n-pseudo.mjs` ourselves. Maintained
packages already do exactly this: **`pseudo-localization`**
(https://www.npmjs.com/package/pseudo-localization — accented + bidi strategies, CLI included)
and **`i18next-pseudo`** (https://www.npmjs.com/package/i18next-pseudo — i18next-flavoured, so
the weaker fit here since we are on vue-i18n); **`pseudo-l10n`** also generates pseudo-localized
JSON files. The hand-roll is ~45 lines with no runtime dependency and is trivially inspectable,
which is a real argument for it — but the standing "survey the ecosystem before building" rule
means the planner, not the executor, should confirm the build-vs-adopt call. Written as
specified for now; say the word and it swaps to a package.

**OQ2 — Appearance-tab labels that live outside the three views.** The plan scopes this batch to
three view files, but SettingsView renders option labels sourced from
`src/renderer/src/services/appearance.js`, so the Appearance tab stays part-English no matter how
completely the view itself is converted. Two distinct owners:
- **JW-local, 15 strings** — `appearance.js:29-35` `PAPER_TINTS` (5 × `label`: "Match app",
  "Cream", "White", "Sepia", "Grey") and `appearance.js:61-137` `THEME_PRESETS` (5 × `name` +
  5 × `hint`, e.g. "Studio" / "Geist + teal, white surfaces — the original clean look.").
  Rendered at `SettingsView.vue:907-908` and `:1199-1205`. These are ours to convert whenever
  the planner extends scope.
- **Kit-owned, not ours** — `appearance.js:11,20` imports and re-exports `SURFACE_TINTS`,
  `INK_PALETTES`, `UI_FONTS`, `DISPLAY_FONTS`, `UI_SCALES`, `SIDEBAR_HEADING_STYLES`,
  `NAV_ITEM_STYLES`, `BUTTON_*_OPTIONS`, `PAIRINGS`, `ACCENT/GOLD/FUNCTIONAL_PRESETS` from
  `@delebash/llm-ui`. Those are the "kit = vue-i18n peer dep, LATER batch" decision (line 6) and
  are correctly out of scope here.

**OQ3 — plural strings are not converted (8 sites).** The plan's rules cover interpolation but
say nothing about plural forms, and `en.json` contains zero `|` plural pipes, so vue-i18n
pluralization would be a NEW mechanism — the AMBIGUOUS clause (lines 87-89) says leave it. All
8 sites are listed with file:line in the batch report. Recommendation for the ruling: vue-i18n
`|` plurals are core to the library and add no dependency.

**OQ4 — no runtime gate on a three-view renderer change.** The plan forbids the headless smoke
because "port may be in use" (lines 33-34); that reason expired when the bench released the
ports. It matters because `i18n/index.js:41-42` sets `missingWarn:false` + `fallbackWarn:false`,
so a mistyped key renders as empty/fallback **silently**; the vitest suite is node-env and never
mounts these views, and `build:vite` is only a compile check. So the batch's gates cannot catch
a bad key at runtime. The executor did NOT run the smoke (explicitly forbidden by the launch
instruction) — flagging so the planner can lift that restriction for the verification pass.
PRECISION (from the second checker pass): `i18n:report` DOES statically catch mistyped *static*
keys, so the true residual blind spot is narrower than the paragraph above implies — it is
dynamic/computed keys and render-time breakage only. **RESOLVED by Ruling 7 — lifted, with the
port protocol.**

**OQ5 — the residual per-view surface: JW-local CHILD COMPONENTS.** OQ2 catches the
"surface ≠ file" gap for *services*; the same gap exists for *components*, and the batch report
must not claim the Chapters/Characters **pages** are converted when only the view files are.
Each of these is JW-local (not kit) and is rendered by an in-scope view, so its raw English is
still on screen after this batch:
- from `ChaptersView.vue:6-21` — `PaneHeader`, `RichEditor`, `AiFeatureChip`, `SceneLinks`,
  `VersionHistoryModal`, `CritiqueModal`, `MultiReaderPanelModal`, `SceneNotesPanel`,
  `StuckDiagnosticModal`, `SensoryResearchModal`, `EntitySweepModal`, `StatusSelect`
- from `CharactersView.vue:6-31` — `Avatar`, `ImagesModal`, `EntitySweepModal`,
  `CharacterAuditModal`, `RelationshipArcModal`, `StatusSelect`, `GroupsModal`,
  `CharacterProfileFillModal`, `CharacterBatchFillModal`, `CharacterSheetSection`, `TagEditor`,
  `SceneRefList`, `MentionRefList`, `PaneHeader`
Enumeration only — no scope change requested. The Affordance Table in the report says so
explicitly, so the user's scope veto is informed rather than surprised.

## STEP 3 — the batch report (the deliverable)

Report back: per view — strings converted / keys reused vs minted / lint-warning count
remaining in that file (and why, per OPEN QUESTIONS); the global `i18n:lint` warning
count before vs after; `i18n:report` missing (must be 0) and unused counts; gates output
(431 tests, build) per commit; every commit sha; and the OPEN QUESTIONS list. Do not
push beyond the three views even if time remains — the planner reviews this batch's
diff before the next batch is cut.
