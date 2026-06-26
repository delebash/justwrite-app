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
- **Hard gates** — now the **rules-as-checks system** (built 2026-06-26, provisioned from
  `claude-config/`; full detail in `claude-config/README.md`). The rules are the slim
  **rule-tests T1–T12** (`~/.claude/CLAUDE.md`) + full WHY/incidents in `rules-detail.md`,
  read on demand. Enforcement at mechanical events: **Stop gate** `verify-gate.py` Blocks
  0–5 (0 = re-read rules/recap/project-CLAUDE after a compact/clear, NOT resume; 1 = code
  claim w/ zero reads; 2 = arch reco w/o precedent; 3 = "done"+code w/o a doc; 4 =
  plan/decision w/o a rules-pass; 5 = code-edit w/o a rules-pass) + a **PreToolUse hook**
  `pre-action-check.py` (pre-task DENY on the first edit w/o a rules-pass · per-edit nudge ·
  ExitPlanMode → run the checker panel) + the **rules-checker subagent** (Opus; a 2–3 panel
  for load-bearing design). Effectiveness tracked in `claude-config/EFFECTIVENESS.md`
  (catches/false-positives/misses). All fail-open. **Real plan = Plan mode + detailed Task
  entries** (not a chat plan) — that's what fires the plan/task events.

## Recently shipped (newest first — detail in the linked doc)
- **Rules-as-checks system** (claude-config `d5e9d52`/`8c36a48`/`ad9a4f9`; activated live
  this session): the global rules reworked from ~50k of prose into 12 checkable tests
  (T1–T12) enforced at mechanical events — PreToolUse (pre-task DENY + per-edit nudge),
  Stop (Blocks 0–5), `TaskCreated`/`TaskCompleted` gates — plus an Opus **rules-checker**
  subagent (a 2–3 **panel** for load-bearing design) and an effectiveness ledger.
  Dogfooded: the panel found + fixed **8 issues in the system itself** (incl. a
  narration-bypass of the blocking gates). → `claude-config/README.md` +
  `claude-config/EFFECTIVENESS.md`; the meta-rationale is design §17.4.
- **Recommendations dropdown fix + the reuse gate** (runner `658936e` / JW `ed3b3e6`,
  smoke-verified): the hardcoded `SUGGESTED_JOBS` became the shared **`LuJobSelect`**
  (live `/v1/ai/jobs`), converged across `RecommendationsEditor` + `FeatureWorkbench`;
  plus **jscpd** as a copy-paste gate + `check-shared-pickers`. → design §17; the jscpd
  findings (Locations↔Objects duplication) seed **#32**, jobs-as-grid is **#33**.
