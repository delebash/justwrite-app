> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# LLM catalog → DB cutover + QuickSetup recommendations (2026-06-25)

Session record + handoff. Pick this up cold in the morning. Companion to the
older `2026-06-24-quicksetup-redesign.md` (superseded in part — see end). Detail
is here; `MORNING_RECAP.md` is the map that points to it.

> **Repos + branch:** both `just-llm-runner` and `justwrite-app` on
> `claude/admiring-galileo-il3q0o`. This session's commits:
> - runner: `ade55b9` (recommendations Protocol) → `1decbef` (editor UI) →
>   `93f0edc` (QuickSetup wizard wired) → `490e7a5` (**catalog→DB cutover**)
> - JW: `f141418` (recommendations table) → `c70d44c` (**catalog/switches tables + wiring**)
> All pushed. 98 runner pytest + 83 JW pytest pass; ruff clean.

---

## 0. The mental model (settle this first — it drove every decision)

For each downloadable local model there are THREE questions, and they live in
THREE different places:

- **Q1 "Will it run on this PC?"** → AUTO-detected. `fit.coarse_fit` (pre-download
  band ok/tight/no/cpu from params×quant or a min-VRAM hint) + `compute_fit`
  (precise, post-download, oobabooga formula) + OOM back-off at spawn. **Works
  today. No human input needed.** MoE-aware: a 35B-A3B advertises a small
  `min_vram_mb` + large `min_ram_mb`, so it "fits" a 6–8 GB card when RAM ≥ ~24 GB
  (experts offload to RAM via `--n-cpu-moe`).
