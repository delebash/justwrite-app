# Morning Recap — JustWrite

> The in-repo session-pickup **MAP** — current state + backlog + an index into the
> deep docs. Read it after the global `~/.claude/CLAUDE.md` and this repo's
> `CLAUDE.md`. **This is a map, not a log:** stable architecture + rules live in
> `CLAUDE.md`; deep per-task detail lives in `docs/plans/*` — this file POINTS to
> them, it does not duplicate them (a copy drifts).

**Branch (all repos):** `claude/admiring-galileo-il3q0o`.

---

## Current state (2026-06-26)

**The shared-LLM job-native move is DONE** — `job` REPLACES `role`; ALL LLM code is
shared; JustWrite is a thin consumer. Green + pushed.

- **What it is:** the whole LLM stack (the 12 tables, stores, dispatch,
  `config_builder`, the API routers, the usage sink, pricing, the GUI, the seed
  mechanism) lives in `just-llm-runner`. Any app drops it in with ONE
  `install_llm(app, engine, session_factory, feature_catalog, feature_prompts,
  feature_jobs)` call + its 3 feature seeds. **JW now has zero LLM code except its
  feature seeds.** `job` (a user-editable list seeded chat/prose/extraction/analysis)
  replaced the fixed quick/accuracy roles end-to-end (schema/dispatch/routing/GUI).
- **Commits:** just-llm-runner `7232214` (shared stack + `install_llm`) · `5e5005a`
  (job-native GUI + two-base backup + FK fix) · `c0ddfc8` (QuickSetup leftover fix).
  justwrite-app `adec065` (thin consumer) · `a34f955` (rules-gate `resume` fix).
- **Verified:** runner 102 pytest + JW 77 pytest + ruff (both); JW renderer build +
  headless smoke (every route, zero JS errors) + live tab-render of the Jobs cards;
  live server job-native (`/v1/ai/jobs` seeded, routing shape `[default,jobs,pins]`,
  7 providers).
- ➡️ **Detail:** `docs/plans/2026-06-25-jobs-architecture-design.md` (§0–§14, the full
  design) + `docs/plans/2026-06-26-llm-shared-move-cascade-audit.md` (drop-in build
  order + the ~25-file cascade).

## Standing rules (load-bearing — do not re-litigate)
- **NOTHING hardcoded:** every value/threshold/name/mapping/flag/preset lives in the
  **DB**, seeded + user-editable. No `manifest.json` config, no files on disk. Code is
  only the engine (hardware detect · the VRAM fit formula · the flag merge · process spawn).
- **NO JSON blobs in SQL:** relational/fixed-schema data = real columns/rows. JSON only
  for genuinely freeform data with a cited reason (vectors→packed binary; snapshots/
  tombstones like `chapter_versions.scenes`/`trash.payload`; variable AI artifacts; the
  heterogeneous settings `ui` doc) — and flagged.
- **Operating mode (zero-trust):** grounded recommendations (receipt + counter-case),
  the USER decides; don't barrel (stop after units, surface decisions); audit the full
  cascade file-by-file before a big refactor; think 4×; verify line-by-line; build the
  clean shared component (don't optimize "JV-safe").
- **DB policy:** drop + reseed, no migrations (pre-release; `docs/plans/2026-06-18-unified-storage-no-idb.md`).
- **Hard gates** (`~/.claude/hooks/verify-gate.py`): Block 0 = re-read rules + this recap
  + project `CLAUDE.md` after a compact/clear/startup (NOT `resume` — that reloads context
  intact, fixed 2026-06-26); Block 1 = code claim w/ zero reads; Block 2 = storage/arch
  reco w/o a cited precedent; Block 3 = "done" + code-edit w/o a doc. Fail-open; 5-reblock failsafe.

## Recently shipped (newest first — detail in the linked doc)
- **Shared-LLM job move** — see *Current state*.
- **Catalog / switches / recommendations → DB** (runner `490e7a5` / JW `c70d44c`): the
  downloadable model catalog left `runner-manifest.json` for `model_catalog` +
  `model_switches` + `model_recommendations` tables. → `docs/plans/2026-06-25-llm-catalog-db-cutover.md`.
- **Platform settings shared** (U1–U4): AI consolidation, the usage ledger, Data
  backup/restore/reset, Server/Logs/Updates/Appearance. → `docs/plans/2026-06-24-shared-platform-settings.md`.
- **`/v1/llm` gateway retired** (all phases) — JW LLM + embeddings run through the shared
  dispatch (`/v1/ai/run|stream|embeddings`). → `docs/plans/2026-06-22-jw-gateway-retirement.md`.
- **AI ▸ Features UX pass** — `FeatureWorkbench` is the ONE AI config+test surface
  (per-action prompts/presets/test; Writer Lab + `/ai-prompts` deleted); category-grouped
  nav; point-of-use names. → `docs/plans/2026-06-20-shared-ai-stack-plan.md`.
- **Hardware presets + Fit engine shared** (runner `b77341c`/`9737af5`) — the oobabooga
  GGUF VRAM formula (cited; ~19.5k measurements) replaced the hand-rolled fit.
- **#19 `Overrides` through `/v1/llm-runner/load`** (`e5cecef`) — the switch-tuning foundation.

## Backlog (ordered; pointers where detail exists)
**Finish jobs in the UI — the §9 GUI gaps deferred during the move:**
- A dedicated **"Routing by job" tab** + rename the **"Features" tab → "Routing by feature"**
  + a **job-list editor** (add/rename/remove jobs over the existing `/v1/ai/jobs` CRUD).
  (Today `FeatureWorkbench`'s Jobs cards + the per-feature job dropdown already do job→model;
  this is the dedicated surface + the job CRUD UI.) → design doc §9.
- **#30 model-catalog/switches editor UI** — grow `LuModelCatalog` into a manager: **+Add
  model** (paste HF) + edit catalog fields + edit per-model switches. (No UI edits
  `/v1/ai/model-catalog` or `/v1/ai/model-switches` yet.)

**Switches phase (design §4/§6 — NOT built):** `switch_presets` (by model type) +
`flag_catalog` (the one on/off-vs-value bit) + per-hardware rules + `job_presets`; per-job
**switches + sampling** (a job today = provider+model only). → design doc §4/§6.

**Runner / residency:** **#27** router mode (`RunnerService` `--models-preset`, replaces
spawn-per-model) → **#29** residency manager (`--models-max`; cross-kind LLM⟷TTS VRAM
coordination). → `just-llm-runner/docs/plans/2026-06-24-server-model-management-brief.md`.

