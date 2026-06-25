# Jobs architecture + data-driven switch system (2026-06-25) — AUTHORITATIVE PLAN

Consolidated design from the 2026-06-25 design conversation. This **supersedes**
the earlier patched cuts of this file. Status: **DESIGN COMPLETE → BUILDING**
(build order + status at the end). Every code claim is cited from files read while
writing this. It sits on the *built* catalog/switches/recommendations DB layer
(`2026-06-25-llm-catalog-db-cutover.md`).

---

## 0. The core + the governing principle

**The chain:** a feature → its **job** → the job's **model + switches + sampling**.

**⛔ GOVERNING PRINCIPLE (user, 2026-06-25): NOTHING is hardcoded.** Every value,
threshold, name, mapping, flag, and preset lives in the **DB**, seeded with our
best guess and **user-editable** (merge-by-key seeders + reset-to-factory, like
`model_catalog`/`model_switches`/`model_recommendations`). **No `manifest.json` for
config, no files on disk.** Code is only the *engine* that reads the data and runs
the few real algorithms (hardware detect, the VRAM fit formula, the flag merge, the
process spawn). *"If all we have to do is add a switch, change a name, change VRAM —
that's a data edit, never code."*

---

## 1. The mental model — three buckets

The split that ties everything together (all three verified this session):

| Bucket | What | Set where | Cost to change |
|---|---|---|---|
| **Facts** | model type (MoE/dense), VRAM, layers/size | **read** — MoE from the GGUF file (`expert_count>0`, `gguf.py:45,50-51`); VRAM from the card | not set; they *drive* auto-choices |
| **Switches** (Plane 1) | `-ngl`, `--n-cpu-moe`, `--ctx-size`, cache-type, flash-attn, spec-type, threads, batch… | **CLI at spawn** — `POST /v1/llm-runner/load` builds `Overrides`; omitted fields fall back to computed Fit + base preset (`api.py:141-159`) | **reloads the model** |
| **Sampling** (Plane 2) | temperature, max_tokens, JSON/schema, thinking | **HTTP per request** — sent in each chat call (`openai_compat.py:114-122`) | **no reload** |

Consequence: switching jobs reloads the model **only** if the model or a *switch*
differs — never if only *sampling* differs.

---

## 2. Jobs — the routing unit (a user-editable list)

- `job` **REPLACES** `role`. Today routing stores two fixed roles —
  `RoutingConfig.quick`/`accuracy` (`routing_api.py:47-53`); columns
  `quick_*`/`accuracy_*` on `routing_configs` (`models.py:644-647`); dispatch's
  `_resolve_role` over `llm_roles`.
- Jobs are a **user-editable list** (add / rename / remove), seeded with a guess
  **`chat · prose · extraction · analysis`** — **not** capped at 4.
