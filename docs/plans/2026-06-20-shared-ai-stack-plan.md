# Shared AI stack — JustVoice + JustWrite (+ future apps) — full plan

**Authored 2026-06-20 after a RULE #7 deep dive** (read JV, JW, and
`just-llm-runner` in full + web UX research). This is the authoritative plan; it
supersedes the per-app-adapter framing in `2026-06-16-thread3-phase2-llm-ui.md`
and folds in `2026-06-20-engines-llmui-cutover-boundary.md` (kept for its cited
per-surface tables). **Same file in both repos.**

## Principle (RULE #7)

Same stack → same code → **reuse, don't copy-paste.** The entire AI stack is
**one shared implementation — same Python, same client views** — consumed by
every app. Only genuinely-different slices are app-local. This is general app
development, not an LLM special case: future apps on this stack start from these
shared packages, never a fork.

The **only** legitimate per-app differences (everything else is shared):
1. **TTS** — JustVoice-only (engines, voices, render/casting).
2. **Feature catalog** — each app registers its own features + default prompts
   onto the *same* dispatch (JV: speaker-attribution / smart-assign / preset-
   suggest / persona-rewrite; JW: critique / plot-holes / entity-sweep / ~24
   total). Same machinery, different prompt set + which provider-tier each
   defaults to.

### Feature catalog vs feature routing (how shared routing works with different catalogs)

These are two layers — the per-app difference is *only* the first:

- **Feature catalog = DATA (per-app).** The list of features an app has; each
  entry = `key` + `label` + `description` + default role/tier + **default
  prompt(s)**. Domain-specific. JV registers its voice features, JW its prose
  features, a future app its own.
- **Feature routing = CODE/GUI (shared).** The table that maps each catalog
  entry → provider+model (or Inherit-default/role), persists the pin, plus the
  dispatch that resolves it at call time and the Lab that edits prompts. ONE
  shared implementation that renders *whatever catalog it's handed* — it doesn't
  know voice from prose.

Flow: each app's server **registers its catalog** with the shared dispatch
(feature registry) → shared endpoint (`/v1/llm/features`, JV today: the
`/v1/feature-pins` catalog) returns *that app's* catalog → the shared
`<FeatureRouting>` component renders one row per entry with a provider/model
picker → the shared dispatch resolves `production-config > pin > role >
tier-default` and runs the feature's prompt. So **"different feature routing per
app" = same routing code, different rows.** Adding/removing a feature = a catalog
registration (key + default prompt + default role), **zero routing-code change**.
JV is already catalog-driven from the server (`SettingsView.vue:576,:662`); JW's
static `AI_FEATURES` (`:75-95`) moves server-side onto the same registry.

## Current state — grounded (read 2026-06-20, file:line)

JV's server-side AI stack is a **superset**; JW has a thin client-side subset;
the local runner is already shared. Convergence = lift JV's stack into the
shared package, bring JW up onto it.

