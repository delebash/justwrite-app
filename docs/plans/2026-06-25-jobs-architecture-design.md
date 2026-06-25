# Jobs architecture — `job` replaces `role`, switches layer per-job, + the job lab (2026-06-25)

Design record from the 2026-06-25 design conversation. **DESIGN — nothing here is
built yet** (it sits on top of the *built* catalog/switches/recommendations DB
layer, see `2026-06-25-llm-catalog-db-cutover.md`). Every code claim is cited from
files read while writing this. **This revision supersedes the first cut's
Decision 6** ("switches stay per-model") — see §6 for the corrected design and why
the old line was wrong.

> **One line:** a model is chosen, tuned, and recommended **per job** (~4 task
> archetypes) — not per feature (19) and not per the 2 coarse roles. Each job
> carries *its own switch overrides*, so the **same model can run differently for
> different jobs** (chat with a small context, analysis with a big one). Features
> inherit their job's model+switches; a per-feature pin can still override.

---

## 0. The mental model — read this first (so the rest isn't confusing)

For every model there are THREE questions, and they now all hang off **the job**:

| # | Question | Who answers | Where it lives |
|---|---|---|---|
| Q1 | **Will it run on this PC?** | AUTO (hardware) | `fit.coarse_fit`/`compute_fit` + OOM back-off — unchanged, no human input. |
| Q2 | **How should it run?** (the switches: context size, KV cache, MoE offload, spec decoding…) | AUTO default + human tuning | **Two layers, merged:** the model's own defaults (`model_switches`, built) PLUS a **per-job override** (NEW). This §6 is the corrected design. |
| Q3 | **What is it good FOR?** | HUMAN judgment | `model_recommendations` (job-tagged, built) → pre-fills the job pickers. |

The thing that ties Q2 and Q3 together is the **job**. Today the app routes by
two coarse *roles* (`quick`/`accuracy`). We replace that single concept with ~4
*jobs* that match how features actually cluster by task shape.

**The chain at run time:** a feature → its **job** → the job's **model + switches**.
A per-feature pin can short-circuit it. That's the whole architecture.

---

## 1. Why (the problem)

- **Per-FEATURE config (19 features) is too fine** — nobody tunes 19 features by
  hand. They cluster by task shape.
- **The 2 roles (`quick`/`accuracy`) are too coarse** — a model great at
  extraction can be weak at prose, yet both are "accuracy" today.
- **`category` (8 nav groups) is nav-shaped, not task-shaped** — "Whole book"
  lumps `plotHoles` (an extraction task) with `marketingPack` (a prose task)
  (`feature_catalog.py:36,39`). So category can't be the routing unit either.
- **`job` is already half-here but dead.** `model_recommendations.job` exists
  (built; `models.py:604-619`) but only `quick`/`accuracy` are ever *consumed*
  (QuickSetup `prefillRoles`). The other job tags (`attribution`, `prose`, …) have
  no reader. This design gives `job` a real, central job.

The right grain is a deliberate **~4-job** set, sitting between the 2 roles and
the 19 features.

---

## 2. Decisions (user, 2026-06-25)

### 2.1 — `job` REPLACES `role` as the routing unit
- **Today:** routing stores two fixed role targets, `quick`+`accuracy`
  (wire: `RoutingConfig.quick/accuracy`, `routing_api.py:47-53`; dispatch:
  `LLMRolesSettings {quick, accuracy}`, `schema.py:67-72`; resolve:
  `_resolve_role` does `getattr(roles, role)`, `dispatch.py:46-57`); each feature
  carries a fallback `role` (`FeatureCatalogEntry.role`, `routing_api.py:97`; e.g.
  `feature_catalog.py:27`).
- **After:** a **job → (model + switches) map** (~4 jobs) + **`feature.job`** +
  dispatch resolves **feature → job → model+switches**. `quick`/`accuracy` retire
  into the job set.
- This is a **rename + reshape across one well-defined seam**, not a fork — the
  exact files/symbols are listed in §7.

### 2.2 — ~4 jobs; the set + per-feature mapping is the ONE thing still OPEN
Tentative set: **`chat · prose · extraction · analysis`**. It is **not**
auto-derivable from `role` (2 values) or `category` (8, nav-shaped). It needs a
deliberate human mapping of all 19 features (`feature_catalog.py:25-53`) to
exactly one job each. **This is the only content decision left before building.**

