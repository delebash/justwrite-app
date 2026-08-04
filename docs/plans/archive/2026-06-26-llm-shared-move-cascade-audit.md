> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# All-LLM-shared + role→job move — RE-CONFIRMED cascade audit + staged plan (2026-06-26)

> **Status: AUDIT + PLAN ONLY. No code written.** Produced at the user's request
> ("audit + plan only, stop before code") and to re-ground last session's §14.3
> cascade (`2026-06-25-jobs-architecture-design.md`) against the **current** code,
> file-by-file, this session. Every cell cites a path:line read on 2026-06-26.
> This is the doc to greenlight from; it SUPERSEDES the §14.3 list (which it
> confirms ~90% and corrects in 6 places).
>
> **⛔ TARGET SHAPE = design-doc §13, VERBATIM (settled 2026-06-25):** zero LLM-code
> difference between apps; ALL shared — tables, stores, dispatch, `config_builder`,
> the API routers, **the usage sink + pricing**, the GUI, the seed mechanism +
> shared seed data. The ONLY per-app thing is the **3 feature seeds** (feature
> catalog + feature prompts + feature→job map). This doc does NOT re-decide
> placement — it only GROUNDS §13's cascade against current code + the **drop-in**
> build order. (An early draft of this doc wrongly kept `usage_sink`/`pricing`/the
> usage-API "JW-local" and staged around "JV-safety" — both were drifts from §13,
> corrected throughout below. Per user 2026-06-26: "no need for safe — it should
> drop in to JV or any app, run seed, and it works.")

## What this move is (the target, from the design doc §0–§13)

Two **orthogonal axes**, bundled by the design as one move:

- **Axis A — storage convergence.** Move ALL 12 LLM tables + the 10 store classes
  + the LLM seeders + the `LLMConfig` builder out of JustWrite into the shared
  `just-llm-runner/llm_runner/llm/` package (new `db.py` · `stores.py` · `seed.py`
  · `config_builder.py`). JW becomes a thin consumer that supplies only its
  feature-catalog DATA. "Any app drops the LLM in and it just works."
- **Axis B — `job` REPLACES `role`.** Drop `LLMRolesSettings`/`LLMRoleTarget`/
  `quick`/`accuracy`/the `role` fields everywhere; the routing unit becomes the
  editable `job` (the `jobs`/`feature_jobs` tables already exist, additively).

## Method — three independent reconciliation passes (per the user's "think 3×")

Done inline (RULE #2/#3 forbid subagent audits — they vibe). Three lenses over
the same line-by-line reads, then reconciled:

1. **Forward** — inventory every `role`/`quick`/`accuracy` site + every storage
   unit that moves (what's actually there).
2. **Adversarial** — assume §14.3 is wrong; hunt for files it MISSED or
   symbols it MISSTATED.
3. **Consumer sweep** — `grep` every importer of each removed/renamed symbol
   across all three repos to bound the true blast radius.

### Reconciliation verdict
The three passes **converge**: §14.3's ~25-file cascade is substantially correct.
Pass 2 (adversarial) found **6 corrections/additions**, all folded into the
tables below:

| # | §14.3 said | Reality (grounded) |
|---|---|---|
| C1 | (omitted) | **Usage axis = SHARED (not JW-local).** `llm_usage` is a shared table (§13:243), so `usage_sink.py` + `pricing.py` move to the shared package too — §13 says ZERO LLM-code difference. (First draft wrongly kept them JW-local on "host policy: JV in-memory" — that was the banned RULE #7 §B reflex copying the pre-convergence code; §13 already settled it as shared. JV gets the DB sink on drop-in.) |
| C2 | (omitted) | **Duplicate usage surface → RETIRE.** `/v1/llm-usage` (`api/llm_usage.py`) duplicates the shared `/v1/ai-usage` (`api.py` ledger snapshot, used by `AiModelsArea.vue:79,91`). Retire `/v1/llm-usage`; the shared `/v1/ai-usage` is the one surface. |
| C3 | "8 stores" | 8 store **files** = **~11 store classes** (`routing_store` has 2, `model_catalog_store` has 2, `jobs_store` has 2). The shared `stores.py` implements all 11. |
| C4 | "delete config.py" | True, but note: `app.py:195` (`make_feature_router(get_prompt_store, llm_config)`) and `app.py:225-246` (runner catalog injection via `get_model_catalog_store`) are extra rewire points that depend on moved pieces. |
| C5 | "all 19 features" | Actually **20** (`feature_catalog.py:25-53`; `test_routing.py:19` asserts `len==20`; `DEFAULT_FEATURE_JOBS` maps 20, `seed.py:285-310`). |
| C6 | "JV: ignore, it breaks" | True — but the **two axes have DIFFERENT JV blast radius**, and that reshapes the staging (below). |

## ⭐ The load-bearing insight Pass 2 surfaced — the axes split on JV

JV does **not** import JW's stores (it has its own settings-blob storage — recap:
"JV NOT YET de-blobbed"). JV **does** import the shared `schema`
(`JustVoice/server/justvoice/models.py:26-27` → `LLMRolesSettings`,
`LLMRoleTarget`; `engines/llm/config.py:51,53` → `llm_roles`,
`default_feature_roles`). Therefore:

- **Axis A (storage move) is genuinely JV-SAFE** — it touches JW + the shared
  package's new files only; JV imports none of it.
- **Axis B (role→job rename) BREAKS JV** — it deletes the shared symbols JV
  imports. On the shared branch (`claude/admiring-galileo-il3q0o`, which BOTH
  apps pin) JV will not boot/test until JV adopts.

The axis distinction is a real *technical* ordering (storage can land before the
rename), but per the user it does **NOT** drive staging — we do **not** protect JV.
JV breaks at the rename and is fixed as a one-call drop-in later (Phase 3). Staging
is by repo-green + reviewable diffs only (build order below).

---

## Per-unit strict-diff (BEFORE → AFTER, file:line, this session's reads)

Legend — **Axis**: A=storage, B=rename. **Stage**: see staging section.

### SHARED `just-llm-runner/llm_runner/llm/` — NEW files (absent today, confirmed by glob)

| File | What it absorbs (source, file:line) | Axis | Stage |
|---|---|---|---|
| `db.py` | `LlmBase = declarative_base()` + the 12 tables lifted from JW `models.py:502-778` (snake columns, app-agnostic) + `configure_storage(SessionLocal)` + `create_all(engine)` + a `metadata` accessor. | A | 0 |
| `stores.py` | The 11 store classes — bodies are **near-identical** to JW's (verified): `ProviderStore`(`provider_store.py`), `RoutingStore`+`RoutingPresetStore`(`routing_store.py`), `FeaturePresetStore`(`feature_preset_store.py`), `PromptStore`(`prompt_store.py`), `RecommendationStore`(`recommendation_store.py`), `ModelCatalogStore`+`ModelSwitchStore`(`model_catalog_store.py`), `JobStore`+`FeatureJobStore`(`jobs_store.py`) — now over the shared session + shared models. | A | 0 |
| `seed.py` | Shared `DEFAULT_PROVIDERS/CATALOG/SWITCHES/RECOMMENDATIONS/JOBS` + seeders (lifted from JW `seed.py:48-342`) + `configure_app_seed(feature_catalog=…, feature_jobs=…, feature_prompts=…)` hook for per-app data + a `seed_llm(db)` orchestrator. Per §13 split: providers/catalog/switches/recommendations/jobs/routing-active-row = SHARED; feature_jobs + feature_prompts + feature_catalog = per-app via the hook. | A | 0 |
| `config_builder.py` | `build_llm_config(feature_catalog) -> LLMConfig` (**job-native**) — replaces JW `config.py:48-90` `llm_config()` AND JV `engines/llm/config.py`. Reads the shared routing+provider+feature_jobs stores; resolves feature→job→model. | A/B | 1 |
| `usage_sink.py` | DB usage sink over the shared `llm_usage` table — **moved from** JW `llm/usage_sink.py` (shared per §13:243; JV gets it on drop-in). | A | 1 |
| `pricing.py` | cost-per-model rates + `cost_for()` — **moved from** JW `llm/pricing.py` (shared — rates are by model, not by app). | A | 1 |
| `install_llm.py` | `install_llm(app, SessionLocal, *, feature_catalog, feature_prompts, feature_jobs, asset_dirs=None)` — the **ONE drop-in call**: `create_all(LlmBase)` + `configure_storage` + mount every router + set DB usage sink + inject runner catalog + register app feature seeds + contribute LLM metadata to backup/reset. (§13:240 "boot wiring".) | A | 1 |

### SHARED — CHANGE (Axis B rename)

| File | Current (file:line) | Change |
|---|---|---|
| `schema.py` | `LLMRoleTarget` (60-65); `LLMRolesSettings` (67-72); `FeaturePinConfig.role` (57); `LLMConfig.llm_roles` (116) + `default_feature_roles` (118) | DROP role classes + fields; ADD `LLMConfig.jobs: dict` + `feature_jobs: dict` (keep `prefer_local_features`). |
| `dispatch.py` | `_resolve_role` (46-57); `pin.role` branches (85-86, 129-132); `default_feature_roles` (136-138) | `_resolve_role`→`_resolve_job`; chain = action→production→explicit-pin→**feature's-job→job-route**→prefer-local→first. |
| `routing_api.py` | `RoleTarget` (29); `RoutingConfig.quick/accuracy` (51-52) + `.jobs` (57, additive); `FeaturePin.role` (44); `FeatureRow.defaultRole/role` (67,70); `RoutingResponse.quick/accuracy` (75-76) + `.jobs` (77); merge (122,125) | DROP quick/accuracy + role/defaultRole; KEEP `jobs`; `RoleTarget`→`JobTarget` (also rename in the `jobs` map type); `FeatureCatalogEntry.role` (102) dropped. |
| `feature_presets_api.py` | `FeaturePreset.role` (38) | DROP `role` (test doesn't exercise it — low impact). |
| `__init__.py` | exports `LLMRolesSettings`/`LLMRoleTarget` (43-54 block, 85-86, 96-97) | drop those exports; add `JobTarget` if renamed. |
| `recommendations_api.py` | `SUGGESTED_JOBS` includes `quick`/`accuracy` (36) | cosmetic — refresh suggestions to chat/prose/extraction/analysis (freeform; non-breaking). |
| `prompts.py` | `make_feature_router(store, llm_config)` (10, 34-35) | NO structural change; verify the config-builder arg still satisfied by `build_llm_config`. KEEP. |
| `api.py` / `registry.py` / `base.py` / `usage.py` / `tiers.py` | no role/storage refs (`tiers` uses `FeaturePinConfig.tier` — tier stays) | KEEP; verify `/v1/ai-usage` snapshot unaffected. |

### SHARED — TESTS (Axis B)

| File | Current (file:line) | Change |
|---|---|---|
| `tests/test_llm_dispatch.py` | imports `LLMRolesSettings`/`LLMRoleTarget` (20-21); `test_explicit_pin_beats_role` (84-93), `test_pin_inherits_role` (95-103), `test_default_feature_role` (106-114) | rewrite the 3 role tests to jobs; drop the imports. |
| `tests/test_routing_api.py` | `FeatureCatalogEntry(..., role=)` (28-29); `defaultRole` assert (47) | drop `role=`; assert on job. |
| `tests/test_routing_presets.py` | `RoleTarget`, `quick=` (11,59) | `JobTarget`/`jobs`. |
| `tests/test_feature_presets.py` | no `role` in the test body | verify-only (schema field drop doesn't break it). |

### JW `server/justwrite_server/` — CHANGE

| File | Current (file:line) | Change | Axis/Stage |
|---|---|---|---|
| `database.py` | `Base.metadata.create_all` only (55) | + `LlmBase.metadata.create_all(engine)` + `configure_storage(SessionLocal)` so shared stores use JW's session. | A / 1 |
| `app.py` | store-getter imports (176-187); `make_feature_router(get_prompt_store, llm_config)` (195); runner injection `_jw_catalog_fn`/`_jw_switches_fn`→`_configure_runner` (225-246) | repoint getters to shared `stores.py`; pass shared `build_llm_config(FEATURE_CATALOG)`; runner injection uses shared `get_model_catalog_store`/`get_model_switch_store`; call `configure_app_seed(...)` at boot. | A / 1 |
| `models.py` | the 12 LLM tables (502-778) | DROP all 12 (now in shared `db.py`); KEEP domain (49-497) + sessions (781-816). | A / 1 |
| `seed.py` | LLM seeders + `DEFAULT_*` (48-342); `seed_default_routing` (345-355); `seed_workspace` (390-417) | DROP LLM seeders → call shared `seed_llm`; register JW feature DATA (catalog/feature_jobs/prompts) via `configure_app_seed`; KEEP demo (358-372) + orchestration. | A / 1 |
| `data_admin.py` | `_reset` iterates `Base.metadata` (26); `make_data_router(metadata=Base.metadata)` (38) | iterate BOTH `Base.metadata` + `LlmBase.metadata`; pass both to the router (reset + backup must cover LLM tables). | A / 1 |
| `migrations.py` | LLM migration block (52-98): llm_providers rebuild (52-58), feature_prompts rebuild (64-70), max_tokens (74-77), feature_presets rebuild (81-87), routing_configs cols (92-98) | DELETE the LLM block (obsolete under shared + drop/reseed); KEEP `kv` drop (46) + `projects` migration (100-106) + `migrate_blobs`. | A / 1 |
| `api/llm_usage.py` **[C2]** | `from ..models import LlmUsage` (22); the `/v1/llm-usage` router | **RETIRE** — duplicate of the shared `/v1/ai-usage`. (`usage_sink.py` + `pricing.py` MOVE to shared — see the shared NEW-files table, not here.) | 2 |
| `feature_catalog.py` | every `FeatureCatalogEntry(..., role, ...)` (27-52) | drop the `role` positional → `(key,label,hint,category)`; stays JW DATA, passed via `configure_app_seed`. | B / 2 |
| `cli.py` | (not read in full) | verify: `init_db` creates BOTH bases before `seed_workspace`; likely no change. | A / 1 (verify) |

### JW — DELETE (→ shared `stores.py`/`config_builder.py`/`seed.py`)

`llm/config.py` · `llm/routing_store.py` · `llm/provider_store.py` ·
`llm/recommendation_store.py` · `llm/model_catalog_store.py` ·
`llm/feature_preset_store.py` · `llm/prompt_store.py` · `llm/jobs_store.py`
(**8 files**). **MOVE TO SHARED:** `llm/pricing.py` + `llm/usage_sink.py` (the DB
usage sink over the shared `llm_usage` table — shared per §13, NOT host-policy-local).
**KEEP (per-app):** `seed_feature_prompts.py` (feature prompt DATA, registered via the
hook); the app's own non-LLM domain (chapters/projects).

### JW — TESTS

| File | Change |
|---|---|
| `tests/test_routing.py` | drop `DEFAULT_FEATURE_ROLES` import (9); rewrite role asserts (18,29,54,59-60,63,72-73) to jobs; keep `len==20` (19). (Axis B / 2) |
| `tests/test_seed.py` | provider/demo asserts are storage-agnostic — verify green after the shared seed move. (A / 1) |
| `tests/test_migrations.py` | likely asserts on the dropped LLM migrations → update/trim. (A / 1) |
| `tests/test_ai_features.py`, `test_ai_prompts.py`, `test_llm_providers.py` | exercise surviving endpoints — verify green. (A / 1) |

### GUI `just-llm-runner/ui/src/` (the headless-smoke gate)

| File | Current (file:line) | Change | Stage |
|---|---|---|---|
| `views/AiModelsArea.vue` | tab nav (140-146) | ADD a "Routing by job" tab beside "Features". | 3 |
| `views/FeatureWorkbench.vue` | role cards `['quick','accuracy']` (451-453); `defaultRole` (66,234); `routing.quick/accuracy` (37,62-63,273); `pin.role` (178-179,206-207,233,284,311-312); rchip css (593-594) | role cards → jobs list; `defaultRole`→job; pins → explicit-model-only; add per-feature **job dropdown**. (Heaviest GUI unit.) | 3 |
| `views/QuickSetup.vue` | `quick/accuracy` picks (37,44,51,80,181,190,218-219); `pins f.role` (207) | iterate the editable jobs list instead of fixed quick/accuracy; pins explicit. | 3 |
| `components/LuModelPicker.vue` | `role:quick`/`role:accuracy` options (103-104); `pin.role` (41,42,87,89) | drop role options; explicit-model (or job) only. | 3 |
| `views/RecommendationsEditor.vue` | `SUGGESTED_JOBS` (33) | refresh to chat/prose/extraction/analysis (cosmetic; already freeform). | 3 |

### JV (IGNORE per user; **breaks at Stage 2**, adopts at Stage 4)

Breakers (consumer-sweep grep): `models.py:26-27,290`; `engines/llm/config.py:28,51,53,54`;
`app.py:41,232` (`llm_roles_api`); `api/feature_pins_api.py:21,129`;
`storage/settings_store.py:94`; tests `test_llm_roles.py`, `test_camel_aliases.py`,
`test_persona_rewrite.py`.

---

## Build order — drop-in is the target (no JV-safety staging)

§13 + user (2026-06-26): *"no need for safe — it should drop in to JV or any app, run
seed, and it works."* Staging is by **repo-green + reviewable diffs only**, NOT by
protecting JV. The per-unit tables above map to phases: **every SHARED-side row →
Phase 1; every JW-side row → Phase 2; GUI → Phase 2 (smoke runs through JW).**

- **Phase 1 — `just-llm-runner` becomes the complete, job-native, drop-in package.**
  NEW `db.py` · `stores.py` · `seed.py` (shared seed DATA + `configure_app_seed` hook)
  · `config_builder.py` · `install_llm.py`; MOVE `usage_sink.py` + `pricing.py` in;
  role→job across `schema`/`dispatch`/all `*_api`/`__init__` + shared tests; GUI →
  job-native. **Verify:** runner `pytest` + `ruff` green; `vite build` clean.
  **Commit (runner green on its own).**
- **Phase 2 — `justwrite-app` becomes a thin consumer.** Delete the 8 stores +
  `config.py`; `models.py` drop the 12 LLM tables; `database.py` create both bases;
  `app.py` → ONE `install_llm(...)` with JW's 3 feature seeds; `seed.py` drop LLM
  seeders (call shared; keep demo); `data_admin`/`migrations` LLM coverage from the
  shared package; `feature_catalog` drop role; **retire `/v1/llm-usage`**; JW tests →
  job. **Verify:** JW `pytest` + `ruff` + **headless smoke** green. **Commit (JW green).**
- **Phase 3 — drop-in proven (any app, whenever).** JV: delete `engines/llm/*`, call
  `install_llm(...)` with JV's feature seeds, run seed. Same recipe for any future app.

Repos are separate, so Phase-1's commit is green for `just-llm-runner` even before JW
migrates — no "broken intermediate," no role kept "for safety." JV breaking at the
rename is expected and irrelevant — it's a one-call drop-in (Phase 3).

## Scope guard (what this move is NOT)
- NOT the switch-presets/`switch_presets`/`flag_catalog` DB redesign (design §4/§6)
  — that's a later step; this move keeps the existing `model_switches` shape.
- NOT the residency manager (#29) / router mode (#27) / job lab (#21).
- NOT the model-manager editor UI (#30).
This move = storage convergence (A) + role→job (B) only.
