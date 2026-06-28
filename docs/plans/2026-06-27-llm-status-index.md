> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# LLM-Area Status Index — "Where We Left Off" (code-verified 2026-06-27)

**How this was built (so it's trustworthy):** 10 agents each read the **actual code** for one
LLM area and marked every piece **✅ done · 🟡 partial · ⚠️ STUB · ❌ missing** with file:line —
no docs, no memory. 2 independent confirmers re-read the code; **both returned "trustworthy,"**
catching only 4 file:line slips (state correct) + 1 dead-code note, folded in below. 178 items.

**Scope:** LLM area only. **JustVoice is out of current scope** (its rows are kept under
"JustVoice — LATER" because the audit found JV is *broken* against the shared schema — flagged,
not current work). Companion deep-dive: `2026-06-27-switch-param-lab.md` (the lab).

**Rule going forward:** this doc is the live status — updated as each piece lands, never a
"done" without the file:line that proves it isn't a stub.

---

## STILL TO BUILD (LLM) — the non-done items only

### Verifiable in this container now (no GPU / no live model)

**The Lab + Switches §6.6 rebuild** (the focus area; detail → `2026-06-27-switch-param-lab.md`):
- ❌ `<ConfigColumn>` reusable component · ❌ Compare view (N-column + collapse-nav + Run-all) ·
  ❌ switch-string field + parse/format · ❌ tokens/sec readout · ❌ `JobPreset` (table+store+router+promote)
  · ❌ `job_preset_switches`/`feature_preset_switches` tables · ❌ per-job/feature switch EDITORS
- ❌ Rip switch editing OUT of Providers (§6.6) — still in `LuModelCatalog.vue:280-288` + `LuSwitchPresets.vue`
- 🟡 PARTIAL (corrected 2026-06-27 by the status panel — the old "ZERO readers" was stale): per-hardware
  (`HardwareSwitch`) **HAS a live reader** (`switch_resolve.py:62` → `install.py:106` → `lifecycle.py:209`)
  — it needs a WRITER/editor, not a reader. per-job (`JobRouteSwitch`) has a resolver
  (`switch_resolve.py:86`) + write API (`/v1/ai/job-switches`) — only the load-path caller is unwired
  (GPU-gated residency). per-feature (`PinSwitch` `db.py:230`) is the only **truly zero-reader** table.
- ✅ FIXED (panel): `extra_flags` from stored switch rows is routed, not dropped (`lifecycle.py:82-104`
  `_switches_to_overrides` → `process.py:178-179`; commit `703d379`).

**Per-action params** (#22/#18 capability outruns its wiring):
- ❌ `FeaturePreset` doesn't capture `json_mode`/`top_p`/`max_tokens` (`feature_presets_api.py:28-42`) — preset round-trip gap
- ❌ #18 as json-SCHEMA/grammar (only weak `json_object`) · ❌ top_k/min_p/typical · ❌ penalties/dry/xtc
  · ❌ reasoning-budget N (only binary `think`) · ❌ sampler order (low) · ❌ no host action seeds non-default json/top_p
- ⚠️ STUB: Ollama (`ollama.py:91-92`) + Gemini (`gemini.py:115-116`) drop `top_p`+`response_format` (wrong nesting);
  🟡 Anthropic ignores `json_mode`

**Providers / Recs / cleanup:**
- ✅ FIXED: per-provider-row **"Test"** now POSTs (`AiModelsArea.vue:112`) to match POST `api.py:56` (was a GET → 405)
- 🟡 `detect-local` (`provider_api.py:208-234`) + `classify-tier` (`api.py:42-53`) — real backends, wired in **JV** (`QuickSetup.vue:301`, `RecommendCard.vue:40`, `SpeakerLabView.vue:116`) but NOT in JW's shared kit UI. A JW-side FEATURE gap (auto-discover a running local provider; auto-suggest a tier on Add-model), not a bug — needs a UX placement decision, not a mechanical fix.
- ✅ recommendations + `ModelCatalogStore` backend tests — added (`test_recommendations_catalog.py`, 10 cases: seed/order, upsert new+update, built_in flip, delete, reset-keeps-user, `set_type` preserves built_in) · ✅ `RecommendationsEditor` native `confirm()` → `confirmDialog` (dialog-ban honored)
- ✅ FIXED: `LuModelPicker` dead `showRoles` prop removed (+ the 2 inert `:show-roles="false"` caller attrs in `RoutingByJob.vue`)
- ✅ FIXED: FeatureWorkbench **token stat** — JW readers aligned to kit camelCase (`aiFeature.js:139`, `aiTasks.js:145-146`); + decode **tok/s** readout
- 🟢 NOT dead — `ProductionConfig` was MISCHARACTERIZED here. It's a LIVE, tested shared precedence layer (step 1):
  `test_llm_dispatch.py:69 test_production_config_wins` asserts it beats a feature pin; exported in `__init__.py`.
  JustVoice populates the shared `LLMConfig` with it (`engines/llm/config.py:52`) and reads it live for
  speaker_attribution — model+prompts+tier+temperature (`extraction_api.py:147-157`). What's true is narrower:
  JW's `config_builder.py:33-39` doesn't populate it YET, because JW's promote uses the pin+prompt path and the
  richer per-feature editable-prompt/temperature `ProductionConfig` is a PLANNED convergence delta to bring to JW
  (`shared-ai-stack-plan.md:65` — "✗ — add to shared"). **Do NOT remove it** — that breaks JV + the shared test.

**Shared task queue (#23):** by design JW-local; only the `runStream` hook is shared. Moving the queue into the kit = not done.

### Needs your GPU / a live model to verify
- ❌ **#27 router mode** — `RunnerService` is single-process (`lifecycle.py:102-218`); `process.py:250` hardcodes `-m`;
  no `--models-preset`/`--models-max`. Design around known router OOM/TOCTOU/metrics-autoload failures.
- ❌ **#29 residency/VRAM planner** — only a forward-ref hook (`switch_resolve.py:15-18`); no co-reside/LRU/idle-TTL/dedup;
  adopt Ollama queue-not-OOM + embeddings-stay-resident rules; cross-kind LLM⟷TTS coordinator.
- ⚠️ #27/#29 runtime apply of per-job/feature switch overrides (model-level resolve built+tested; the reload trigger is a hook)
- ❌ Compare scheduler (cloud-parallel · co-reside · switch-serial) — depends on router mode
- 🟡 #20 per-model tuning with tok/s + VRAM readout (foundation in `fit.py`, single-model only)

### Research / content
- #28 measured per-tier benchmarks + the real 8GB-exact config · #25 curate recs "why" content · gguf-parser (additive) ·
  extend `hardware.py` beyond NVIDIA · study GPUStack **v0.x** (not v2)

---

## Per-area detail (✅ done · 🟡 partial · ⚠️ STUB · ❌ missing)

### Providers — connect + model management
✅ provider list/add/edit/delete (`AiModelsArea.vue` + `provider_api.py` + shared `stores.py:51-95`) · ✅ form Fetch-models +
Test-connection (`ProviderForm.vue:78-114`) · ✅ built-in llama.cpp seeded + locked-fields · ✅ catalog list/Fit/load-unload +
per-model switches manager (`LuModelCatalog.vue`; `model_catalog_api.py`) · ✅ switch-presets editor (`LuSwitchPresets.vue`) ·
✅ LuModelPicker/LuCombobox · ✅ QuickSetup wizard · ✅ hardware strip · ✅ usage ledger · ✅ `install_llm` mounts the stack
(`justwrite_server/app.py:149-163`). ⚠️ STUB per-row Test (GET/POST). 🟡 detect-local + classify-tier have no UI caller.

### Routing — by job + by feature + dispatch (job replaces role)
✅ jobs CRUD (`jobs_api.py:78-124`) · ✅ feature→job map · ✅ routing GET/PUT (`routing_api.py`) · ✅ routing-presets API
(no UI consumer) · ✅ dispatch job-cascade (`dispatch.py`, `test_llm_dispatch.py` 23 passed) · ✅ job-native LLMConfig +
`config_builder` · ✅ shared JobStore/FeatureJobStore + seed · ✅ `RoutingByJob.vue` + `FeatureWorkbench.vue` + `LuJobSelect` +
`useRouting` · ✅ JW end-to-end (`test_routing.py` 10 passed). ✅ dead `LuModelPicker.showRoles` removed.

### Switches — tables + resolver + /load + editors + §6.6
✅ base/type-preset tables + seed · ✅ `model_catalog.type` · ✅ layered resolver (`switch_resolve.py`, `test_switch_resolve.py`
5 passed) · ✅ switch-presets + per-model switch routers · ✅ `LuSwitchPresets`/per-model sub-editor (both §6.6-slated to delete)
· ✅ Overrides → `/v1/llm-runner/load` (#19). 🟡 switch tables PARTIAL (HardwareSwitch read; JobRouteSwitch resolver+write done, load-apply pending; only PinSwitch zero-reader); ✅ `extra_flags` fixed
from stored rows dropped. ❌ MISSING: §6.6 rip-out · switch-string field · ConfigColumn · Compare · tok/s · JobPreset (+ its
switch tables) · per-job/feature editors · runtime apply.

### The Lab — switch/param + job Compare
✅ per-action "one column" editor (`FeatureWorkbench.vue:459-530`) · ✅ FeaturePreset CRUD + `/{id}/use` promote — the JobPreset
precedent (`feature_presets_api.py`, shared store `stores.py:219`, `install.py:67`, table `db.py:291`) · ✅ switch tables schema ·
✅ model-level resolver · ✅ Overrides path (#19). ❌ MISSING: ConfigColumn · Compare view · switch-string field · tok/s ·
JobPreset (all layers) · per-job/feature editors · §6.6 rip-out. 🟡 task-queue via host hook (#23). ✅ extra_flags fixed. → **master plan: `just-llm-runner/docs/plans/2026-06-27-model-catalog-build-plan.md`** (panel-verified 2026-06-27).

### QuickSetup (#11) — REAL, not a stub
✅ 4-step modal wizard (`QuickSetup.vue:1-403`) · ✅ mounted/reachable · ✅ Fit re-score for an overridden card · ✅ models/hardware/
load+status endpoints · ✅ jobs + recommendations prefill + heuristic fallback · ✅ boot seed · 🟡 embedding display-only (by design) ·
✅ header comment is STALE but code is done.

### Per-action params (#22 top_p / #18 json_mode)
✅ top_p + json_mode: schema/model/DB column + round-trip + seed-merge + reset + dispatch `_plane2_extra` + request override +
openai-compat adapter + FeatureWorkbench fields + runtime honor + unit tests (`test_plane2_params.py`). 🟡 Anthropic ignores json_mode.
⚠️ STUB Ollama+Gemini drop both. ❌ MISSING: FeaturePreset capture of json/top_p/max · #18-as-schema/grammar · top_k/min_p/typical ·
penalties/dry/xtc · reasoning-budget · sampler-order · no action seeds non-default.

### Task queue (#23)
✅ JW-local `aiTasks` store + `AiTaskStrip`/`AiStatusPanel`/`AiStatusButton` (18+ sites) · ✅ kit `runStream` hook + JW wrapper +
`runAiFeatureStream` SSE + `/v1/ai/stream`. ⚠️ STUB token-usage shape (inline stat 0). ❌ queue-into-the-kit (by design JW-local).

### Streaming ports
✅ `/v1/ai/stream` + `dispatch.stream_chat` + adapter stream impls · ✅ writerAI + rag/chat + characterChat ports · ✅ non-analysis
consumers on `/v1/ai/run` · ✅ embeddings on `/v1/ai/embeddings` · ✅ **old `/v1/llm` gateway DELETED** · ✅ tests (13 passed).
✅ `voiceFingerprint` = N/A (deterministic, no LLM call — feeds writerAI's voiceCanon). *(confirmer fix: characterChat port call is
`rag/characterChat.js:179`; rag/chat is `rag/chat.js:180`.)*

### Recommendations (#25)
✅ CRUD router + mounted + shared store + table + reset-preserves-user · ✅ seed (10 recs, 6 catalog models) · ✅ `RecommendationsEditor.vue`
+ reachable + QuickSetup-consumed + `LuJobSelect` + catalog-fed picker. ❌ MISSING: backend tests (recs + ModelCatalogStore) ·
🟡 native confirm() · 🟡 UiTable `_key` cosmetic.

### Runner / residency (#27/#29) — unbuilt; single-model baseline solid
✅ single-model serving + load/status + Fit + tests (`test_lifecycle.py`/`test_runner.py`). ❌ MISSING: router mode (preset INI,
no-`-m` launch, `--models-max`, harden failures) · residency planner (co-reside/LRU/idle-TTL/dedup/low-VRAM toggle/cross-kind) ·
gguf-parser. ⚠️ STUB per-model VRAM estimate single-model only (`fit.py:138-160`); runtime override apply is a hook. *(confirmer fix:
hand-rolled gguf import is `lifecycle.py:22`.)*

---

## JustVoice — LATER, NOT current scope (but flagged: BROKEN)
The verification found JV's LLM layer **does not work** against the job-native shared schema — recorded so it's not lost, but it is
**not** current-plan work (JV adoption = U5):
- ❌ JV server won't import — `JustVoice/server/justvoice/models.py:23` imports the removed `LLMRolesSettings` (ImportError)
- ⚠️ JV config builder passes `llm_roles=`/`default_feature_roles=` → TypeError (`engines/llm/config.py:48-56`); never calls `install_llm`
- ⚠️ JV still mounts the old role/pin surface (`app.py:40-41,232-233`) · ❌ no shared routing UI in `JustVoice/src`

---

## Confirm-pass corrections (folded in above)
Both confirmers = **trustworthy**. Fixes: characterChat port `rag/characterChat.js:179` (not 232-251); rag/chat `rag/chat.js:180`
(not 200-220); gguf import `lifecycle.py:22` (not :24); the recs/catalog/preset stores live in the **shared kit**
`just-llm-runner/llm_runner/llm/stores.py`, not a JW-side file (states unchanged). Re-examined the `ProductionConfig` "dead layer" claim and found it WRONG — it's live + tested in the shared pkg and consumed by JV; only unwired in JW's config_builder (corrected above).