Jobs are an **app-defined catalog** (a small shipped list, like the feature
catalog), *not* user-CRUD. The user edits which **model+switches** serves each
job, not the job set itself. (Mirrors how features work: app ships the list,
user edits the routing.)

### 2.3 — Per-feature override = the EXISTING pin, resolved LIVE (never copied)
`resolve_pin` already does *explicit pin → role → catalog default*
(`dispatch.py:92-163`). We rename the `role` leg to `job`. A feature's dropdown
**displays its inherited job model**; choosing another **writes a pin**; reset
**deletes the pin**.

**"Apply a job's model" = ONE write to the job→model map.** Every feature that
inherits that job then shows the new model automatically — we never stamp the
same model into 19 pin rows that later drift (RULE #8). (This is exactly the
user's "choosing a job sets all the feature dropdowns" — achieved by *live
inheritance*, not by copying 19 rows.)

### 2.4 — `job` is ONE organizing concept
Routing unit **and** `model_recommendations.job` tag (already exists → finally
read) **and** the Compare unit (§8). Recommendations need **no schema change**.

### 2.5 — The job→model map is a CHILD TABLE, not fixed columns
Today the two roles are **fixed columns** on `routing_configs`
(`quick_provider_id/quick_model/accuracy_provider_id/accuracy_model`,
`models.py:644-647`). Four *editable* jobs can't be fixed columns. Replace them
with a **`job_routes` child table** `(config_id, job) → provider_id, model` — the
**exact shape of the existing `routing_pins` table** `(config_id, feature) →
provider_id, model, role` (`models.py:650-663`). Same precedent, one row per job.

### 2.6 — Switches are LAYERED (this REPLACES the old "switches stay per-model")
**See §6 — this is the corrected centerpiece of the revision.**

### 2.7 — The job lab = Compare + JobPreset + promote
**See §8.** Mirrors the proven per-action preset lifecycle
(`feature_presets_api.py`).

