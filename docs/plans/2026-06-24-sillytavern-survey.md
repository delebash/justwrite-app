# SillyTavern feature survey → our shared AI stack (2026-06-24)

Research pass (RULE #7 §D: study mature prior art before building) on **SillyTavern**
— the most comprehensive open LLM front-end — to decide which settings/features +
design choices our shared stack (`just-llm-runner` + `@delebash/llm-ui`, consumed
by JustWrite + JustVoice) should adopt. Sources (SillyTavern-Docs, GitHub `main`):
`Usage/Common-Settings.md`, `Usage/Prompts/{index,advancedformatting,reasoning,
tokenizer}.md`, `Usage/worldinfo.md`, `Usage/macros.md`,
`Usage/API_Connections/Connection-Profiles.md`. (Docs site bot-blocks fetchers;
read from the raw repo.)

## Where we are today
Providers (local/cloud) · routing (default LLM **+ model**, Quick/Accuracy role
cards, per-feature pins) · per-action prompts (system + user template + `{{var}}`)
with **named presets = the Lab** (save / test-candidate / promote to production) ·
knobs: **temperature · max_tokens · think** · local llama.cpp runner with auto-Fit
(no per-model layer/MoE override UI yet) · JW: RAG ("Ask the book") + story bible.

## 1. Sampler parameters — the big gap
ST exposes ~19 samplers; **most are local-backend-only**. The portability matrix
(**source-verified** against ST's request builders — `public/scripts/openai.js`
+ `public/scripts/textgen-settings.js`, 2026-06-24 — see §8):

| Sampler | OpenAI-compat (cloud) | Ollama | llama.cpp/Kobold | We pass it? |
|---|---|---|---|---|
| temperature | ✅ | ✅ | ✅ | ✅ |
| max_tokens | ✅ | ✅ (num_predict) | ✅ | ✅ |
| top_p | ✅ | ✅ | ✅ | ❌ |
| frequency_penalty / presence_penalty | ✅ | ~ | ~ | ❌ |
| repetition_penalty (+ range/slope) | ❌ | ✅ (repeat_penalty) | ✅ | ❌ |
| top_k | ❌ | ✅ | ✅ | ❌ |
| min_p | ❌ | ✅ | ✅ | ❌ |
| typical_p / top_a / TFS / smoothing / dynamic-temp / epsilon-eta / DRY / XTC / mirostat / top-nsigma / beam | ❌ | partial | ✅ | ❌ |
| seed | ✅ | ✅ | ✅ | ❌ |
| stop sequences | ✅ | ✅ | ✅ | ❌ |

**Design recommendation (the key call):** do NOT add 19 columns. Add ONE
**`sampler_params` JSON field** per action (variable-shape, backend-specific →
the cited exception to "no JSON in SQL"). The adapter passes only the keys its
backend supports + ignores the rest. The editor shows a **backend-aware** sampler
section: the portable few (top_p, penalties, seed, stop) always; the local-only
exotics (top_k, min_p, mirostat, DRY, XTC, …) only when the routed provider is
Ollama / local-llamacpp. This is the scalable shape ST itself uses (a preset =
a bag of sampler values) and it cleanly extends the per-action Lab.

**Minimum useful first slice:** `top_p`, `stop` (array), `seed`, and
`frequency_penalty`/`presence_penalty` (cloud) ↔ `repeat_penalty`/`top_k`/`min_p`
(local). Everything else is a power-user add behind "Advanced (local only)".

## 2. Generation controls worth adopting
- **Stop sequences** + **Seed** (per action) — portable, high value (bounded /
  reproducible outputs). Part of the sampler_params slice above.
- **Reasoning effort** (low/med/high) — ST maps ONE effort knob to each provider's
  native param (Claude token %, OpenAI keyword, Gemini budget). We have a `think`
  bool + the tier system; graduating to an effort enum future-proofs reasoning
  models. MED.

## 3. Context + prompt management
- **Token counting + context budgeting** (HIGH for us): ST counts tokens, reserves
  a **padding buffer**, and truncates to fit. We send prompts as-is — our
  whole-book features (plot-hole audit, reverse outline) can overflow context with
  no guard. Adopt: a tokenizer estimate (≈chars/4 fallback; exact via the local
  runner / tiktoken) + a per-provider context cap + a "this prompt is ~N tokens /
  cap M" indicator in the Lab, and budget-aware truncation for long inputs.
- **Prompt itemization** (MED): ST shows the fully-assembled prompt + per-section
  token breakdown. A "Preview assembled prompt + token count" in the Lab before
  Run would make the Lab much stronger.
- **Post-history instructions** (LOW–MED): a final, higher-priority instruction
  after the user content. Could be a per-action "final instruction" slot.
- **Context / instruct templates** (LOW for us): per-model wrappers for raw
  text-completion. We use chat endpoints (server applies the chat template), so
  mostly N/A — note it only if we ever add a raw-completion backend.

## 4. Conditional context injection — World Info ↔ our story bible
ST's **World Info / lorebook**: keyword-triggered (or vector-similar) injection of
entries into the prompt, with insertion order/position/depth, recursion, and a
token budget. JW already has the pieces (story bible + RAG). The adoptable idea:
**auto-inject the relevant bible entries** (characters/locations the chapter
mentions) into AI-feature prompts — so e.g. critique/continue "knows" the cast —
keyword- or embedding-triggered, budget-capped. MED; complements RAG.

## 5. Macros
We do plain `{{var}}` lookup. ST has a rich macro set (names, card data, history,
time/date, **variables** get/set/inc, **random / pick / roll**, conditionals).
Worth extending `render()` with a few generally-useful ones: `{{random::a::b}}`,
`{{pick::…}}`, `{{date}}`/`{{time}}`, maybe `{{if}}`. LOW–MED; cheap.

## 6. Connection profiles — design note
ST bundles API + model + preset + templates + stop into a **named, switchable
Connection Profile** (GUI + `/profile` slash command; explicit update, no
auto-save on switch). We just removed the whole-routing "Saved configs"
(RoutingPresets) per the user. If config-switching returns, ST's model is the
reference: bundle everything, switch in one click, explicit update. Not now — note.

## Prioritized adopt list
- **HIGH:** per-action `sampler_params` (JSON) + backend-aware sampler UI (top_p,
  penalties, top_k/min_p, seed, stop); context **token-count + budget guard**
  (whole-book features); **prompt-preview + token count** in the Lab.
- **MED:** reasoning-effort enum; story-bible→prompt injection (lorebook-style);
  a few macros (`random`/`pick`/`date`/`if`).
- **LOW / skip:** context+instruct templates (we're chat-only), CFG, beam search,
  Author's Note, full STscript. Connection profiles = note (config-switch is gone).

## Not yet decided
Whether samplers live per-ACTION (fits the Lab) or also per-ROLE/default;
tokenizer choice for counting (runner endpoint vs local estimate).

## 7. UI details confirmed from ST screenshots (2026-06-24)
- **Connection Profile = a bundle** of: API · Settings Preset · Use System Prompt
  + name · Instruct Mode · Context Template · Tokenizer · Custom Stopping Strings
  · Start Reply With · Reasoning Template. Each toggle can be omitted from the
  profile (granular). Switchable via dropdown + `/profile`.
- **Advanced Formatting** splits into three editable templates: **Context
  Template** (a "Story String" with **handlebars `{{#if}}` conditionals** around
  description/personality/scenario/persona), **Instruct Template** (per-role
  prefix/suffix sequences), **System Prompt** + **Post-History Instructions** +
  **Custom Stopping Strings** (JSON array) + **Tokenizer** + **Token Padding (64)**
  + **Reasoning** (Auto-Parse / Auto-Expand / Show Hidden / Add to Prompts / Max).
- **User Settings** has a deep flag set (Experimental Macro Engine, Lorebook
  Import Dialog, Request token probabilities, Show `{{char}}`/`{{user}}`/`<tags>`
  in responses, Auto-swipe / Auto-Continue, AutoComplete, STscript flags). Most
  are RP-chat-specific — not for us.

## 8. Source verification + Open WebUI cross-check
**ST source (request builders):**
- `openai.js` (chat completions) sends: `temperature`, `top_p`,
  `frequency_penalty`, `presence_penalty`, `max_tokens`, `seed`, `n`, `stop`, and
  **`reasoning_effort` + `verbosity`** (gated to reasoning providers). Claude caps
  temp at 1.0, Mistral 1.5. → confirms our portable cloud set + that
  `reasoning_effort` is real (validates the reasoning-effort enum rec).
- `textgen-settings.js` core (all local backends): `temperature`, `top_p`,
  `top_k`, `min_p`, `top_a`, `typical_p`, `tfs`, `seed`, `stop`/`stopping_strings`,
  `ban_eos_token`. **Ollama/llama.cpp** add `grammar` (GBNF), `logit_bias`,
  `dry_*`; **llama.cpp** also takes an ordered `samplers` list + `cache_prompt`.
  OOBA/Aphrodite/Kobold expose the long tail (mirostat, dynatemp, beams, sampler
  order). → confirms: cloud ≠ local sampler sets; gate exotics to local providers.

**Open WebUI** (`README.md`) — second reference, ChatGPT-style for Ollama +
OpenAI-compat. Worth borrowing:
- **Model Builder**: a reusable "Model" = base model + **system prompt + params +
  knowledge + tools**. This is a *named, reusable config above the provider* —
  close to our per-action presets but at model scope. Design ref if we ever want
  "saved model configs" (the config-switch the user just removed).
- **`num_ctx`** (context window) + `num_predict` (max tokens) as **per-model
  params** — reinforces §3: surface the provider/model **context size** so the
  token-budget guard knows the cap.
- **Per-model Advanced Params** = the Ollama option set (same names as ST's
  textgen) — no new samplers, but confirms the Ollama mapping.
- **Tools / Python Functions / Pipelines** (tool-calling + middleware) and
  **Knowledge collections + web search** (RAG enrichment). Future/agentic; JW
  already has RAG. LOW for now.

**Net of both references:** our plan holds. Add a per-action `sampler_params`
(JSON) with a backend-aware UI (cloud: top_p/penalties/seed/stop/reasoning_effort;
local: + top_k/min_p/grammar/…); add **context-size awareness + a token-budget
guard** (both tools treat context as a first-class, per-model number); keep the
exotic/local-only samplers behind an "Advanced (local)" disclosure.
