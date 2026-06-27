> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-27-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# The Switch/Param + Job/Feature LAB — the real plan (code-verified 2026-06-27)

**What this is.** The single detailed, current plan for the **lab** where you test a
model + engine switches + params + prompt, see tokens/sec, **save a preset**, and
**promote to production** — for both per-action (Features) and per-job (Compare). Every
"done / missing" call below is verified against the code with file:line — not memory.

**Where the design already lived (it wasn't lost, just buried):**
- `docs/plans/2026-06-20-shared-ai-stack-plan.md` **Decision 23** (§910–1004) — the full
  Compare / `<ConfigColumn>` / scheduler spec.
- `docs/plans/2026-06-25-jobs-architecture-design.md` **§8** (job lab) + **§6.6**
  (switches edited as a freeform STRING in the lab, NOT in Providers).
- Backlog ids: **#21** (job-lab Compare + JobPreset + promote), **#20** (per-model tuning
  + tok/s — *folded into the lab* per §6.6), **#19** (Overrides through `/load` — DONE).

This doc supersedes the lab/switches lines of the unverified
`2026-06-27-complete-remaining-plan.md` for this area.

---

## 1. The design (consolidated)

**One surface, "Compare mode" inside Features** (a MODE, not a separate Lab — the
standalone Writer Lab was deleted on purpose, #12):
- A run = **N columns**, each column a FULL config: **model + engine switches (Plane-1, a
  freeform string) + prompt + per-request params (Plane-2: temp / top-p / json / think /
  max-tokens)**.
- **Run one action across all columns** → per column: **output · words · tokens/sec ·
  time · (cost)** → pick the winner → **promote to production**.
- It is simultaneously model A/B, **switch testing** (columns differing only by switches,
  compared by tok/s), and prompt A/B.
- **Layout** (decided 2026-06-24): 2-up base + **horizontal-scroll** strip (not capped at
  2) + a **collapse-nav** toggle; each column a Studio-style card, config stacked
  vertically (model → switches → prompt → params → output → tok-s → promote).

**⭐ The convergence (the whole reason this is small):** the FeatureWorkbench editor pane
**already IS one Compare column** — same preset→promote lifecycle. So the build is: extract
that pane into a reusable **`<ConfigColumn>`**, render **×1** (Features) or **×N** (Compare),
and add the two things it lacks: **the switch-string field + tokens/sec**. (RULE #7 — one
component, not a fork; also replaces JV's old Speaker Lab when JV adopts.)

**Switches = a string field (§6.6), never per-flag boxes — reconciled with the real
contract (the rules-checker caught my first draft; verified in code).** `runner/process.py:44-80`
+ `runner/lifecycle.py:82-93`: switches are a **typed, named `Overrides` set** (`n_cpu_moe`,
`ctx_len`, `flash_attn`, `cache_type_k/v`, `spec_type`, `threads`, …; the stored rows use these
FIELD names — cf. `LuModelCatalog.vue:283`) **plus an `extra_flags: list[str]` escape**, and
`_switches_to_overrides` **silently DROPS unknown keys** (`lifecycle.py:87`). So the textbox
design: edit the string → parse to the known field names, route anything else into
**`extra_flags`**, and **surface unknowns (never silently drop)**. The user's "add a new flag
with no code change" is real, but achieved via **`extra_flags`** + a one-time backend wire
(Track A step 2) — NOT raw CLI spellings (`-fa`/`--ctx-size` map to field names), NOT
already-true.

---

## 2. CODE-VERIFIED current state (the affordance table — RULE #6 strict-diff)

| Piece the lab needs | State | Evidence (file:line) |
|---|---|---|
| Per-action "one column" editor (model pin + prompt + params + presets + promote + test) | ✅ **built** | `ui/src/views/FeatureWorkbench.vue` — pin `LuModelPicker`:492 · presets bar :465-478 · `useAsProduction`:321 · test panel :511-529 |
| FeaturePreset CRUD + `/{id}/use` promote — **the JobPreset precedent to mirror** | ✅ **built** | `feature_presets_api.py` (`make_feature_presets_router`, `use_preset`:98) · **shared** store `stores.py:219`, mounted by `install.py:67` · table `db.py:291` |
| Switch tables (type presets · per-job · per-feature · per-hardware) | ✅ **built** | `llm/db.py`: `SwitchPreset`:111 `PresetSwitch`:127 `JobRouteSwitch`:209 `PinSwitch`:230 `HardwareSwitch`:250 |
| Layered switch resolver (base→type→mtp→model→hw) | ✅ **built** | `llm/switch_resolve.py:resolve_model_switches`:33 |
| Overrides → `POST /v1/llm-runner/load` (#19) | ✅ **built** | `llm/install.py` + runner `lifecycle.py`/`process.py` Override path (switch dict → `_switches_to_overrides`) |
| **`<ConfigColumn>` reusable component** (×1 Features / ×N Compare) | ❌ **missing** | not in `ui/src/components/*` (8 components; none) |
| **Compare view** (N-column horizontal-scroll strip + collapse-nav) | ❌ **missing** | not in `ui/src/views/*` (7 views; none) |
| **Switch field** in the column (string over the typed `Overrides` names) | ❌ **missing** | `FeatureWorkbench.vue` has no switch field; switches edited per-flag in `LuModelCatalog.vue` + `LuSwitchPresets.vue` |
| **`extra_flags` passthrough** from switch rows (the "new flag, no code" escape) | ⚠️ **not wired** | `_switches_to_overrides` drops unknown keys *and* skips `extra_flags` (`lifecycle.py:87`) — needs a one-time wire |
| **tokens/sec** readout | ❌ **missing** | FeatureWorkbench shows ms·words·tokens only (:524-526) |
| **JobPreset** (table + store + router + lab save/load/promote at JOB grain) | ❌ **missing** | no `JobPreset` class in `db.py`; no `job_preset` in JW server (grep) |
| `job_preset_switches` / `feature_preset_switches` tables | ❌ **missing** | `db.py` — not present |
| Per-job / per-feature switch **editors** (in the lab, as strings) | ❌ **missing** | resolver explicitly defers per-job/feature to step-4 (`switch_resolve.py:15-18`) |
| **Rip switch editing OUT of Providers** (§6.6) | ❌ **todo** | `LuModelCatalog.vue` + `LuSwitchPresets.vue` still edit switches in the model manager |
| Shared AI task queue so lab runs land in the strip (#23) | ⚠️ **partial** | FeatureWorkbench takes a `runStream` host-hook prop (:33-35); the SHARED queue (#23) is not built — JW wires its own |
| Compare **scheduler** (cloud-parallel · model-co-reside · switch-serial) | ❌ **missing** | needs router mode (**#27**, GPU) |

**Bottom line:** the column-precursor + the preset/promote lifecycle + the switch backend
are real; the **lab itself (ConfigColumn extraction, Compare view, switch-string, tok/s,
JobPreset) is not started.**

---

## 3. Build plan

### Track A — buildable + verifiable in this container now
1. **Extract `<ConfigColumn>`** (kit `components/ConfigColumn.vue`) from the FeatureWorkbench
   editor pane (`FeatureWorkbench.vue:459-530`): model pin (`LuModelPicker`) + prompt
   (system/instruction) + params (temp/top-p/max/think/json) + presets bar + test panel.
   Props: `unit` ("action" | "job"), the config v-model, the preset list, a `runStream`
   hook. **FeatureWorkbench then renders ONE `<ConfigColumn>`** (no behavior change — verify
   the Features tab is identical). RULE #7: one component, two call sites.
2. **Add the switch-string field** to `<ConfigColumn>` (§6.6): a `UiTextarea` bound to the
   column's switch string + a generic `parseSwitches(str)→{flag:value}` / `formatSwitches(dict)→str`
   (no per-flag code). Round-trips to the switch tables via a new/existing switch endpoint.
3. **Add tokens/sec** to the test result: `tokens / (ms/1000)` in the column's stats line
   (extend `FeatureWorkbench.vue:524-526` once, in the shared component).
4. **JobPreset backend** — mirror `feature_presets_api.py` exactly: `make_job_presets_router`
   + a `JobPreset` table (`db.py`) + `job_preset_switches` + the host store; promote writes
   `job_routes` + `job_route_switches` (the job's production model+switches). Same
   list/save/delete/`use` shape; both apps mount it.
5. **Compare view** (kit `views/CompareView.vue` OR a Compare MODE toggle inside
   FeatureWorkbench): renders **N `<ConfigColumn>`** in a horizontal-scroll strip +
   collapse-nav toggle; "Run all" runs one action across columns; per-column tok/s; "Promote"
   on the winner. Reuse the same `<ConfigColumn>` + the FeaturePreset/JobPreset routers.
6. **Move switch editing into the lab + rip it out of Providers** (§6.6): delete the
   per-model switch sub-editor + the base/moe/mtp preset **cards** from `LuModelCatalog.vue`
   + `LuSwitchPresets.vue`; the string field in `<ConfigColumn>` is now the only switch UI.
   Keep the switch *tables* + resolver (unchanged).
7. **Per-job / per-feature switch strings** — the column's switch field writes
   `job_route_switches` (job grain) / `pin_switches` (feature grain) via the same generic
   parse. (Editing only; the runtime *apply* is Track B.)

### Track B — buildable, but needs your GPU / a live model to VERIFY
- **Runtime switch apply** — the per-job/feature override layers reach `POST /load` via the
  step-4 residency orchestrator (`switch_resolve.py:15-18` leaves this hook). (#27/#29)
- **Compare scheduler** — cloud columns parallel · different-model local co-reside/router-swap
  · same-model-different-switch **serial** (each switch value = its own (re)load). Needs
  router mode (#27). Show a "reloading" state on a cold swap.
- **tok/s accuracy** — real numbers need a live model; the readout + plumbing build now.

### Out of scope (per user, 2026-06-27)
- **JustVoice** — the TTS Lab (audio-variant compare, engine-knob schema) + JV adopting
  `<ConfigColumn>` come with JV adoption (U5), NOT now.
- **#23 shared task queue** — related but its own task; the lab works through the existing
  `runStream` host hook until #23 lands.

---

## 4. Dependencies (verified)
- ✅ **#19** Overrides through `/v1/llm-runner/load` — done (`install.py`).
- ✅ Switch tables + resolver — done (`db.py`, `switch_resolve.py`).
- ✅ FeaturePreset CRUD+promote — done (`feature_presets_api.py`) — the JobPreset template.
- ⚠️ **#23** shared task queue — not built; lab uses the `runStream` host hook meanwhile.
- ⛔ **#27/#29** router/residency — GPU-gated; only the *scheduler + runtime apply* depend on it.

## 5. Verification
- `pytest` + `ruff` (runner + JW) for the JobPreset router/store/tables.
- `npm run build:vite` + `node scripts/headless-smoke.mjs` (boot `python -m
  justwrite_server.cli serve --port 17495` + `npm run dev:vite`): the Features tab renders
  identically (ConfigColumn ×1, no regression — smoke clicks each AI sub-tab); the Compare
  mode renders N columns with the switch-string field + tok/s; a saved JobPreset round-trips
  and Promote writes `job_routes`/`job_route_switches`.
- Chromium: reuse `findChrome()` from `scripts/headless-smoke.mjs` (versioned dir; never
  hardcode).