**Compare / testing:** **#21** job-lab multi-column Compare + persistent JobPreset + promote
(2-up + horizontal scroll; Decision 23). **#20** per-model tuning UI (n_cpu_moe/n_gpu_layers/
ctx + tok/s). **#22** per-action sampling/reasoning (Plane 2). **#18** structured-output (JSON) per action.

**Other:** **#25** curate `model_recommendations` (cited per-job picks). **#28** follow-up
research (measured per-tier benchmarks — the run-2 gap). **#24** temp speaker_attribution +
entity_extraction scaffold. **#23** shared AI task queue → `@delebash/llm-ui`. Per-feature
flags (writerAI 3-variation / voice-canon — discuss which to expose). Cleanup: unused
`PromptLab.vue`; the now-UI-less routing-presets endpoints. **Updates/Changelog** panel (U4 ⏳).
**#26 lean docs** — recap leaned 2026-06-26; CLAUDE.md tightened (Option A) same day.

**JustVoice adoption (later):** JV runs a parallel, older AI stack (NOT on
`FeatureWorkbench`/`AiModelsArea`). Drop-in = delete `engines/llm/*` + call `install_llm`
with JV's feature seeds + run seed. Plus: (a) JV supplies its catalog values (`category` +
per-action point-of-use labels for Compose/Rewrite/Analyze/Smart-assign/…); (b) align JV's
point-of-use surfaces to those names; (c) the shared `ProviderForm` needs a TTS-capability
section before JV drops its forked `ProviderForm.vue`; (d) JV has TWO QuickSetups (TTS+LLM)
to reconcile; (e) **U5** platform settings (mount `make_data_router` with audio asset dirs;
GPU/Hardware → the AI menu). → JV checklist in `docs/plans/2026-06-24-shared-platform-settings.md`.

**Key technical facts that must survive** (the "why"; full detail in
`just-llm-runner/docs/plans/2026-06-24-llamacpp-switches.md`):
1. MoE + `--n-cpu-moe` runs a 35B-A3B on a **6 GB** card if RAM ≥ ~24 GB — the budget pick
   for hard tasks (attribution/extraction); `-ncmoe` is MoE-only (doesn't help a dense 14B).
2. Speculative decode (MTP) **helps DENSE** (+40% on a 27B) but **LOSES on the 35B-A3B MoE**
   in llama.cpp → spec ON for dense, OFF for MoE (seeded: 35B `spec_type=none`, 27B `draft-mtp`).
3. **Two config planes:** engine launch flags (per-model load → reload) vs per-request
   sampling/JSON/reasoning (per-action → no reload). Don't conflate.
4. llama.cpp **router mode** (`--models-preset`/`--models-max`, no `-m`) swaps MODELS live;
   only changing a switch VALUE needs a (re)start.

## Active plan docs (the index)
- `docs/plans/2026-06-25-jobs-architecture-design.md` — **authoritative** jobs design (§0–§14).
- `docs/plans/2026-06-26-llm-shared-move-cascade-audit.md` — the move: drop-in build order + cascade.
- `docs/plans/2026-06-25-llm-catalog-db-cutover.md` — catalog/switches/recs → DB.
- `docs/plans/2026-06-24-shared-platform-settings.md` — platform-settings convergence + the JV checklist.
- `docs/plans/2026-06-20-shared-ai-stack-plan.md` — the 20-decision shared-AI-stack plan.
- `docs/plans/2026-06-22-jw-gateway-retirement.md` — `/v1/llm` gateway retirement.
- `docs/plans/2026-06-21-feature-prompts-db-seed.md` — feature-prompts-in-DB design.
- `docs/plans/2026-06-24-local-model-recommendations.md` — model-by-task chart (cited boards).
- `just-llm-runner/docs/plans/2026-06-24-server-model-management-brief.md` — runner / residency / router.
- `just-llm-runner/docs/plans/2026-06-24-llamacpp-switches.md` — every engine switch (two planes), cited.
- `just-llm-runner/docs/plans/2026-06-24-quicksetup-redesign.md` — the QuickSetup wizard design.

## Where detail lives
Deep per-task detail → `docs/plans/*` (both repos). Architecture + rules → this repo's
`CLAUDE.md` + the global `~/.claude/CLAUDE.md`. The JustWrite↔JustVoice HTTP boundary →
`CONTRACT.md` in the JustVoice repo.
