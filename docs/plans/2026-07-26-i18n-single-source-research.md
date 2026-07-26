# Single-source text + i18n/translation — the research (2026-07-26)

The user's roadmap ruling (2026-07-26): *"the main goal is to completely finish JW and all AI
stuff… 12 we need to do and do the full translation research on how we do it automatically,
there are several ways to automate translation so we need to research unless already done, i
think i gave some research to you already — this should be next big task."* This doc is that
research: the census (measured, this day), the architecture options, the 2026 tooling survey,
and the decision sheet. It builds ON the user's 2026-07-19 groundwork (`docs/IDEAS.md` →
"Single-source text system"), which named json-autotranslate, json-translator, and the
own-runner question — none of that is re-litigated, it is extended.

## R1 — The census (measured 2026-07-26, scratchpad script over all three trees)

The numbers are bucketing-grade (a regex census over templates: text nodes + literal
user-facing attributes + bound-literal strings), deliberately erring toward over-count;
the per-file top-offender lists were eyeballed for sanity.

| tree | files | hardcoded strings | `$t()` calls | translated share |
|---|---|---|---|---|
| JustWrite renderer | 80 | **~1,719** (in 68 files) | 229 | ~12% of surface text |
| Kit (`@delebash/llm-ui`) | 55 | **~613** (in 39 files) | 0 | **0%** |
| JustVoice renderer | 44 | **~1,551** (in 41 files) | 0 | **0%** |

**≈3,900 hardcoded user-facing strings system-wide vs ~190 translated keys in use.**

Worst offenders (JW): `SettingsView` 200 hardcoded beside 109 `$t` calls — a HALF-converted
surface; `ChaptersView` 99/2; `CharactersView` 92/2 (the field-hint duplication exhibit);
`AnalysisView` 84/2. Kit: `LuModelCatalog` 142, `QuickSetup` 60, `AiModelsArea` 50.

**The JustVoice finding:** JV ships `vue-i18n ^11.4.6` (`package.json:30`) and a
`locales/en.json` — and **zero `$t()` calls render through it**. Its Settings → Language
select is cosmetic today. Unification with JW is therefore a green field, not a migration:
whatever shape JW lands, JV adopts from scratch.

**Key health (JW):** `en.json` = 306 leaf keys; 189 used from `.vue` + at least the 5
`dialog.*` keys injected into the kit via `configureDialog` (`main.js:129-137` — the one
existing kit-injection precedent, with its own comment anticipating "re-call on locale
change if/when JustWrite adds a runtime language switcher"). ZERO missing keys (nothing
renders a dead key). The `common.*` vocabulary block (~30 keys) and much else looks
orphaned — seeded ahead of a conversion that never happened. Exact orphan pruning is
build-phase work, not research.

**The two special populations no tool covers by default:**
- **DB-seeded text:** ~67 user-facing strings live in the DATABASE, not code — 11 catalog
  `notes` + 11 `description`s + **42 knob `help` texts** + option labels (runner `seed.py`).
  A locale-JSON pipeline never sees them. Policy needed (see decisions).
- **Server-origin strings:** ~82 HTTP error `detail=` strings + ~11 lifecycle raise
  messages are born in Python and surface in the UI (via `friendlyAiError`). Same gap.

## R2 — The single-source architecture (the help/hints half)

The itch: field hints are authored twice (view literal + `docs/*.md`), and the 29-file help
corpus is glob-loaded raw (`helpDocs.js` `import.meta.glob`) with no key relationship to the
UI at all. Options, compared:

- **A. Docs as the one source, everything generated** (locale JSON + hints derived from
  front-matter). Rejected: the docs are PROSE; most of the ~3,900 strings (buttons, table
  headers, toasts) have no home in a help doc — forcing them in inverts the docs' purpose.
- **B. Locale JSON as the one source, docs generated from it.** Rejected harder: nobody
  authors a help ARTICLE inside a translation key file.
