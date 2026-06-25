# Morning Recap — JustWrite

> The in-repo session-pickup doc — **current + future tasks and the live list of
> active plan docs.** Read this right after the global `~/.claude/CLAUDE.md` and
> this repo's `CLAUDE.md`. Stable architecture + rules live in `CLAUDE.md`, NOT
> here; deep per-task detail lives in `docs/plans/*`.

---

## ⮕ ACTIVE WORK — read first (2026-06-24)

### ⮕ NARROWED STEP (2026-06-25 — user: "one step at a time, stop doing too many things")
**Scope: JW ONLY, NVIDIA ONLY.** How JW swaps models per task + QuickSetup.
(JV, Mac/Linux, tuning UI / Compare — DEFERRED until the JW workflow is right.)
**Operating mode (user, zero-trust):** I do NOT drive/decide — grounded
recommendations (receipt + counter-case); the USER decides. (See rules-reminder.)

**➡️ FULL SESSION DETAIL + HANDOFF:** `docs/plans/2026-06-25-llm-catalog-db-cutover.md`
(read it first next session — has the Q1/Q2/Q3 model, every decision + why, the file
map, what's done/left, how to verify). Below is just the map.

- **quick vs accuracy = DIFFERENT models** (NOT think-on/off — the point of model-based routing).
- **✅ ROUTER MODE — CONFIRMED** (user) for per-task swapping. Hot-swap mechanism
  empirically verified (`just-llm-runner/docs/plans/2026-06-24-llamacpp-switches.md`
  §Lifecycle). **Decided but NOT yet implemented** — the runner still spawns
  single-model; building the `--models-preset` launch in `RunnerService` is **task #27**.
- **✅ CATALOG / SWITCHES / RECOMMENDATIONS → DB (DONE this session).** The downloadable
  model catalog moved OFF `runner-manifest.json` (now `models:[]`) INTO host DB tables:
  `model_catalog` + `model_switches` (normalized child) + `model_recommendations`
  (job tags). Shared `Protocol`+router per table (the `RoutingStore` pattern); JW stores
  + merge-by-id seeders; runner reads via injected `catalog_fn`/`switches_fn`
  (`configure_service` at boot). `/v1/llm-runner/models` is now DB-backed. Per-model
  switches layer UNDER user `Overrides` at spawn. 35B-MoE seeds `spec_type=none`
  (spec hurts MoE); 27B-dense `spec_type=draft-mtp`. Verified live + 98+83 pytest.
  Commits: runner `490e7a5`, JW `c70d44c`.
- **🆕 JOBS ARCHITECTURE (2026-06-25 design — DESIGN, not built; REVISED — switches
  reconciled).** ➡️ `docs/plans/2026-06-25-jobs-architecture-design.md` (rewritten —
  read it). Decided: **`job` REPLACES `role`** as the routing unit (~4 jobs:
  chat/prose/extraction/analysis — exact set OPEN); features get a `job` + inherit their
  job's **model + switches**; **per-feature override = the existing `FeaturePin`** (resolve
  LIVE, don't copy — applying a job is ONE write to the job→model map, features show it via
  live inheritance). `job` = the ONE concept: routing + `model_recommendations.job` tag
  (today only quick/accuracy consumed → finally real) + Compare unit.
  - **Storage:** job→model map = a **`job_routes` child table** `(config_id, job)` replacing
    the 2 fixed `quick_*`/`accuracy_*` columns on `routing_configs` (mirrors `routing_pins`);
    `routing_pins.role → job`. Role machinery role→job across `schema.py`/`dispatch.py`/
    `routing_api.py`.
  - **⭐ SWITCHES — CORRECTED (the old "stay per-model" line was WRONG).** Switches are
    Plane-1 load-time and **LAYERED**: `model_switches` (built) = the **base default**
    (model-intrinsic, e.g. MoE→spec:none) + a **per-job override** (NEW: chat ctx 8k vs
    analysis ctx 32k) + a rare **per-feature override** (NEW) — merged by the **already-built**
    `_merge_overrides` (`lifecycle.py:68-79`). So the **same model can run different switches
    per job**; each distinct (model+switches) = its own router load (hot-swap test
    `2026-06-24-llamacpp-switches.md:460-482`); identical combos dedup to one load. A
    **residency manager** (= the VRAM-budget planner, #29) sets `--models-max` from detected
    VRAM: big card → co-resident, 1-model card → reload-on-switch. This was the ORIGINAL
    two-planes design (`:232-241`), NOT a fork.
  - **Job lab** = multi-column Compare (#21, never built) at job grain — each column = model +
    switch set + the job's test prompt (**reuse a representative feature's prompt**) — +
    **JobPreset** (mirrors `FeaturePreset` save/active/promote, carries its switch set) →
    promote writes the job's live model + switches. **Naming:** add **"Routing by job"** tab
    LEFT of **"Routing by feature"** (renamed from "Features", `AiModelsArea.vue:140-145`).
  - **OPEN (need user):** (a) switch storage — **reasoned rec = FK-backed child tables
    (`model_switches` stays + `job_route_switches` + `pin_switches`, each a CASCADE FK)
    served by ONE shared generic store** (preserves the referential integrity we already
    have; logic shared via the existing `SwitchRow`/Protocol/`make_switches_router`; the
    earlier "unified table" rec was a "least-code" proxy, rejected on merits); (b) the job
    set + mapping all 19 features; (c) lab = new vs shared `unit`-parameterized Compare.
    **Plan presented for verification before any build.**
- **⭐ NEXT build (#30): the editor UI gap.** NO UI edits `/v1/ai/model-catalog` or
  `/v1/ai/model-switches` yet (only `/v1/ai/recommendations` has an editor tab). NO new
  "Models tab" — grow **`LuModelCatalog`** (the bundled-model list inside the provider
  form, today download/load only) into the model manager: **+ Add model** (paste HF) +
  edit catalog fields + edit per-model switches. Then the jobs-architecture build order
  (job set → role→job in routing/dispatch → Compare+JobPreset → editor). (8GB = MIN.)
- **DB policy:** drop + reseed, no migrations (pre-release;
  `docs/plans/2026-06-18-unified-storage-no-idb.md:45-49`). Nuke `JW_DATA_DIR` for a clean DB.


### ⭐ CURRENT FOCUS — engine switches + all LLM settings, so we can TEST MODELS
The user wants to move from docs → BUILD: expose everything configurable about the
LLM engine to the GUI + a Compare surface, so models/switches can be tested on real text.

**STATUS (2026-06-24):**
- ✅ **#19 DONE** — `Overrides` plumbed through `POST /v1/llm-runner/load`
  (`LoadRequest` → `Overrides` → `compose_flags` replace-merge → `start_runner`); 98
  tests pass, ruff clean. Committed (just-llm-runner `e5cecef`).
- ✅ **CORRECTED DEEP-RESEARCH DONE** (run `wf_41866140-cef`, 106 agents) → saved
  `just-llm-runner/docs/plans/2026-06-25-serving-architecture-research.md`. Nailed the
  ARCHITECTURE/adopt answer; the per-tier MEASURED numbers + model-by-benchmark picks did
  **NOT** survive verification (still open → a follow-up research pass + the user's own
  Compare fill them). **DESIGN DRAFTED** (brief §4B): detect → **VRAM-budget planner we
  BUILD** (adopt **`gguf-parser`** for fit — replaces hand-rolled `fit.py`/`compute_fit`) →
  coordination — **CORRECTED 2026-06-25 (user-caught my bad advice):** llama-swap does
  NOT manage our TTS (JV's TTS = custom `EngineProcess` API, not OpenAI `/v1/audio/speech`;
  llama-swap only manages OpenAI-compatible upstreams) → its TTS edge is MOOT. **Cross-kind
  TTS↔LLM VRAM coordination is OURS to BUILD** (planner orchestrates the LLM runner ⟷ JV
  `EngineManager` under one budget — no tool does cross-subsystem VRAM arbitration). LLM-swap
  mechanism: **router mode (native) likely sufficient**; llama-swap only if we want
  backend-agnostic (non-llama.cpp) LLM serving. The error was a synthesis mistake (had both
  facts, didn't connect them), not a research gap. Apple Silicon special (unified-mem budget ~66–75 %, NO `--n-cpu-moe`
  benefit, bandwidth-bound). GPUStack v0.x = the production precedent. **PICKUP:** confirm
  the fork → build planner+detection+(llama-swap|router) → fill model picks/measured numbers
  via Compare (#21). ➡️ **PICKUP doc:**
  `just-llm-runner/docs/plans/2026-06-24-server-model-management-brief.md` — has the
  corrected scope, the **VERIFIED code grounding** (RunnerService spawn-per-model;
  llama.cpp router mode; JV `EngineManager` per-kind SUBPROCESS slots; JV LLM =
  transformers not llama.cpp; `register_local_adapter`; `hardware.detect`), the
  **corrected `/deep-research` question (§1.5)** to run FIRST, and an **UNVERIFIED**
  tier-matrix hypothesis (do NOT implement from it). **Solid from run 1** (tier-GENERAL,
  keep): KV-quant `q8_0`+`-fa`, `--n-cpu-moe`, router **LRU-evict at `--models-max`**
  (corrected the earlier "never evicts" error), llama-swap, embeddings tiny→resident/CPU.
  **NOT solid:** per-tier model picks + tok/s (extrapolated). Feeds **#27/#11/#20**.
- ⚠️ **CORRECTION (2026-06-24):** llama.cpp HAS router mode (live model swap) — an
  earlier "swap = restart" claim was wrong (stale prior + shallow research; user
  caught it). Corrected in the switches doc "Lifecycle (CORRECTED)" + Decision 23.
  RULE #4 hardened (confidence = trigger; one source ≠ verified) in global CLAUDE.md +
  the hook reminder (sent to the user's machine).
- 🧠 **OPEN DESIGN Q (user, 2026-06-24) — cross-kind model memory (JV):** should we
  unload/load TTS *and* LLM so only one model (any kind) is resident on low-VRAM
  cards? Verified JV `EngineManager` (manager.py:943) keeps PER-KIND slots
  (tts|llm|embedding, one each — deliberately allows LLM+TTS resident for speaker
  attribution). My rec: NOT a hard global-1 (forces reload churn on the
  attribute→render flow; evicts cheap embeddings; wastes big-card capacity) — instead
  a **VRAM/RAM-budget-aware coordinator** (evict other-kind slots when over budget;
  **"Low-VRAM mode" toggle = 1-at-a-time opt-in**; idle-TTL unload; keep tiny
  embeddings resident/CPU), **unifying** EngineManager's slots with the runner's
  `--models-max`. Folded into **task #27**.
  - **Verified 2026-06-24 (don't re-derive):** JV does **NOT** use llama.cpp today —
    `qwen3_llm/engine.py` uses **transformers** (in-process PyTorch); JV imports the
    shared `llm_runner.llm` DISPATCH but the llama.cpp **RUNNER** is NOT mounted in JV
    (that's the pending **U5**). JW+JV are **not** run concurrently (no cross-app VRAM
    contention). Open Q (decide after report + code re-audit): is TTS+LLM ever truly
    CONCURRENT, or only sequential (Cast→attribute→render)? If sequential, a simple
    "unload other kind on load" suffices. Likely an EXTENSION of EngineManager
    (already does slots/unload/empty_cache) + U5 runner adoption — not a teardown.

**Then continue the build.** Natural path: **#20 per-model tuning UI** (read JV
`VoiceParamsModal` first — precedent) + **#22/#18 per-action settings/JSON** → **#21
multi-column Compare** (= the Feature editor as a shared `<ConfigColumn>` rendered ×N;
2-up + horizontal scroll + collapse-nav, Studio-styled) + **#24 temp
speaker_attribution scaffold** → **#23 shared AI queue**. **#11 QuickSetup** + **#27
router deep-dive** should wait on the research report.

**Durable docs from this research phase (READ before building the relevant piece):**
- `just-llm-runner/docs/plans/2026-06-24-llamacpp-switches.md` — every engine switch
  (what/why/when/which models+features), the verbatim source docker commands, and the
  **FULL** configurable `llama-server` surface split into **two planes**: load-time
  engine flags (→ tuning UI / Compare via `Overrides`) vs per-request params
  (sampling/JSON/reasoning → routing). Cited.
- `just-llm-runner/docs/plans/2026-06-24-quicksetup-redesign.md` — QuickSetup =
  **modal popup wizard like JV (LOCKED)**; card/VRAM chooser; editable
  Default/Quick/Accuracy/Embedding; MoE-aware Fit. Open Qs: "Card" naming, embedding default.
- `justwrite-app/docs/plans/2026-06-24-local-model-recommendations.md` — model-by-task
  chart + MoE/offload findings (cited boards, not our testing).
- `docs/plans/2026-06-20-shared-ai-stack-plan.md` — **Decision 22** (AI queue/progress/
  cancel is SHARED) + **Decision 23** (testing = multi-column Compare INSIDE Features,
  not a separate Lab; 2-up + horizontal scroll + collapse-nav toggle; every column a full config).
- `JustVoice/docs/plans/2026-06-24-audiobook-nlp-competitor-research.md` — Alexandria /
  audiobook-creator / audiobook-maker / BookNLP2 (committed; **revisit after switches**).

**Key facts that must survive (the "why"):** (1) MoE + `--n-cpu-moe` runs a 35B-A3B on
a **6 GB** card if RAM ≥ ~24 GB — the budget pick for hard tasks (attribution/extraction).
(2) Speculative decoding (MTP/ngram) helps **DENSE** models (MTP +40% on dense 27B) but
**LOSES on the 35B-A3B MoE** in llama.cpp (RTX 3090 benchmark: every spec variant slower
than baseline) → spec ON for dense, OFF for MoE. (3) **Two config planes:** engine launch
flags (per-model load) vs per-request sampling/JSON/reasoning (per-action routing) — don't
conflate. (4) **llama.cpp has ROUTER MODE** (`--models-dir`/`--models-preset`/`--models-max`,
no `-m`) — one server swaps MODELS live (per-model switches via INI, startup-fixed). So
model-switching is live; only changing a SWITCH VALUE needs a (re)start. Corrected an earlier
wrong "swap = restart" claim — see switches doc "Lifecycle (CORRECTED)" + **task #27**
(router-mode vs our spawn-per-model architecture).

**Post-compaction safety net installed (2026-06-24):** a global SessionStart hook
(`/root/.claude/settings.json` → `~/.claude/hooks/inject-recap.sh`) now re-injects the
HEAD of this recap on every compaction/resume/startup, alongside the existing
rules-reminder. So work-state reloads automatically. (Persists this session for sure;
may need re-adding if the container is rebuilt — see chat.)

### Feature Workbench test panel — now wired to the batch AI system (2026-06-24)
The Features test "Run" was a bare one-shot `/v1/ai/run` (output + ms only). Now:
`FeatureWorkbench` takes an optional **`runStream` host-hook** (forwarded by
`AiModelsArea`); JW's `AiView` passes a wrapper around `runAiFeatureStream`
(extended to forward the in-editor candidate overrides system/userTemplate/think/
maxTokens) → the test **streams live, shows word count + token usage, has a
Cancel button, and registers in JW's AI tasks strip** (the batch list). No hook
(JV today) → falls back to the one-shot run. **Next:** make the test panel
**multi-column Compare** (each column = model + switches + prompt; run-all →
per-column output/words/tps/cost → promote winner) — this is the agreed Lab
(NOT a separate route) and absorbs the switch-testing (columns differ by
`n_cpu_moe`/`n_gpu_layers`/`ctx`). Layout DECIDED: 2-up base + horizontal scroll
(unlimited full-config columns) + a collapse-nav toggle for full-width on demand.

### Platform-settings convergence (NEW thread — authoritative: `docs/plans/2026-06-24-shared-platform-settings.md`)

Most of "App Settings" is **stack infrastructure**, not app content → make it
SHARED (components + server modules), placed by-concern in the same home in every
app; only a thin app-domain slice differs. By-concern homes: **Data** (backup ·
restore · reset · clear-caches — *one shared SQLite module, same front+back*) ·
**Server** · Appearance(+language) · **Logs** · **Updates** · About; **Hardware/GPU**
→ the AI menu (runner-driven), **Cache** → with Data. Unit sequence (verify+commit
each):
- ✅ **U1 — AI consolidation + Debug removal.** `AiModelsArea` gained an app-tab
  slot (`appTabLabel` + `#app-tab`); JW fills it with **Writing AI** (voice canon +
  RAG auto-rebuild + 3-variation, `components/WritingAiSettings.vue`); App-Settings
  "Writing AI" tab removed. **Debug** tab + `/debug/writer-lab` + `WriterLabDebugView`
  + the orphaned `WriterLabBase.vue`/`services/writerLab.js` deleted. Dead i18n keys
  pruned. App Settings now = Project · AI usage · Appearance · Server · Backups · About.
- ✅ **U2 — Usage consolidation.** Enriched the shared ledger snapshot (cost +
  by_provider + totals; cost is server-computed in JW's sink via `pricing.cost_for`),
  upgraded the AI-menu **Usage** tab to the full ledger (rollup + by-feature +
  by-provider + reset). Removed the App-Settings "AI usage" tab AND the now-dead
  renderer usage cluster (`recordUsage`/`hydrateUsage`/`usageTotals` + `MODEL_PRICING`
  + `services/usageApi.js` — zero consumers; usage is recorded server-side on dispatch,
  so no double-count). App Settings now = Project · Appearance · Server · Backups · About.
- ✅ **U3 — Shared Data & Storage.** New shared `llm_runner/platform/` subpackage
  (the shared backend kit both apps already depend on — not a new package) with
  `make_data_router`: `GET /v1/data/backup` (VACUUM-INTO ZIP of DB + asset dirs),
  `POST /v1/data/restore` (table-copy, no live-file swap → cross-platform safe),
  `POST /v1/data/reset` (host reset callback). Shared `<DataManagement>` component
  + `requestBlob`/`postForm` client helpers. JW mounts it (`data_admin.py`),
  retired `DELETE /v1/workspace` + `workspaceApi.js` + the renderer JSON-snapshot
  export/import; Backups tab now = Tauri autosave-restore (app-local) + shared
  `<DataManagement>`. Round-trip tested (runner + JW). JV migration recorded in
  the plan (still on `/v1/backup|restore|admin/factory-reset`).
- ✅ **U4 — Shared Server / Logs / Updates / Appearance(+language) sections.**
  App Settings is now **Project · Appearance · General · Backups · Logs · Updates ·
  About**. (Cache → lives with Data / the AI menu; Webhooks → deferred, speculative
  for JW — per the plan.)
  - ✅ **Language → Appearance** (was Project → Preferences; matches JV). The
    now-unused `settings.preferences.cardTitle` i18n key can go in an i18n sweep.
  - ✅ **Logs** — lifted JV's log handlers into shared `llm_runner/platform/logs_api.py`
    (`make_logs_router` + `install_log_ring`/`install_file_log` — in-memory ring for the
    tail + a rotating file for crash survival) + shared `<LogsPanel>`. JW installs the
    ring/file at boot, mounts `/v1/logs/*`, and has a **Logs** App-Settings tab. (JV keeps
    its local `admin_api` logs until U5.)
  - ⏳ **Updates / Changelog** — shared `<UpdatesPanel>` (version + release notes,
    Tauri updater) + JW changelog content + an App-Settings "Updates" tab.
  - ✅ **General** — renamed JW's "Server" tab → **General** + added a Data-location
    card (server DB+assets dir from /v1/health). Holds data location · headless
    access · API tokens. (keep-running deferred — JW has no Tauri command for it yet.)
  - ✅ **Updates / Changelog** — shared `<UpdatesPanel>` (version + rendered
    changelog html, `#actions` slot for a future Tauri updater) + a JW "Updates" tab
    that renders `docs/whats-new.md` (single-sourced with the WhatsNew modal).
- ⏳ **U5 — JV adoption** of the shared platform settings (mount `make_data_router`
  with audio asset dirs; replace JV General/Cache/Logs/Changelog with the shared
  sections; GPU/Hardware → the AI menu). See the plan's JV transfer checklist.


**AI ▸ Features UX pass (JW, on `claude/admiring-galileo-il3q0o`).** The shared
`FeatureWorkbench` (AI Settings ▸ Features) is now the ONE AI config + test
surface — it absorbed per-feature prompt editing **and** a test-on-real-input
panel, so the standalone **Writer Lab** (`/writer-lab`) and **Feature prompts**
(`/ai-prompts`) views were DELETED (views + router + sidebar + command-palette +
i18n). The dev compare tool at `/debug/writer-lab` stays (multi-model compare,
reachable via Settings).

**Shipped this pass (committed):**
- **Canonical naming = POINT-OF-USE (user law, 2026-06-24):** a feature's name in
  Features must match what the user sees where they use it. Line edits dropped the
  "Rule" prefix; critique actions = **Notes** + **Structure**; chat = **Ask the
  book**; sensory = **Research feel**; voiceDrift = **Voice drift**; beatSheet =
  **Beat sheet**. Driven by `feature_catalog.py` (per-feature `label` + new
  `category`) + per-action `label` in `seed_feature_prompts.py` (`_ACTION_LABELS`).
- **Category-grouped nav** — categories (Writing / Drafting tools / Analysis /
  Multi-reader panel / Whole book / Characters / Chat / Home) → action cards at a
  SINGLE indent (a sub-label/group header doesn't push its cards deeper). A
  **Set-all** provider+model picker per group, **stacked** (provider over model)
  in a narrow column; a single-feature category "merges" (Set-all on the category
  header).
- **Per-action presets = the LAB (kept — this is load-bearing):** save several
  named presets per action, **test each candidate** (the test panel runs the
  in-editor prompt via new `/v1/ai/run` `system`/`userTemplate`/`think` overrides,
  not just the live one), then **Use as production** to promote one. This is WHY
  Writer Lab + the standalone prompt editor could be retired. The separate
  whole-routing **"Saved configs"** (RoutingPresets) was removed (that was the
  "save box" to drop); `PromptLab.vue` is now unused (cleanup pending).
- **Model roles cards (JV look):** per role — speed blurb + catalog-derived
  "Used for: …" + our picker + trade-off note. **Full-width** AI area (dropped the
  1100px cap). One-line **hardware strip** (OS · CPU · Memory · GPU · Accel).
- **App Settings → horizontal tab strip**, full width (matches JV). Test-panel
  variable labels humanized (voiceCanon → "Voice canon").
- **Shared contract additions (backward-compatible, default ""):**
  `FeatureCatalogEntry.category` (routing_api) + `FeaturePromptRow.label`
  (prompts). JW added the `label` column + migration rebuild + store mapping.
- **Editor picker:** inherit option = plain **"Inherit default"** (dropped the
  redundant "· role"); role options = "Quick role"/"Accuracy role". Role pickers
  aligned (fixed chip column). `LuModelPicker` = non-wrapping 2-col grid.
- **Entity sweep:** ONE name everywhere (the 3 story-bible buttons + modal + the
  Features card) + a discoverable button on the Analysis dashboard AI-tools row.
- **Nav rename:** Settings → **App Settings**, AI → **AI Settings**.

**Backlog (this session):**
- ✅ **DONE — Default LLM → provider+model picker:** `RoutingDefaults.model` +
  `routing_configs.default_model` (ALTER) + store + `config.py` role fallback +
  the shared picker. Default now pins a model like the role cards.
- ✅ **DONE — Max tokens per action:** `feature_prompts.max_tokens` (0 = no cap)
  + wire shapes + `/v1/ai/{run,stream}` pass it + editor field. (Named presets
  don't capture it yet — minor follow-up.)
- **Per-feature flags (DISCUSS):** beyond max tokens, only feature-specific
  behaviors exist (writerAI 3-variation, voice-canon) — confirm which to expose.
- **QuickSetup rethink (IN DESIGN) — see `docs/plans/2026-06-24-local-model-recommendations.md`.**
  Decided: modal wizard (like JV) + card/VRAM chooser + pick Card/Quick/Accuracy/Embedding
  from a benchmark-cited, Fit-filtered (VRAM+RAM, MoE-aware) list; the Lab A/Bs the picks.
  **Key findings:** model recommendations come from BOARDS not our testing (Qwen3=reasoning/
  attribution, Mistral Small=JSON/extraction, EQ-Bench=prose [cloud still leads], nomic-embed=embeddings).
  **MoE offload (`--n-cpu-moe`) runs Qwen3.6-35B-A3B on a 6 GB card (~30 tps, needs ~24 GB RAM)** —
  far better than dense 8B for hard tasks; `-ncmoe` is MoE-only (doesn't help a dense 14B, which is
  why 14B is slow on a small card). Switch presets ARE saved (`runner-manifest.json` flagPresets +
  `process.py` Overrides); the GAP is they're not plumbed through `/v1/llm-runner/load` or exposed in
  the UI → build a per-local-model tuning UI (n_cpu_moe/n_gpu_layers/ctx + tps readout) to test.
  Enabler shipped: `/v1/llm-runner/models?vram_mb=` re-scores Fit. User's machine: small card + 32 GB RAM
  (MoE-capable). JW LLM first; JV has TWO (TTS + LLM).
- **App Settings common sections (audit):** JW lacks GPU · Logs · Changelog vs JV.
- **Cleanup:** delete the now-unused `PromptLab.vue`; the routing-presets backend
  endpoints are now UI-less (decide keep vs remove).
- ✅ **DONE — LuModelPicker fetches provider models** (`/v1/llm-providers/{id}/models`):
  the model dropdown was a stub ("(provider default)" only); Default LLM / roles /
  per-action now list the provider's real models. (No live LLM in the dev container,
  so it shows the saved default there; real providers list models.)
- ✅ **DONE — Default embedding → provider+model picker (consistent w/ Default LLM):**
  `RoutingDefaults.embeddingModel` (routing_api) + `routing_configs.default_embedding_model`
  (ALTER) + store map; RAG honors it (`override → routing default → provider.embeddingModel`
  via the store's `embeddingModelFor` getter; indexer/chat/characterChat/IndexBuildModal
  rewired). **`LuModelPicker` gained `editable` (pick-OR-type combobox, reusing `LuCombobox`)
  + `kind` ("chat"|"embedding", `/embed/i` suggestion filter)** — Decision 14 realized; the
  main pickers (Default LLM, Default embedding, roles, per-action editor) are now type-able,
  the compact nav Set-all stays a native `<select>` (its popup escapes the overflow-clipped
  sticky nav; a combobox list wouldn't). Embeddings are usually typed (text-embedding-3-small /
  nomic-embed-text; Anthropic/Gemini expose none) — the combobox suggests fetched models AND
  accepts free text. Also fixed a latent bug: `routingBackend.putRoutingPrefs` omitted
  `default.model`, so a JW-side routing save silently wiped the Default-LLM model — now merges
  with the cache; `AiView` re-syncs routing on unmount so picks are live in-session.
- **Think-about (design, user 2026-06-24):** consolidate JW's App-Settings
  **"Writing AI"** section (voice canon · RAG auto-rebuild · 3-variation) INTO the
  AI Settings area — it's AI-related and AI Settings already hosts the writer
  features. Ties to per-feature flags: voice-canon / 3-variation as per-action knobs.

**JV TRANSFER CHECKLIST (when JV adopts the shared AI GUI — make the changes
correctly):** JV currently runs a PARALLEL, older AI stack and is NOT on
`FeatureWorkbench`/`AiModelsArea`. To transfer: (1) migrate JV's `/v1/feature-pins`
+ its locally-defined `FeatureCatalogEntry` (tier-based) onto the shared
`/v1/ai/routing` + `feature_catalog.py` (role-based); (2) JV supplies its own
catalog values — `category` per feature + per-action `label` (point-of-use names
for Compose/Rewrite/Analyze/Smart-assign/etc.); (3) align JV's point-of-use
surfaces to those names; (4) the shared `ProviderForm` needs a TTS capability
section before JV can drop its forked `ProviderForm.vue`; (5) JV has TWO
QuickSetups (TTS + LLM) to reconcile with the shared one.

---

## Prior thread — shared AI/LLM stack convergence (2026-06-21)

**Current thread: the shared AI/LLM stack convergence.** JustWrite is the
**focus app** — build the shared GUI in service of JW first; JustVoice adopts the
identical result after. Branch: `claude/admiring-galileo-il3q0o` (all repos).
Authoritative plan: `docs/plans/2026-06-20-shared-ai-stack-plan.md` (20 settled
decisions + a reconciliation — read it before any AI work; do NOT re-litigate it).

Goal: JustWrite and JustVoice run the SAME AI stack — `just-llm-runner` (Python)
+ `@delebash/llm-ui` (plain-JS Vue) — differing ONLY in TTS (JV) and each app's
feature catalog.

**⚠️ STANDING RULE (user, 2026-06-22): NO JSON blobs in SQL.** Relational /
fixed-schema data = real columns/rows. JSON is allowed ONLY for genuinely
freeform data with a cited perf/design reason (embedding vectors → packed binary;
snapshots/tombstones like `chapter_versions.scenes`/`trash.payload`; variable-
shape AI artifacts; the heterogeneous settings `ui` doc) — and must be flagged.

**AI config de-blobbed → real tables (2026-06-22, pushed):**
- **Providers** (`LlmProvider`): the `data` JSON blob → real columns
  (provider_type/base_url/api_key/default_model/embedding_model/timeout_seconds/
  **local**). Added the `local` flag (Local/Online grouping, stored not URL-
  guessed) + server-derived id-from-name (Id field dropped from the form).
  Migration rebuilds the old blob table; built-ins reseed.
- **Routing** (`routing_configs` + `routing_pins`): default/roles/pins/presets
  left the `ai` settings blob for real tables (live row id='active' + named
  presets; presets fully normalized, own pins rows). `routing_store` +
  `config.py` table-backed; renderer `services/routingBackend.js` (boot cache +
  merge-preserving PUT) + `stores/ai.js` persist routing via `/v1/ai/routing`
  (modelTiers + autoRebuildRagIndex stay in the `ai` doc — genuine prefs). This
  retired the dual-writer `ai` blob seam (renderer store + shared router).
- **JV NOT YET de-blobbed** — `SettingsRow.data` still holds providers + pins +
  roles + production_configs. JV providers are server-internal (renderer uses
  `/v1/llm-providers`) so they mirror JW Unit 1; JV **routing** needs a bigger
  convergence (JV mounts NO `/v1/ai/routing` router — its pins/roles flow through
  the renderer's `llmBackend`→settings; needs the routing+presets routers mounted
  + `llmBackend`/`QuickSetup` migrated). JV providers are USER data (no seed,
  `engines.llm` defaults `[]`) so its migration carries a clean-start-vs-preserve
  decision. This is the next AI-stack phase — do it with JV running + smoke-verified.

**Done + pushed:**
- `just-llm-runner` split into `runner/` (local llama.cpp) + `llm/` (cloud
  providers + dispatch + prompts, incl. `make_prompt_router`/`make_feature_router`).
- `@delebash/llm-ui` is plain JS, self-contained (own `client.js` + `lu-*`
  `styles.css` + `Lu*` primitives + `PromptLab.vue`); the old `ProviderBackend`
  adapter is deleted (the UI calls the same endpoints both apps mount).
- JW server adopted the shared prompt subsystem (its per-app duplicates deleted);
  feature prompts are DB-seeded + Lab-editable via `/v1/ai/prompts` + `/v1/ai/run`
  + `/v1/ai/stream`.
- ~~`PromptLab` mounted at JW `/ai-prompts`~~ → **REMOVED 2026-06-24** — per-feature
  prompt editing was absorbed into the Features workbench (see the 06-24 section).

**The A–F plan (JustWrite):**
- A ✅ shared prompt subsystem → `llm_runner`. B ✅ JW server adopts it.
- C 🔄 shared `@delebash/llm-ui`: **done** — PromptLab, ProviderForm (presets ·
  where-it-runs · model comboboxes via probe-models · test/save/delete),
  provider list (local/cloud rows), Usage stats, the bundled-runner model
  catalog (`GET /v1/llm-runner/models` + `LuModelCatalog.vue`: Model · Params ·
  Fit · Status · Load/Unload/Download, scoped to `local-llamacpp`), **and the
  Features routing table** (`/v1/ai/routing` + `FeaturesRouting.vue`: default
  LLM/embedding + Quick/Accuracy roles + per-feature provider▸model pins; wired
  so saved routing drives dispatch). Still to build — Quick Setup wizard,
  hardware presets, and the routing table's named-config / inline tune editor.
- D ✅ shared top-level **"AI"** menu area (`/ai` → `AiView` host chrome
  [PaneHeader + `.pane-card`] wrapping the naked `AiModelsArea`); sidebar entry.
- E ⬜ JW streaming features (writerAI / rag / characterChat) → `/v1/ai/stream`,
  then delete the old `/v1/llm/...` gateway (`api/llm.py`).

**Model-catalog deferrals** (built but honest gaps — no backend/data yet, NOT
skipped): numeric Fit score (needs the downloaded GGUF — `compute_fit`), per-
model delete-from-disk (no runner endpoint), free-form download-by-`repo:quant`
(manifest `/load` is id-only), and inline model-management for Ollama/LM-Studio
(they expose no per-model VRAM to score Fit; they keep the Fetch combobox).

**Features-routing deferrals / cleanup:** named production-configs (the table's
"Active config" column), the inline tune editor's max-tokens + Lab-compare, and
the 3-alternative-drafting toggle. **Cleanup owed (RULE #8):** JW's old
`SettingsView.vue` AI-features section now duplicates the shared Features tab
(both read/write the same `ai` settings blob) — remove that section + the
renderer's `AI_FEATURES` once the shared tab is accepted. The server feature
catalog (`feature_catalog.py`) is the single source; `DEFAULT_FEATURE_ROLES`
derives from it.

## Active plan docs
- `docs/plans/2026-06-20-shared-ai-stack-plan.md` — **authoritative** AI-stack plan (20 decisions).
- `docs/plans/2026-06-21-feature-prompts-db-seed.md` — feature-prompts-in-DB design (headless-first).
- `docs/plans/2026-06-20-engines-llmui-cutover-boundary.md` — per-surface cutover tables (kept for reference).
- `docs/plans/2026-06-20-cross-app-convergence.md` — structural convergence (DONE).
- `docs/plans/2026-06-18-jw-server-migration.md` — JW Python-server migration (DONE).
- `docs/plans/2026-06-18-unified-storage-no-idb.md` — storage rewrite, no IndexedDB (DONE).
- `docs/plans/2026-06-18-server-side-llm-architecture.md` — ⚠️ superseded by the 2026-06-20 shared-ai-stack plan.

## Next up — agreed plan + live constraints (2026-06-21 cont.)

Remaining roadmap, in dependency order. **Core principle (user, reaffirmed): no
per-app duplication — anything both apps need lives in the SHARED stack.**

1. ✅ **DONE** — manifest now carries 6 user-provided GGUF models (`runner-manifest.json`):
   Qwen3.5 9B (Q4_K_S/Q4_K_M), Qwen3 14B (Q3_K_M/Q4_K_M), Qwen3.6 27B-MTP (Q4_K_M),
   + the seed 35B-A3B MoE. VRAM/RAM are coarse Fit estimates. To add more: paste
   `hf download hf://org/repo/file.gguf` lines (I parse repo+quant) — HF is still
   bot-blocked for my tooling, so **never fabricate IDs (RULE #4)**; the user
   provides them or opens HF egress for a fresh session.
2. ✅ **DONE** — shared **Quick Setup** (Fit-based) shipped in `@delebash/llm-ui`
   (`ui/src/views/QuickSetup.vue`), mounted atop AiModelsArea's Providers tab; on
   Apply it sets default+Quick+Accuracy roles via `/v1/ai/routing` and loads the
   Quick model. JW's Ollama-pull subsystem (QuickSetup.vue + HardwarePresetsCard.vue
   + ollamaAdmin/quickSetupPresets/hardwarePresets) was **deleted** (commit
   `46adb65`); the dead `applyQuickSetupPreset`/`quickSetupTiers` were removed in
   Phase 5 (`be43d4c`).
3. ✅ **Hardware presets → shared DONE** (runner `b77341c`, JW `40a1e91`,
   2026-06-22). Named routing snapshots (default + roles + per-feature pins),
   save/apply/rename/delete — switch the whole AI config in one click (Decision
   18; the manual escape hatch to auto-Fit). Shared `make_routing_presets_router`
   (CRUD + `/from-current` snapshot + `/{id}/apply` → writes the active
   RoutingStore) mirrors the `/v1/ai/routing` store pattern; JW `JwRoutingPresetStore`
   persists them in the `ai` blob (`routingPresets`). UI `RoutingPresets.vue`
   ("Saved configs") in AiModelsArea's **Features** tab (applying remounts the
   routing table). Verified: 82 runner + 82 JW pytest, ruff/build/smoke clean,
   CRUD+apply confirmed on the live server.

   **Fit engine ✅ replaced** (just-llm-runner `9737af5`, 2026-06-22): the runner's
   hand-rolled VRAM fit → the **oobabooga GGUF VRAM formula** (re-implemented in
   `runner/fit.py`, cited; GQA-aware KV via new `gguf.n_kv_heads`; coarse catalog
   band computes from params×quant so models need no hand-tuned `minVramMb`). OOM
   back-off stays the safety net. This was an **adopt-before-build research pass**
   that also added global **RULE #7 §D** (research existing tools before rolling
   our own). Evaluated + rejected as deps: **llmfit**/**whichllm** (mature MIT
   recommenders but DB-bound — no arbitrary-GGUF fit, advisory-only) and
   **llmserve** (pre-alpha v0.0.7 TUI launcher); **llm-checker** NPDL / Ashish
   tool no-license → not borrowable. Formula chosen because it's data-derived
   (~19.5k measurements) + license-clean to re-implement.
4. ✅ **DONE (conservative)** — commit `3e4ea83`. Removed the provably-duplicated
   parts from `SettingsView.vue`'s `id="audio"` section (provider list,
   Default-LLM/embedding pickers, Feature-routing table, Quick-setup-tips) + all
   the dead script behind them + the orphaned `SettingsProviderForm.vue`. KEPT
   the writing-specific knobs (Quick setup [trigger re-homed to a slim "Local
   model setup" card], Hardware presets, embeddings/RAG toggle, 3-alt streaming,
   Voice canon); added an "Open AI menu" pointer; renamed the section "AI
   engines" → "Writing AI". Deferred tidy: the now-unused `settings.audio.*`
   i18n keys across locale files (harmless; remove in an i18n sweep). Moving
   QuickSetup + HardwarePresets fully INTO `/ai` is still #2/#3 (gated on #1).
5. ✅ **E — `/v1/llm` gateway RETIRED** (all 5 phases done; full plan:
   `docs/plans/2026-06-22-jw-gateway-retirement.md`). JW's LLM + embeddings now
   run entirely through the shared `just-llm-runner` dispatch
   (`/v1/ai/run|stream|embeddings` + `/v1/llm-providers`); the per-app gateway,
   `openai-compat.js`, and `aiStream.js` are deleted.
   - ✅ **Phase 1 — shared embeddings backend** (just-llm-runner `6c02d5c`):
     adapter `embed()` (OpenAICompat `/embeddings` + Ollama `/api/embed`) + `POST
     /v1/ai/embeddings` + tests. The keystone — the shared stack had no
     embeddings, which blocked deleting the gateway's `/embeddings` proxy.
   - ✅ **Phase 2** (`096f80f`) — `useModelList` → `GET /v1/llm-providers/{id}/models`
     (plain ids → cache shape); removed the dead `ai.ping`/`pingClientFor`/`status`
     + the unused OpenAICompatClient import in ai.js.
   - ✅ **Phase 3** (`6081c2e`) — RAG embeddings → `services/embedApi.js`
     (`embedTexts` → `POST /v1/ai/embeddings`); repointed `rag/indexer.js`,
     `rag/chat.js`, `rag/characterChat.js`; dropped their OpenAICompatClient import
     (chat path still on `runAiStream` → Phase 4).
   - 🔄 **Phase 4 (Option A — prompts into server DB, feature-by-feature):**
     - ✅ **4a writerAI** (`0a77001` + `6e49081`) — 13 `writerAI.*` feature_prompts
       (5 actions + guided-continue + 7 rules); `writerAI.js` sends
       `{action, variables:{passage, voiceCanon[, direction]}}` via
       `runAiFeatureStream`; instructions deleted client-side; per-call
       temperature override added for variations. Verified prompts render
       byte-for-byte vs the old client; `/v1/ai/stream` dispatches it.
     - ✅ **4b manuscript chat** + **4c character chat** (`a87f7d0`, runner
       `cf31db8`) — seeded `chat` + `characterChat` prompts; clients retrieve +
       format the cited `{{excerpts}}` and send `{question, excerpts}` + history
       via `runAiFeatureStream`. Added multi-turn `history` to `/v1/ai/{run,stream}`
       (RunRequest + `_history_messages`). characterChat's framing + RULES are
       Lab-editable; the per-character profile rides in `{{characterProfile}}`.
       Verified byte-for-byte (chat; characterChat full + name-only).
   - ✅ **Phase 5** (`be43d4c`) — deleted `api/llm.py` (+ mount + test),
     `services/openai-compat.js`, `services/aiStream.js`, and the dead
     `stores/ai.js` `applyQuickSetupPreset`/`quickSetupTiers`. KEPT
     `providerBackend.js` (it's the shared `/v1/llm-providers` CRUD client, not a
     gateway consumer — earlier plan was wrong; verified before deleting).

After JW proves the shared GUI: **JustVoice adopts the identical `@delebash/llm-ui`
views + layers TTS**; JV also still has per-app duplicate prompt/provider
machinery to lift to the shared package (same Keystone treatment JW got).

## Where detail lives
- Deep per-task detail → `docs/plans/*`. Architecture + rules → `CLAUDE.md` +
  global `~/.claude/CLAUDE.md`. The JustWrite↔JustVoice HTTP boundary →
  `CONTRACT.md` in the JustVoice repo.