- **Switch editors + per-action Plane-2** (runner `edeae9a`/`43a40e7`/`900e20c`):
  the **model manager** (#30 — LuModelCatalog +Add/Edit `type`+per-model switches/
  Delete/Reset), the **`switch_presets` editor** (base/moe/mtp bundles editable), and
  **per-action JSON output (#18) + top-p (#22)** threaded end-to-end (Plane-2, via the
  adapter's `extra`). Verified: 115 runner + 77 JW pytest, build, smoke, CRUD curls.
- **§9 jobs GUI** (runner `28d3d6e`): "Routing by job" tab (Defaults + job→model cards
  + job-list editor) + "Features"→"Routing by feature" rename + `useRouting` composable.
- **Switches phase — server foundation** (runner `42f4057` data model + `9133c67`
  type presets + layered resolver). `model_catalog.type` + `switch_presets`/
  `preset_switches` + `job_route_switches`/`pin_switches`/`hardware_switches` tables;
  `switch_resolve.resolve_model_switches` layers base→type→mtp(not-if-moe)→per-model→
  per-hardware, wired into the runner `switches_fn` — the **MoE `spec:none` rule lives
  ONCE on the `moe` preset** (per-model copies removed). 107 runner + 77 JW pytest.
  ⏳ Remaining: the per-job/feature runtime apply (GPU-gated **step 4 / #27**), the
  manifest-`flagPresets` removal, and the switch **editor routers + GUI**. →
  `docs/plans/2026-06-25-jobs-architecture-design.md` §11-step-3 STATUS.
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
**✅ DONE — the §9 jobs-in-the-UI gaps (runner `28d3d6e`, smoke-verified):** the
dedicated **"Routing by job" tab** (Defaults + per-job model cards + the **job-list
editor**: add/rename/remove/reset over `/v1/ai/jobs`), the **"Features" → "Routing by
feature"** rename, and a shared `useRouting` composable. Job editor placed on
Routing-by-job (with the list) per the app's manage-where-listed pattern. → design §10.
- **✅ #30 model manager DONE** (runner `edeae9a`, smoke + CRUD-curl verified):
  `LuModelCatalog` grew into a manager — ＋Add model (paste HF repo:quant), Edit
  (catalog fields + the editable `type` + a per-model switches sub-editor), Delete,
  Reset-catalog. ✅ + a `switch_presets` editor (base/moe/mtp bundles editable, `43a40e7`).

**Switches phase (design §6 — data + presets + editors DONE; runtime is GPU-gated):**
✅ data model + type presets + `switch_resolve` (runner `42f4057`/`9133c67`); ✅ **editors**
— model `type` + per-model switches (#30, `edeae9a`) + the `switch_presets` editor
(`43a40e7`). ⏳ left: `flag_catalog` (optional), `job_presets`, the **per-job/per-feature
switch editors**, and the **runtime apply** of the per-job/feature override layers — all
gated on **step 4 / #27** (router/residency, needs a GPU to verify). → design §6 + §11.

**Runner / residency:** **#27** router mode (`RunnerService` `--models-preset`, replaces
spawn-per-model) → **#29** residency manager (`--models-max`; cross-kind LLM⟷TTS VRAM
coordination). → `just-llm-runner/docs/plans/2026-06-24-server-model-management-brief.md`.

**Compare / testing:** **#21** job-lab multi-column Compare + persistent JobPreset + promote
(2-up + horizontal scroll; Decision 23 — needs a live model). **#20** per-model tuning UI
(n_cpu_moe/n_gpu_layers/ctx + tok/s). (✅ **#22** per-action sampling/top-p + **#18**
structured-output JSON shipped — runner `900e20c`.)

**✅ DONE — Recommendations job dropdown + the REUSE gate (design §17):** the stale
hardcoded `SUGGESTED_JOBS` was replaced by the shared **`LuJobSelect`** (live
`/v1/ai/jobs`), wired into BOTH `RecommendationsEditor` AND `FeatureWorkbench` (which
had its OWN native `<select>` over jobs — converged). Verified green: build + smoke
(incl. a behavior gate: add a job → it appears). **Reuse gate** (user-driven, the
real point — "a pro extracts a component, doesn't copy code"): adopted **jscpd**
(made JW's DEAD `threshold:10` config real at 3.5%; kit 1.5%; `npm run dup` both
repos; in the smoke prelude) + a `check-shared-pickers` structural check (job picker
only in `LuJobSelect`; fails on a hand-rolled copy). → design §17.5.
- **#32 (copy-paste audit) — jscpd findings:** kit clean (0.88%); JW renderer 3.04%
  (221 clones), dominated by **`LocationsView`↔`ObjectsView`** (near-identical entity
  CRUD views → should be ONE parameterized component) + ImportView↔NotesView, etc.
  Ratchet the jscpd thresholds down as these converge.
- **#33** Routing-by-job: jobs as a grid (`UiTable`), not cards.

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
- `docs/plans/2026-06-25-jobs-architecture-design.md` — **authoritative** jobs design (§0–§14; + §17 = the dropdown fix / reuse gate / rules-as-checks rationale).
- `claude-config/README.md` — the **rules-as-checks** system (slim rules + event hooks + rules-checker + metrics); `claude-config/EFFECTIVENESS.md` = the effectiveness ledger.
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
