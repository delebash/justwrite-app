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

## STEP 3 — the batch report (the deliverable)

Report back: per view — strings converted / keys reused vs minted / lint-warning count
remaining in that file (and why, per OPEN QUESTIONS); the global `i18n:lint` warning
count before vs after; `i18n:report` missing (must be 0) and unused counts; gates output
(431 tests, build) per commit; every commit sha; and the OPEN QUESTIONS list. Do not
push beyond the three views even if time remains — the planner reviews this batch's
diff before the next batch is cut.