- **Q2 "How should it run?" (the switches)** → AUTO by default (`compute_fit`
  derives `-ngl`/`--n-cpu-moe`/ctx; base flag preset gives `-fa on`/`q8_0` KV/
  `--mlock`), with **per-model overrides** now editable in the DB (`model_switches`
  table). The *fastest* `--n-cpu-moe` still needs human/Compare tuning (#20) — the
  back-off finds *a working* value, not the *fastest*.
- **Q3 "What is it good FOR?"** → HUMAN judgment, can't be auto-detected. The
  curated `model_recommendations` table (job tags + rank + why). Drives QuickSetup
  pre-fills.

**This session built the DB-backed homes for Q2 (switches) and Q3
(recommendations), and moved the model CATALOG itself off the JSON manifest into
the DB.** Q1 math was already there and is unchanged.

---

## 1. Locked decisions (user, this session) + WHY + rejected alternatives

1. **Router mode — CONFIRMED** for how JW swaps models per task (quick vs accuracy
   = DIFFERENT models). WHY: dispatch already routes each role→model; the runner
   just needs to serve many models and route by the request `model` field.
   Empirically verified hot-swap works (two models, different per-model INI
   switches, each its own child process, router parent PID constant — detail in
   `just-llm-runner/docs/plans/2026-06-24-llamacpp-switches.md` §Lifecycle).
   *Rejected:* keep single-model spawn + stop/respawn per task — slower, more code.
   ⚠️ **NOTE: router mode is DECIDED but NOT yet implemented.** The runner still
   spawns single-model (`process.py` `-m`, one `RunnerService._runner`). The
   catalog/switches DB work this session is the *foundation* (a real model list +
   per-model switches to build the `--models-preset` INI from); the actual router
   launch in `RunnerService` is still TODO (task #27).

2. **Everything in the DB, no JSON config files** (user, emphatic, ×3). WHY: a
   user must add/edit/curate models + switches without re-shipping. Matches the
   app's own pattern — `seed_default_providers` seeds `LlmProvider` rows merge-by-id
   (`seed.py`), `feature_prompts` is DB-seeded + Lab-editable. *Rejected:*
   `recommended_models.json` / `switch-rules.json` flat files (my repeated wrong
   instinct — anchoring on the existing `runner-manifest.json` instead of the
   seeder pattern). The shipped `runner-manifest.json` keeps ONLY ship data
   (`llamacpp.binaries`, `flagPresets`, `vramFit`); its `models` array is now `[]`.

3. **Best SQL practices — normalized, not wide.** Switches are a **child table**
   `model_switches (model_id, flag_name)`, NOT 18 nullable columns on
   `model_catalog`. WHY: variable-cardinality per-model attribute. *Rejected:* wide
   nullable columns (I wrote that first; user corrected — "best sql practices, you
   are making up the one-source constraint"). "ONE source" = one *common* source
   (no duplicated code across apps), NOT one table.

4. **No migrations — drop + reseed** (pre-release dev data). WHY: documented policy
   `2026-06-18-unified-storage-no-idb.md:45-49` ("No per-collection data migration…
   dev/demo data on a pre-release app") + `2026-06-24-shared-platform-settings.md`
   (`/v1/reset` = `drop_all` + recreate + `reseed()`). Existing dev DBs just get the
   new tables created next to the old on next boot; nuke `JW_DATA_DIR` to start clean.

5. **Shared package owns the SHAPE + endpoints, host owns STORAGE.** Same pattern as
   `RoutingStore`/`PromptStore`: shared `*_api.py` = Pydantic wire shape + `Protocol`
   + `make_*_router` factory (no storage); each app implements the Protocol over its
   own SQLite. This is "one common source" done right.

---

## 2. What was BUILT this session (DONE + verified)

### Shared package (`just-llm-runner/llm_runner/llm/`)
- **`recommendations_api.py`** — `RecommendationRow {modelId, job, rank, why, builtIn}`
  + `RecommendationStore` Protocol (list/upsert/delete/reset_to_factory) +
  `make_recommendations_router` → `GET/PUT/DELETE /v1/ai/recommendations` +
  `POST /v1/ai/recommendations/reset`. `SUGGESTED_JOBS` = quick/accuracy/attribution/
  prose/chat/extraction/embedding (not enforced).
- **`model_catalog_api.py`** — TWO shapes/Protocols/routers:
  - `CatalogRow` + `ModelCatalogStore` + `make_catalog_router` →
    `GET/PUT/DELETE /v1/ai/model-catalog` + `POST /reset`.
  - `SwitchRow {modelId, flagName, flagValue, builtIn}` + `ModelSwitchStore` +
    `make_switches_router` → `GET/PUT/DELETE /v1/ai/model-switches` + `POST /reset`.
- Both exported from `llm/__init__.py` (`__all__` updated).

### Runner package (`just-llm-runner/llm_runner/runner/`)
- **`lifecycle.py`** — `RunnerService` gained `catalog_fn` + `switches_fn`
  injections (defaults: empty catalog → falls through to `manifest.models`; empty
  switches). New public `service.catalog()`. `_run_load` now (a) resolves the model
  from `self.catalog()`, (b) loads per-model switches via `switches_fn(model_id)`,
  parses text→typed (`_switches_to_overrides` / `_parse_switch`: bool/int/string),
  and (c) **layers them UNDER the user-supplied `Overrides`** (`_merge_overrides`,
  user wins per field; `extra_flags` concatenated). New module-level
  `configure_service(catalog_fn=…, switches_fn=…)` — host calls once at boot.
- **`api.py`** — `GET /v1/llm-runner/models` now reads `service.catalog()` (was
  `manifest.models`); `_status_for` keyed by model id.
- **`runner-manifest.json`** — `"models": []` (catalog moved to DB).

### JW host (`justwrite-app/server/justwrite_server/`)
- **`models.py`** — `ModelCatalog` (catalog fields only: id, name, hf_repo, quant,
  mmproj, total/active_params, mtp, min_vram_mb, min_ram_mb, tier, built_in,
  position). `ModelSwitch` (PK (model_id, flag_name); CASCADE FK→model_catalog.id;
  flag_value TEXT, built_in). `ModelRecommendation` (PK (model_id, job); rank, why,
  built_in) — added in the earlier commit.
- **`seed.py`** — `DEFAULT_CATALOG` (the 6 Qwen models, no switches inline) +
  `DEFAULT_SWITCHES` (4 rows: 35B-MoE→`spec_type=none`+`no_mmap=true`;
  27B-dense-MTP→`spec_type=draft-mtp`+`spec_n_max=3`) + `DEFAULT_RECOMMENDATIONS`
  (7 job-tag rows). Three seeders (`seed_default_catalog`, `seed_default_switches`,
  `seed_default_recommendations`) — all merge-by-id, all called from `seed_workspace`.
- **`llm/model_catalog_store.py`** — `JwModelCatalogStore` + `JwModelSwitchStore`
  (list/upsert/delete/reset). `reset_to_factory` = delete factory keys + re-seed
  (preserves user-added rows, restores user-EDITED factory rows).
- **`llm/recommendation_store.py`** — `JwRecommendationStore`. **Reset bug FIXED:**
  was `filter(built_in=True).delete()` (an edited factory row had built_in cleared,
  so reset silently skipped it) → now delete-by-factory-key + re-seed.
- **`app.py`** — mounts `make_recommendations_router`, `make_catalog_router`,
  `make_switches_router`; defines `_jw_catalog_fn` (CatalogRow→`ModelEntry`) +
  `_jw_switches_fn` ({flag_name: flag_value} per model) and calls
  `configure_service(catalog_fn=…, switches_fn=…)` at boot so
  `/v1/llm-runner/models` + the spawn path read JW's DB.

### Shared UI (`just-llm-runner/ui/src/`)
- **`QuickSetup.vue`** — rebuilt as a modal wizard (was a collapsible card). Stacked
  per-role sections (Default/Quick/Accuracy) each header→picker→blurb→"why" callout,
  + an "Apply summary" block. Reads `/v1/llm-runner/models` (DB-backed) +
  `/v1/ai/recommendations` (prefill by job, rank-ordered, Fit-fallback) +
  `/v1/ai/routing` (read+write picks). `ROLE_DEFS` const drives the rows.
- **`RecommendationsEditor.vue`** — new "Recommendations" tab in `AiModelsArea.vue`
  (4th tab). UiTable + edit modal over `/v1/ai/recommendations` (jobs). Add / edit /
  delete / "reset factory".

### Verified by running (not asserted)
- Live boot, fresh `JW_DATA_DIR`: `/v1/ai/model-catalog` = 6 rows; `/v1/ai/model-switches`
  = 4 rows; `/v1/ai/recommendations` = 7 rows; `/v1/llm-runner/models` = same 6
  DB-backed, fit-annotated. PUT user row + POST /reset → user row preserved,
  built-ins restored.
- 98 runner pytest (test_lifecycle/test_runner/test_runner_models/test_manifest
  adapted to the catalog_fn injection + empty manifest.models), 83 JW pytest, ruff
  clean both repos, JW headless smoke green (zero JS errors incl. `#/ai`).

---

## 3. What's LEFT (start here in the morning, in order)

1. **⭐ The editor UI gap — NO UI edits the catalog or switches yet.** Confirmed via
   grep: `RecommendationsEditor.vue` only hits `/v1/ai/recommendations`; nothing hits
   `/v1/ai/model-catalog` or `/v1/ai/model-switches`. **The user's vision: ONE
   per-model screen** = catalog fields + its switches + its job tags edited together,
   with a **"+ Add model"** path for user-pasted HF GGUF repos (Fork-R "Curated +
   paste HF"). Right now those two endpoints are reachable only by curl. This is the
   next build. (Precedent to read FIRST: `RecommendationsEditor.vue` for the
   table/modal pattern; `ProviderForm.vue` for the add-form pattern.)
2. **Router mode in `RunnerService` (task #27)** — the decided-but-unbuilt piece.
   Generate a `--models-preset` INI from `model_catalog` + `model_switches`, launch
   `llama-server` in router mode (no `-m`), route by the request `model` field,
   `--models-max` by VRAM tier. #19's single-model `/load`+`Overrides` stays the
   switch-VALUE *tuning* path. The hot-swap test already proved the mechanism.
3. **Per-model tuning UI + tokens/sec (#20)** — surface switches with a measured
   readout so the user finds the fastest `--n-cpu-moe` on their box.
4. **JV adoption (U5)** — JV implements the same Protocols over its own storage; it
   currently uses transformers (`qwen3_llm`), not the llama.cpp runner.

---

## 4. File map (where everything lives)

| Concern | File |
|---|---|
| Catalog/switches wire shapes + Protocols + routers (shared) | `just-llm-runner/llm_runner/llm/model_catalog_api.py` |
| Recommendations wire shape + Protocol + router (shared) | `just-llm-runner/llm_runner/llm/recommendations_api.py` |
| Runner catalog/switches injection + spawn merge | `just-llm-runner/llm_runner/runner/lifecycle.py` |
| `/v1/llm-runner/models` (DB-backed) | `just-llm-runner/llm_runner/runner/api.py` |
| Tables (ModelCatalog, ModelSwitch, ModelRecommendation) | `justwrite-app/server/justwrite_server/models.py` |
| Factory data + seeders | `justwrite-app/server/justwrite_server/seed.py` (`DEFAULT_CATALOG`/`DEFAULT_SWITCHES`/`DEFAULT_RECOMMENDATIONS`) |
| JW host stores | `justwrite-app/server/justwrite_server/llm/model_catalog_store.py`, `…/recommendation_store.py` |
| Router mounts + `configure_service` | `justwrite-app/server/justwrite_server/app.py` |
| QuickSetup wizard | `just-llm-runner/ui/src/views/QuickSetup.vue` |
| Recommendations editor + tab | `just-llm-runner/ui/src/views/RecommendationsEditor.vue`, `AiModelsArea.vue` |

---

## 5. How to verify / run (commands that worked this session)
```bash
# server tests
cd justwrite-app/server && python -m pytest -q tests/      # 83 pass
cd just-llm-runner && python -m pytest -q tests/           # 98 pass
ruff check llm_runner/      # + justwrite_server/  → clean
# live endpoints (fresh DB)
JW_DATA_DIR=/tmp/...jw-test python -m justwrite_server.cli serve --port 17495 &
curl -s localhost:17495/v1/ai/model-catalog   | python -m json.tool
curl -s localhost:17495/v1/ai/model-switches  | python -m json.tool
curl -s localhost:17495/v1/llm-runner/models  | python -m json.tool
# renderer smoke: boot server + `npm run dev:vite` then `node scripts/headless-smoke.mjs`
```

---

## 6. Process note (the painful part, for honesty)
This session went badly on process: I repeatedly proposed before grounding
(JSON-vs-DB, wide-columns, one-table) and the user had to correct each. A Stop
**verify-gate** (`~/.claude/hooks/verify-gate.py`) was built
to mechanically block "code claim with zero reads this turn" AND "storage/arch
recommendation without a cited precedent." (The soft per-turn reminder was later
REMOVED — 2026-06-26 — and the gate extended to a rules/state re-read gate + a
docs-with-features gate; everything is a hard gate now. See MORNING_RECAP.) They're
live globally. The deeper fix is discipline: **read the deciding file (e.g. `seed.py`
for "where does editable data live") BEFORE recommending, not after pushback.**

## 7. Superseded
- `2026-06-24-quicksetup-redesign.md` §"recommendations home (JSON vs manifest)" —
  SUPERSEDED: it's the DB (`model_recommendations` table), decided this session.
- The recap's old "AWAITING USER DECISION: router vs single-model" — RESOLVED
  (router mode confirmed; implementation still pending = task #27).
- The recap's "adopt gguf-parser → replaces fit.py" — RETRACTED earlier (keep
  `fit.py`; gguf-parser at most adds metadata parsing, deferred #29).
