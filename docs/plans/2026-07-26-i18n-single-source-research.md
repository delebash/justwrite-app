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

## THE HELP-SYSTEM HALF, DESIGNED (the user, 2026-07-26: "we also talked about updating
## the help system, maybe pulling info from docs for the text in the apps — think on this")

The refinement of R2's bridge, by TEXT CLASS — each class has one natural authoring home:

| class | natural source | mechanism |
|---|---|---|
| micro-copy (buttons/headers/menus) | locale JSON | plain `$t()` keys — docs would never carry these |
| **field hints + examples** | **the surface's help DOC** | front-matter `hints:` map → build-time extraction into `hints.*` locale keys |
| **surface ledes** (the one-sentence page explainer, the don't-cram law) | **the same doc** | front-matter `lede:` → `lede.*` keys — a lede IS the doc's summary, so they can never disagree |
| help articles | markdown, unchanged | the drawer keeps glob-loading; per-locale docs dirs become possible later |
| errors/toasts/DB-seeded | code/seed → keys | already on the decision sheet |

The extractor is a SECOND small tool beside autotranslate in the shared tools, under the
same genericity contract (config = docs dir + front-matter schema + output path; any app
with a docs folder uses it). It runs at BUILD time — runtime stays plain vue-i18n, no
markdown parsing in the app. CI contract: a form referencing hint key X fails the build
unless the doc defines X — form ⇔ doc ⇔ every locale, one chain.

Why generate INTO the locale source: perfect composition with translation, zero special
cases — docs → extract → `en.json` → autotranslate → `es.json`; a changed hint re-translates
as an ordinary key delta. The translator never knows docs exist.

THE FREE UPGRADE this buys: once a hint and its doc section share a key, the hint's
"more…" deep-links the help drawer to that exact doc anchor AUTOMATICALLY — the inline
hint, the drawer section, and their translations are provably one text family, and the
"Learn more" affordance can never point at the wrong article.

Deliberately NOT done: no CMS, no runtime markdown parsing, no button labels migrating
into prose docs. Sequencing unchanged — this IS phase 2 of the build order below.

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

## WHAT THE INDUSTRY ACTUALLY DOES (the user, 2026-07-26: "I am sure they have systems
## that work together so things are repeated and automated as much as possible")

Verified 2026-07-26, and the answer maps almost one-to-one onto the plan — with three
additions the industry runs that we hadn't named:

1. **Nobody hand-maintains the key inventory.** Static analysis owns it:
   [`vue-i18n-extract`](https://github.com/Spittal/vue-i18n-extract) scans the code and
   reports (and can AUTO-ADD) missing keys and flags unused ones; the same intlify lint
   family has [`no-unused-keys`](https://eslint-plugin-vue-i18n.intlify.dev/rules/no-unused-keys)
   / [`no-missing-keys`](https://eslint-plugin-vue-i18n.intlify.dev/rules/no-missing-keys)
   beside `no-raw-text`. ADOPTED: my one-off census retires; extraction tooling becomes the
   permanent inventory (it also mechanizes a chunk of the 1,719-string conversion —
   the tool writes the missing keys, the human writes the English).
2. **Pseudo-localization is the standard pre-translation test** ([practice](https://simplelocalize.io/blog/posts/vue-i18n-localization/)):
   generate a fake locale (accented, ~30% longer, bracketed) and run the app in it —
   every hardcoded string glows as plain English, and German-length overflow breaks
   BEFORE any real translation is bought. ADOPTED as a build-order step between coverage
   and translation; it is also the honest completion test for the coverage phase.
3. **At scale the hub is a TMS** (Lokalise/Crowdin/Phrase; self-hosted: Tolgee, Weblate)
   — code ⇄ TMS ⇄ human translators, MT pretranslation, glossaries, in-context editing.
   NOT ADOPTED at our scale (solo, local-first, MT+review): the shared autotranslate
   package IS our hub. Tolgee (self-hostable, in-context click-to-edit) is the recorded
   upgrade path if human translators ever join.
4. One real fork in the road the industry splits on — WHERE English lives: central
   catalogs (our current shape) vs CO-LOCATED messages (per-component `<i18n>` SFC blocks
   / formatjs-style inline defaults, merged at build). Co-location makes the conversion
   friendlier (text stays beside its use); central is simpler for the pipeline and the
   kit-peer model, and tooling bridges both. Added to the decision sheet rather than
   decided here.

Placed honestly — CORRECTED after a dedicated help-industry check (2026-07-26; the first
pass surveyed translation only and I said so when asked): the help design maps onto THREE
named, established practices rather than being custom. (1) **Docs-as-code** — help as
markdown in the repo, built and validated like code: our drawer corpus already is this.
(2) **Single-sourcing** — a recognized technical-writing discipline (content
snippets/variables reused across outputs — the [ClickHelp/DITA world](https://medium.com/level-up-web/versioning-of-technical-documents-the-single-sourcing-approach-fd49e249296d)):
our docs→hints/lede extraction IS single-sourcing at small scale. (3) **Contextual in-app
help** — [an established pattern](https://document360.com/blog/contextual-in-app-documentation/):
tag help content with context identifiers so the app surfaces the right article — exactly
our key⇒anchor deep-link, done in-repo instead of via the SaaS help widgets
(Docsie/Document360) that sell this to web apps and that a local-first offline desktop app
could never use. So: no off-the-shelf package to adopt (the packaged versions are
cloud widgets), but the SHAPE is industry practice with names, not an invention. The only
piece without any external precedent found is generating the hints INTO the locale files
specifically so translation composes — and that is a composition choice, not a system.

## The build order (falls out of the census)

1. **Coverage first** — convert the ~1,719 JW strings to keys (view-by-view, MECHANIZED:
   the lint guard lands FIRST so progress can't regress, and `vue-i18n-extract` auto-adds
   the missing keys so the human work is writing English, not bookkeeping). The kit's 613
   ride the peer-dep decision. JV's 1,551 wait for the JV pass (the user's roadmap).
2. **Pseudo-locale gate** — generate the fake locale, run the app in it: remaining
   hardcoded strings glow as plain English, and length-overflow breaks now instead of
   after paying for translations. This IS the completion test for phase 1.
3. **Single-source hints/ledes third** (the docs bridge) — kills the CharactersView/docs
   drift and buys the automatic "Learn more" deep-links. **3b — THE HINTS CONTENT PASS
   (the user's explicit ask, 2026-07-26: "this includes adding hints — small instruction
   or what this feature does — everywhere in the app; we have some already"):** once the
   bridge exists, a surface-by-surface CONTENT audit — every view gets its one-sentence
   lede (the don't-cram law: ONE lede max, detail behind `?`), every non-obvious field
   and control gets a short hint, written IN THE DOCS front-matter so they flow through
   the bridge translated like everything else. The existing hints (character sheet,
   scattered tooltips, the current ledes) are the style precedent — this pass fills the
   gaps to that standard, it does not re-write what exists. Output is a coverage table
   (surface → lede ✓/hint count) so "everywhere" is checkable, not vibes.
4. **Translation fourth** — the shared autotranslate package + glossary + languages.
5. Language switcher (title-bar vs Settings — JV precedent is Settings) + `setUiLocale`
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
7. **Where English lives** — central catalogs (today's shape, simpler pipeline) vs
   co-located per-component messages (`<i18n>` SFC blocks — friendlier authoring during
   the big conversion; tooling merges them into catalogs either way). The industry splits
   on this; our call can too.

## Verification

Census script: scratchpad `i18n_census.py` (regex census; numbers bucketing-grade by
design). Key-health cross-checked against `main.js:129-137`'s dialog injection. Seed/server
counts: greps over `seed.py` (`notes/description/help/label` fields) and the HTTP/raise
sites. Tool claims: each row's URL, read 2026-07-26. What would reverse the REC: the
prototype failing placeholder-survival on the runner route (then DeepL-free becomes
primary), or the kit peer-dep decision going the other way (then the key namespace design
changes shape).
