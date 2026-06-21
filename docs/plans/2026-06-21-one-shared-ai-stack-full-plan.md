# One shared AI stack (JW = JV except TTS) — full plan (2026-06-21)

**Same file in both repos.** The actionable consolidation of the AI-convergence,
per the user's directive: *"there should not really be any difference in AI stuff
between the apps besides the TTS tweak."* Cites the principle in each `CLAUDE.md`
(LLM-stack convergence) + `2026-06-20-engines-llmui-cutover-boundary.md`.

## Principle (the contract)

ONE shared AI implementation:
- **`llm_runner`** (Python) — mounted by both servers.
- **`@delebash/llm-ui`** (Vue) — imported by both renderers.

Both apps run it **identically**. The ONLY legitimate differences:
1. **TTS** — JustVoice-only (engines, voices, render/casting; the external-TTS
   provider editor).
2. **Per-app feature catalog** — the *domain* prompts/seed + the domain
   context-gathering (JV: speaker-attribution / smart-assign / preset-suggest /
   show-notes / persona; JW: critique / plot-holes / entity-sweep / …). **Same
   machinery, different prompt set / data.**

Everything else — provider CRUD/detect/classify, the local runner, dispatch,
per-feature config *incl. editable prompts*, model roles, usage, **and the client
views** (provider GUI, prompt editor, usage) — is the **same code**. No per-app
duplication, no shims (RULE #7 / #8).

## Current state — shared vs duplicated (grounded 2026-06-21)

| Piece | In `llm_runner` (shared)? | Reality |
|---|---|---|
| Adapters / registry / tiers / dispatch / usage / schema | ✅ `llm_runner/llm/*` | Good — both apps use it |
| Provider CRUD router | ✅ `provider_api.make_provider_router` + `ProviderStore` | Good — both mount it |
| Storage-free endpoints (classify-tier / ai-usage / ping / models) | ✅ `llm_runner/llm/api.py` | Good |
| **Feature-prompt store + `feature_prompts` table + `render()`** | ❌ **DUPLICATED** | Built separately this session in JW (`llm/prompt_store.py`, `llm/features.py`, table) AND JV (`engines/llm/prompt_store.py`, table) — near-identical copies |
| **Prompt-editor endpoint `/v1/ai/prompts`** | ❌ **DUPLICATED** | JW `api/ai_prompts.py` + JV `api/ai_prompts_api.py` — near-identical |
| **Feature-run endpoint** | ❌ **DIVERGENT** | JW generic `/v1/ai/run` + `/v1/ai/stream`; JV per-domain endpoints (`extraction_api`, `smart_assign_api`, …) |
| **Prompt catalog (seed DATA)** | ✅ per-app (legit) | JW `seed_feature_prompts.py`, JV `database/seed.py` — legitimately per-app **data** |
| **Prompt-editor GUI** | ❌ **JW-local** | JW `views/AiPromptsView.vue` — should be a shared `@delebash/llm-ui` view |
| **Provider GUI** | ❌ not built | `@delebash/llm-ui` = contract + `ProviderBackend` only; JW `SettingsProviderForm` + JV `ProviderForm` are app-local |

⇒ the **machinery** I added this session (prompt store + editor endpoint + table +
render) is duplicated → lift into `llm_runner` behind the established host-store
pattern. The **client AI views** → lift into `@delebash/llm-ui`. Only the
**catalog (data)** + **TTS** stay app-local.

## Target

**Server — `llm_runner.llm`:**
- `prompts.py` — `FeaturePrompt` dataclass + `PromptStore` Protocol
  (get/list/upsert/reset) + `render()`. ONE implementation (lifted from the two
  per-app copies).
- `prompt_api.py` — `make_prompt_router(get_store, defaults)` → `/v1/ai/prompts`
  editor (lifted from the two `ai_prompts` copies).
- `feature_api.py` — `make_feature_router(get_store, get_config)` → generic
  `/v1/ai/run` + `/v1/ai/stream` (lifted from JW `ai_features.py`).
- Each app provides ONLY: a `PromptStore` impl over its storage (JW
  `feature_prompts` table / JV its store) + its catalog seed + `app.py` mounts
  the shared routers. **Delete** the per-app prompt_store / ai_prompts / render /
  feature-run duplicates.

**Client — `@delebash/llm-ui`:** `LlmProviderForm`, `ModelPicker`,
`ProviderSelect`, `UsageView`, `RunnerStatus`, **and the prompt-editor view**
(lift JW `AiPromptsView`). Both renderers import them (already vite-aliased). Each
app provides only its `ProviderBackend` adapter (+ JV's TTS editor).

**Menu / Settings / Lab (consistency):** ONE AI surface, **same components, same
placement in both apps**. *Proposal* (not firmly recorded before — confirm):
**Settings → "AI"** = provider config + model roles + usage, with a **"Prompts"
sub-tab** = the editor (JV adds a TTS section under the same Settings → AI). The
JW `/ai-prompts` sidebar item I added this session is a stopgap that folds into
this.

**App-local only:** TTS (JV) + the feature catalog (domain prompts/seed +
context-gathering) per app.

## Sequence

0. ✅ **Bug fix** — bump `llm-runner` git pin `95e001e → c9b3615` in both servers
   (the old pin predated `llm_runner/llm/`; that was the `ModuleNotFoundError`).
1. **Lift prompt machinery into `llm_runner`** (`prompts.py` + `make_prompt_router`
   [+ `make_feature_router`]); JW + JV import + provide store-adapters + catalogs;
   delete the duplicates. pytest both.
2. **Resolve the feature-invocation surface** (open decision #2 below).
3. **Build `@delebash/llm-ui` views** (provider GUI + prompt editor + usage); both
   apps adopt; delete app-local AI UI (JW `SettingsProviderForm` + `AiPromptsView`;
   JV `ProviderForm`). Screenshot-iterate (`scripts/shot.mjs`).
4. **Menu reorg** — mount the shared AI surface identically in both (open
   decision #1).
5. **JV TTS** on top (the one app-local addition).
6. **Delete dead per-app code**; bump pins; verify (pytest + headless smoke +
   screenshots) both apps.

## Open decisions (need your call)

1. **Menu placement:** Settings → "AI" section with a "Prompts" sub-tab (one
   place for everything AI), **vs** a dedicated top-level "AI Lab" route. Same in
   both apps either way. *(No firm prior decision was recorded — this is the one
   to confirm.)*
2. **Feature-invocation surface:** make BOTH apps use the generic `/v1/ai/run`
   (maximum convergence — JV's pipelines become feature "assemblies" behind it),
   **vs** keep JV's domain endpoints (which already call the shared dispatch +
   prompt store) and document the multi-step-pipeline justification.
