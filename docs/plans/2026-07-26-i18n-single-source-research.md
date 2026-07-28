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

## The prototype (R3's last step — RE-SPECIFIED 2026-07-27, see "R3 CORRECTION" at the end
## of this document: the json-autotranslate route below is DEAD — its OpenAI backend hardcodes
## api.openai.com — and the DeepL arm needs a key that does not exist on this box)

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

## R3 CORRECTION (2026-07-27): the primary route does not exist, and the prototype is re-specified

The prototype was gated on the GPU freeing. It freed; the prototype was run at, and stopped on a
finding that changes R3's recommendation rather than on a translation result. Both arms are blocked,
for two unrelated reasons, and the first one is a claim this document made and got wrong.

**json-autotranslate cannot point at our llama-server.** R3's table above calls its OpenAI backend
"the primary candidate — because it can point at OUR llama-server", with the caveat "needs one
prototype check: custom base-URL support". That check comes back NO. In
`src/services/openai.ts`, `callOpenAIChatCompletion()` builds `const apiUrl =
'https://api.openai.com/v1/chat/completions'` as a string literal (`:317`) and posts to it with
`node-fetch`, hardcoding `model: 'gpt-4o'` (`:320`) and `temperature: 0.3`. The service's entire
configuration surface is the `--config` string, split on a comma into `[apiKey, systemPrompt]`
(`:33`) — there is no base-URL option, no model option, and because it uses raw `node-fetch` rather
than the OpenAI SDK there is no environment variable to lean on either. Published version is 1.16.2,
last modified 2026-02-26. The claim in R3 was inferred from the backend's NAME and from the README's
service list; nothing in either says the endpoint is configurable, and the source says it is not.

**The DeepL baseline needs a key we do not have.** `DEEPL_API_KEY`, `DEEPL_KEY` and `DEEPL_AUTH_KEY`
are absent from the user's environment at every scope (process, user, machine). DeepL-free requires a
signup the user has to perform; it cannot be arranged from here.

**The replacement, verified the same way.** `i18n-ai-translate`
(https://github.com/taahamahdi/i18n-ai-translate, npm 5.1.0, last modified 2026-06-28 — actively
maintained, a month old at the time of writing) is a maintained CLI over locale JSON with four
engines. Its factory constructs the ChatGPT engine as `new OpenAI({ apiKey })`
(`src/chats/chat_factory.ts`, the `Engine.ChatGPT` case) — passing no explicit `baseURL`. The
official openai-node client defaults that argument to the environment:
`baseURL = provider ? null : readEnv('OPENAI_BASE_URL')` (`openai-node/src/client.ts:433`), falling
back to `https://api.openai.com/v1` only when the variable is empty (`:452`). So exporting
`OPENAI_BASE_URL=http://127.0.0.1:<port>/v1` points the tool at our llama-server with no patch, no
fork, and no custom script — which is the property R3 wanted json-autotranslate for. Its `--model`
is a first-class option, it carries a glossary module (`src/glossary.ts`), a diff/delta mode
(`src/cli_diff.ts`) matching R3's "steal the delta idea", plus rate limiting, retry and sharding.
Its Ollama engine does take a `--host` (`src/cli_helpers.ts:133`, falling back to
`OLLAMA_HOSTNAME`), but it drives the `ollama` npm client against Ollama's native `/api/chat`, so it
is NOT a route to a llama.cpp server; the ChatGPT engine plus the env var is.

**The 40-key corpus is built and is the one thing here that survives any engine choice.** It lives in
the scratchpad (`i18n-proto/en/proto.json`), selected deterministically from the 846 leaves of
`en.json` by even spacing within each stratum, so it regenerates identically: 8 plural-pipe keys
(every one in the catalog), 20 keys carrying `{interpolation}`, 10 paragraphs over 120 characters,
7 keys containing a do-not-translate term, and 15 short labels — 3,097 characters total. Two strata
were chosen because they are where this will break rather than to be representative. The plural
pipes include forms carrying TWO different interpolations across both halves
(`chapters.dialogs.deletePartMessage`: `"Its {n} chapter will move to \"{into}\". | Its {n} chapters
will move to \"{into}\"."`), which tests pipe survival, interpolation survival, and Spanish plural
rules at once. The long paragraphs are the `<i18n-t>` named-slot sentences from the 2026-07-26
no-HTML conversion (`settings.intro` carries `{settings}`, `{project}`, `{appearance}`, `{general}`),
where a slot name that comes back translated or reordered into a different key renders as literal
braces on screen — the failure mode that conversion's own verification was built to catch.

