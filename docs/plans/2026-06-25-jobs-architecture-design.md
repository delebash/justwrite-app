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

> **⛔ STANDING PRINCIPLE (user, 2026-06-25): no hardcoded routing/classification —
> it is SEEDED, USER-EDITABLE data.** "Remember no hardcoded, only seed data that
> should be user editable in most cases." So the **job set**, each **feature's job**,
> the **job→model map**, and the **switches** all ship as factory seed rows in the DB
> and are editable in the UI (merge-by-key seeders + reset-to-factory, exactly like
> `model_catalog`/`model_switches`/`model_recommendations`). The Python `feature_catalog.py`
> stays the app-defined *list of which features exist* (code-bound — a feature exists
> because there's code for it); its **job assignment moves OUT** of that constant into a
> seeded-editable `feature_jobs` table.

### 2.1 — `job` REPLACES `role` as the routing unit
- **Today:** routing stores two fixed role targets, `quick`+`accuracy`
  (wire: `RoutingConfig.quick/accuracy`, `routing_api.py:47-53`; dispatch:
  `LLMRolesSettings {quick, accuracy}`, `schema.py:67-72`; resolve:
  `_resolve_role` does `getattr(roles, role)`, `dispatch.py:46-57`); each feature
  carries a **hardcoded** fallback `role` (`FeatureCatalogEntry.role`,
  `routing_api.py:97`; e.g. `feature_catalog.py:27`).
- **After:** a **job → (model + switches) map** + **`feature.job` as editable seed
  data** + dispatch resolves **feature → job → model+switches**. `quick`/`accuracy`
  retire into the job set.
- This is a **rename + reshape across one well-defined seam**, not a fork — the
  exact files/symbols are listed in §10.

### 2.2 — Jobs are a USER-EDITABLE list, not a locked set of 4 (user, 2026-06-25)
The job set is **not** hardcoded and **not** capped at 4 — it's a **user-editable
list** (add / rename / remove), seeded with our best guess **`chat · prose ·
extraction · analysis`**. Likewise the **feature→job mapping** is **seeded with our
best guess** (we map all 19 features now) and then **editable per feature via a
dropdown** — we may have guessed a feature's task type wrong, so the user
re-classifies it with no code change.
- **`jobs`** `(job_key → label, description, position, built_in)` — seeded, full CRUD.
- **`feature_jobs`** `(feature_key → job_key, built_in)` — seeded best-guess mapping;
  editable per feature (the dropdown, in *Routing by feature*). `feature_catalog.py`
  stops carrying the job.
- **Integrity (NEW — needs a rule, §12):** when a user deletes/renames a job that
  `feature_jobs` + `job_routes` reference, we must not orphan them. Recommended: keep
  one **un-deletable default job** + **block delete while a job is in use** (or
  reassign-on-delete); dispatch falls back to the global default LLM if a feature's
  job is ever missing.

### 2.3 — Per-feature override = EXPLICIT MODEL ONLY (the pin drops its role/job leg)
Decision (user): the per-feature override is an **explicit provider+model**, NOT
"inherit a different job." So the pin stops carrying a routing role —
`FeaturePin.role` (`routing_api.py:44`), `FeaturePinConfig.role` (`schema.py:57`),
and `routing_pins.role` (`models.py:663`) are **dropped**; the pin is just
`{providerId, model}`. The pin's "inherit a role" legs in `resolve_pin` /
`_resolve_action_override` (`dispatch.py:85-88,129-132`) are **removed**.

Two distinct, editable per-feature controls in *Routing by feature*:
1. **Job dropdown** (§2.2) — the feature's *classification* → writes `feature_jobs`.
2. **Model picker** — *inherit* (shows the feature's job model, live) **or** an
   explicit override → writes / clears a `routing_pins` row.

**Resolve LIVE, never copy.** The model picker DISPLAYS the inherited job model; it
never stamps it. Changing a job's model is ONE write to `job_routes`; every feature
in that job updates automatically (no 19 drifting copies — RULE #8). New dispatch
chain: action override → production config → **explicit pin** → **feature → job →
job route** → prefer-local → first registered.

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

### 2.7 — The job lab = Compare + PERSISTENT JobPreset + promote (user, 2026-06-25)
**See §8.** Confirmed: the job lab is where you **compare model A vs model B with
different params/switches** for a job — and because you'll try several settings and
want to **save what you tested instead of guessing again**, a JobPreset is a
**persistent, named save/load** (many per job, one promoted), mirroring the per-action
`FeaturePreset` lifecycle (`feature_presets_api.py:28-44,99-103`).

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

### 6.4 — Storage for the override switches (reasoned on the merits)
The *layering shape* above is settled. The remaining decision is the storage
layout for the NEW per-job / per-feature override switches (and later the preset
candidates). Reasoned on engineering merits — NOT on line count:

> **First cut was wrong.** I first recommended one polymorphic `switch_overrides`
> table and justified it as "least code / one source." "Least code" is a proxy
> metric, not a reason (PRIORITY RULE #1). Reasoning to the merits flips the
> answer.

**Recommendation — a child table per owner, each a real FK child of its parent,
all served by ONE shared store implementation:**
- `model_switches` (BUILT) **stays** — base layer; `CASCADE` FK → `model_catalog`
  (`models.py:591-595`). (Not renamed.)
- `job_route_switches (config_id, job, flag_name)` — `CASCADE` FK → `job_routes`.
  *(per-job override; the common case)*
- `pin_switches (config_id, feature, flag_name)` — `CASCADE` FK → `routing_pins`.
  *(rare per-feature override)*
- *(later, with the lab #21)* `job_preset_switches` / `feature_preset_switches` —
  FK → their preset rows.

**Why, on the merits (each is a reason a senior engineer defends, not a proxy):**
1. **Referential integrity — and we already HAVE it.** A switch row is meaningless
   without its owner; we want the DB itself to forbid orphans and `CASCADE`-delete
   switches when the owner is removed. A real FK does that — `model_switches`
   already has one (`models.py:591-595`). A single polymorphic table **cannot**
   carry a FK (one column can't reference three parent tables), so it would
   *downgrade* the integrity we have today and shove orphan-cleanup into app code.
   Trading away enforced integrity to reduce table count is the wrong trade.
2. **No real duplication — the LOGIC is shared once.** The thing that must not be
   duplicated is behavior (list/upsert/delete/reset/parse/merge). It already lives
   once: the shared `SwitchRow` + `ModelSwitchStore` Protocol + `make_switches_router`
   factory (`model_catalog_api.py:99-155`), and the store body
   (`model_catalog_store.py:112-167`) is generic over `(ORM class, key columns,
   seed data)` — ONE implementation serves every owner. The separate *table
   declarations* are a few lines each and describe genuinely **distinct
   relationships** (model→switches ≠ job→switches ≠ feature→switches). Distinct,
   correctly-separate declarations are not "duplication"; conflating them via a
   `scope` discriminator is what trades correctness for a proxy.
3. **The layering itself kills the duplication that WOULD matter.** Model-intrinsic
   flags (MoE→`spec_type=none`) live ONCE in `model_switches` and compose into
   every job via `_merge_overrides` — instead of being copied into each job's
   override. The model-base layer is the *anti-duplication* home for model facts.
4. **Clarity at the query.** "switches WHERE `config_id=? AND job=?`" reads off a
   table whose every row IS a job switch — no `scope` filter, no overloaded
   composite `scope_key`, no model/job/feature rows mixed in one table.

**Rejected — one polymorphic `switch_overrides(scope, scope_key, flag_name)`
table.** Its *only* advantage is fewer table declarations (a proxy). It sacrifices
the FK/`CASCADE` integrity we already have and overloads `scope_key` into a
composite string. Rejected on the merits.

> **My reasoned recommendation: FK-backed child tables + one shared generic store.**
> This is the only storage decision blocking the build — your call, but I'd defend
> this one.

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
- **JobPreset (persistent, many per job)** — same lifecycle as `FeaturePreset`:
  several **named saved configs per job** so you keep what you tested and can review
  it instead of guessing again; one is `active`/promoted. Each carries its candidate
  switch set (`job_preset_switches`). Build a `JobPreset` store +
  `make_job_presets_router` mirroring `make_feature_presets_router`.
- **Promote** — writes the job's production **model** (`job_routes`) **and its
  switches** (`job_route_switches`). After promote, dispatch resolves that job to the
  promoted model+switches.
- **Routing by feature** (the existing `FeatureWorkbench`) holds the **per-feature
  controls**: the job-classification **dropdown** (§2.3, writes `feature_jobs`) + the
  explicit-model override + the rare per-feature switch override (`pin_switches`).

Is the lab a NEW component or the **same Compare** parameterized by `unit`
(action vs job)? Lean: **one Compare component, `unit`-parameterized** (RULE #7).
Confirm when building #21.

---

## 9. The data model — before → after (one place, so it's clear)

| Concern | Today | After |
|---|---|---|
| Model catalog | `model_catalog` (`models.py:555-576`) | unchanged |
| **Model-default switches** | `model_switches` (`models.py:579-598`) | **stays as-is** — the base layer (FK→`model_catalog` CASCADE). Not renamed. |
| **Recommendations** | `model_recommendations` job-tagged (`models.py:604-619`) | unchanged (already job-keyed) |
| **Job → model map** | 2 fixed columns `quick_*`/`accuracy_*` on `routing_configs` (`models.py:644-647`) | **`job_routes` child table** `(config_id, job) → provider_id, model` (mirrors `routing_pins`) |
| **Job → switch override** | — | NEW `job_route_switches (config_id, job, flag_name)`, FK→`job_routes` CASCADE |
| Per-feature pin | `routing_pins` `(config_id, feature) → provider_id, model, role` (`models.py:650-663`) | `role` column **DROPPED**; pin = explicit `(provider, model)` override only |
| Per-feature switch override | — | NEW, rare `pin_switches (config_id, feature, flag_name)`, FK→`routing_pins` CASCADE |
| Switch store/shape/router | shared `SwitchRow`/`ModelSwitchStore`/`make_switches_router` (`model_catalog_api.py:99-155`) | **unchanged** — ONE generic store serves all switch tables (no logic duplication) |
| Feature catalog (the LIST) | `FeatureCatalogEntry {…, role, category}` (`routing_api.py:88-98`; `feature_catalog.py:25-53`) | drops `role` — stays the **app-defined list of features** (+ label/hint/category) |
| **Job list** | — | NEW `jobs (job_key → label, description, position, built_in)` — seeded 4-guess, **user CRUD** |
| **Feature → job map** | hardcoded `feature.role` + `DEFAULT_FEATURE_ROLES` | NEW `feature_jobs (feature_key → job_key, built_in)` — seeded best-guess, **editable per-feature dropdown** |
| Dispatch role machinery | `LLMRolesSettings {quick, accuracy}`, `FeaturePinConfig.role`, `LLMConfig.{llm_roles, default_feature_roles}`, `_resolve_role` (`schema.py:60-118`, `dispatch.py:46-57`) | `LLMJobsSettings {jobs: dict}` (job map); **`FeaturePinConfig.role` DROPPED** (explicit-only pin); `LLMConfig.{llm_jobs, feature_jobs}` (latter built from the `feature_jobs` table); `_resolve_role→_resolve_job` |
| Wire shapes | `RoleTarget`, `RoutingConfig.{quick,accuracy}`, `FeaturePin.role`, `FeatureRow.{defaultRole,role}`, `RoutingResponse.{quick,accuracy}` (`routing_api.py:29-77`) | `JobTarget`, `RoutingConfig.jobs` (dict), **`FeaturePin.role` DROPPED** (`{providerId, model}`), `FeatureRow.{defaultJob,job}`, `RoutingResponse.jobs` |
| Job lab presets | — (`FeaturePreset` exists for actions) | NEW `JobPreset` + router, mirrors `FeaturePreset` |
| **DB migration** | — | **drop + reseed, no migration** (`2026-06-18-unified-storage-no-idb.md:45-49`) |

---

## 10. Scope / touch points (grounded — what changes, file by file)

**Shared dispatch layer (`just-llm-runner/llm_runner/llm/`):**
- `schema.py:47-72,92-120` — `FeaturePinConfig.role→job`; `LLMRoleTarget→
  LLMJobTarget`; `LLMRolesSettings{quick,accuracy}→LLMJobsSettings{jobs:dict}`;
  `LLMConfig.llm_roles→llm_jobs`, `.default_feature_roles→.default_feature_jobs`.
- `dispatch.py:46-57,85-88,126-140` — `_resolve_role→_resolve_job` (getattr →
  dict lookup over the job map); **REMOVE** the pin's role legs in
  `resolve_pin`/`_resolve_action_override` (`:85-88,129-132` — pin is explicit-only);
  the `default_feature_roles` leg (`:136-140`) becomes feature → job (from
  `feature_jobs`) → job route.
- `routing_api.py:29-98` — `RoleTarget→JobTarget`; `RoutingConfig.{quick,
  accuracy}→jobs` (dict); **`FeaturePin.role` DROPPED** (explicit-only);
  `FeatureRow.{defaultRole,role}→{defaultJob,job}`; **`FeatureCatalogEntry.role`
  removed**; the GET merge at `:109-126` joins `feature_jobs`.
- NEW shared shapes/Protocols/routers (the `RoutingStore` pattern): a **`jobs`**
  list (user CRUD), a **`feature_jobs`** map (seeded + editable), and a `JobPreset`
  save/load mirroring `feature_presets_api.py`.
- The merge mechanism (`lifecycle.py:68-79`) is **already built** — no change.

**JW host (`justwrite-app/server/justwrite_server/`):**
- `models.py:644-647` — drop the `quick_*`/`accuracy_*` columns; add `job_routes`.
- `models.py:650-663` — `routing_pins` **drops `role`** (pin = explicit provider+model).
- `models.py:579-598` — `model_switches` unchanged; ADD `job_route_switches` +
  `pin_switches` sibling child tables (each a CASCADE FK to its parent), served by
  the existing shared `SwitchRow`/`ModelSwitchStore`/`make_switches_router` via one
  generic store (§6.4).
- `feature_catalog.py:25-53` — **remove the per-feature `role`** (the list stays;
  job moves to data).
- `seed.py` — NEW `DEFAULT_JOBS` (the 4-guess) + `DEFAULT_FEATURE_JOBS` (best-guess
  mapping of all 19) + `job_routes` defaults — all merge-by-key seeders; the new
  switch tables seed alongside `model_switches`.
- NEW JW tables + stores: `jobs`, `feature_jobs`, `job_routes` (+ switches),
  `job_presets` (+ switches). The routing store + `config.py` `LLMConfig` builder
  read jobs/feature-jobs instead of roles.

**Shared UI (`just-llm-runner/ui/src/`):**
- `AiModelsArea.vue:140-145` — add "Routing by job" tab, rename "Features" →
  "Routing by feature".
- `QuickSetup.vue` — role pickers → **job pickers iterated from the editable `jobs`
  list** (not a fixed set).
- `FeatureWorkbench.vue` (*Routing by feature*) — per feature: a **job dropdown**
  (writes `feature_jobs`) + the model picker (inherit/explicit) + the rare switch
  override; "Set all" becomes per-job. Plus a small **job-list editor** (add/rename/
  remove jobs).
- NEW: the job **Compare** (#21) — ideally the same Compare component
  parameterized by `unit`.

---

## 11. Build order
*(Switch storage = §6.4 FK child tables; jobs + feature→job ship as editable seed
data we refine in-app — nothing blocks step 1.)*
1. **Jobs + feature→job as editable data** — NEW `jobs` (seeded 4-guess, CRUD) +
   `feature_jobs` (seeded best-guess mapping of all 19, per-feature dropdown) tables +
   stores + seeders; remove `role` from `feature_catalog.py`. (The mapping is a guess
   we refine in-app, not a blocking content decision.)
2. **role → job across the seam** — `schema.py`/`dispatch.py`/`routing_api.py` +
   JW `routing_configs`→`job_routes`, drop `routing_pins.role`, the store +
   `config.py`. QuickSetup job pickers. *(Drop+reseed; pytest + ruff + smoke.)*
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

## 12. Still OPEN (smaller points — none block the build)
- **(a) §2.2 — job-deletion integrity:** keep one **un-deletable default job** +
  **block delete while a job is in use** (or reassign-on-delete)? *(My recommendation;
  confirm.)*
- **(b) §8/§2.9 — the job's test-prompt source:** a `test_feature` column on the
  `jobs` row (which feature's prompt Compare borrows, editable), or pick one per
  Compare run? *(Lean: a `test_feature` on the job row.)*
- (c) §8 — job lab = new component or the **same Compare** parameterized by `unit`
  *(lean: shared component)*.
- (d) §2.2 — feature→job scope: **GLOBAL** (one classification) vs per-routing-config
  *(lean: global — a feature's task type doesn't change between presets)*.

**Settled:** switch storage (§6.4 FK child tables) · jobs + feature→job are
user-editable seed data (§2.2) · per-feature override is explicit-model-only (§2.3) ·
JobPreset is persistent (§2.7). The feature→job mapping is a best-guess we seed and
refine in-app — not a blocking decision.