| Capability | JustVoice | JustWrite | Shared today? |
|---|---|---|---|
| Headless server | `justvoice-server serve` | `justwrite-server serve` (`cli.py`; `app.py:70` *"same router JustVoice mounts — full symmetry"*) | ✅ both |
| Local llama.cpp runner (download/load/spawn) | mounts `llm_runner.router` | mounts `llm_runner_router` | ✅ `just-llm-runner` |
| Provider adapters (cloud + local) | `engines/llm/{anthropic,gemini,openai_compat,ollama,local_managed}.py` (server, ~1.6k ln) | `api/llm.py` transparent **proxy** (server) | ✗ two impls |
| **Feature execution** | **server** `engines/llm/dispatch.py` + `/v1/llm/*` endpoints | **client** `services/analysis/*` (17 modules; 16 LLM + 1 local `styleMetrics`) + `services/` + `rag/` = **~24 LLM features** → **headless JW gets no AI** | ✗ |
| Per-feature provider+model routing GUI | EXISTS but **buried + sparse**: Settings→"AI features" sub-tab, table driven by **server-fetched `aiCatalog`** + 2 extras, role-centric Inherit·Quick/Accuracy (`SettingsView.vue:470,:576-580,:1551-1581`) → often shows ~nothing | **the real one**: static **20-feature** `AI_FEATURES` table, flat provider+model, prominent (`SettingsView.vue:75-95,:1257`) | ✗ — **JW's GUI is the base to carry forward**; JV comes up to it |
| Tier→reasoning auto · usage-by-feature · QuickSetup | tiers.py · `/v1/ai-usage` · QuickSetup | `aiStream.js:88,129` · `ai.js:70` · `applyQuickSetupPreset` (`ai.js:270`) | ✅ both |
| Local-free / cloud-paid GUI split | EnginesView online tab | "Local·free"/"Cloud·metered" (`SettingsView.vue:298-311`) | ✅ both |
| Per-feature config DELTAS (JW lacks) | `ProductionConfig` editable system+user prompt + temperature (`models.py:329-341`) · Quick/Accuracy roles (`models.py:320`) · per-**feature** tier | prompts hardcoded (`critique.js:27,93`), temp hardcoded (`:57,126`), tier per-**model** (`ai.js:135`), no roles | ✗ — add to shared |
| Model roles (Quick/Accuracy) | `LLMRolesSettings` (`models.py:320`) + `/v1/llm-roles/recommendations` | — | ✗ |
| **Editable system/user prompts** | server-side, preset + custom, tuned in **Labs** then *promoted* (`SpeakerLabView.vue`; `extraction_api.py:156-228,323`) | hardcoded inline in renderer modules | ✗ |
| Provider CRUD / detect / classify-tier | server REST `/v1/llm-providers/*` + `/detect-local` + `/classify-tier` | bulk GET/PUT `/v1/llm-providers` (`providerBackend.js`) + client detect/tier | ✗ shape + side |
| Usage ledger | `/v1/ai-usage` (`engines/llm/usage.py`) | `/v1/llm-usage` (server DB) | ✗ name |
| Provider/AI client GUI | `EnginesView` (online tab) + `ProviderForm` + Settings "AI features" tab + `SpeakerLabView` | `SettingsView` "AI engines" + `SettingsProviderForm` + `ProviderSelect` + `ModelPicker` | ✗ two impls |
| Local-model VRAM fit | `compute_fit` (GGUF header → `-ngl`/`--n-cpu-moe`, `runner.py:89`) + TTS `recommend_for_vram` | — (no local models surfaced) | runner has it |

## Target architecture

**`just-llm-runner` (Python) — the whole AI backend, mounted by every app:**
- hardware detect + llama.cpp binary + GGUF catalog + VRAM-fit + runner
  lifecycle (download/load/spawn/status/stop) — *already there*.
- **provider registry + adapters** (cloud: anthropic/gemini/openai-compat/
  ollama; local: the runner) — lift from JV `engines/llm/`.
- **provider config + CRUD + storage** (`LLMProviderConfig`).
- **feature dispatch** (feature → pin/role → provider → call → parse) + **tiers/
  roles** — lift JV `dispatch.py`/`tiers.py`/`LLMRolesSettings`.
- **per-feature config + prompts** (`FeaturePinConfig` + `ProductionConfig`,
  preset + custom, the "Lab → promote" flow) — lift.
- **usage** ledger — lift `usage.py`; one endpoint name.

**`@delebash/llm-ui` (client views) — the whole AI GUI, imported by every app:**
provider form, provider list, model picker, per-feature config + **prompt
editor / Lab**, model-roles, usage view, runner status, **download strip**,
quick-setup. Styled via each app's `tokens.css`; one i18n approach (vue-i18n —
JV adopts it).

**Per-app:** JustVoice adds the **TTS** side (engines/voices/render; TTS model
download **reuses** the shared `DownloadStrip`). Each app registers its **feature
catalog** (feature keys + default prompts + default tier) onto the shared
dispatch. Nothing else app-local.

## GUI design — informed by web UX research + mock rev (mocks: `preview/shared-ai-models-mock.html`, `preview/shared-ai-lab-mock.html`)