**Open, and neither is ours to settle:** whether `i18n-ai-translate` replaces `json-autotranslate`
as the vehicle (a forced substitution — the named tool is incapable, not merely worse — but it is
still the tool this project would live with), and whether the DeepL baseline is worth a signup or
the local output gets judged on absolute quality with no comparator. Decision-sheet item 6 ("engine
default — decided by the prototype, blessed by them") is unchanged in spirit; only the instrument
moved.

## THE TOOL EXISTS — `just-ai-help`, built and measured 2026-07-27

**What changed.** The translation half of this research is now a working tool in its own
repository, `E:\Dev\Web\just-ai-help` (commits `b36ae7f`, `88bd06f`). The user named it and
ruled its shape over the course of the session: an **independent open-source tool, not linked to
any app** — *"it is just a tool we have setup to run against any en.json file"* — with two
functions sharing one pipeline. Function 1 translates any standard i18n JSON folder. Function 2
(designed, not built) authors the help-docs system, emitting `lede:`/`hints:` front-matter into
locale keys so one authored sentence becomes the help article, the surface lede and the field
hint, and then translates like any other key. They live in one repo because function 2 feeds
function 1; the user's own framing is that function 1 alone would not justify a repo, since
*"most people would not even use what we built and just use the tool directly."*

**Why a wrapper at all, given that.** Two things the dependency structurally cannot do, both
discovered by failure rather than reasoning. First, `src/engines.json` holds per-provider facts
a generic translator has no way to know: a stale model id 404s (`gemini-2.5-flash`, which is the
dependency's own `DEFAULT_MODEL` constant, is no longer served to new API keys, and silently
failed 19 of 40 keys); a thinking model with no token headroom returns EMPTY content because the
deliberation fills `reasoning_content` and the budget is gone before an answer is written; and
the `chatgpt` engine assumes OpenAI's ~500 RPM, so pointing it at a 15 RPM free tier burns the
run on retries. Second, the dependency **exits 0 even when it skipped keys** — a broken run and a
good run are indistinguishable to CI — so the wrapper re-reads the files that were written and
asserts nothing is missing, placeholders are unchanged, `doNotTranslate` terms survive, and
plural halves are both present AND different from each other. That last check is the only one
that catches `"¿Eliminar {n} autoguardados? | ¿Eliminar {n} autoguardados?"`, which passes every
structural test and is still wrong.

**The engine decision.** Local means "point at a server you already run", and the user ruled
Ollama as the recommended one: *"ok ollama is fine, keeps it simple."* The tool downloads and
manages nothing. The grounds are priced from our own working implementation rather than asserted:
`just-llm-runner/llm_runner/runner/binary.py` is 422 lines (CUDA build selection by compute
capability at `:28`, a four-way installed-exe search at `:167`-`:216`) and `runner/hardware.py`
591 — 1,013 lines of platform matrix, against this tool's entire engine mechanism, which is one
config key (`src/engines.json` `baseUrlEnv`) and one line (`src/translate.mjs`, forwarding it to
the child process). `node-llama-cpp` (MIT, 1.12M weekly downloads) remains the upgrade path if
zero-setup local is ever wanted, but it is a JavaScript API with no HTTP server, so it would need
a small shim; it buys convenience, not capability.

**Measured, against 40 real keys** chosen to break things (every plural-pipe key in the catalog,
20 interpolations, the long `<i18n-t>` named-slot paragraphs, glossary terms, short labels).
Gemini 3.6 Flash: 40/40 translated, 40/40 placeholders intact, 8/8 pipes, **zero** identical-half
bugs, glossary 5/5, 1.14x length, 94 seconds. Local Gemma-26B on the 8 GB card: identical except
**one** identical-half bug, 1.13x, 147 seconds. Both viable; both ship. Short labels blow up
worst (1.50x on a ten-character nav item), so sidebars overflow before paragraphs do.

**The dependency is forked at `E:\Dev\Web\i18n-ai-translate`** on the user's instruction —
*"clone i18n repo, do the fix and we will work off that until we are confident of fix and then do
pr."* The fix adds a `--think` flag for the Ollama engine: `constants.ts` gains the help text,
`cli_helpers.ts` gains `parseThink()` (rejecting unrecognised values loudly, because a typo would
otherwise be indistinguishable from "thinking is off") and sets `chatParams.think` only when the
flag is present, and `cli_translate.ts:65` / `cli_diff.ts:45` / `cli_check.ts:44` each gain the
option — all three, because `diff` is the command that preserves hand-corrections and would
otherwise silently start thinking again on a re-run. It is TypeScript because their codebase is;
`just-ai-help` itself contains no TypeScript at all (`git ls-files`: one `.mjs`, two `.json`, a
README).

**How to verify.** In `just-ai-help`, `node src/translate.mjs <config> --check-only` re-runs the
output checks offline with no API call — that is the CI gate. The checks are proven to BITE, not
merely to pass: a clean file reports `4/4 translated, all checks passed, exit 0`, and a corrupted
one names all three defects separately (`missing (1): settings.storedServer`, `plural halves
IDENTICAL (1): outline.noteCount`, `glossary term translated (1): nav.strands`) and exits 1. The
full path was run end to end against a local llama-server with the cache CLEARED — 16 seconds,
4/4, exit 0. The first attempt passed in 0 seconds from cache and proved nothing, which is
recorded because that is exactly how a rename gets waved through untested. In the fork,
`npm run build` then `npx esbuild src/cli.ts --bundle --platform=node --outfile=build/i18n-ai-translate.js`
(the `prepare` script's own quoting fails on Windows), then `node build/cli.js translate --help`
shows the flag; 229/229 of their tests pass.

**What would reverse it.** For the wrapper: if the dependency ever grows engine profiles and
output verification of its own, `just-ai-help`'s function 1 becomes redundant and only the docs
half justifies the repo. For the engine call: if `node-llama-cpp` ever ships an OpenAI-compatible
server, zero-setup local costs nothing and "bring your own server" stops being the simplest
answer.

**Open.** The `--think` fix is **untested against a real Ollama** — it compiles, renders in help
and parses, but no request carrying `think:false` has left this machine; Ollama is installed
(`F:\ollama\ollama.exe`) but not running, and a thinking model is a multi-GB pull. The full
846-key catalog run was still in flight when this was written. And the runner has the same gap:
`llm_runner/llm/ollama.py:99-103` omits `think` when off rather than sending `false`, so a
thinking-by-default model asked for thinking-off still thinks — the user has ordered that fixed
next.

### The runner's Ollama thinking gap — FIXED and live-verified 2026-07-27

**What changed.** `llm_runner/llm/ollama.py:_apply_reasoning` now sends an explicit
`body["think"] = False` when thinking is off, where it previously omitted the field and
inherited whatever the model does by default. The user ordered this after the same gap
surfaced in the new translation tool: *"do we need to fix our llama runner."*

**Why it was wrong.** The old docstring said "think off → omit (model default)", which is
only harmless for a model whose default is off. For a model that thinks BY DEFAULT the user
switches thinking off in the UI, the runner sends nothing, and the model reasons anyway —
the control says off while the behaviour is on. Measured on this box against a live Ollama,
qwen3:8b, translating one five-word string: with no `think` field the response carried
**1,930 characters of thinking and took 27 seconds**; with `think: false` it took **2 seconds
with no thinking at all**. That is the defect, reproduced.

**The risk that had to be cleared first.** Sending `think: false` universally could break a
model that does not support thinking. Tested directly: gemma3:1b (a non-thinking chat model,
pulled for this) **accepts the field without error**. An earlier attempt at this test used
`nomic-embed-text` and returned a 400 — that proved nothing, because the model does not
support chat at all; the 400 was about the endpoint, not the field.

**A finding that came free, and matters for the translation tool.** Thinking off is not a
pure win. On the same string, thinking-on returned `{n} nota | {n} notas` while thinking-off
returned `{nota} nota | {nota} notas` — **it translated the placeholder**. Deliberation is
what protected the interpolation. So `think: false` buys a 13x speedup at a real quality cost
on structured text, which is why `just-ai-help` exposes the flag but sets no default.

**How to verify.** `tests/test_adapter_extra.py::test_ollama_reasoning_maps_level_or_bool`
now asserts `b["think"] is False` for the off case (it previously asserted `"think" not in b`
— the old behaviour was pinned by a test, so this is a deliberate behaviour change, not a
bug fix to an unguarded path). Suite: 42/42 in that file, **710 passed / 9 skipped / 1
failed** full-suite, the failure being the documented Windows `lspci` known-bad.

**What would reverse it.** An Ollama build old enough to reject the field, or a report that
some model errors on it. The generic `openai-compat` adapter deliberately still sends nothing
when off (`openai_compat.py:127-128`, *"we don't own its chat template"*) — that caution stays,
because it applies to unknown servers; Ollama is not unknown.

## THE V2 DESIGN — planned 2026-07-27, awaiting go

The complete rethink (user's order, written for an Opus executor as Fable's weekly tokens
ran out) lives in **`just-ai-help/docs/plans/2026-07-27-v2-design-executor-plan.md`** —
decision-closed. Headline changes from v1: the GPL fork is no longer the long-term base
(its self-verification measured blind to every semantic defect and 5-10x the cost; every
failure today traced to not owning the request body); ONE spike decides adopt-vs-build
(Lingo.dev CLI — pure Node npm package, permissive Apache-2.0 LICENSE, 5,401 stars,
BYO-Ollama — with mechanical pass criteria), else a fully-specified ~450-line own loop
with an extraBody pass-through that makes every provider quirk config; checks expand per
the pofilter test list in Node (es conventions table — the measured 5/5 missing-¿ class);
a mechanical qwen3:8b vs gemma3:12b bake-off picks the local default; a single-file review
page + --escalate close the correction loop. Launch = the user's literal "go".

## V2 EXECUTION LOG — the user's "go", 2026-07-27

### STEP 2 — the Lingo.dev spike: **FAIL on criterion (c)**. Path 3B (build Layer 1) is selected.

The spike ran in the scratchpad (`lingo-spike/`), `lingo.dev` **0.138.3**, LICENSE.md is
Apache-2.0 as the plan recorded. The 40-key corpus, en→es, provider `ollama` / `qwen3:8b`,
temperature 0.2, with a system prompt carrying the do-not-translate list, the
inverted-punctuation rule and the product-context line. Verdict against the plan's four
mechanical criteria:

| criterion | result | evidence |
|---|---|---|
| (a) fully local, no lingo.dev account | **PASS** | `lingo.dev auth` reports "Not authenticated" and the run completes. In `createProcessor` (bundle `cli.mjs`), a present `provider` node takes the `createBasicTranslator` branch; only a *missing* provider falls through to `createLingoLocalizer` (their hosted engine). |
| (b) documented glossary + context injection | **PASS**, found in ~10 min of the 30-minute box | `provider.prompt` is a **required** field of the published config schema (`@lingo.dev/_spec`, `providerSchemaV1_10`: *"Prompt template used when requesting translations"*). It is used verbatim as the system message, with `{source}`/`{target}` substituted. Anything we want the model told, we can tell it. |
| (c) output passes our structural gate | **FAIL** | see below |
| (d) immediate re-run translates 0 keys | **PASS** | second run: `1 from cache, 0 processed, 0 failed`, 6.9 s, `es.json` byte-identical. The `i18n.lock` delta works. |

**The failure, in full.** 40/40 keys came back and 8/8 plural pipes survived, but:

```
chapters.outline.noteCount   en: "{n} note | {n} notes"
                             es: "{n} nota | {3} notas"        ← placeholder REWRITTEN
nav.strands                  en: "Strands"
                             es: "Hilos"                       ← glossary term translated
opening ¿ on questions:      0/5                               ← same class the fork failed
```

That is 39/40 placeholders (needed 40/40) and 2/3 glossary terms held (needed 3/3), against a
prompt that explicitly forbade both. Wall time 37 s for the corpus — the fastest local result
measured all day, and it does not matter, because the two defects are the exact two axes this
whole exercise exists to hold.

**Why it fails, mechanically, and why it is not patchable from outside.** `createBasicTranslator`
sends the payload as raw JSON and asks for JSON back — **there is no placeholder shielding
anywhere in the path**. The fork's one genuinely valuable behaviour (swap `{n}` for an opaque
token before the model sees it, restore by index afterwards) has no counterpart here, so
placeholder survival rests entirely on the model choosing to comply, and on this corpus it did
not. Prompt wording cannot fix that: `{3}` is what the model wrote when it was told in the
system prompt not to.

**Recorded, not pass/fail — is the request body shapeable?** **No.** The Ollama branch is
`createOllama()(provider.model)` — `provider.baseUrl` is accepted by the schema and then
*ignored* for this provider, and the only per-model setting the schema permits is
`settings.temperature` (`modelSettingsSchema` has exactly one key). There is no `think`, no
`options`, no extra-body escape hatch. This is the same disease the v2 design was written to
cure: the request body belongs to somebody else. Adopting lingo.dev would re-acquire it.

Chunking, for the record: fixed at 25 items or 250 words per request, not configurable.

**Verdict: FAIL → STEP 3B.** Per the plan, no third option and no attempt to patch lingo.dev.
The spike was worth its cost: it converted "adopt-first" from a preference into a measurement,
and it produced the sharpest single argument for owning the loop — a tool that does everything
else right still wrote `{3}`.

### STEPS 3B–8 — what the tool is now

`just-ai-help` is three layers, one repo, **zero npm dependencies** (its `package-lock.json` is
down to the root package; Node 20+ and global `fetch` are the whole runtime). The GPL fork is
retired as a dependency and stays only as evidence and PR material.

**Layer 1 — `src/loop.mjs`, the translate loop.** The request body is a literal object in that
file, and `extraBody` on an engine profile merges into it verbatim. That single field is the
cure for the disease every failure of 2026-07-27 shared: `--think`, `chat_template_kwargs`, a
stale model id, a rate limit tuned for another provider — all of them are now data. Two
transports, `ollama` (`{url}/api/chat`) and `openai-compat` (`{url}/chat/completions`), both
already proven accepted. Retry ladder: batch ×3, then that batch's stragglers as singletons ×2,
then the key is **left untranslated, named on stderr, and the exit code is non-zero**, because
the bug that started this whole project was a tool that exited 0 after skipping keys.

Shielding turned out to be the load-bearing idea, and it grew one step beyond the plan's spec
under measurement. Interpolations are swapped for `⟦0⟧`, `⟦1⟧` … before the model sees them and
restored by index; an item that does not return every token exactly once is a *failure* routed
to retry rather than a result. The plan left do-not-translate terms to the prompt, and the
gate then failed exactly there: run 1 of the corpus passed every check and run 2 of the
**identical code** came back with `Strands` → `Hilos`, the same key lingo.dev had also
mistranslated, both with the term named in the system prompt. A rule a model may or may not
follow is not a guarantee. Glossary terms are now shielded by the same substitution,
longest-first and only at non-letter boundaries. (Flagged as a deliberate extension of the
plan's spec, not a silent one.)

The gate itself found a real bug worth recording, because it is the kind that makes a CI signal
meaningless: the first fully passing run still exited **127**, a libuv assertion
(`!(handle->flags & UV_HANDLE_CLOSING)`) on Node v26.5.0 caused by `AbortSignal.timeout` leaving
a live timer while `process.exit()` ran. Replaced with an explicit `AbortController` cleared in
a `finally`, and the CLI now sets `process.exitCode` instead of exiting hard.

STEP 3B gate, qwen3:8b on the 40-key corpus, two consecutive `--force` runs, both exit 0:
40/40 translated · placeholders 40/40 · pipes 8/8 · glossary 3/3 · **117.7 s and 125.2 s**
against a 307.5 s ceiling (1.5× the fork's 205 s). One run exercised the retry path and
recovered. The delta re-run made 0 requests and produced a byte-identical file.

**Layer 2 — `src/checks.mjs`.** pofilter's test list as the spec, in Node, 13 codes:
`missing` · `blank` · `placeholder-changed` · `plural-halves-lost` · `plural-halves-identical` ·
`glossary-translated` · `untranslated` · `startpunc` · `endpunc` · `numbers` · `brackets` ·
`doublewords` · `whitespace`. Every finding is `{key, code, detail}` — one shape, because the
list is not only the CI gate, it is the feed the review page triages on. Every check has a test
that hands it a deliberately broken string and asserts it complains; a check that has never been
seen to fail is indistinguishable from one that cannot. `untranslated` deliberately exempts a
string that is only placeholders and glossary terms, since `Strands` → `Strands` is correct
behaviour and a check that flags its own correct behaviour trains people to ignore the report.
`src/conventions.json` ships **Spanish only** — French's spaced punctuation, German's quotation
marks and CJK full-width forms are real rules nobody here knows, and writing them from memory is
how a confident wrong rule reaches every future translation.

**STEP 5 — the local bake-off, and the day's second real finding.** Two models, two full corpus
runs each, scored mechanically by Layer 2:

| | **gemma3:12b** | qwen3:8b |
|---|---|---|
| translated | 40/40 · 40/40 | 40/40 · 40/40 |
| **structural** failures | **0 · 0** | **0 · 0** |
| semantic flags | **1 · 2** | 3 · 7 |
| missing `¿` (`startpunc`) | **0 · 0** | 1 · 5 |
| wall time | 227 s · 219 s | 160 s · 116 s |

Winner **gemma3:12b**, written into the ollama profile with its numbers; the time tiebreak was
never reached. The step existed to answer one question directly rather than assume: *is qwen3's
measured 5/5 missing-`¿` prompt-fixable?* Both models got the identical conventions rule in the
system prompt. gemma3 obeyed it 5/5, twice. qwen3 missed 5/5 on one run and 1/5 on the other —
**unreliable rather than consistently wrong, which is harder to plan around than either**. The
answer is no: that defect is a model choice.

And it is only visible because the checks separate structural from semantic. On structure the
two models are **indistinguishable** — 0 and 0, twice each. Everything that separates them lives
in the half that nothing except these checks looks at, which is the strongest available argument
for Layer 2 being the differentiator rather than the loop.

**Layer 3 — `src/review.mjs`.** One `node:http` server, one inline HTML page, no framework, no
build, no dependencies, no account, no database: the locale files *are* the state. Flagged rows
pin to the top with a reason chip each, edit in place, saves on blur, re-runs the checks for
that key and updates the counts. The contract that matters, and it has a test: **saving one
value leaves the file byte-identical except that value** — the nested structure is rebuilt from
the *source* file's shape, so a one-word fix produces a one-line diff and a reviewer's work can
itself be reviewed. Rendered headless against both bake-off outputs: zero JS errors, correct
chips. Looking at it produced one fix that no test would have caught — the textarea was a fixed
two rows and clipped exactly the long paragraphs most likely to be wrong.

**STEP 8 — `--escalate <profile>`.** Checks what is on disk, re-translates only the flagged
keys with a named profile, merges, re-checks, prints before → after. The cheap engine does the
catalogue; the expensive one is spent on the keys that earned it. Gate, on a first pass
corrupted by hand across every failure class, qwen3:8b escalated to gemma3:12b: **16 findings
across 11 keys → 1 finding across 1 key, in one request, 83.6 s.** Ten keys changed; the
eleventh came back identical and stayed flagged, which is the honest outcome rather than a
hidden one.

That feature forced two fixes that were latent bugs, not new work. `--force` was silently
*deleting the entire cache* — it started from `{}` and then wrote the file back, taking every
other key's and every other language's entries with it. And the write path now merges over the
existing target, so a key that exhausts every retry keeps its previous translation instead of
vanishing (still named on stderr, still exit 1) — a transient engine failure no longer destroys
good prior work.

### The observability incident — a healthy run killed on a misdiagnosis

Worth recording in full, because the mistake was mine and it is repeatable.

The first attempt at STEP 6 was launched as `node translate.mjs config.json 2>&1 | tail -60`
and, separately, before the per-batch flush existed. Those two facts together made a perfectly
healthy hour-long run **completely invisible**: `tail` buffers everything until its input
closes, so stdout showed nothing; and the pre-flush loop wrote the locale file only at the very
end, so the output directory stayed empty. Forty minutes in there was no log, no `es.json` and
no `.jah-cache.json`.

Asked to investigate, I read Ollama's `server.log`, saw recent tasks with prompts of 152–494
tokens against `n_ctx_slot = 4096` — far too small to be a batch of 16 — and concluded it was a
singleton retry storm. **That inference was wrong.** Those small prompts belonged to *other*
runs sharing the same Ollama instance (a corpus re-verification, a resume smoke test at
batchSize 8, and the escalation gate); the shared server interleaves every client's tasks into
one log and one task counter, so "recent small prompts" said nothing whatever about which
client sent them. On that reasoning I killed the process.

Its buffered output, released when the pipe finally closed, showed the truth: **36 of 53
batches complete, 576 of 846 keys, in about forty minutes, with exactly two single-item
retries** — one of the cleanest runs of the day. I destroyed 68% of an hour's work to fix a
problem that did not exist.

Three things to keep from it. First, a shared inference engine's log is **not** attributable to
one client, and reasoning about your own run from it is a category error. Second, the
per-batch flush landed for robustness (resume-after-interruption) and turns out to matter at
least as much for *observability* — the relaunched run's first flush was verified on disk
within three minutes, so "is it alive" became a question with an answer. Third, and the actual
root cause of the whole episode: **never pipe a long background run through `tail`.** Redirect
to a file. The progress lines the loop already printed every batch were there the entire time;
they were sitting in a buffer.

Nothing about the tool was wrong. The instrumentation around it was, and a confident diagnosis
built on unattributable evidence did the damage.

### STEP 6 landed — and the checks caught a regression the corpus could not

The 846-key proof run finished 2026-07-27 19:17: **846/846 translated, 56 requests, 3
single-item retries, 3,112.8 s** (52 min) on gemma3:12b via Ollama. Structurally perfect at
scale — **zero** placeholder, plural, glossary or missing-key failures across the whole
catalogue, and **0 of 16** real questions lost their opening ¿, which is the bake-off result
holding at 21x the sample size.

**The regression, and it was ours.** The conventions `promptLine` told the model Spanish
questions open with ¿ and never said *only when it is a question*. The catalogue came back
with **72 ¿ against 16 real questions — 56 spurious**: the button "Try tutorial project"
became "¿Probar proyecto de tutorial?", the card title "Statuses" became "¿Estados?", the
empty state "No chapters match" became a question. The 40-key corpus could not have caught
it (five questions, few imperative labels); only the full catalogue had the surface area.
This is the checks earning their place — a defect invisible to every structural test, found
mechanically.

**Fixed in two parts.** The promptLine now says when NOT to apply (`conventions.json`, with
the old wording preserved in `_promptline_history` so the lesson survives the fix), and a new
inverse check `checkSpuriousPunc` / `spurious-interrogative` flags a target that opens a
paired mark the source never closed — `endpunc` had caught only 39 of the 56 because the rest
had matching terminal punctuation. Test bites on the two verbatim regressions and stays
silent on genuine questions, so the cure cannot undo `startpunc`. 37/37.

**Escalation, measured:** `--escalate ollama` over the 63 flagged keys — **99 findings → 23,
63 keys → 18, 557 s**, 22 requests. Spurious ¿ fell **52 → 10**.

**What remains, and why it stays.** The surviving 10 are one harder class: English labels
built from interrogative words with no question mark — "Where the lie began", "How they
escalate", "How they sound and move — the calibration set." Semantically interrogative,
grammatically a label; correct Spanish nominalises without marks. A prompt rule cannot
reliably separate those from real questions, and an automatic strip would be a blind mutation
of translated prose. They are a **review-page residue: 10 of 846, 1.2%**, which is the
workflow the third layer exists for. The 8 `untranslated` flags are all false positives —
"No", "General", "Error", "ID", "Tauri ({version})", "Vue 3 + Pinia" are correct as-is; a
cognate exemption is possible but unbuilt, and deliberately so: the rule that distinguishes a
lazy copy from a correct cognate is not obvious and is not mine to invent.

One key exhausted its retries during escalation (`characters.fields.function.escalation.label`)
and **kept its previous translation rather than being erased** — the hard-fail-preserves-prior
behaviour working as designed.

### Model recommendations by VRAM — `just-ai-help/src/models.json`, added 2026-07-28

**What changed.** A new file, `just-ai-help/src/models.json`, holding which model to run at
which VRAM tier. It is deliberately NOT part of `engines.json`: that file holds PROVIDER facts
(how to reach a server — url, kind, batch size, rate limit), whereas this holds MODEL
JUDGEMENT (which weights are any good). A provider row is configuration; a model row is a
claim about quality, and a claim needs evidence attached.

**Why, and the two rules written into the file.** The user asked for larger-VRAM options —
"maybe larger versions of the hy-mt2 or gemma if they prove to be the best in our small vram
solution". The trap in that request is the one their own JustWrite catalogue work already
named: availability is not recommendation. So every entry carries `status: measured` or
`status: available`, and the file states why the distinction is load-bearing — **TranslateGemma
is the proof**: the 12B was measured flawless while the 4B translated the do-not-translate
brand `Strands` to `Hilos` and dropped a key. A larger or smaller sibling of a good model is a
CANDIDATE, never a recommendation. The second rule is `_size_does_not_predict_fit`:
`gemma3:12b` and `translategemma:12b` are BOTH 8.1 GB on disk and took **227 s and 1,145 s**
for the same 40 keys on the same 8 GB card — 5x apart. Tiers are therefore grouped by what was
measured to run well, never by arithmetic on file sizes. The 16 GB and 24 GB+ tiers carry
`recommended: null` with named candidates, because nobody here owns that hardware and a
plausible-sounding guess in a shipped table is indistinguishable from a measurement to whoever
reads it later.

**The new measurement that prompted it.** The user's HuggingFace links (after correctly
calling out that searching the marketing name "TowerLLM" instead of the family name
`Tower-Plus` was lazy) surfaced that **Tencent ships FIRST-PARTY GGUFs for the whole Hy-MT2
family** — `Hy-MT2-1.8B`, `7B`, and `30B-A3B` (187k downloads on the base repo), which is the
opposite of the third-party-quant provenance that made StyleTune a hazard. `Hy-MT2-7B`
(Q4_K_M, 4.6 GB) pulled via Ollama's `hf.co/` path and ran the 40-key corpus: **0 structural
failures, 2 semantic flags (1 startpunc, 1 endpunc), 232.6 s** — statistically tied with
`gemma3:12b` (0 structural, 1-2 semantic, 219-227 s) at **57% of the disk size**. One run does
not unseat a two-run winner, so the default is unchanged pending a second run; `qwen3:14b` is
measuring now.

**How to verify.** `node -e "require('./src/models.json')"` parses; the measured numbers are
reproducible by re-running the 40-key corpus at
`C:\Users\danel\.claude\jobs\5b32e070\tmp\mt-bakeoff\<model>\` with
`node E:\Dev\Web\just-ai-help\src\translate.mjs config.json`. **What would reverse it:** a
second Hy-MT2-7B run confirming the first would make it the 8 GB recommendation on size alone;
a 16 GB machine appearing would let that tier stop being `null`.
