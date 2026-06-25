# Jobs architecture — `job` replaces `role`, + the job lab (2026-06-25 DESIGN)

Design record from the 2026-06-25 morning design conversation. **DESIGN ONLY —
nothing here is built yet.** It sits on top of the *built* catalog/switches/
recommendations DB layer (see `2026-06-25-llm-catalog-db-cutover.md`). Every
code claim is cited from reads this session.

> One-line: a model is chosen, tested, and recommended **per job** (~4 task
> archetypes), not per feature (37) and not per the 2 coarse roles. Features
> inherit their job's model; a per-feature pin overrides.

---

## Why (the problem)

Per-FEATURE model config/testing (37 actions) is too fine — nobody tunes each
feature. Features cluster by **task shape**. The 2 roles (`quick`/`accuracy`) are
too coarse (a model great at extraction can be poor at prose, both "accuracy").
And `category` (8 nav groups) is nav-shaped, not task-shaped — "Whole book" lumps
`plotHoles` (extraction) with `marketingPack` (prose) (`feature_catalog.py:36,39`).
So the right grain is a deliberate **~4-job** set in between.

Also found this session: today **`job` is mostly dead data** — `model_recommendations.job`
exists but only `quick`/`accuracy` are ever consumed (by QuickSetup `prefillRoles`,
`QuickSetup.vue:145-146`); `attribution`/`prose`/`chat`/… have no reader. This design
gives `job` a real, central purpose.

---

## Decisions (user, 2026-06-25)

1. **`job` REPLACES `role` as the routing unit.**
   - Today: routing stores two fixed `RoleTarget`s, `quick`+`accuracy`
     (`routing_api.py:51-52`); dispatch resolves feature→role
     (`dispatch.py:129-140`); the catalog carries `feature.role`
     (`FeatureCatalogEntry`, `routing_api.py:94-98`; e.g. `feature_catalog.py:27`).
   - After: a **job→model map** (~4 jobs) + **`feature.job`** + dispatch resolves
     **feature → job → model**. `quick`/`accuracy` retire into the job set.

2. **~4 jobs — set + per-feature mapping is OPEN.** Tentative: `chat · prose ·
   extraction · analysis`. NOT auto-derivable from `role`(2) or `category`(8);
   needs deliberate human mapping of all 19 features to exactly one job each.

3. **Per-feature override = the EXISTING `FeaturePin` — no new machinery.**
   `resolve_pin` already does pin → role → default (`dispatch.py:126-140`);
   `FeaturePin` is `{providerId, model, role}` (`routing_api.py:41-44`).
   **Resolve LIVE, do not copy:** a feature's dropdown DISPLAYS its inherited job
   model; choosing another writes a pin (override); reset deletes the pin.
   "Apply a job's model" = ONE write to the job→model map; every inheriting feature
   updates automatically — never write the same model into 19 rows that drift (RULE #8).

4. **`job` = ONE organizing concept** — the routing unit + the
   `model_recommendations.job` tag (already exists → finally meaningful) + the
   Compare unit. Recommendations need no schema change.

5. **The job lab** = multi-column **Compare** (at job grain) + **JobPreset** +
   promote-to-production. It MIRRORS the proven per-ACTION preset lifecycle:
   - `FeaturePreset {action, name, active, providerId, model, …}`
     (`feature_presets_api.py:28-44`); `set_active` / `POST /v1/ai/feature-presets/
     {id}/use` = production (`:99-103`); "the active preset IS what dispatch runs"
     (`:14-16`); JW `feature_presets.is_active` (`models.py:669-682`).
   - **JobPreset** = same lifecycle, `unit = job`; **promote = set the job's
     production model** (write the job→model map). Build a `JobPreset` table +
     `make_job_presets_router` mirroring `make_feature_presets_router`.
   - The **Compare half does NOT exist** (#21, never built — the old Writer/Speaker
     Lab that did this was removed in task #12). The **preset/promote half is proven
     — LIFT it**, don't reinvent.
   - **Feature lab** (`FeatureWorkbench.vue`, exists: per-action config + single
     Test + presets + promote) stays as the RARE per-action fine-tune.

6. **Switches stay PER-MODEL** (lean — confirm). `model_switches` is keyed
   `(model_id, flag_name)` (built this session); router mode loads a model ONCE with
   one switch set, so switches can't differ per job for the same model. The job lab
   tests `(model + override switches)` live via #19 `/load`+`Overrides`; **promote
   persists the winning switches back to that model**. A `JobPreset` = `(job, model)`;
   switches travel with the model.

### Related (same conversation) — the model/switches EDITOR (task #30)
NO new "Models tab" — it would be a third model list (one's already in
`ProviderForm.vue:200` via `LuModelCatalog.vue`; another is the Recommendations
tab). Instead **grow `LuModelCatalog`** (the bundled-model list, today download/
load only) into the model manager: **+ Add model** (paste HF repo + catalog
fields), row-click → edit catalog fields, edit per-model **switches**. The
switches surface and the job-lab's switch-testing both read/write the one
`model_switches` table.

---

## Scope / touch points (grounded)
- `feature_catalog.py` — add `job` per feature (replace `role`); `FeatureCatalogEntry`
  gains `job` (`routing_api.py:94-98`).
- `dispatch.resolve_pin` — role chain → job chain (`dispatch.py:129-140`).
- `RoutingConfig` (`routing_api.py:47-53`) + JW `RoutingConfigRow` (the `quick_*`/
  `accuracy_*` columns) → a **job→model map / child table**.
- QuickSetup — role pickers → job pickers (reworks the just-built wizard; same
  shape, ~4 buckets).
- `FeatureWorkbench` "Set all" (`FeatureWorkbench.vue:203`) → per-job.
- New: Compare (#21) at job grain + `JobPreset` (table + shared router).
- `model_recommendations.job` already aligns — no change.
- DB policy: **drop + reseed**, no migration (`2026-06-18-unified-storage-no-idb.md:45-49`).

## Open questions (more to discuss)
- (a) the exact **job set** + mapping all 19 features to one job each;
- (b) confirm **switches per-model** (vs a JobPreset carrying its own switches);
- (c) the **job→model storage** shape (replace the 2 fixed columns with a job-routing
  child table);
- (d) is the job lab a NEW surface, or the **same Compare component** parameterized
  by `unit` (action vs job)?

## Build order (once the job set is fixed)
1. `feature.job` + the job set (catalog + seed).
2. Widen role→job in routing storage + `dispatch.resolve_pin` (+ QuickSetup pickers).
3. Compare (#21) at job grain + `JobPreset` + promote.
4. `LuModelCatalog` → model manager (#30: add/edit catalog + per-model switches).
Verification each step: pytest + ruff (server), headless smoke (renderer).