Best-in-class local+cloud apps (Msty's provider-agnostic mixing + split-chat
compare; LM Studio's model browser + settings panel; LLMFit/whichllm fit). The
unified **"AI / Models" area is a top-level entry, identical in both apps** (in
JV it sits beside Voices/TTS). Three sub-tabs:

1. **Providers & models** — one list mixing **Local·free / Cloud·metered**, and
   **model management lives PER PROVIDER** (the v1 mistake was a detached "Local
   models" tab — model mgmt is type-specific):
   - **Local engine** (renamed from "runner") → the *only* Download&Run path: a
     GGUF catalog with a **hardware Fit score** (0–100, KV-cache/MoE-aware). Model
     list/status/load via **llama.cpp router mode** (`GET /models` +
     `POST /models/load|unload`, `-hf` download) — see Decision 11; our manifest
     overlays curated picks + Fit. Reuses the shared download strip.
   - **Ollama / LM Studio** → list installed (`/api/tags`) + a pull field.
   - **Cloud** → fetch the model list (`/models`) + pick defaults; **no
     download**. (Anthropic = curated list, no `/models`.)
   - **Add/Edit provider** = one inline form that **replaces the read row** (no
     duplicate Test), Combobox model picker, presets, no-ID/no-tier, key hidden
     for local; the Local engine needs no connection form (Decision 14). GPU
     info is a **top strip**.
2. **Features** — JW's flat routing table as the base, each row inherit-a-role or
   override to a specific **provider ▸ model**. Roles (Quick/Accuracy) are
   **optional** and **grounded** (each is itself a provider▸model pick). Expand a
   row to edit inline: **real settings** — temperature · max tokens · reasoning
   (adapter-plumbed today) + **Advanced sampling** (top-p/top-k/repeat/ctx/stop/
   seed — *requires plumbing these through the shared adapter*, currently
   only temp/max_tokens/think exist) — plus system & user prompt, saved as a
   named production config. "Open in Lab" for compare.
3. **Usage** — token/cost ledger, per feature + provider.

### The Lab — one per action (LLM *and* TTS), tune → compare → Apply to route
User direction (2026-06-20): *"a Lab for each type of LLM action … anything that
takes a different prompt or settings … adjust and then apply a setting for the
routes / default settings."* So every action (speaker attribution, entity/
object/location extraction, rewrite, critique, …) has its own Lab:
- **Tune** the action's prompt + the settings sent to the model (its sample
  input is action-specific — a chapter, a selection, …).
- **Compare candidates side-by-side** (Msty split-chat): same prompt+settings,
  different model — free-local vs metered-cloud — with per-column output, tokens,
  time, cost; pick the winner.
- **Apply to route** → writes that action's **production config** (model +
  settings + prompts) = the route's default; shows a `CONFIG` tag on Features;
  revert anytime.
- **Generalizes to TTS actions** (JV): the same Lab framework, but the settings
  panel swaps to the engine's knobs (e.g. Chatterbox exaggeration / cfg-weight /
  speed + optional style prompt) and compare = audio variants. The Lab/compare/
  Apply code is shared; only each action's sample input + output rendering (and,
  for TTS, the settings *schema*) differ.

**Casual vs power (keeps it easy):** casual users add one provider OR one-click a
recommended local model, and everything runs on Quick/Accuracy defaults — never
touching a prompt. Power users open an action's Lab to compare models, tune the
prompt + settings, and Apply.

## The lift — START from what exists, don't rebuild

**⛔ Hard-won lesson (2026-06-20):** we reinvented the provider/model UI on JV
from scratch and iterated (painfully, over many mock rounds) right back to JW's
existing pattern — the combobox model picker, provider+model feature pins, the
inline form. **Don't repeat it: extract the client from JW's working components;
extract the server from JV's superset.** Read + lift first; design only the gaps.

- **Server → `just-llm-runner` (Python), from JV:** `engines/llm/*` (registry, 4
  cloud adapters, dispatch, tiers, usage) + the LLM settings models
  (`LLMProviderConfig`, `FeaturePinConfig`, `ProductionConfig`,
  `LLMRolesSettings`) + the LLM APIs (`llm_providers_api`, `feature_pins_api`,
  `llm_roles_api`, ai-usage, feature endpoints). `local_managed.py` is
  **replaced by** the shared runner.
- **Client → `@delebash/llm-ui` (Vue), from JW (the proven base):** lift JW's
  `SettingsProviderForm` → provider form, `ProviderSelect`, `ModelPicker`, and the
  **provider+model feature-routing** + `ai`-store patterns. Add only what JW
  lacks, from JV: the **Lab** (`SpeakerLabView` → per-action prompt/settings
  tuner + compare) and **Quick/Accuracy roles**. (The mocks *confirmed* the
  provider/model surface lands on JW's pattern — lift it, don't redesign.)
- **JW server gap:** move client-side feature execution (`services/analysis/*`)
  server-side as registered features w/ editable prompts; drop the bulk-PUT
  provider store + proxy-only `api/llm.py`; mount the shared routers. JW **gains**
  headless AI, editable prompts, rich pins, roles, usage parity.
- **Both adopt:** EnginesView (JV) LLM parts + SettingsView (JW) "AI engines" →
  the same `@delebash/llm-ui` views.

## Sequence (per-unit, RULE #5/#7 — one at a time, verify each)