- **C. TWO sources with ONE bridge and a CI contract (REC).** Labels/hints/short copy live
  in the locale files (per app + one shared kit namespace); long-form help stays markdown.
  The BRIDGE is the keyed hints layer the user sketched on 07-19: field hints authored once
  (front-matter in the field's help doc, or a small keyed file per domain), a build step
  emits them INTO the locale JSON under `hints.*` — so hints are translated like everything
  else and the form looks them up by key. The CI contract: form key ⇔ source ⇔ every locale
  (fail the build on drift). This is also the only option that keeps the help corpus
  translatable LATER as whole documents (markdown per-locale directories) without blocking
  the UI translation now.

**The kit mechanism (the real architecture decision inside C):** the kit has no i18n lib —
by design (hosts own the locale). Two ways to translate its ~613 strings:
  1. **Kit adopts `vue-i18n` as a peer dependency** and ships a `en` message pack the host
     merges; hosts pass locale. Clean long-term; touches every kit component once.
  2. **Extend the injection pattern** (`configureDialog`-style) to a full `configureText()`
     map. No new dependency, but ~613 keys through a hand-rolled lookup = reinventing
     vue-i18n badly.
  REC: **option 1** — both hosts already ship `vue-i18n ^11.4.6`, so the peer is free, and
  the `main.js:129` comment shows injection was always considered the interim, not the end
  state.

## R3 — The translation-automation survey (the "several ways", 2026 state)

| route | what it is | verdict |
|---|---|---|
| **json-autotranslate** ([repo](https://github.com/leolabs/json-autotranslate)) | CLI over locale JSON; backends: google, deepl(-free), azure, amazon, **openai**, manual, dry-run; DeepL glossaries; ICU/i18next placeholder PROTECTION (interpolations swapped to `<0/>` before the engine sees them) | **The primary candidate — because its OpenAI backend can point at OUR llama-server** (an OpenAI-compatible endpoint), making the user's on-brand "our runner translates locally" option a CONFIG of a maintained tool instead of a custom script. Free, offline, private. Needs one prototype check: custom base-URL support for the openai backend. |
| **The GitHub-Actions class** (ai-i18n, i18n-ai-translate — [compared here](https://localhero.ai/blog/best-i18n-translation-github-actions)) | LLM translates the PR's locale DELTA, commits back | The right *shape* (delta-driven), wrong *place* for a local-first app (wants a cloud LLM key in CI). Steal the delta idea: translate only changed keys. |
| **Intlayer** ([vue guide](https://intlayer.org/blog/i18n-technologies/frameworks/vue)) | Compiler-based extraction + CI LLM translation + web review UI | Strongest all-in-one, but it wants to BE the i18n framework — replacing vue-i18n across three trees is a bigger migration than the problem. |
| **Glot** ([site](https://glot.dev/blog/i18n-json-translation-guide-vue-react-nuxt)) | Local-first JSON editor with AI translate | A useful REVIEW surface, not a pipeline. Note for the human-review step. |
| **Lingo.dev** | Managed pipeline, i18n.lock delta tracking | Out — $99/mo + token pricing for a local-first, free-model project. |
| **DeepL-free via json-autotranslate** | Machine translation, 500k chars/mo class | The QUALITY BASELINE the runner prototype must beat or match; needs an API key but the free tier likely covers our whole corpus. Verify limits at build. |

**The guard (found and confirmed):** [`@intlify/eslint-plugin-vue-i18n`](https://eslint-plugin-vue-i18n.intlify.dev/rules/no-raw-text)
`no-raw-text` — flags every hardcoded template string, with `attributes` (catches
placeholder/title/aria), `ignorePattern`, `ignoreNodes`. This turns the census into a
PERMANENT lint: the conversion can't silently regress. (We run Biome, not ESLint — the
build phase adds a minimal ESLint config scoped to ONLY this plugin, or checks Biome's
lint-plugin support then; either way the rule exists and fits.)

**Do-not-translate discipline (matters for a NOVEL app):** brand ("JustWrite"), feature
names the user ruled canonical ("Strands", "Ask the book", "the Lab"), model names, and —
in help examples — invented book terms. Mechanism: DeepL glossary (native) or the LLM
prompt's protected-terms list (runner route); either way ONE shared glossary file both
routes read.

## The prototype (R3's last step — PENDING, the bench owns the box)

Spec, ready to run the moment the bench frees the GPU: take 40 real `en.json` keys
(mixed: short labels, sentences with `{n}` interpolation, a hint paragraph), translate to
ONE language (recommend Spanish) two ways — json-autotranslate→DeepL-free vs
json-autotranslate→openai-backend→our llama-server (Gemma 26B, temp 0.2, the glossary in
the system prompt) — and judge: placeholder survival, glossary obedience, length blowup
(UI fit), and read-quality. The verdict decides the default engine; the loser stays as the
documented alternative.

## THE SHAPE RULING (the user, 2026-07-26, mid-research): a SHARED autotranslate system

*"We should build an autotranslate system that works with any app with this stack or Vue —
we should be able to use this on JV."* And clarified same day: *"not just JV/JW — if we
build another app with Vue we should be able to use the system too."* So the pipeline is
NOT a JW script and not even a JW/JV-shared script: it is a standalone, generic package
(living in the shared-stack repo beside the kit — working name `tools/autotranslate/` —
but importable/runnable on its own, npx-style). **The genericity contract, explicit:**

- ZERO coupling to this stack: no kit import, no runner assumption, no JW/JV path baked
  in. The engine is "any OpenAI-compatible URL, or a DeepL key" — our bundled runner is
  merely the default VALUE in JW's config, never a dependency of the tool.
- Works on any app whose locales are keyed JSON (vue-i18n's shape — which is also
  react-i18next's shape, so future non-Vue apps ride free too). The per-app config file
  is the ONLY app-specific artifact.
- The one genuinely Vue-specific piece — the `no-raw-text` lint guard — is per-app
  tooling, shipped as the documented Vue recipe beside the tool, not inside it.

What the package owns, ONCE, for every consumer:

- a one-file config per app (locales dir · source lang · target langs · glossary path ·
  engine endpoint — the bundled runner's OpenAI-compatible URL by default, DeepL-free as
  the alternative);
- the shared GLOSSARY format (do-not-translate terms: brand, canonical feature names,
  per-app additions);
- delta-only translation (only keys changed since the last run — the idea taken from the
  GitHub-Actions class);
- the KEY-PARITY guard (every locale has every key; fail loud) — runnable in any app's CI;
- orchestration of the actual translation via json-autotranslate's machinery (adopt, don't
  rewrite: placeholder protection and engine backends are its job).

JW is consumer #1; JV becomes consumer #2 during its convergence pass with zero new design.

## The build order (falls out of the census)

1. **Coverage first** — convert the ~1,719 JW strings to keys (mechanical, view-by-view,
   the lint guard landing FIRST so progress can't regress). The kit's 613 ride the peer-dep
   decision. JV's 1,551 wait for the JV pass (the user's roadmap: JV comes after JW).
2. **Single-source hints second** (the C-bridge) — kills the CharactersView/docs drift.
3. **Translation third** — pipeline + glossary + languages. Translating before coverage
   would translate ~12% of the product.
4. Language switcher (title-bar vs Settings — JV precedent is Settings) + `setUiLocale`
   re-call wiring, last.

## The decision sheet (the user's calls, needed before the BUILD — not before the prototype)

1. **Kit i18n mechanism:** vue-i18n peer dep (REC) vs injection maps.
2. **Languages first:** which set? (ES/FR/DE/PT-BR is the usual first wave; their call.)
3. **Review policy:** ship machine-translated with an "improve translation" path, or
   human-review before shipping each locale.
4. **DB-seeded text policy:** translate the 42 knob-help + catalog notes (a locale column?
   a keyed overlay? leave English?) — the one genuinely novel design question found.
5. **Server-string policy:** translate in Python (error catalogs) vs map status→key in the
   UI (the `friendlyAiError` layer already intercepts — the cheap path).
6. **Engine default** — decided by the prototype, blessed by them.

## Verification

Census script: scratchpad `i18n_census.py` (regex census; numbers bucketing-grade by
design). Key-health cross-checked against `main.js:129-137`'s dialog injection. Seed/server
counts: greps over `seed.py` (`notes/description/help/label` fields) and the HTTP/raise
sites. Tool claims: each row's URL, read 2026-07-26. What would reverse the REC: the
prototype failing placeholder-survival on the runner route (then DeepL-free becomes
primary), or the kit peer-dep decision going the other way (then the key namespace design
changes shape).