- **A job = name + provider + model + that model's switches + its sampling.**
- **Lifecycle** (matches the provider precedent — `provider_api.py:184` keeps an id
  immutable *so renames don't orphan pins*): **immutable `job_id` + editable label**
  (rename is free) · **allow delete** · orphaned features resolve to a
  **guaranteed-present, un-deletable default job** (graceful fallback, the way
  dispatch already tolerates an unregistered provider, `dispatch.py:121-124`).

## 3. Features — classification + override

- Each feature has a **job dropdown** (its classification) → seeded best-guess,
  **editable per feature**. The job leaves the hardcoded `feature_catalog.py`
  (`FeatureCatalogEntry.role`, `routing_api.py:88-98`) and becomes data.
- The per-feature **override = EXPLICIT MODEL ONLY** — the pin drops `role`
  (`FeaturePin.role`, `routing_api.py:41-44`; `routing_pins.role`, `models.py:663`);
  the pin becomes `{providerId, model}`.
- **Resolve LIVE, never copy:** the model picker *displays* the inherited job model;
  changing a job's model is ONE write to `job_routes` and every feature in that job
  follows. New dispatch chain: action override → production config → **explicit pin**
  → **feature → job → job route** → prefer-local → first registered.

## 4. Switches & presets (data-driven — no definitions table)

- **Presets** = switch bundles **by model type** (`base`, `moe`, `dense`, `mtp`,
  `turboquant`), **seeded from research, editable.** A preset is a flag→value map.
- **The only per-flag metadata is ONE bit: on/off vs takes-a-value** — so the engine
  prints `--mlock` bare vs `--cache-type-k q8_0` with a value. The code already
  splits these: `_set_flag` (value, `process.py:118-122`) vs `_set_presence`
  (on/off, `process.py:125-132`); `_VALUE_FLAGS` (`process.py:135-146`) is today's
  hardcoded list. That one bit becomes data → **a new llama.cpp flag is added as
  data, no code.** No types/enums/help/validation table.
- **VRAM autocompute** fills the three fit knobs (`-ngl` / `--n-cpu-moe` / `--ctx`)
  **when unset**; an **explicit value in any layer WINS** — already the behavior:
  `ctx_len = ov.ctx_len or DEFAULT_CTX` (`process.py:193`); `if ov.n_gpu_layers is
  not None: use it; else compute` (`process.py:196-198`); same for `n_cpu_moe`
  (`process.py:216-219`). **Computed values are EPHEMERAL — never stored** (they'd
  go stale on a new card).
- **Merge order** (later wins, via the existing `_merge_overrides`,
  `lifecycle.py:68-79`): `base preset → model-type preset → per-model override →
  per-hardware rule → per-job → per-feature → live tune`, then autocompute fills the
  rest. Safe even with a bad manual value — OOM back-off sheds layers
  (`process.py:347-369`).
- **Per-hardware rules:** a user researches their card → saves switches for it (an
  editable layer keyed by GPU [+ optionally model/type]). This is the persistent,
  per-machine version of #20 tuning (auto-fit finds *a* working value, not the
  fastest).

## 5. Sampling (Plane 2)

temperature / max_tokens / JSON / thinking are per-job and per-feature, **sent per
request, no reload** — `feature_prompts` already carries `temperature`/`max_tokens`
(`models.py:696-724`), and the chat call forwards them (`openai_compat.py:114-122`).

---

## 6. The data model