1. **Expand `just-llm-runner` Python** to own the full backend: lift JV's
   `engines/llm/*` + settings models + APIs; refactor `local_managed` → the
   shared runner. JV switches to mounting it; **parity-verify JV is byte-for-byte
   behavior-identical** (pytest + a boot/smoke run).
2. **JW mounts the same routers**; migrate JW's ~24 LLM features to server-side
   registrations on the shared dispatch (prompts moved server-side + editable);
   delete JW's proxy + bulk store. Verify (JW build + server run; features work
   headless).
3. **Build `@delebash/llm-ui` views by EXTRACTING JW's existing components**
   (`SettingsProviderForm`, `ProviderSelect`, `ModelPicker`, provider+model
   routing, `ai`-store patterns) — NOT from scratch — then add JV's Lab + roles.
   JV + JW both replace their per-app AI GUI with these. Verify in each app.
4. **JV layers TTS** on top — unchanged native engines/voices/render; the TTS
   model download **reuses** the shared `DownloadStrip`.
5. **Delete** the now-duplicated per-app code (no leftover forks).

## Decisions — RESOLVED (user, 2026-06-20)

1. **i18n** — ✅ vue-i18n in both (standard; JV adopts it). Not a per-app choice.
2. **AI-area placement** — ✅ one shared **top-level "Models" area**, identical in
   both; in JV it sits beside Voices/TTS.
3. **Hardware Fit** — ✅ adopt the **richer Fit score** (0–100, KV-cache/MoE-aware).
4. **JW feature migration** — ⏸️ **held** as its own later phase (after backend +
   GUI land); migrate incrementally, feature by feature.
5. **Model management** — ✅ **per-provider, and ALL local providers identical** —
   Ollama, LM Studio, and the bundled **Local engine** share the same Models
   section (list · status · Fit · load/download) inside Edit; the built-in is just
   pre-added (no special "catalog" — corrects the earlier framing). Cloud =
   fetch + pick (no download). No detached "Local models" tab.
6. **Roles** — ✅ kept, **optional + grounded** (each role = a provider▸model pick).
7. **Prompt + settings editing** — ✅ inline per-feature **plus** a **per-action
   Lab** (tune → side-by-side compare → Apply to route). Settings = the full set
   (requires plumbing top-p/top-k/repeat/ctx/stop through the shared adapter).
8. **Lab scope** — ✅ one Lab **per action**, LLM *and* TTS (TTS settings = engine
   knobs); shared framework, per-action sample/output.
9. **Embeddings/RAG** — ✅ embeddings = shared provider capability; RAG (index +
   chat) = JW catalog feature (JV may add later).
10. **Rename** — ✅ the built-in "runner" is user-facing **"Local engine"** (the
    technical package stays `just-llm-runner`; API stays `/v1/llm-runner/*`).
11. **Local-engine model management — lean on llama.cpp router mode** (verified
    against latest llama.cpp docs): list = `GET /models` (status
    unloaded/loading/loaded/sleeping/downloading/failed); load/unload =
    `POST /models/load|unload`; download = `-hf <user>/<model>:<tag>` (auto on
    first request); multi-model LRU = `--models-max` (default 4); cache via
    `LLAMA_CACHE`/`--models-dir`; `llama-server --cache-list` also lists cache.
    ⇒ keep our manifest only for the **curated recommendations + Fit score +
    pinned build + flag presets**; delete our custom download/cache-scan +
    single-model load. (`/v1/models` single-mode returns only the loaded model —
    not a catalog.)
12. **Settings model** — ✅ **all tunables live in the Lab, per provider, with
    predefined defaults + Reset-or-tune.** LLM = llama.cpp's full set grouped as
    llama.cpp groups it (Sampling: temp/top-k/top-p/min-p/dyn-temp/XTC/typical-p/
    sampler-order · Penalties: repeat/presence/frequency + DRY · Reasoning:
    enable-think/exclude-reasoning · max-tokens/seed) + a **Custom-JSON
    pass-through** escape hatch; cloud providers show only the subset they
    support. Requires plumbing the extra params through the shared adapter
    (today only temp/max_tokens/think exist).
13. **TTS settings are two layers + engine-paradigm-branched** (Alexandria ref):
    **per-voice** adapts to the engine — Chatterbox = numeric knobs
    (exaggeration/cfg/temp/speed), Qwen3-TTS = a **style instruct** text (no
    knobs), Kokoro = preset voice + speed — read from the engine capability
    surface; **render/batch** (device, parallel workers, compile codec,
    sub-batching min/length-ratio/max-items [0=auto-VRAM], batch seed) +
    **merge timing** (speaker-change / same-speaker pause) are job-level, distinct
    from per-voice. All in the TTS Lab, defaults + reset. JV-only.
