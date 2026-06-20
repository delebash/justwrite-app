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

## GUI design — informed by web UX research (2026)

Best-in-class local+cloud AI apps (Msty, LM Studio, Jan; LLMFit/whichllm for
hardware fit) converge on patterns we should adopt. The unified **"AI" area is
identical in both apps**, four sections:

1. **Providers** — *provider-agnostic single list mixing local-free + cloud-paid*
   (Msty's flagship pattern: "mix local and cloud models in one interface").
   Capability chips (LLM/embed), status dot + Test, inline edit, "+ Add"
   (presets: Anthropic / OpenAI / Ollama / LM Studio / "local llama.cpp" / Custom).
   "local" and "no key — free" badges make the free path obvious.
2. **Local models (the runner)** — *a browsable catalog → one-click "Download &
   Run"* (LM Studio's GUI-first model browser), each model showing a **hardware
   Fit indicator** (LLMFit/whichllm "will it fit" score; our `compute_fit`
   already accounts for KV-cache + MoE, which whichllm validates as the correct
   approach). Reuses the shared `DownloadStrip` (phase·bytes·rate·ETA·cancel).
3. **AI features (feature routing)** — **base = JW's GUI** (the real, visible
   one): a prominent table, static feature catalog, one row per feature with a
   flat Provider + Model picker (Inherit-default), provider list split Local·free
   / Cloud·metered (`SettingsView.vue:75-95,:298-311,:1257`). JV's buried,
   role-centric, server-`aiCatalog`-driven version (`:1551-1581`) is **replaced**
   by it. **On top, add JV's backend strengths:** per-feature editable system &
   user prompt + temperature, savable as **named presets** (LM Studio/Msty: "a
   preset bundles a system prompt + every parameter into one named package" =
   JV's `ProductionConfig`); a **Lab** to tune against the real resolved prompt,
   test, and promote (JV `SpeakerLabView`, generalized); and **optional**
   Quick/Accuracy roles as the casual two-knob default (a row can inherit a role
   instead of naming a provider). So JV comes *up* to JW's routing UX; JW gains
   prompts/Lab/roles.
4. **Usage** — token/cost ledger, per-feature breakdown.

JustVoice's nav additionally hosts the **Voices / TTS** sections alongside this
AI area; JustWrite shows only the AI area. Same components, same layout.

Casual-vs-power split (keeps it easy): a user can (a) add one provider OR
one-click a recommended local model, and everything works on Quick/Accuracy
defaults; power users drop into AI features → Lab to pin models + edit prompts.

## The lift (what moves, reuse-not-copy)

- **JV → `just-llm-runner`:** `engines/llm/*` (registry, 4 cloud adapters,
  dispatch, tiers, usage) + the LLM settings models (`LLMProviderConfig`,
  `FeaturePinConfig`, `ProductionConfig`, `LLMRolesSettings`) + the LLM APIs
  (`llm_providers_api`, `feature_pins_api`, `llm_roles_api`, ai-usage, the
  feature endpoints) + the AI GUI (Settings "AI features", `SpeakerLabView`,
  `ProviderForm`/online providers). JV's `local_managed.py` is **replaced by**
  the shared runner (don't keep both).
- **JW:** drop the client-side feature execution (`services/analysis/*` logic
  moves server-side as registered features with editable prompts), the bulk-PUT
  provider store, and the proxy-only `api/llm.py`; mount the shared routers;
  import the shared GUI. JW **gains** headless AI, editable prompts, rich pins,
  roles, usage parity — for free.
- **Both:** EnginesView (JV) LLM parts + SettingsView (JW) "AI engines" → the
  same `@delebash/llm-ui` views.

## Sequence (per-unit, RULE #5/#7 — one at a time, verify each)

1. **Expand `just-llm-runner` Python** to own the full backend: lift JV's
   `engines/llm/*` + settings models + APIs; refactor `local_managed` → the
   shared runner. JV switches to mounting it; **parity-verify JV is byte-for-byte
   behavior-identical** (pytest + a boot/smoke run).
2. **JW mounts the same routers**; migrate JW's ~24 LLM features to server-side
   registrations on the shared dispatch (prompts moved server-side + editable);
   delete JW's proxy + bulk store. Verify (JW build + server run; features work
   headless).
3. **Build `@delebash/llm-ui` views** (provider form/list, model picker, AI-
   features + prompt-editor/Lab, roles, usage, runner status, download strip,
   quick-setup). JV + JW both replace their per-app AI GUI with these. Verify in
   each app (real run).
4. **JV layers TTS** on top — unchanged native engines/voices/render; the TTS
   model download **reuses** the shared `DownloadStrip`.
5. **Delete** the now-duplicated per-app code (no leftover forks).

## Open decisions (need a steer)

1. **i18n in shared views** — vue-i18n bundled in `@delebash/llm-ui` (JV adopts
   vue-i18n; JW already has it). Confirm this over host-injected strings.
2. **AI-area placement** — JV currently has top-level **Engines** (TTS-centric)
   with an Online-providers tab; JW has **Settings → AI engines**. Proposal for
   sameness: one shared **"AI"/"Models"** area, identical in both; in JV its nav
   sits beside Voices/TTS, in JW it's the AI area. (Same components either way;
   this is just where it mounts.)
3. **Hardware Fit indicator** — adopt a richer **Fit score** (LLMFit/whichllm
   style: speed + context + quality + VRAM headroom) for local models, vs the
   current 3-state ok/tight/no dot. Score is more useful; dot is cheaper.
4. **Scope/sequencing of the JW feature migration** — ~24 LLM features moving server-
   side is the largest chunk; confirm doing it as its own phase after the backend
   + GUI exist (step 2 can land incrementally, feature by feature).

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