**NEW editable tables (all seeded + user-editable + reset-to-factory):**
- `jobs (job_id PK, label, description, position, built_in)` — the job list (CRUD).
- `feature_jobs (feature_key PK, job_id, built_in)` — feature→job map (dropdown).
- `job_routes (config_id, job_id) → provider_id, model` — per-config job→model.
- `switch_presets (preset_id PK, label, applies_to, built_in)` — type presets
  (`applies_to` = base / moe / dense / mtp / …, matched to the model's type).
- `job_presets (id PK, job_id, name, is_active, provider_id, model, built_in)` — the
  lab's persistent saved configs (mirrors `feature_presets`, `models.py:669-690`).
- **Switch child tables, all FK-backed, all served by ONE shared generic store**
  (no logic duplication): `preset_switches (preset_id, flag_name)`,
  `model_switches` (built — now the rare per-model override),
  `hardware_switches (hw_key, flag_name)`, `job_route_switches (config_id, job_id,
  flag_name)`, `pin_switches (config_id, feature, flag_name)`,
  `job_preset_switches (preset_id, flag_name)`. Each row = `(…, flag_name,
  flag_value, kind, built_in)` where `kind ∈ {value, presence}` (the one bit).
- `flag_catalog (flag_name PK, cli, kind, compute, built_in)` — OPTIONAL minimal
  vocabulary (name → cli spelling + the on/off-vs-value bit + a `compute` tag for the
  ~3 fit knobs). Lets a new flag be added once and referenced everywhere; keeps the
  one bit normalized instead of repeated on every switch row. (If we instead capture
  the bit on each switch row from the editor widget, this table is unnecessary — a
  small open choice, §11.)

**CHANGED:** drop `quick_*`/`accuracy_*` columns (`models.py:644-647`) → `job_routes`;
`routing_pins` drops `role` (`models.py:663`); `RoutingConfig.quick/accuracy` → a
`jobs` map (`routing_api.py:47-53`); `FeaturePin.role` dropped; `FeatureCatalogEntry.role`
removed; the dispatch role machinery (`schema.py` `LLMRolesSettings`/`FeaturePinConfig.role`/
`LLMConfig.{llm_roles,default_feature_roles}`; `dispatch._resolve_role`) → job.

**DELETED:** `runner-manifest.json` config (`flagPresets`, the dead `vramFit.tiers`)
→ DB; only the editable **safety margin** survives. (`llamacpp.binaries` stays in the
manifest — a ship constant, *which binary to download*, not user config.)

**Policy:** drop + reseed, no migration (`2026-06-18-unified-storage-no-idb.md:45-49`).

---

## 7. Residency manager (VRAM-budget planner, #29)

Reads detected VRAM → sets the router's `--models-max`: big card = several
`(model+switches)` children co-resident (instant job switch); 1-model card =
`--models-max 1`, LRU-evict + reload on switch. Dedups identical combos. Needs router
mode in `RunnerService` (#27; the runner still spawns single-model today). Same
planner later arbitrates cross-kind VRAM (LLM ⟷ JV TTS).

## 8. The job lab (#21)

Multi-column **Compare** — each column = a model + a switch set + the job's test
prompt; run-all → per-column output / words / tokens-per-sec → pick a winner. Plus
**persistent JobPresets** (save the configs you tested so you can review them, not
guess) → **promote** one to production (writes the job's live model + switches).
Mirrors the proven `FeaturePreset` save/active/promote lifecycle
(`feature_presets_api.py:28-44,99-103`).

## 9. GUI surfaces (shared `@delebash/llm-ui`)

- **QuickSetup** (auto-setup): picks a model per job, sets each job's preset default;
  iterates the editable `jobs` list (today hardcodes quick/accuracy).
- **Routing by job** (NEW tab) + **Routing by feature** (renamed from "Features",
  `AiModelsArea.vue:140-145`): each shows model + a **switch-preset dropdown**
  (defaulted by auto-setup, user can pick another) + individual flag tweaks +
  sampling. Routing-by-feature also has the per-feature **job dropdown**, plus a
  small **job-list editor** (add/rename/remove jobs).
- **Model manager** (grow `LuModelCatalog`): add/edit models, the model `type`, the
  presets, per-model overrides.

---

## 10. Settled

The three-bucket model · jobs + feature→job editable seed data · explicit-only
per-feature override · presets-by-type + autocompute + explicit-wins · the one
on/off-vs-value bit (no heavy definitions) · FK-child-table switch storage + one
shared generic store · immutable-id + editable-label + allow-delete + default-job
fallback · nothing hardcoded / all DB.

## 11. Open (small — none block the build)
- (a) the **one bit** home: a minimal `flag_catalog` table vs capturing it per
  switch row from the editor widget (lean: a small `flag_catalog`).
- (b) the job's **test-prompt** source: a `test_feature` column on the `jobs` row
  vs pick-per-Compare (lean: `test_feature` on the job row).
- (c) the lab = a new component vs the **same Compare** parameterized by `unit`
  (lean: shared).
- (d) feature→job scope: **global** vs per-routing-config (lean: global).

## 12. Build order + STATUS

> ⚠️ The role→job rename touches the SHARED `just-llm-runner` dispatch, which
> **JustVoice also imports** (`MORNING_RECAP.md`). Verify JV's usage before the
> breaking-rename phase; phase 1 below is purely additive (safe for JV).

1. **Jobs + feature→job as editable data** — `jobs` + `feature_jobs` tables + shared
   Protocol/router + JW stores + seeders (best-guess mapping of all 19 features);
   remove `role` from `feature_catalog.py`. *(Additive; safe for JV.)*  ← **building**
2. **role → job across the seam** — `schema.py`/`dispatch.py`/`routing_api.py` +
   JW `routing_configs`→`job_routes`, drop `routing_pins.role`, store + `config.py`;
   QuickSetup job pickers. *(Update JV in lockstep; drop+reseed.)*
3. **Switches: presets → DB** — `switch_presets` + the one bit + autocompute/merge
   (explicit wins) + per-hardware rules; delete `flagPresets`/`vramFit.tiers` from
   the manifest.
4. **Residency manager** (#29) — needs router mode (#27).
5. **Job lab** (#21) — Compare + persistent JobPreset + promote.
6. **Model manager UI** (#30) — grow `LuModelCatalog`.

Verification each step: `pytest` + `ruff` (server) + headless smoke (renderer).