### 2.8 — Naming: "Routing by job" left of "Routing by feature"
The AI-area subnav today is `Providers & models · Features · Recommendations ·
Usage` (`AiModelsArea.vue:140-145`). Add a **"Routing by job"** tab to the LEFT
of Features, and rename **"Features" → "Routing by feature"**. The Jobs tab opens
with a plain explanation ("Pick one model per kind of task. Most people only
touch this. For fine control of a single feature, use *Routing by feature*.").
Result: `Providers & models · Routing by job · Routing by feature ·
Recommendations · Usage`.

### 2.9 — The job-compare test prompt = a representative feature's prompt
A job has no production prompt of its own (prompts live per-feature,
`feature_prompts`, `models.py:696-724`). For Compare we **reuse a representative
feature's prompt** for that job (e.g. test the `extraction` job with
`plotHoles`'s prompt). Rationale (user): "if a feature in a job works, all
features in that job should work."

---

## 6. Switches — LAYERED, not per-model-only (the corrected design) ⭐

> **What the first cut got wrong:** Decision 6 said *"switches stay per-model …
> router loads a model once with one switch set, so switches can't differ per job
> for the same model."* That contradicts both the user's requirement (*"chat has
> model A with ctx A and extraction has model A with ctx B, so we reload the model
> when we switch jobs"*) **and** the original two-planes design we already wrote
> (`2026-06-24-llamacpp-switches.md:232-241`). It was never a fork to introduce —
> it was already designed. This section restores it.

### 6.1 — Switches are Plane-1, load-time, and they LAYER
From the two-planes design (`2026-06-24-llamacpp-switches.md:232-241`):
- **Plane 1 = load-time engine flags** (context size, KV cache type, flash-attn,
  `--n-cpu-moe`, spec decoding, batch, threads…). Set when `llama-server` spawns a
  model; go through `Overrides → compose_flags`. These are what the per-model
  tuning UI **and the Compare columns** expose (`:235-236`).
- **Plane 2 = per-request params** (temperature, max tokens, JSON schema,
  reasoning budget). These ride in the per-feature/per-action routing config, NOT
  on the launch command (`:237-241`). *(Unchanged by this design — already live in
  `feature_prompts`.)*

We are only talking about **Plane 1** here. They layer in three tiers, merged by
the **already-built** `_merge_overrides(base, user)` (`lifecycle.py:68-79`: user
wins per field; `extra_flags` concatenated):

```
   model defaults        +     job override        +    feature override
  (model_switches,             (per job, NEW)            (rare, per pin, NEW)
   built — the base)
  e.g. MoE → spec:none,        e.g. analysis → ctx 32k    e.g. plotHoles → ctx 64k
       no_mmap:true            chat     → ctx 8k
            └──────────────── _merge_overrides ───────────────┘
                                      ↓
                       the flags this (model, job) loads with
```

- **Base = `model_switches`** (built, `models.py:579-598`; seeded
  `seed.py:163-171`). These are **model-intrinsic** facts — an MoE needs spec OFF
  regardless of the job (`spec_type=none`, `no_mmap=true` for the 35B-A3B; dense
  MTP gets `spec_type=draft-mtp`). They travel with the model because they're
  about its architecture. **`model_switches` stays — it is the base layer, not a
  mistake.**
- **Job override** (NEW) — task-shaped flags: `analysis` wants a big context,
  `chat` a small one. This is the user's "model A @ ctx A vs model A @ ctx B."
- **Feature override** (NEW, rare) — the per-feature fine-tune from
  *Routing by feature* / the Feature lab. Most users never touch it.

### 6.2 — Same model, two jobs = two router loads
Because the launch flags differ, `(qwen-14b, chat-switches)` and
`(qwen-14b, analysis-switches)` are **two distinct loads** — verified by the
hot-swap test: each model is its own child `llama-server` launched with that
config's flags, and a **switch-VALUE change on the same model needs a (re)load**
(`2026-06-24-llamacpp-switches.md:460-482`). So switching jobs may reload the
model — exactly what the user described.

### 6.3 — Dedup identical combos
If two jobs resolve to the **same (model + identical switches)**, they are ONE
load, not two — the planner keys live children by the resolved `(model_id +
merged-flags)` tuple, so identical combos share a child.

### 6.4 — ⚠️ THE ONE OPEN DECISION FOR YOU: where the override switches are stored
The *shape* above is settled. The only open question is the **storage layout** for
the NEW job/feature override switches (and later the preset candidates). Two clean
options — I recommend **A**:

**Option A (recommended) — ONE unified `switch_overrides` table.**
`switch_overrides (scope, scope_key, flag_name) → flag_value, built_in`, where
`scope ∈ {model, job, feature, job_preset, feature_preset}`. The current
`model_switches` table is **renamed/absorbed** into it as `scope='model'` rows.
- *Why:* switches are the **identical shape** wherever they attach
  (`flag_name → flag_value`). One table → one store → one router → one merge path.
  Resolution is `merge(get('model',M), get('job',J), get('feature',F))`. The lab
  reads `get('job_preset', id)`; promote copies those rows to `scope='job'`. This
  is the convergent, least-code answer (RULE #7 — don't build the same child table
  5×). It is also the rename the you flagged ("rename `model_switches` to match
  the new design").
- *Counter-case:* a polymorphic table can't carry a DB-level `FOREIGN KEY` to
  three different parents, so deleting a model/config/preset won't `CASCADE`-delete
  its switch rows — the **store code** must clean them up (it already does
  key-scoped deletes for reset). And the job/feature `scope_key` is a composite
  (`config_id:job`), slightly less tidy than a native multi-column key.

**Option B — separate child tables.** Keep `model_switches` and add
`job_route_switches (config_id, job, flag_name)` + `pin_switches (config_id,
feature, flag_name)` (+ preset variants later), each with a real `CASCADE` FK to
its parent.
- *Why:* clean FK integrity + clean composite PKs, matching `model_switches`'s
  own `CASCADE` FK to `model_catalog` (`models.py:591-595`).
- *Counter-case:* ~5 near-identical tables + ~5 near-identical stores for one
  shape — the duplication the user fears ("you build things 10 different ways").

> **My recommendation: Option A (unified `switch_overrides`).** It is the single
> source the user keeps asking for, it's the least code, and orphan-row cleanup in
> the store is trivial and already the pattern. **Your call — this is the only
> storage decision blocking the build.**

---

## 7. The residency manager (= the VRAM-budget planner, task #29)

The user: *"of course we have a manager that says if the card is big enough we can
have more than one model loaded, but for 1-model-at-a-time cards we switch as
needed."* That manager is the **VRAM-budget planner** (task #29):

- It reads detected VRAM (`hardware.detect`, already used by Fit) and sets the
  router's **`--models-max`** — which is **count-based, not VRAM-aware on its own**
  (`2026-06-24-llamacpp-switches.md:480-482`), so the planner must compute the
  count from the budget.
- **Big card →** several `(model+switches)` children co-resident; switching jobs
  is instant (no reload).
- **1-model card →** `--models-max 1`; switching jobs **LRU-evicts** and reloads
  (the user's "switch as needed").
- It **dedups identical combos** (§6.3) before counting.
- It is the same planner that later arbitrates **cross-kind** VRAM (LLM ⟷ JV TTS)
  — out of scope for the JW-only step, but the same component.

This makes "switches differ per job → may reload" safe and automatic: the planner,
not the user, decides co-residence vs reload from the hardware.

---

## 8. The job lab (Compare + JobPreset + promote)

A new surface that mirrors the **proven** per-action preset lifecycle — we LIFT
it, we do not reinvent:
- `FeaturePreset {action, name, active, providerId, model, system, userTemplate,
  temperature, think}` (`feature_presets_api.py:28-44`); `set_active` +
  `POST /v1/ai/feature-presets/{id}/use` = promote to production (`:52,99-103`);
  "the active preset IS what dispatch runs" (`:14-16`); JW table `feature_presets`
  with `is_active` (`models.py:669-690`).

The job lab:
- **Compare** — multiple columns, each column = **a model + a switch set + the
  job's test prompt** (the Plane-1 "Compare columns" from
  `2026-06-24-llamacpp-switches.md:235-236`). Run-all → per-column
  output/words/tokens-per-sec → pick a winner. **This half does NOT exist yet**
  (#21; the old Writer/Speaker Lab that did this was removed in #12).
- **JobPreset** — same lifecycle as `FeaturePreset`, with `unit = job` and
  **carrying its switch set** (its candidate flags). Build a `JobPreset` store +
  `make_job_presets_router` mirroring `make_feature_presets_router`.
- **Promote** — writes the job's production **model** (the `job_routes` row) **and
  its switches** (the `scope='job'` override). After promote, dispatch resolves
  that job to the promoted model+switches.
- **Routing by feature** (the existing `FeatureWorkbench`) stays as the **rare
  per-action fine-tune** — it gains the per-feature switch override (the
  `scope='feature'` layer).

Is the lab a NEW component or the **same Compare** parameterized by `unit`
(action vs job)? Lean: **one Compare component, `unit`-parameterized** (RULE #7).
Confirm when building #21.

---

## 9. The data model — before → after (one place, so it's clear)

| Concern | Today | After |
|---|---|---|
| Model catalog | `model_catalog` (`models.py:555-576`) | unchanged |
| **Model-default switches** | `model_switches` (`models.py:579-598`) | **base layer**; under Option A renamed/absorbed into `switch_overrides` (`scope='model'`) |
| **Recommendations** | `model_recommendations` job-tagged (`models.py:604-619`) | unchanged (already job-keyed) |
| **Job → model map** | 2 fixed columns `quick_*`/`accuracy_*` on `routing_configs` (`models.py:644-647`) | **`job_routes` child table** `(config_id, job) → provider_id, model` (mirrors `routing_pins`) |
| **Job → switch override** | — | NEW (`scope='job'` rows / `job_route_switches`) |
| Per-feature pin | `routing_pins` `(config_id, feature) → provider_id, model, role` (`models.py:650-663`) | `role` column → **`job`**; same shape |
| Per-feature switch override | — | NEW, rare (`scope='feature'` rows / `pin_switches`) |
| Feature catalog | `FeatureCatalogEntry {…, role, category}` (`routing_api.py:88-98`; data `feature_catalog.py:25-53`) | `role` → **`job`** |
| Dispatch role machinery | `LLMRolesSettings {quick, accuracy}`, `FeaturePinConfig.role`, `LLMConfig.{llm_roles, default_feature_roles}`, `_resolve_role` (`schema.py:60-118`, `dispatch.py:46-57`) | role → **job**: `LLMJobsSettings {jobs: dict}`, `FeaturePinConfig.job`, `LLMConfig.{llm_jobs, default_feature_jobs}`, `_resolve_job` |
| Wire shapes | `RoleTarget`, `RoutingConfig.{quick,accuracy}`, `FeaturePin.role`, `FeatureRow.{defaultRole,role}`, `RoutingResponse.{quick,accuracy}` (`routing_api.py:29-77`) | `JobTarget`, `RoutingConfig.jobs`, `FeaturePin.job`, `FeatureRow.{defaultJob,job}`, `RoutingResponse.jobs` |
| Job lab presets | — (`FeaturePreset` exists for actions) | NEW `JobPreset` + router, mirrors `FeaturePreset` |
| **DB migration** | — | **drop + reseed, no migration** (`2026-06-18-unified-storage-no-idb.md:45-49`) |

---

## 10. Scope / touch points (grounded — what changes, file by file)

**Shared dispatch layer (`just-llm-runner/llm_runner/llm/`):**
- `schema.py:47-72,92-120` — `FeaturePinConfig.role→job`; `LLMRoleTarget→
  LLMJobTarget`; `LLMRolesSettings{quick,accuracy}→LLMJobsSettings{jobs:dict}`;
  `LLMConfig.llm_roles→llm_jobs`, `.default_feature_roles→.default_feature_jobs`.
- `dispatch.py:46-57,85-88,126-140` — `_resolve_role→_resolve_job` (getattr →
  dict lookup); the role legs of `resolve_pin`/`_resolve_action_override` → job.
- `routing_api.py:29-98` — `RoleTarget→JobTarget`; `RoutingConfig.{quick,
  accuracy}→jobs`; `FeaturePin.role→job`; `FeatureRow.{defaultRole,role}→
  {defaultJob,job}`; `FeatureCatalogEntry.role→job`; the GET merge at `:109-126`.
- NEW: a job catalog (the ~4-job shipped list) + `JobPreset` shape/store/router
  mirroring `feature_presets_api.py`.
- The merge mechanism (`lifecycle.py:68-79`) is **already built** — no change.

**JW host (`justwrite-app/server/justwrite_server/`):**
- `models.py:644-647` — drop the `quick_*`/`accuracy_*` columns; add `job_routes`.
- `models.py:650-663` — `routing_pins.role → job`.
- `models.py:579-598` — under Option A, `model_switches` → `switch_overrides`
  (+ scope); under Option B, unchanged + new sibling tables.
- `feature_catalog.py:25-53` — set each feature's `job` (replaces `role`); map all
  19 to the chosen ~4-job set (the §2.2 content decision).
- `seed.py` — seed the job catalog + `job_routes` defaults; the switch seeders
  adopt the chosen storage layout.
- the routing store + `config.py` `LLMConfig` builder — role→job field names.

**Shared UI (`just-llm-runner/ui/src/`):**
- `AiModelsArea.vue:140-145` — add "Routing by job" tab, rename "Features" →
  "Routing by feature".
- `QuickSetup.vue` — role pickers → job pickers (same wizard shape, ~4 buckets).
- `FeatureWorkbench.vue` — "Set all" cascade becomes per-job; gains the
  per-feature switch override.
- NEW: the job **Compare** (#21) — ideally the same Compare component
  parameterized by `unit`.

---

## 11. Build order (after you pick the §6.4 storage option + the §2.2 job set)
1. **Job set + `feature.job`** — choose the ~4 jobs, map all 19 features, set them
   in `feature_catalog.py` + the job catalog + seed. (Content; no behavior yet.)
2. **role → job across the seam** — `schema.py`/`dispatch.py`/`routing_api.py` +
   JW `routing_configs`→`job_routes`, `routing_pins.role→job`, the store +
   `config.py`. QuickSetup pickers. *(Drop+reseed; pytest + ruff + smoke.)*
3. **Switches layered** — implement the chosen storage (§6.4), wire the
   `merge(model, job, feature)` resolution into the runner spawn path (the
   `_merge_overrides` chain already exists). Seed per-job defaults.
4. **Residency manager (#29)** — VRAM budget → `--models-max`, co-resident vs
   reload, dedup identical combos. (Needs router mode in `RunnerService`, task #27.)
5. **Job lab (#21)** — Compare at job grain (one `unit`-parameterized component) +
   `JobPreset` + promote. Per-feature switch override lands in *Routing by feature*.
6. **Editor UI (#30)** — grow `LuModelCatalog` into the model manager (add/edit
   catalog + per-model base switches). (Independent; can come earlier.)

Verification each step: `pytest` + `ruff` (server) + headless smoke (renderer).

---

## 12. Still OPEN (need you)
- **(a) §6.4 — switch storage: Option A (unified, recommended) or B (separate).**
- **(b) §2.2 — the exact job set + mapping all 19 features to one job each.**
- (c) §8 — job lab = new component or the same Compare parameterized by `unit`
  (lean: shared component).

Everything else above is settled design.