14. **Provider add/edit** — ✅ one inline form that **replaces the read row** (one
    Test, in the form — no duplicate; rows are a normal **Edit + Delete** grid,
    built-in = Edit only); **Where it runs** Local/Online selector (drives the
    group + whether a key shows); **API format** OpenAI-compatible / Ollama-native
    (restored — native only for an Ollama daemon, see Decision 15); one Combobox
    model picker; provider **presets**; **no ID** (auto-slug); **no tier** (auto;
    tune in Lab). LOCAL providers' form also carries the shared Models section
    (Decision 5). GPU info is a top strip.
15. **Reasoning (think) control = a per-provider-mapped setting** (verified): only
    **Ollama** needs its **native `/api/chat`** to toggle reasoning — its
    OpenAI-compatible `/v1` can't (that's the sole reason for the "Ollama native"
    API format). **llama.cpp + cloud control reasoning via request-body params**
    on `/v1/chat/completions`: llama.cpp `chat_template_kwargs.enable_thinking` /
    `reasoning_format` / `reasoning_control`; OpenAI `reasoning_effort`; Anthropic
    `thinking`. ⇒ the user sets one **"Enable thinking"** control (Lab/feature
    settings) and the **shared adapter maps it** to the right param/endpoint per
    provider. Sources: ggml-org/llama.cpp server README; ollama/ollama API docs.

16. **Prompt customization (Alexandria-informed)** — each action's **system +
    user-prompt template** is editable in its Lab, with the **template variables
    listed** (`{{chapter_text}}`, `{{cast}}`, `{{context}}`, `{{chunk}}`,
    `{{speaker}}`, …), a **Reset to defaults**, and named production-config
    presets. Some actions are **multi-stage** — Alexandria ships separate
    Generation / Review (QC) / Persona prompt sets; an action's Lab can hold a
    primary prompt **+ an optional review/refine pass** (mirrors JV's "two-pass"
    configs). Reasoning can also be disabled **portably via banned tokens** (ban
    `<think>`) when a provider lacks a reasoning param (Decision 15). Long-text
    actions expose a **chunk size** processing setting. Ref:
    Finrandojin/alexandria-audiobook.

## Web UX sources
- Msty / LM Studio / Jan / Ollama comparison (provider-agnostic mixing, GUI-first
  model browser, presets): modelpiper.com/blog/local-ai-platforms-compared-mac ·
  dev.to "Running Local LLMs in 2026" · kunalganglani.com/blog/lm-studio-vs-jan
- Presets bundle system-prompt+params; per-feature model+prompt: cognativ LM
  Studio guide · dev.to contexttree "visual LLM canvas" · tetrate.io system-vs-user prompts
- Hardware fit ("will it fit", KV-cache/MoE-aware VRAM est): xda-developers LLMFit ·
  github.com/Andyyyy64/whichllm

## Appendix — JW feature catalog (the step-2 migration set, ~24 LLM features)

Each becomes a server-side feature registration (key + default prompt + default
tier) on the shared dispatch. Grounded from `src/renderer/src/services/` (2026-06-20).

- **Per-chapter analysis:** `critique`, `plotHoleScan`, `characterAudit`,
  `entityExtraction`, `threadExtraction`, `readerKnowledge`, `relationshipArc`,
  `voiceDrift`, `aiTellScanner`.
- **Whole-book sweeps:** `entitySweep` (orchestrates entityExtraction),
  `foreshadowingScan`, `tensionSweep`, `reverseOutline`, `beatSheet`,
  `marketingPack`, `multiReaderCritique`.
- **Writing assistance:** `writerAI` (selection-level), `sensoryResearch`,
  `voiceFingerprint`.
- **Workflow/session:** `resumeBriefing`, `sessionRecap`, `stuckDiagnostic`.
- **RAG:** `rag/chat`, `rag/characterChat`, `rag/indexer` (embeddings).
- **NOT LLM (stays local, excluded):** `styleMetrics` (deterministic prose metrics).

JV's feature catalog (for symmetry, already server-side): compose, refine,
persona_rewrite, voice_gender, speaker_attribution, smart_assign, show_notes,
render_preset_suggest (`dispatch.py` `DEFAULT_FEATURE_ROLES`).
