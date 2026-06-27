# Morning Recap — JustWrite

> The in-repo session-pickup **MAP** — current state + backlog + an index into the
> deep docs. Read it after the global `~/.claude/CLAUDE.md` and this repo's
> `CLAUDE.md`. **This is a map, not a log:** stable architecture + rules live in
> `CLAUDE.md`; deep per-task detail lives in `docs/plans/*` — this file POINTS to
> them, it does not duplicate them (a copy drifts).

**Branch (all repos):** `claude/admiring-galileo-il3q0o`.

---

## Current state (2026-06-27) — DESIGN LOCKED, about to build

**The authoritative build plan: `docs/plans/2026-06-27-switch-and-preset-architecture.md`**
(LOCKED). The **Profile + Feature** architecture:
- a **Profile** = a named **model + switches** "engine" — the editable list (= the library) AND
  the routing target a feature points at. (It IS today's `job` + its model + switches; UI-named
  "Profile", internal code stays `job` — rename deferred.)
- a **Feature** = system/user **prompt + sampler params + a Profile pointer** + a minimal test.
- **switches (Plane-1) and samplers (Plane-2) share ONE `<KnobGrid>`** — a key-value editor + a
  seeded `knob_catalog` (DATA), so a new llama.cpp param needs **no code** (D15). Storage =
  key-value rows, **no JSON blobs**.
- carries the full **decision log D1–D15** (with the alternatives kept, not just the landing),
  the **source-verified Plane-2 sampler surface** (§8, ~30 llama.cpp params), and the **build
  stages** (Track A in-container · Track B GPU). **Parked:** the user's QuickSetup concern (raise
  before touching routing).

For where the CODE stands today (done/stub/missing + file:line): `docs/plans/2026-06-27-llm-status-index.md`
(2 confirmers "trustworthy"). Pre-design pickup: `2026-06-27-session-handoff.md`. The older
`2026-06-27-switch-param-lab.md` + the design-doc ✅/⏳ markers are **superseded** for switches /
presets / samplers by the architecture plan above.

**Model catalog + recommendations research (2026-06-27) — the data foundation the lab/QuickSetup/
routing read from.** `docs/plans/2026-06-27-model-catalog-research-and-recommendations.md`
(+ `-evidence.md` raw claims): two `/deep-research` runs + a 3-reviewer consensus panel decided
the local-GGUF catalog across the FULL hardware range — **floor = CPU 32 GB RAM / GPU 8 GB+32 GB,
NO upper cap**. Final catalog = keep 4 Qwen anchors + **add** Mistral-Small-3.2-24B (dense no-thinking
JSON extraction) + Gemma-4-12B (2nd 8 GB family) + high-end GLM-4.5-Air (MIT) / Qwen3-235B (Apache,
cloud-class prose) / Llama-4-Scout; **drop** 2 redundant quant rows; fix the 35B-A3B to a 32 GB-RAM
floor model. Includes a **COMPLETE per-job × per-tier matrix (no blank cells)**, per-model-type
**switch sets** (dense = base+MTP; MoE = base + `--n-cpu-moe`, spec = measure-per-machine), and the
**#20 tuning-UI build plan**. Speaker attribution (LLM): `2026-06-27-speaker-attribution-llm-research.md`
— LLM zero-shot CoT is SOTA; the whole-chunk numbered-quote recipe + a character-roster step; 8B
*fails* implicit quotes → route to 35B-A3B+/cloud. Audiobook-converter feature mining parked for JV:
`JustVoice/docs/plans/2026-06-27-audiobook-tools-research-todo.md`. **adds/drops APPROVED; the seed.py
BUILD is pending go-ahead.** Micro-decision applied (user can flip): chat floor defaults to the fast
Qwen3.5-9B + a 35B-A3B "smarter chat" toggle; the other 4 jobs default to 35B-A3B at the floor.

