# Morning Recap — JustWrite

> # ⛔⛔ THE #1 OPERATING RULE — read this FIRST, every time ⛔⛔
> **NEVER act until the user literally types the word "go".** A question is ONLY a question —
> answer it in words, then STOP and WAIT. Do NOT read/grep, edit, spawn an agent, run a
> workflow, build, or commit until "go". **"It was only read-only" is NOT an excuse — do not
> start.** Approval for one step is NOT approval for the next; each new action needs its own go.
> Companion hard rules: ② show the user any agent/research prompt BEFORE sending it; ③ never
> stop a running job/agent unless the user says "stop"; ④ always confirm the plan + get the
> explicit go first; ⑤ never guess — read code line-by-line, cite file:line. *(The user has had
> to repeat #1 many times across 2026-06-27 — it is the top cause of lost trust. GET IT.)*

> The in-repo session-pickup **MAP** — current state + backlog + an index into the
> deep docs. Read it after the global `~/.claude/CLAUDE.md` and this repo's
> `CLAUDE.md`. **This is a map, not a log:** stable architecture + rules live in
> `CLAUDE.md`; deep per-task detail lives in `docs/plans/*` — this file POINTS to
> them, it does not duplicate them (a copy drifts).

**Branch (all repos):** `claude/admiring-galileo-il3q0o`.

---

## Current state (2026-06-29) — AI **Lab + Preset** model: redesign of routing/tuning (in progress)

> **The one current design doc for the AI config model is `just-llm-runner/docs/plans/2026-06-29-ai-lab-preset-model.md`.**
> Its ENTITIES + CASCADE are LOCKED and SUPERSEDE the job-centric routing in the 2026-06-28 master plan (AREA 1/2, the
> C1/C2/C3/C5 lab/switch resolutions, and the whole "Routing by job" engine screen). The master stays authoritative only
> for the model catalog / Fit / licensing / model research, which this redesign does not touch. The AI **screen structure**
> (which tabs, where assignment/tuning live) is being iterated by TRIAL-AND-ERROR (user, 2026-06-29 — "locking sorta of …
> trial and error testing different designs until we get it correct"), so the doc's **Trial iteration log** is the live
> authority for the current tabs/layout; the prose below records the stable model, not each trial. Its "LIVE TRACKER"
> status block is the single source of truth for where the build stands — read it before resuming AI work.

The redesign was worked out with the user over 2026-06-28/29 and replaces the job-centric model. The core idea: **the Lab
(the Tuning tab) is the single source of truth.** You build and TEST a complete engine config in the Lab and SAVE it as a
**preset** (a preset = model + frozen switches + params, with the two hardware fit-knobs `-ngl`/`--n-cpu-moe` auto-computed
at load, shown in the Lab, and user-overridable). A **feature** is then just a prompt that points at a preset. Presets are
assigned in bulk by **category** (the visible feature grouping already in the nav), with a global Default underneath and a
per-feature override on top — the cascade at call time is feature-override → category preset → global Default. The
Fast/Balanced/Best dial was dropped and the "job" concept was demoted (task-type survives only as the recommendation key);
there is no model-per-job routing layer anymore. The reasons, the entities, and the screen list are all written out in full
in the design doc; do not re-litigate them here.

**What is committed and verified (branch `claude/admiring-galileo-il3q0o`, in `just-llm-runner`).** The entire backend is
done, tested (178 runner pytest + ruff), and pushed: the data model (`engine_presets` plus the `engine_preset_switches` /
`engine_preset_samplers` children, plus `category_presets` and `feature_preset_refs`) in `llm_runner/llm/db.py`; the preset
API (`presets_api.py` — CRUD on `/v1/ai/engine-presets` and the default/category/feature assignment layers on
`/v1/ai/preset-assignments`); the stores (`stores.py`); the cascade resolver (`preset_resolve.py`); and the dispatch wiring
in `prompts.py`, where `run_feature`/`stream_feature` resolve the preset, overlay it onto the action's spec as an "effective
spec", and fall back to the legacy job/pin routing when no preset is assigned so nothing breaks mid-migration. The UI rework
is also committed: Routing-by-feature was slimmed to just the feature's prompt + an engine-preset picker (`ecc9e87`); the
wrong standalone preset popup (`EnginePresets.vue`) was deleted; and the Lab (Tuning tab) became the preset editor — each
`ConfigColumn` is a full engine config you Run and then "Save as preset", with `ConfigColumn.vue` + `CompareStrip.vue`
reworked to speak engine-presets (`74f7819`). Commit chain: `f18e80b` (doc) · `b11f6b5` (data) · `deacca0` (API+resolver) ·
`7acb78d` (dispatch) · `5d309be` (first preset UI) · `ecc9e87` (slim routing-by-feature + drop popup) · `74f7819` (Lab is
the editor).

**Current screen + walk-through state (Trial 4, 2026-06-29 — the full blow-by-blow + complete commit chain are in
the design doc's Trial iteration log).** The earlier "Routing by category" SEPARATE tab (Trial 2) was SUPERSEDED — the
whole AI area is now ONE page. The **Routing by feature** tab holds everything: the LEFT list is the feature nav with a
per-category **set-all preset dropdown** (+ a **Reset** that re-inherits) on each category heading; the RIGHT pane is the
selected feature's **prompt** (the "testing prompt" — it lives in the column, NOT duplicated above) plus the **Tune
presets** column workbench (one column = full width, "+ Add column" to compare, "Save as preset"). The Tuning and
Routing-by-category tabs are GONE; the AI sub-nav is now: Providers & models · Routing by feature · Recommendations ·
Usage · (host app tab). The global Default row was removed (user: "use your recommendation"); the per-category dropdown
was kept (user: the left nav is otherwise correct).

The user then walked the build on their own machine (Windows / RTX 2070 SUPER 8 GB) and drove FIVE fixes:
1. **Page must not scroll — only the nav + content — DONE.** Flex chain (the first `height:100%` attempt FAILED —
   %-height doesn't resolve through a flex item, so the page still scrolled): `AiView` wraps the area in a flex-fill
   `.ai-fill` instead of the scrolling `.scrollarea`; `.lu-area` / `.lu-tab-fill` / `.lu-fw` are `flex:1`; panes
   `overflow-y:auto`. Verified programmatically `pageOverflow 0`. (runner `81d9875`, JW `5877090`.)
2. **Remove the per-feature engine-preset dropdown — DONE** (runner `1302f88`).
3. **"Use in production" — DONE.** Always-visible button in the column preset bar; sets the feature's preset
   (`FeaturePresetRef`); the column preselects + loads the feature's in-production preset on open; reads
   "✓ In production" when it is the live one. (`1302f88` + `81d9875`.)
4. **Preset dropdown was full-width — FIX JUST APPLIED (uncommitted-or-just-committed at compaction; needs visual
   re-check).** Root cause: a `class=` on `<UiSelect>` falls through to its `SelectRoot` wrapper, NOT the visible
   `SelectTrigger`, so `max-width` did nothing — the cap is the UiSelect **`width` prop** (`ui-w-{token}`:
   token 110 / id 180 / name 280 / …). Set `width="name"` (280px) + moved "Use in production" next to the dropdown.
5. **Samplers + switches grid rework — DONE (2026-06-29; full prose in the design doc's Trial-4 #5 entry).** The
   add-a-blank-row sampler/switch editors in `ConfigColumn` are now a **prefilled checklist** from `knob_catalog`. The
   shared `KnobGrid` got an opt-in `checklist` mode (props `checklist`/`catalogList`/`exclude`/`scrollMax`); the existing
   add-row UI is the byte-unchanged `v-else`, so the other live consumers (`LuModelCatalog`, `RoutingByJob`) + JustVoice
   are untouched. Each row = enable/disable checkbox + kind-aware value (enum→select, int/float→number, bool→checkbox
   only at `"true"`), a per-row ↺ reset-to-default, an `＋ Add custom` row, a footer **Reset to defaults**, in a
   fixed-height scroll; rows are common-first (the catalog API already returns them ordered). NO backend change (the
   catalog already has `kind`/`default`/order; the UI reads the RAW rows — wire field is `default`). **⚠ One judgment
   call made while the user slept (flagged to reverse in seconds):** two `:exclude` lists prevent a double-edit bug —
   samplers hide `temperature`+`top_p` (already in the params row), switches hide `n_cpu_moe` (the Hardware-fit knob).
   An excluded knob already set in a preset is NOT dropped — it shows in a raw "Other keys" section. Verified:
   `build:vite` 0, headless smoke 0 JS errors (Routing-by-feature + LuModelCatalog's legacy grid both render), a
   dedicated Playwright check green (prefill, order, both excludes, toggle enables the value), ruff + pytest clean. A
   2-checker rules panel ran on the plan BEFORE coding; findings folded in. Files: `KnobGrid.vue`, `ConfigColumn.vue`,
   `CompareStrip.vue`, `FeatureWorkbench.vue` (all in `just-llm-runner/ui/src`).

**⛔ Hard rule the user reaffirmed forcefully this session: ZERO decisions on my own — do EXACTLY what's asked, nothing
adjacent; a question is a question (answer it, do not act); stop and ask on anything ambiguous.** Most of this session's
churn came from me removing things off a *question* + inventing a prompt-persistence "bubble" — do not repeat that.

**JV note:** the scroll fix touches the SHARED kit, so JustVoice's AI host needs the same flex-fill wrapper as `AiView`
(it degrades gracefully — scrolls as before — until then). I have the JV repo in scope and CAN verify it; the user said
NOT to for now.

**Remaining for this redesign (in order):** (1) the user's visual re-check of BOTH the preset-dropdown width fix (#4)
and the new samplers/switches checklist (#5) — including whether `temperature`/`top_p`/`n_cpu_moe` should be shown IN
the grid (delete the matching `:exclude` on the `<KnobGrid>` in `ConfigColumn.vue` to do so); (2) the JustVoice AI host
flex-fill wrapper; (3) QuickSetup auto-generating a ready-made preset per task at first run; (4) the download "use it
for ‹task›?" offer + Retune/Retune-all + the load-time fits/doesn't-fit warning; (5) deleting the now-unmounted
`RoutingByJob.vue` + the job switch-editor.

---

## Current state (2026-06-28) — plan rebuilt (truncation fixed) + the big deviation rebuilt + verified

> **The trust reset (2026-06-28):** the prior `2026-06-27-MASTER-PLAN.md` was a TRUNCATED summary that
> *claimed* full detail — and the Compare lab had been built from it at ~40% of the decided design. Fixed:
> - **Plan rebuilt** → `2026-06-28-MASTER-PLAN.md` CARRIES the full detail, folded verbatim from the ~12
>   curated docs, with a COMPLETENESS check (not the accuracy check that missed the truncation 4×): 7
>   condensations restored, the long folds 0-gap. Conflicts **C1–C7** recorded. Old master bannered
>   superseded; all pointers repointed. (runner `0d85b0e`, JW `27854e4`)
> - **Compare/ConfigColumn rebuilt to Decision 23** (C1): ONE full `<ConfigColumn>` (model + Plane-1 switch
>   KnobGrid + prompt + Plane-2 params + presets/Promote + preview + budget-guard + Run/result w/ cost),
>   rendered **×1** in Routing-by-feature and **×N** in a Compare **MODE** (`CompareStrip`: 2-up +
>   horizontal-scroll + collapse-nav, cloud-parallel/local-serial Run-all, promote-the-winner). The separate
>   Compare tab + `Compare.vue` were removed. (runner `820e597`)
> - **Independent code-vs-plan audit** (NOT trusting the test suite): A–E all match the plan at file:line
>   except ONE gap — FeaturePreset dropped `maxTokens`+`jsonMode` on round-trip — now **fixed**
>   (runner `5541fd4`).
> - **Verified:** 174 runner pytest + ruff · build:vite · headless smoke (6 AI sub-tabs, 0 JS errors) ·
>   interaction 19/19. Both repos pushed on `claude/admiring-galileo-il3q0o`.
>
> **Remaining = the plan's Part 2 outstanding (NOT deviations):** GPU-gated — #27 router / #29 residency /
> real tok/s / live per-job switch-apply; research — #28 measured benchmarks; and the [IC] backlog F-items
> (#23 shared AI task queue, license-flag UI, QuickSetup enhancements, shared-LLM-UI views, cleanup/dedup).
> **Router-vs-spawn = DECIDED: router** (R1; build GPU-gated) — NOT "the user's call" (that framing was stale).
>
> **⛔ THE MASTER IS NOW THE LIVE TASK TRACKER + SINGLE SOURCE OF TRUTH.** Its top section **"LIVE TASK TRACKER"**
> is the ONLY status authority — **every commit is backed by a task row** (T1–T13 done; T20–T50 remaining). Body
> ✅/⬜ markers are detail/history. **§1** = doc-conflicts C1–C7 · **§1b** = decision-state R1–R7 (resolved) +
> O1–O3 (genuinely open) · **§1c** = the A1–16 implementation decisions (each annotated vs the docs). Source docs
> kept as the verbatim backstop. **WORKFLOW RULE (user): a task row in the plan BEFORE any code; mark it ✅ + its
> commit sha on push — keep the tracker live; never synthesize status from elsewhere.**
>
> **2026-06-28 commits (branch `claude/admiring-galileo-il3q0o`):** runner `0d85b0e` plan-rebuild · `820e597`
> Compare/ConfigColumn · `5541fd4` FeaturePreset · `e7315f2` audit · `24b6f93` license · `638f6c5` test-iso ·
> `ce40c1b` no-hardcoding · `b7a57d8` decision-state · `9c3aa3f`+`e7371ff` live-tracker+§1c. JW `27854e4`
> repoint · `5a7469e` dead-fork · `60d0172` recap/handoff.
>
> **RESUME:** read the master's LIVE TASK TRACKER → next in-container item = **T20 QuickSetup enhancements** (my
> rec). GPU-gated: T40 #27 router build · T41 #29 residency. Open: O1/O2/O3.

## Current state (2026-06-27) — DESIGN DONE; build pending the user's go

> ⛔ **THE ONE PLAN: `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md`.**
> Everything is in there, in full detail — **✅ what's completed** (file:line) and **⬜ what's
> outstanding** (phased A–G + the open decisions + JustVoice-later §G), plus the reference
> per-job×per-tier matrix / switch sets / attribution recipe / license gate (Part 3) and the
> provenance (Part 4). It is detailed enough to **restart and code from after a compaction.**
>
> **Every other doc in `docs/plans/` (both repos) is historical / evidence — each is bannered
> "⛔ NOT THE CURRENT PLAN" at its top. Do not plan from them; plan from the master.** This
> recap + `docs/plans/2026-06-27-session-handoff.md` are the ONLY two things that point to the
> master. Status was **panel-verified 2026-06-27** (3 Opus agents, file:line + 144 runner / 77 JW
> tests pass); the build is **NOT started — pending the user's go.**

**Deep audit of the master — option A (full inline verify) COMPLETE (2026-06-27).** The user pushed
for a no-skim verification of the master against actual code AND the old docs, read in full. Done
inline across multiple passes (per-finding log: `just-llm-runner` scratchpad `audit-findings.md`).
**12 old docs read in full** (the decision-dense + Part-3-backing set) + completed-history
spot-verified. **Verdict: the master is FAITHFUL — the ONE design contradiction was D9** (the master
said "build PinSwitch"; the LOCKED design says DROP `pin_switches`+`model_switches`, `job_route_switches`
is the Profile's switches — **user ruled D9; folded into D1**). Status-staleness also fixed against
file:line: **#11 QuickSetup is built+job-native** (not "to build"), **U4 partial** (UpdatesPanel
exists unmounted), **Streaming feature ports = DONE** (all on `/v1/ai/stream`, gateway gone),
dup-counts (~19/~7), A3 narrowed, #31 cite, PROVIDER_DEFAULTS dup, tiers.py maps. Confirmed
accurate: D1 wiring, extra_flags, citations, #23/#27/#29/#34/Cache/Hardware/shared-views (not-built),
Part 3 vs evidence, suite (144+ruff). Full detail in the handoff §"Deep audit" + master Part 4.

**Option B (independent fresh-context panel, 63 agents) — DONE; caught what A missed.** Fresh
auditors (blind to A) + challengers of A's conclusions; I re-verified each high-value B finding vs
code. **1 A-error caught (U4: `UpdatesPanel` IS mounted — `SettingsView.vue:7,1216` — reverted)** +
real A-misses incl. a ⛔ **live DATA-LOSS bug [FIXED 2026-06-27]**: `routingBackend.js` (#31, stale
role-shape) sent no `jobs` on save → `set_routing` (`stores.py:132`) wiped ALL `job_routes` on each
default/embedding/pin save (#31 elevated to a bug-fix). **Now fixed** — `putRoutingPrefs` carries the
cached `jobs` + untracked (action-keyed) `pins` through verbatim, overlays only the store's tracked
feature pins, drops dead role/quick/accuracy; verified build:vite + smoke. Also: **GGUF auto-detect =
unwired orphan** (§1.2 demoted),
`pricing.py` hardcoded USD, `model_catalog` has no `license` column (A2 needs it), Part 3.2 "all
typed" false, DECIDED §6.6 "freeform string" vs shipped D15 KnobGrid, F#23 ProviderRow doesn't exist,
`test_prompts` also fails isolation, stale `routing_api` docstring, dead JW QuickSetup fork. B
corroborated A on D9/#23/#27/#29/#34/Cache-Hardware/shared-views/PROVIDER_DEFAULTS/tiers/A7/A3. All
folded into the master (Parts 1/2/3 + Part-4 "Option B"). Full B output: `tasks/w5kt79rge.output`.

The model-catalog + Fast/Balanced/Best-dial + speaker-attribution research (two `/deep-research`
runs + reviewer panels) and the resulting decisions are **folded into the master** (Part 1.3 = what
was decided + why, Part 3 = the per-job×per-tier matrix / per-model-type switch sets / attribution
recipe, Part 4 = the sources). Headlines that survive: catalog spans the FULL hardware range
(**floor = CPU 32 GB RAM / GPU 8 GB+32 GB, NO upper cap**); **add** Mistral-Small-3.2-24B + Gemma-4-12B
+ GLM-4.5-Air (MIT) / Qwen3-235B (Apache) / Llama-4-Scout, **drop** 2 redundant quants, fix the
35B-A3B to a 32 GB-RAM floor; one **Fast/Balanced/Best dial** per job resolving to (model, think),
fit-filtered. Adds/drops APPROVED; the `seed.py` build is **pending the user's go**.

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
  → the **master plan's Part 2** (all outstanding work, phased A–G: #27/#29 router/residency,
  #20/#21 lab, #23/#31/#32/#33/#34…) + **§G** (JustVoice-later). The jobs/switches design
  history lives in `docs/plans/2026-06-25-jobs-architecture-design.md` (bannered historical).

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
- **Phase E2-b1 DONE — prompt-preview + token-count → E2 COMPLETE → PHASES A–E ALL DONE** (this session):
  `ConfigColumn` gained a "Preview & tokens" panel — the **assembled prompt** (system + user template with
  `{{vars}}` filled; `ui/src/tokens.js` `assemblePrompt` mirrors the server `render()`) + a **token count**:
  instant heuristic (`estimateTokens` ~chars/3.5) live, upgradable to **exact** on demand via the loaded
  model's own tokenizer — new `POST /v1/llm-runner/tokenize` (`RunnerService.tokenize` proxies llama-server
  `/tokenize`; graceful `{ok:false}` with no model → UI keeps the heuristic). Wired in FW + Compare.
  Verified: 174 runner tests (2 new) + ruff + build:vite + smoke (0 errors) + interaction 12/12. Deferred
  (honest): a hard context-budget guard needs per-model context-window data we don't have; exact count is
  local-only. **With this, the entire A–E plan tail is shipped — only Phase F backlog + the 🔒 GPU-gated +
  🔬 research items remain (see master).**
- **Phase E2-a1 DONE — reasoning-effort enum, all providers** (this session): a per-action
  **Off/Low/Med/High** select mapped to EACH provider's NATIVE reasoning (Anthropic `thinking.budget_tokens`,
  Gemini `thinkingConfig.thinkingBudget`, OpenAI-compat cloud `reasoning_effort` / local llama.cpp
  `chat_template_kwargs.enable_thinking`, Ollama bool|level) — **web-verified 2026-06-28, not recalled.**
  Fixed the latent bug: `think` was honored ONLY by Ollama; the other 3 adapters accept-and-dropped it.
  Threading kept `dispatch.py` + the base Protocol UNCHANGED (minimal blast on the critical path) — the
  level rides `extra["reasoning_effort"]` via a shared `base.pop_reasoning_effort` helper + each adapter's
  `_apply_reasoning`. Data field threaded like `top_p` incl. **feature-presets** (which also fixed a
  pre-existing top_p-dropped-in-presets bug). UI: one `UiSelect` in ConfigColumn (FW + Compare). B3
  guardrail preserved (reasoning off under JSON mode). Verified: 172 runner tests (6 new) + ruff +
  build:vite + headless smoke (0 errors) + curl round-trips + rules-checker (2 findings fixed: docs +
  preset fidelity). **Tail left: E2-b1 (token-count/preview/budget guard).**
- **Phase D4 DONE → Phase D COMPLETE** (this session): `LuSwitchPresets` (the base/moe/mtp engine
  type-preset editor) moved OUT of the Providers tab (`LuModelCatalog.vue`) INTO **Routing-by-job** as a
  collapsed "Advanced · engine type presets" section — the last switch-editing UI is now out of Providers
  (§6.6 satisfied). Conscious placement: it pre-fills the per-Profile switches, so it lives with them (not
  in Compare, which the handoff had suggested). Verified: build:vite + smoke (0 JS errors). **Tail left:
  E2 (a1+b1) — decisions resolved, building next.**
- **Phase D2 Compare + ConfigColumn DONE** (this session): the multi-column **Compare lab**.
  New shared `ui/src/components/ConfigColumn.vue` = one runnable config (model + params + Plane-2
  sampler KnobGrid + Run + tok/s readout), owning the run + decode-tok/s math ONCE. New
  `Compare.vue` (a "Compare" AI sub-tab) renders N ConfigColumns for one action with a SHARED
  input + ranks by tok/s (sequential — local co-residency is GPU-gated). **FeatureWorkbench was
  refactored to CONSUME ConfigColumn ×1** (a `columnConfig` computed bridges its draft/samplers/pin;
  the old inline editor + run logic deleted — T3-clean, both import the same unit). Backend:
  `/v1/ai/run` now returns token usage + accepts ad-hoc per-call `samplers` (same `_plane2_extra`
  path; also fixed FW's old non-stream tokens:0). Verified: 165 runner tests + ruff + build:vite +
  headless smoke (0 JS errors) + a Playwright interaction test (10/10) + rules-checker PASS. Real
  cross-model tok/s 🔒 GPU. **Remaining tail: D4 → E2 (a1+b1).**
- **Phase C2 UI DONE** (this session): the model-card **"Tune & measure"** in the kit
  `LuModelCatalog.vue` — a `Tune` action (disk/loaded rows) opens a modal with a Plane-1
  `KnobGrid` (`:catalog` from `/v1/ai/knob-catalog`, mirrors Routing-by-job), **pre-filled
  from the model's resolved switches** via a new read-only `GET /v1/ai/model-catalog/switches`
  (reuses `resolve_model_switches`). "Load & measure" → `POST /v1/llm-runner/load` with an
  ad-hoc **`switches` dict** (new `LoadRequest.switches`, converted by the EXISTING
  `_switches_to_overrides`+`_merge_overrides` — no client-side flag mapping) → poll `/status`
  → `POST /measure` → tok/s + VRAM/RAM. **Measure-only** (per D9 switches live on a Profile,
  not per-model; the modal points to Routing-by-job to persist). Verified: 164 runner tests +
  ruff + build:vite + headless smoke (0 JS errors) + live-endpoint curl. Real tok/s 🔒 GPU.
  **Remaining tail: D2 Compare → D4 → E2 (a1+b1, building now).**
- **Soundness pass + D3 + C2-backend + E2-wins** (this session, after the user
  flagged E1 slipping 4 passes). **SOUNDNESS PASS (3 agents)** — the dimension the 4
  fidelity-passes missed (does each item contradict an app's CLAUDE.md / duplicate
  shipped work / rest on a stale premise): found 5 unsound items, **all in the
  UNBUILT tail — nothing unsound was built**; built phases confirmed clean. All folded
  into the master (Part 4 "SOUNDNESS pass"). **D3 JobPreset** — per-job presets +
  promote (writes live job_route + switches); DELETED the dead config-grain
  routing-presets (T3). **C2 measure backend** — `POST /v1/llm-runner/measure`
  (probe → tok/s + VRAM/RAM; injectable). **E2 sampler wiring** — extended plane-2
  knob_catalog + wired the Workbench sampler KnobGrid `:catalog`. **+ E1 dropped for
  JW** (JV-stuff ruling). Verified: 162 runner + 77 server tests + build:vite + smoke,
  all pushed. **Remaining tail (gated):** C2 UI + D2 Compare + D4 (frontend-scale);
  E2 reasoning-effort/token-guard (open cloud-adapter + tokenizer decisions); real
  tok/s (🔒 GPU). See master Phase C/D/E + the handoff.
- **Phase D1 DONE** (this session): the **D9 switch-table cleanup** (user "do it all,
  drop included"). DROPPED `model_switches` (table + `ModelSwitchStore` + the
  `/v1/ai/model-switches` router + the per-model resolver branch + seed + exports +
  test) and `pin_switches` (inert table). `job_route_switches` is the survivor;
  `resolve_profile_switches` (was an orphan) is now wired as the **load-path reader**
  — `LoadRequest.jobId` → `RunnerService.load(job_id)` → injected
  `profile_switches_fn` applies the Profile's frozen-flat switches over the model
  base. Verified: 159 runner + 77 JW server tests + ruff. *(Per-job live apply at
  scale stays router-mode #27. Schema change → reset existing DBs.)*
- **Phase C1 DONE** (this session): the **knob_catalog** — `knob_catalog` +
  `knob_option` DB tables (seeded `DEFAULT_KNOBS`: Plane-1 switches + key Plane-2
  samplers, with enum options relational), `GET /v1/ai/knob-catalog`, and the
  Routing-by-job switch KnobGrid wired to render labelled/typed/enum-select inputs.
  Verified: 158 runner tests + build:vite + smoke. **C2 (per-model Tune & measure,
  #20) remains — its real tok/s readout is GPU-gated.** NOTE: the new schema
  (`job_routes.quality` + knob/runner tables) needs a **DB reset** on an existing
  install (`POST /v1/data/reset`) — the standing drop+reseed-on-schema-change policy.
- **Phase B COMPLETE** (this session): the **Fast/Balanced/Best dial**. Per job, a
  3-stop `UiSegmented` dial in Routing-by-job resolves a concrete model for the
  detected hardware — `resolve_quality(job, quality, hardware)` fit-filters the
  job's recommendations then walks a size ladder (Fast=smallest, Best=largest,
  Balanced=median), reproducing the Part-3 matrix; persisted as the job's
  `{model, quality}`; the explicit picker stays as the advanced/cloud override.
  Backend `quality.py` + `GET /v1/ai/job-quality` + a think guardrail (force think
  OFF under json_mode, `prompts._effective_think`). Verified: 155 runner tests +
  build:vite + smoke. (Master Phase B → COMPLETE.)
- **Phase A COMPLETE** (this session, `just-llm-runner`): the model catalog + fit
  + the last config-file, all DB-backed. **A1–A6:** `DEFAULT_CATALOG` rebuilt to 11
  rows across the full hardware range (Qwen · Gemma 4 · Mistral · GLM · Llama),
  repo ids + licenses web-verified (Gemma 4 = Apache, GLM-Air = MIT, Llama-4 =
  Community→flag); `license` column added through the stack; cited per-job
  recommendations; `coarse_fit` GPU branch now RAM-gates (no 64 GB-MoE offered to a
  16 GB box). **A7:** `runner-manifest.json` + its loader DELETED — binaries/pin/
  margin moved to DB tables (`runner_binary`/`runner_setting`, seeded built_in from
  `runner/config.py` constants), `RunnerConfig` replaces `RunnerManifest`, flag
  presets come only from the DB `switch_presets` (no duplication), endpoint
  `/v1/llm-runner/manifest`→`/config`. **GGUF orphan WIRED** (auto-detect type on
  load). Verified: 148 runner + 77 JW server tests pass + ruff clean; fresh JW
  server serves the 11-model catalog + DB-backed config. (Master Phase A → COMPLETE.)
- **#31 DATA-LOSS BUG FIXED** (this session, JW `routingBackend.js` rewrite): a JW default-LLM /
  embedding / feature-pin save no longer wipes the per-job model routes. The client now sends the
  full `{default, jobs, pins}` shape — cached `jobs` + untracked action-keyed `pins` carried through
  verbatim, only the store's tracked feature pins overlaid (set on pin / delete on inherit); dead
  `role`/`quick`/`accuracy` removed. Verified build:vite + headless smoke (0 JS errors). Master #31
  → "DATA-LOSS BUG FIXED ✅"; this is the first slice of the continuous data-loss + Phase A–E run.
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

## Backlog (everything is in the master — this is just the pointer)
The full outstanding-work list — **every # item, phased (A–G), with what · why · file:line ·
acceptance · verify · gate** — is the master's **Part 2**. JustVoice-later work is the master's
**§G**. The load-bearing "why" technical facts (MoE `--n-cpu-moe`, MTP spec-decode helps dense /
machine-dependent on the A3B MoE, the two config planes, router mode) are the master's **Part 3.2**.
Do not maintain a second backlog here — add/triage items in the master.

## Active plan docs (the index) — there is now exactly ONE
**`just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` is the only current plan.** It folded in
everything that used to be split across the LLM status-index, the switch/preset architecture, the
switch-param lab, the 339-item complete-remaining audit, the jobs-architecture design, the
model-catalog research, the shared-AI-stack plan, the catalog-cutover / gateway-retirement /
platform-settings / cascade-audit docs, and the runner serving/switches/quicksetup research. **All
of those still exist in `docs/plans/` (both repos) as historical/evidence and are bannered "⛔ NOT
THE CURRENT PLAN" — read them for background only.** The two exceptions that are NOT plan docs and
stay live: `claude-config/README.md` + `EFFECTIVENESS.md` + `RULES-AS-CHECKS-V2-PLAN.md` (the
separate rules-as-checks track, Plan 1 — unhooked but documented).

## Where detail lives
**The plan detail lives in the ONE master** (`just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md`).
Architecture + rules → this repo's `CLAUDE.md` + the global `~/.claude/CLAUDE.md`. The
JustWrite↔JustVoice HTTP boundary → `CONTRACT.md` in the JustVoice repo. Other `docs/plans/*` files
(both repos) are historical background only.
