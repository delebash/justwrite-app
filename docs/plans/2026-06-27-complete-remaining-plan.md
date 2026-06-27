# THE COMPLETE REMAINING PLAN (2026-06-27) — audited + independently confirmed

**How this was built (so it's trustworthy):** a 13-agent audit read all **17 plan docs**
across both repos in full and extracted **339 planned items**; the result was reconciled
against `MORNING_RECAP.md` + git (authoritative over older docs); then **3 independent
confirmers re-read the docs** and all three voted *incomplete*, surfacing **20 items the
first pass missed** — those are folded in below.

**Scope (per user, 2026-06-27):** **JustVoice is NOT current scope.** All JV-specific work
is isolated in **§7 (LATER)**, never mixed into the current plan. Already-shipped items are
in **§0** (pointers only). Governing decision: switches live in a **Features-style LAB as a
freeform string** (test → save preset → promote), **NOT in Providers** (design §6.6).

Legend: **[#NN]** backlog id · **[NEW]** surfaced by the audit · **[+conf]** added by a confirmer.

---

## 0. Already shipped — NOT part of the plan (verified vs recap + git)
Shared-LLM job-native move + the ~25-file cascade · gateway retirement (all phases) · platform
settings U1–U3 (+ most U4) · #30 model manager + switch_presets editor · #33 jobs grid · §9 jobs
GUI · switches **server** foundation (data model + type presets + layered resolver) · #18 + #22
*subset* (json_mode + top_p) · #19 Overrides through `/load` · catalog/switches/recs → DB · Fit
engine + hardware presets · feature-prompts → DB · LuJobSelect + jscpd reuse gate · #32 **dropped**
· the reset drop+recreate fix (this session). *(Full closed-item ledger: workflow §F.)*

---

## 1. BUILDABLE + VERIFIABLE IN THIS CONTAINER NOW (build:vite · headless smoke · pytest)

### 1a — The switch/param LAB + job Compare  **[#21]** (the "switch lab"; **#20** folded in)
- **[#21]** The **LAB** (Features-style): model + freeform **switch-string textbox** + params + prompt → **test** → **save preset** → **promote to production**. (design §6.6, §8)
- **[#21]** Multi-column **Compare** at job grain (N columns = model + switch-set + prompt; run-all → output/words/**tok-s**; pick winner → promote). (design §8; shared-ai Decision 23)
- **[#21]** ONE unit-parameterized **`<ConfigColumn>`** — extract the FeatureWorkbench editor pane; render ×1 (Features) / ×N (Compare). (Decision 23 "the convergence")
- **[#21]** `JobPreset` store + `make_job_presets_router` (named save/load, one promoted) mirroring FeaturePreset; Promote writes `job_routes` + `job_route_switches`; add `job_preset_switches` + `feature_preset_switches` tables. (design §2.7, §6.4, §8)
- **[NEW]** Compare **scheduler**: cloud = parallel · different-model local = co-reside · same-model-switch = serial. (Decision 23) — *full timing needs a GPU (→ §2)*
- **[+conf]** Cold-swap UX: already-loaded route <100 ms, cold swap 2–10 s → **show a "reloading" state** on a switch-value reload. (server-mgmt §3)

### 1b — Switches phase: editors + manifest cleanup (post-§6.6 reversal)
- **[NEW]** **Rip out** the per-model switch sub-editor + base/moe/mtp preset **cards** from the model manager/Providers (reverses shipped `edeae9a`/`43a40e7` per §6.6).
- **[NEW]** Per-job + per-feature **switch editors** live **in the lab** (string), not on routing tabs — land with the runtime apply (§2). (design §10, §16.8)
- **[+conf]** **Per-hardware switch editor** — the surface to save card-keyed switches into the (already-built) `hardware_switches` table; merges after per-model, before per-job. (design §6.1) — *missed by synthesis*
- **[NEW]** (optional) `flag_catalog` table (flag→cli/kind/compute) so a new flag is data not code; remove `flagPresets` from manifest `compose_flags`; emit `turboquant` preset. (design §9/§11; llamacpp-switches)

### 1c — Per-action sampling completion **[#22 finish]** + prompt features
- **[#22]** Rest of the sampling set: top-k/min-p/dyn-temp/XTC/typical-p/sampler-order/penalties/DRY/seed/stop, grouped + backend-aware. (design §16.6; Decision 12; sillytavern §1/§2)
- **[#22]** **Custom-JSON pass-through** escape hatch (merged into `extra`). (design §16.6)
- **[NEW]** Reasoning-effort **enum** (think bool → low/med/high → per-provider native) + ban-`<think>` fallback. (sillytavern §2; Decision 15/16)
- **[NEW]** Context-size + **token-budget guard**; lab **prompt-preview + token count** before Run; per-action **chunk-size**; optional **review/refine QC** pass; template-var listing + reset; `render()` macros (`{{random}}`/`{{pick}}`/`{{date}}`/`{{if}}`); story-bible→prompt injection (lorebook-style, budget-capped); post-history-instructions (LOW). (sillytavern §1–§5; Decision 16)

### 1d — Shared AI task queue **[#23]**
- **[#23]** Move ONE task system into `@delebash/llm-ui` (`aiTasks.js`+`AiTaskStrip.vue`+`aiFeature.js`), sweep JW's ~46 consumers, delete JW copies (no shims); replace the FeatureWorkbench `runStream` stopgap with the shared runner+store. (Decision 22)
- **[#23]** Share `AiStatusPanel`/`AiProgressBar`/`PresetBar`/`ProviderRow` + fix the in-file `ProviderRow` dup in `AiModelsArea.vue`. (shared-component §B)
- **[+conf]** Follow the prescribed **method**: per-component strict diff FIRST, in order AiStatusPanel/AiTaskStrip → AiProgressBar → PresetBar → ProviderRow. (shared-component P2)

### 1e — QuickSetup wizard **[#11]** (JW LLM)
- **[#11]** Modal wizard: card/VRAM chooser re-scores Fit → pick Default+Quick / Accuracy + Embedding → Apply sets routing + downloads/loads. RAM as a first-class Fit line; MoE-aware Fit (`--n-cpu-moe` steering, prefer 35B-A3B when RAM allows); editable embedding; "Test on your book →" deep-link to Compare; Fit-driven + manual hardware presets. (quicksetup-redesign; Decision 18)
- **[+conf]** Surface **download hygiene** (prefer instruct>base; trusted quant uploader; GGUF for budget GPUs). (llamacpp-switches §curation)
- **[+conf]** Design stance to honor: QuickSetup is a **best-effort seeder; Compare confirms** — don't over-engineer its accuracy. (quicksetup §Step3)

### 1f — Shared LLM-UI client views (the GUI half of the cutover; LLM + embedding only)
- **[NEW]** Build in the kit: `LlmProviderForm` · `ModelPicker` · `ProviderSelect` · `RunnerStatus` · `DownloadStrip` · `UsageView` · routing/jobs surface. (engines-llmui P2.3)
- **[NEW]** P0a normalize download-progress wire → camelCase + fix rate/ETA bug **once** in shared `DownloadStrip`/`useDownloadProgress`. P0c fold tier picker into `LlmProviderForm`. (engines-llmui P0a/P0c)
- **[NEW]** Add/Edit provider **inline form** (Local/Online + providerType, presets, auto-slug, GPU strip); provider role/job badges + counts; per-provider model mgmt surfaces (llama.cpp router list/load/unload/`-hf` · Ollama/LM-Studio `/api/tags`+pull · Cloud list-fetch); rename built-in runner → "Local engine"; Routing & Cost defaults card. (Decision 5/10/11/14/19/20)
- **[+conf]** **Preserve** the documented divergence: Ollama/LM-Studio keep the Fetch-models **combobox** (NOT the catalog table — bundled-runner only). (LuModelCatalog header)
- **[NEW]** Build host `ProviderBackend` adapters (JW Pinia adapter still **open**, T3.4) then delete the per-app adapter once endpoints identical. (engines-llmui T3.4)
- **[+conf]** Verify/stand up the kit's planned **`common/` vs `llm/` folder split** + `tokens.contract.css` (P1) — or record it as shipped. (shared-component P1)

### 1g — Streaming feature ports onto the shared stack
- **[NEW]** Port `writerAI` (rewrite/expand/tighten/continue/applyRule/guidedContinue/describe) onto `runAiFeatureStream` + RichEditor live-diff + VariationsModal **3-alt** (temps 0.55/0.7/0.95, opt-in). (Decision 17; gateway P4)
- **[NEW]** Port `rag/chat` + `characterChat` (ChatPanel + RAG) onto `/v1/ai/stream`; migrate non-analysis consumers (resumeBriefing/sessionRecap/stuckDiagnostic/sensoryResearch/brainstorm); move heavy context-gather server-side. (Decision; feature-prompts-db-seed)
- **[+conf]** Port **`voiceFingerprint`** — a listed LLM feature absent from the shipped migration set AND from the synthesis. (shared-ai appendix) — *missed by synthesis*
- **[NEW]** Then delete the `/v1/llm/...` gateway once the last consumer migrates (recap claims retired — **verify** against these). 

### 1h — Cleanup / dedup / gates
- **[#34]** New-entity-popup audit → AUDIT app-wide for redundant double-step/popup flows (RULE-5 table) → report → collapse to open-detail + validate-before-save.
- **[+conf]** `#30` residual: **job tags on the model row** ("one per-model screen") never landed (recs stay a separate tab) — decide build-or-supersede.
- **[NEW]** deep-audit A-items: reconcile copy-pasted helpers (`htmlToText`×9/`tailWords`×4/…); shared `runJsonAnalysis`; promote big CSS clones to `styles.css`; `useEntityCrudView` composable; finish per-file RULE-5 audit. (deep-audit A1–A4/D)
- **[NEW]** Gates: extend `check-shared-pickers` RULES[]; recs-dropdown behavior smoke; ratchet jscpd; i18n key fix (`SettingsView` `startNew`). (design §17)
- **[NEW]** Remove unused `PromptLab.vue` + UI-less routing-presets endpoints; unify usage path to `/v1/ai-usage`. (recap; Decision 3)

### 1i — Platform settings remainder
- **[NEW]** **U4** Updates/Changelog panel; Cache/Data "reclaim disk" aggregation. (shared-platform U4)
- **[NEW]** Generic **Hardware panel in the AI menu** (GPU/CPU/RAM/accel), both apps. (shared-platform)

---

## 2. BUILDABLE — but needs your GPU / a live model to VERIFY
- **[#27]** **Router mode** in `RunnerService` (`--models-preset` INI from catalog+switches, no `-m`, route by model, `--models-max` by tier). (server-mgmt; catalog-cutover §1.1)
  - **[+conf]** Design AROUND known router failures: count-based (not VRAM-aware) eviction OOM (#19425/#18939) · TOCTOU race under concurrency (#20137) · `GET /metrics?model=` re-triggers autoload + resets idle timer (#23096). (serving-research §Switching)
- **[#29]** **Residency / VRAM-budget planner** (VRAM detect → per-model estimate → `--models-max` + co-reside vs LRU-evict/reload + dedup identical (model+flags) + idle-TTL; cross-kind coordinator; Low-VRAM 1-at-a-time toggle). (server-mgmt §4B)
  - **[+conf]** Adopt the **Ollama pattern**: LRU that **queues rather than OOMs** + pre-flight "must completely fit" check tracking **RAM vs VRAM separately**. (serving-research §Ollama)
  - **[+conf]** **Embeddings residency rule**: tiny (~0.5–0.8 GB) → keep resident or CPU-only, **never swap**. (server-mgmt §3)
- **[#27/#29]** Apply per-job + per-feature **switch overrides at runtime** (the (re)load-on-job-switch trigger); same-model-two-jobs reload + dedup. (design §6.2/6.3/§11)
- **[#20→lab]** Per-model tuning with **tokens/sec + VRAM/RAM readout** to find the fastest `--n-cpu-moe` (OOM back-off only finds *a* working value); plumb Overrides through `/v1/llm-runner/load`. (llamacpp-switches; local-recs)
- **[NEW]** Per-tier **auto-strategy** (detect → auto model-set + `--models-max` + offload, manual override); advanced tuning (RoPE/YaRN off-by-default; multi-GPU `-sm/-ts/-mg`); turbo/KV-type validation. (server-mgmt §5; llamacpp-switches)
- **[NEW]** **Apple Silicon** path (unified-memory budget; no `--n-cpu-moe`; bandwidth-bound TG). **[+conf]** operator lever `sudo sysctl iogpu.wired_limit_mb` to raise the ~66/75% cap. (serving-research §Apple)
- **[#18]** Evaluate `--json-schema`/GBNF structured output quality + latency for extraction/attribution. (server-mgmt; serving-research)

---

## 3. RESEARCH / CONTENT
- **[#28]** Corrected deep-research run → the implementation design doc: per-tier **measured** tok/s + VRAM (incl. real **8 GB-exact** config), serving/switching adopt-vs-build, MoE-vs-dense extraction quality, per-task benchmark recs. (server-mgmt §1/§4/§5)
- **[#25]** Curate `model_recommendations` (cited per-job picks; EQ-Bench/MTEB overlay) + seed the "why" content (manifest models list currently empty). (local-recs; quicksetup)
- **[NEW]** Adopt `gguf-parser` to feed `fit.py` metadata (additive, #29); extend `hardware.py` beyond NVIDIA → AMD/Intel/Apple (llmfit per-vendor shell-out pattern). (catalog-cutover §7; serving-research)
- **[+conf]** **STUDY GPUStack v0.x** (same llama-box+vox-box stack) — **NOT v2** (v2 dropped llama-box/Metal; archived Nov 2025). (serving-research)
- **[NEW]** Build/ship-or-not the **TurboQuant** fork binary (turbo3/4 KV) — lean stock default, advanced opt-in. (llamacpp-switches)

---

## 4. DECISIONS TO SETTLE FIRST (then build)
- **[+conf]** **Router-vs-spawn (and hybrid: router-serve + #19-spawn-for-switch-tuning) is the USER's call** — present with receipts + counter-case, **do not switch the runner unilaterally**. (server-mgmt §5 Q1) — *synthesis wrongly treated router as confirmed-build*
- **[NEW]** Serving/switching mechanism choice (router vs llama-swap vs spawn) + keep-TTS-resident mechanism. (serving-research)
- **[NEW]** Job lifecycle on delete/rename (immutable id + editable label + graceful fallback); job test-prompt source (`test_feature` column vs per-run); feature→job scope (global vs per-config); samplers per-action vs also per-default; tokenizer for token-count. (design §2.2/§2.9/§12; sillytavern §3)
- **[NEW]** Wire **cloud-native adapters** (Anthropic `thinking`, Gemini thinking/safety, **prompt caching**, Ollama-native think:false) so one "Enable thinking" maps per-provider; finalize JW provider blob↔config mapping. (Decision 14/15/20) — *live-model to verify*
- **[NEW]** `prefer_local_features` + `vramFit.tiers` → editable (vs hardcoded); kit git-dep packaging at release; prose/embedding/recommendation **defaults**. (design §13; local-recs)

## 5. DECIDED — NOT to build / superseded (recorded; no work)
- **§6.6**: switches = freeform string in the lab, **no per-flag fields, none in Providers**. **#20** separate tuning UI → **folded into lab**. **#32** Locations↔Objects convergence → **dropped**.
- **[+conf]** The **VRAM fit math stays per-domain** (no shared "fit engine"; each behind its adapter — only the visual "fits" badge is shared). (engines-llmui Decision 1)
- **[+conf]** **App/UI prefs (appearance) stay a simple store**, NOT relational P2 tables. (p2-normalization §non-goals)
- Roles (quick/accuracy) → **replaced by jobs** end-to-end. Connection-profiles / instruct-templates / CFG / beam / Author's-Note → design-reference only. (sillytavern §6/§7)

## 6. DEFERRED-until-needed optimizations
- **P2.5** incremental per-scene writes; full per-entity write REST; RAG **sqlite-vec** ANN; IDB→SQLite import path; drop dead `idb-keyval`; boot/splash UX for spawn; dead Tauri `images_save` cleanup. (jw-server-migration)
- **P5** extract kit `common/` → standalone `@delebash/ui` + neutral rename; llama-swap as optional backend-agnostic layer (pin v229 if adopted); Tauri/package rename PR ("track, don't churn"). (shared-component P5; serving-research; cross-app)

---

## 7. JUSTVOICE — LATER, NOT current scope (separated per user, 2026-06-27)
*Listed for completeness only; none of this is current-plan work.*
- **U5 adoption:** delete `engines/llm/*` → `install_llm(...)` + JV feature seeds + run seed; fix role→job consumer breakers; mount the shared llama.cpp runner; supply catalog values + point-of-use labels; reconcile the two QuickSetups; persistent usage table; two-base reset/backup.
- **TTS Lab** (the JV half of the Compare framework): engine-knob settings schema (Chatterbox/Qwen3/Kokoro) + render/batch + merge-timing + **audio-variant compare**. (Decision 8/13/23)
- **[+conf] JV capture/dictation fix** (wrongly shown shipped): the `capture` localStorage ref nothing writes + client/server shape mismatch — align to server variant ids, bind to `settings.captures.*`, drop dead localStorage. (deep-audit A7) — *JV-domain correctness, independent of LLM*
- **[+conf] JV Lab prompt-editor view** (`/v1/ai/prompts` editor for JV) — never built. (feature-prompts §132)
- JV catalog drift (`refine`/`voice_gender` first-class server entries; dynamic-prompt features → base-text-in-DB); shared `ProviderForm` TTS-capability section; JV de-blobbing; fix JV CLAUDE.md "in-process" wording; JV planner wiring (keep TTS resident while swapping LLM); shared TTS `DownloadStrip`/task-queue adoption; JV platform-settings checklist.

---

## Counts
339 audited items → **§1** ~70 buildable-now · **§2** ~14 GPU-gated · **§3** ~8 research · **§4** ~12
decisions · **§5/§6** recorded-no-work / deferred · **§7** JV-later. Confirmers added **20**; the 3
JV-specific ones went to §7, the rest folded into §1–§6. Verdicts: all 3 = *incomplete on the first
pass* → why these 20 matter.