Scope right now is **the LLM stack + the job/feature LAB only — JustVoice is out of scope
(later)**. The shared-LLM job-native move shipped earlier (job replaced role end-to-end; all
LLM code lives in `just-llm-runner`; JW is a thin `install_llm` consumer) and JustWrite's LLM
stack is largely built + tested. BUT the **LAB is NOT built** (no ConfigColumn / Compare /
JobPreset / switch-string field / tok-s; `FeatureWorkbench.vue` is only the single-column
precursor), the per-job/per-feature/per-hardware **switch-override tables have ZERO readers**
(schema shipped, wiring didn't), the §6.6 "switches are a string in the lab, not in Providers"
rip-out is not started, and router mode (#27) + residency planner (#29) are unbuilt (the
single-model baseline is solid). Real stubs/bugs were found (per-row Test always fails;
Ollama/Gemini drop params; token stat reads 0) — see the index. (The "dead ProductionConfig
layer" entry was re-examined and found MISLABELED: it's a live, tested shared layer consumed by
JV's speaker_attribution; JW's config_builder just doesn't populate it yet — a planned convergence
delta, not dead code. Do NOT remove it.)

**Working bar (the user's standing rule — this is the DEFAULT, do not make them re-ask):** be
professional, no skim, no quick way out, NEVER guess — read the code line-by-line and cite
file:line, reuse or make reusable components (never copy-paste logic), nothing hardcoded,
**save docs without asking** (it's the rule), never mark "done" without the file:line proving
it isn't a stub, and verify load-bearing calls with an independent pass (the `rules-checker`
agent or a verification workflow — "other yous confirm").

**Rules-as-checks gates are UNHOOKED** (user's call, 2026-06-26): `~/.claude/settings.json` =
`{}` so no gate fires (backup at `settings.json.hooked.bak`; re-enable with `FORCE=1 bash
claude-config/install.sh`). The plain T1–T12 in `~/.claude/CLAUDE.md` still govern, followed by
reading them. So commits need no rules-checker verdict right now. The Reset bug was fixed
(`data_admin._reset` drops+recreates+reseeds, not row-delete — commit `677d165`).

## Two plan tracks (the work splits in two; approve + build + review EACH, in sequence)
The user split the active work into two separate plans (2026-06-26), handled one at a
time: present a plan → user approves → I build → user reviews → next plan.
- **PLAN 1 — Dev-process / rules-as-checks** (global; governs every repo).
  → `claude-config/RULES-AS-CHECKS-V2-PLAN.md`. **v2 SHIPPED (commit `b43411e`)** + **v3
  SHIPPED (this turn): the AGENT is the judge at commit.** v2 = one shared registry
  (`hooks/_rules.py`) + verify-gate / pre-action / task-gate refactored onto it +
  `commit-gate.py` + committed `hooks/test_gates.py` + gate-stats imports the ids. **v3 =
  the COMMIT boundary now requires a GENUINE independent rules-checker AGENT all-pass
  verdict** — `agent_pass()` reads PASS/FAIL only from the agent's OWN harness-authored
  result (a `tool_result` tied to an Agent call, or a `<task-notification>`), NOT from
  self-typed text — closing the self-certification hole the user found (a typed
  "VERDICT: PASS" no longer clears a code commit). **The LIVE `~/.claude` is v3**
  (`FORCE=1 install.sh` applied). Live-system docs: `claude-config/README.md` +
  `claude-config/EFFECTIVENESS.md`; the rules: `~/.claude/CLAUDE.md` (slim T1–T12) +
  `rules-detail.md`. The "why the rules fail" rationale belongs to THIS track.
- **PLAN 2 — App (JustWrite / JustVoice)** — the product work.
  → `docs/plans/2026-06-25-jobs-architecture-design.md` (jobs/switches + build log, §0–§17)
  + the **Backlog** below (#27/#29 router/step-4, #32 component audit, #33 jobs grid,
  #20/#21…). The dropdown fix / reuse gate / #32 / #33 (§17.1–17.3, 17.5) are app work.

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
  ExitPlanMode → run the checker panel) + a **commit gate** `commit-gate.py` (PreToolUse Bash:
  a code `git commit` is HARD-DENIED until docs **+** a GENUINE rules-checker AGENT all-pass
  verdict — read from the agent's OWN result, not self-typed; v3, closes the self-cert hole) +
  the **rules-checker subagent** (Opus; a 2–3 panel
  for load-bearing design). Effectiveness tracked in `claude-config/EFFECTIVENESS.md`
  (catches/false-positives/misses). All fail-open. **Real plan = Plan mode + detailed Task
  entries** (not a chat plan) — that's what fires the plan/task events.

## Recently shipped (newest first — detail in the linked doc)
- **#33 — Routing-by-job is a grid** (kit `RoutingByJob.vue`, this session): jobs render as a
  `UiTable` (job · model picker · Used-for · Edit/Delete) with add/edit via `AppModal`, reusing
  the `RecommendationsEditor` table+modal pattern (not a copy). All prior behavior kept (Defaults,
  per-job model, add/rename/delete/reset, `chat` un-deletable). Verified: build:vite + headless
  smoke (Routing-by-job tab renders, 0 JS errors) + kit jscpd 0.88% < 1.5%.
- **Rules-as-checks v3 — the AGENT is the judge at commit** (claude-config `cfb4924`; obs
  note `ac80912`; LIVE): closed the self-certification hole the user found — a CODE `git
  commit` now requires a GENUINE independent rules-checker AGENT all-pass verdict
  (`_rules.agent_pass()` reads PASS/FAIL from the agent's OWN harness result — a tool_result
  tied to an Agent call, or a `<task-notification>` — NOT from self-typed text). Dogfood: the
  live gate's first run returned FAIL + caught this recap + the plan doc stale → fixed →
  re-run PASS. **On TRIAL ("live with it"); friction tracked in `EFFECTIVENESS.md`** (first
  finding: a chained `git add && git commit` is conservatively gated — stage docs separately).
- **Rules-as-checks v2 — one shared registry + commit boundary + anti-skim** (claude-config
  `b43411e`, doc fix `8349e19`): regexes/turn-scan/rule-list moved into ONE `hooks/_rules.py`
  (killed the triplication; rule id == gate-stats key); verify-gate/pre-action/task-gate
  refactored onto it; NEW `commit-gate.py`; narrowed the pre-task deny (.md/trivial exempt +
  task-notification turn-window fix); committed `hooks/test_gates.py` harness. Panel found +
  fixed 2 commit-classifier bugs pre-ship.
- **Rules-as-checks v1 — the system** (claude-config `d5e9d52`/`8c36a48`/`ad9a4f9`; activated
  live): the global rules reworked from ~50k of prose into 12 checkable tests
  (T1–T12) enforced at mechanical events — PreToolUse (pre-task DENY + per-edit nudge),
  Stop (Blocks 0–5), `TaskCreated`/`TaskCompleted` gates — plus an Opus **rules-checker**
  subagent (a 2–3 **panel** for load-bearing design) and an effectiveness ledger.
  Dogfooded: the panel found + fixed **8 issues in the system itself** (incl. a
  narration-bypass of the blocking gates). → `claude-config/README.md` +
  `claude-config/EFFECTIVENESS.md`; the meta-rationale is design §17.4.
- **Recommendations dropdown fix + the reuse gate** (runner `658936e` / JW `ed3b3e6`,
  smoke-verified): the hardcoded `SUGGESTED_JOBS` became the shared **`LuJobSelect`**
  (live `/v1/ai/jobs`), converged across `RecommendationsEditor` + `FeatureWorkbench`;
  plus **jscpd** as a copy-paste gate + `check-shared-pickers`. → design §17. (Jobs-as-grid
  is **#33**; the old **#32** view-convergence was DROPPED — see backlog.)
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

**The switch/param LAB (user, 2026-06-27 — supersedes Decision 23's Providers placement; design §6.6):**
switches + params are edited/tested ONLY in a Features-style **lab** — model + a **switch-STRING
textbox** (freeform; no per-flag boxes; a new llama.cpp flag = edit the string, no code/GUI change)
+ params + prompt → test (tok/s, output) → **save preset** → **promote to production** (same
lifecycle as feature prompts). **NO switch editing in the Providers tab** — rip out the per-model
switch sub-editor + the base/moe/mtp preset cards from the model manager. **#21** = that lab
(multi-column Compare + JobPreset + promote; 2-up + h-scroll; needs a live model to fully test).
**#20** (a separate per-model tuning UI in Providers) is **FOLDED INTO the lab**, not its own
screen. (✅ **#22** per-action sampling/top-p + **#18** structured-output JSON shipped — runner `900e20c`.)

**✅ DONE — Recommendations job dropdown + the REUSE gate (design §17):** the stale
hardcoded `SUGGESTED_JOBS` was replaced by the shared **`LuJobSelect`** (live
`/v1/ai/jobs`), wired into BOTH `RecommendationsEditor` AND `FeatureWorkbench` (which
had its OWN native `<select>` over jobs — converged). Verified green: build + smoke
(incl. a behavior gate: add a job → it appears). **Reuse gate** (user-driven, the
real point — "a pro extracts a component, doesn't copy code"): adopted **jscpd**
(made JW's DEAD `threshold:10` config real at 3.5%; kit 1.5%; `npm run dup` both
repos; in the smoke prelude) + a `check-shared-pickers` structural check (job picker
only in `LuJobSelect`; fails on a hand-rolled copy). → design §17.5.
- **#32 — DROPPED (user, 2026-06-26):** `LocationsView`↔`ObjectsView` are near-identical
  TODAY but are intentionally-separate **views that may diverge** (location- vs
  object-specific affordances) — NOT forced into one shared component (premature
  abstraction rejected). Parallel views ≠ duplicated logic.
- **✅ #33 DONE** (this session): Routing-by-job renders jobs as a `UiTable` grid (job · model
  picker · Used-for · Edit/Delete) + add/edit via `AppModal`, reusing the `RecommendationsEditor`
  pattern. Verified: build + smoke + kit jscpd.
- **#34 (user, 2026-06-26) — redundant New-entity flow + UX audit:** clicking **New** on
  an entity (location/object/character/…) opens a `promptDialog` asking only for the NAME
  (`services/entityMeta.js` `NEW_ENTITY_META`, used by `addLocation`/`addObject`/… + the
  sidebar add), THEN shows the detail page — a redundant extra popup. Instead: open the
  detail page directly (create with a placeholder name) and **validate-before-save** there.
  **First AUDIT** the whole app for this + any similar double-step / redundant-popup flow
  and REPORT findings (RULE #5 per-surface table) for review BEFORE changing anything.

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
- `docs/plans/2026-06-27-llm-status-index.md` — **★ CODE-VERIFIED LLM STATUS** (2026-06-27): 10 agents read the actual code + 2 confirmers (both "trustworthy") → every LLM piece done/partial/**STUB**/missing with file:line. **THE "where we left off" for LLM.** Caught real stubs (per-row Test always fails; per-job/feature/hardware switch tables have ZERO readers; Ollama/Gemini drop params; JV broken).
- `docs/plans/2026-06-27-switch-and-preset-architecture.md` — **★ THE CURRENT SWITCH+PRESET PLAN** (PROPOSED, under review 2026-06-27; code-verified + 3-checker panel folded in): full-bundle preset (model+switches+params+prompt) built/tested/saved in the lab + routed to a job; freeze-flat; preset is the loadable unit (new `resolve_preset_switches` + `preset_id` load branch); type-defaults = pre-fill baseline; model identity auto-detected from the GGUF → drives type presets; drop `model_switches`/`job_route_switches`/`pin_switches`; provider form = connection+catalog only. Supersedes the switch/§6.6/JobPreset parts of the two docs below.
- `docs/plans/2026-06-27-switch-param-lab.md` — the lab MECHANICS (ConfigColumn / Compare / tok-s) — carried forward into the architecture plan above; its switch-placement + JobPreset sections are superseded by it.
- `docs/plans/2026-06-27-complete-remaining-plan.md` — the 339-item audit of all 17 plan docs (doc-derived, **NOT code-verified** — superseded for the LLM area by the status-index above; keep for non-LLM breadth only).
- `docs/plans/2026-06-25-jobs-architecture-design.md` — **authoritative** jobs design (§0–§14; + §17 = the dropdown fix / reuse gate / rules-as-checks rationale).
- `claude-config/RULES-AS-CHECKS-V2-PLAN.md` — **Plan 1** (rules-as-checks) + its v2 & v3 **Build-outcome** record (the agent-as-judge fix); shipped + in observation.
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
