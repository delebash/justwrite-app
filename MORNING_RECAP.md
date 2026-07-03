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

## Current state (2026-07-03) — **GGUF-grounded model layer, Phase 1**: SAMPLER SCOPE EXPANDED — ALL DECISIONS SETTLED, build starting

> **Single source of truth stays `just-llm-runner/docs/plans/2026-07-02-gguf-grounded-model-layer.md` — see its new "## Phase 1 EXPANSION" section for the full detail + the open decisions.** A container restart wiped the working session; the plan itself survived on origin (recovered by fast-forwarding the stale local clone to runner `fde6667` / JW `820c91b`). We resumed on Phase 1. The user reframed *why* P1 stalled: it stopped on the DATA question — which model facts we read and why — and the model's recommended **sampler settings** are one of those facts, so sampler capture is folded INTO Phase 1 (user: "B").
>
> **Settled this session (2026-07-03) — do NOT re-litigate:** (1) **Option 2** — read the model's recommended sampler settings FROM THE FILE, NOT hand-curated per model (Option 3 rejected: the catalog is an unmeasured 11-model example set, and hand-curating model facts is the exact anti-pattern this plan kills). (2) Base defaults + per-task temperatures stay the backbone; model-recommended is additive. (3) **Task wins per-knob:** task owns temperature; the model fills the secondary knobs (top_k/min_p/top_p/penalties) it leaves blank; temperature stays task-driven. (4) **Storage/display — SEED-AND-SHOW (corrected 2026-07-03):** model-recommended sampling is a per-MODEL fact stored on the model (read-only "auto-detected from the file" like type/mtp/ctx); it is made VISIBLE by SEEDING the Lab's sampler grid when a model is picked — exactly like the shipped model→switch-connect seeds the switch grid (`switchResolve.js`, `2b0543f`) — so what you see is what runs. A preset bundles model+switches+samplers (`EnginePreset.model` `db.py:359`); **Update** overwrites the task preset in place, **Save-as** makes a new one, seen=saved=run. (Corrects an earlier draft that said "layered invisibly under the preset, never shown" — that hidden substitution was exactly the confusion we're avoiding.) (5) Sources: `general.sampling.*` from the GGUF header (12 keys, verified from llama.cpp `gguf-py/gguf/constants.py`; = generation_config baked in at conversion) → else fetch `generation_config.json` from the ORIGINAL repo (gated/omitted/404-in-GGUF-repo caveats, live-probed) → else generic. No `huggingface_hub` dep (reuse `models.py`). (6) Keep `tokenizer.chat_template` (+ multi-template keys), documented. (7) Save-grid: all useful GGUF fields except the token/tokenizer blobs. (8) Model-card tags → Phase 4.
>
> **Verified in code this session:** per-task config sets ONLY temperature (+ think/json) — `seed_feature_prompts.py`, zero non-temperature sampler keys; the fuller set is generic per model (`seed.py:266-310`). Catalog (`seed.py:101-140`) = 11 unmeasured example models; recommendations linked by `model_id` string, no FK (`db.py:156`); Phase 4 grid = a read-time VIEW joining recs × live fit (no merge/replacement).
>
> **RESOLVED (2026-07-03) — build starting:** **[OPEN-A → UNIFY NOW]** the per-hardware recommendation grid becomes the single model surface (rows = hardware tiers, cols = functions, cell = fitting model(s) + Download + why; the flat catalog folds in; "Add your own GGUF" stays) — supersedes the plan's earlier "defer the merge." **[OPEN-B → (a)]** temperature stays the only per-task sampler; Option 2 fills the secondary knobs (top_k/min_p/top_p/penalties) from the model file (no good per-*task* secondary data exists to hand-type; low-temp tasks make those knobs near-inert; prose is model-dependent → Option 2 beats a guess; real per-task tuning goes through Tune & measure #28/Phase 5, measured not guessed). Full detail in the plan's "Phase 1 EXPANSION". **Build order: Phase 1 (GGUF metadata from the link — MTP/fit fields + `general.sampling.*` capture), header key-name verification FIRST.** **Standing rule (user, 2026-07-03): update all docs in FULL DETAIL after every phase (compaction safety).**

---

## Current state (2026-07-02, LATE) — **GGUF-grounded model layer**: PLAN APPROVED (3-checker panel) — implementation NOT STARTED

> **Single source of truth: `just-llm-runner/docs/plans/2026-07-02-gguf-grounded-model-layer.md` — read its ⛔ LIVE STATUS first (all phases NOT STARTED; start at Phase 1).** A long design session (after `model-switch-connect` shipped) traced a chain of model/tune problems to ONE root cause: **model facts are hand-typed, not read from the file.** `mtp` is a hand-typed seed flag nothing detects (`seed.py:116`); fit/params/quant/context are hand-estimated; the MoE+MTP resolve rule (`switch_resolve.py:53`) blanket-skips MTP for every MoE model — wrong for the flagship MoE+MTP case (our own `qwen3.6-35b-a3b-mtp`), and our OWN research already corrected it (`model-catalog-research-and-recommendations.md:89` "measure, don't dogmatize"); catalog↔recommendations are two overlapping hand-curated places; Tune & measure is a dead end (tuned switches can't reach the Lab).
>
> **Live-confirmed the linchpin this session:** the HF API (`GET /api/models/{repo}`) returns a model's `context_length`/`architecture`/**real file size** with ZERO weight download — but NOT the per-arch hyperparameters (checked Qwen3.6-27B-MTP / DeepSeek-V3 / GLM-4.5-Air: no `nextn`/`expert_count` in the `gguf` block). So `mtp`/`type`/experts come from a **range-read of the GGUF binary header** (reusing our own `gguf.py` `_read_value`, no new dep). That is the Phase-1 foundation.
>
> **The plan (items 1–5; item 6 = QuickSetup #100 deferred), JW-only, JV inherits:**
> - **Phase 1** — read GGUF metadata from the link pre-download: extend `gguf.py` GgufMeta (`context_length`/`nextn_predict_layers`/`expert_used_count`/`file_type`) + new `gguf_remote.py` (`fetch_gguf_meta` = HF API for context/size + range-read for mtp/type); feed `fit.py` real numbers (KEEP fit.py, #29). **Verify the key names against a real MTP GGUF header FIRST** (range-read `https://huggingface.co/unsloth/Qwen3.6-27B-MTP-GGUF/resolve/main/Qwen3.6-27B-Q4_K_M.gguf`).
> - **Phase 2** — auto-derive catalog fields: `db.py` add `trained_ctx`; `identity.py` detect `mtp`(nextn>0)+`trained_ctx` (fix the wrong `:8-10` comment IN this phase); hydrate on ADD via a new `POST /v1/ai/model-catalog/inspect`; Edit form's file-derived fields read-only "auto-detected"+revert (fix stale copy `LuModelCatalog.vue:447` too); hand-editable = curation/policy only.
> - **Phase 3** — MTP detect + default-OFF + measurable: drop the auto-`mtp` layer in `resolve_model_switches` (kills the MoE-skip + honors default-off; update the `switch_resolve.py`/`install.py` docstrings IN this phase); **remove the now-orphaned `mtp` switch-preset** (values live once in `knob_catalog` `spec_type`/`spec_n_max` defaults); surface `spec_type` as an opt-in switch (default `none`) in Lab + Tune for MTP-capable models.
> - **Phase 4** — per-hardware recommendation grid: a shared `taskKind→function` map (chat/prose/extract/analysis) + `other` bucket (custom/JV) + `embed`; a seeded `DEFAULT_HARDWARE_TIERS` (vram,ram) band table = the grid ROWS; seed embed recommendation rows; new backend `GET /v1/ai/recommendation-grid` (a VIEW over recommendations + `coarse_fit` on real metadata, quality-vs-faster); new grid UI upgrading the Recommendations tab (keep `RecommendationsEditor` as the advanced editor); **chat default → best-that-fits** (flip `p_chat` off the 9B). Additive (grid = new discovery surface; catalog kept for load/unload/tune). Routing stays 9.
> - **Phase 5** — Tune & measure → Tasks Lab handoff: `labHandoff={providerId,model,switches}` kit singleton; a "Send to Tasks Lab" link → tab `tasks` → a new Compare column under `tasks[0]` seeded + tagged `switchesSource:'user'` (robust to a task with no members — switch-tuning needs no test prompt) → Save as the task's preset.
> - **Phase 6** — persist plan (done) + recap (this) + doc cleanups (research-doc "4 vs 5 jobs" — the 5th is JV attribution; the honest "picks were reasoned not measured, #28" note).
>
> **Validated by a 3-checker rules panel (architecture-fit · reuse · grounding); all FAILs folded** — the HF-vs-range-read grounding (T2, re-verified live), the hardware-band + coarse-map `other`-bucket definition (T1), the `tasks[0]` guarded-mount + `providerId` fix (T1), the orphaned-mtp-preset removal (T3), docstrings-in-their-phase (T11), the stale `:447` copy + the `embed` data source (T5). Reuse (T3) passed clean across all three lenses.
>
> **User's standing calls this round (do NOT re-litigate):** everything live/real-fit, nothing estimated; file = source of truth, hand-editable = curation/policy only; MTP default OFF + measurable; the grid shows **5 functions (4 jobs + embed)** mapped from the **9 routing tasks (routing unchanged)**; **chat defaults to best-that-fits** (not the 9B); quality/faster is display, not a revived dial; **attribution is a JV LLM task** (out of JW scope; grid per-app extensible via `other`). Both repos clean; the plan doc is committed. **Resume: build Phase 1, starting with the GGUF-header key-name verification.**

---

## Current state (2026-07-02, EVENING) — **Connect model → engine switches + simplify the model/tune surface**: Phases 0–4 SHIPPED + PUSHED + VERIFIED — ✅ feature COMPLETE

> **Single source of truth: `just-llm-runner/docs/plans/2026-07-02-model-switch-connect.md` — read its ⛔ LIVE STATUS first.** Triggered by the user walking the Providers → AI surface and hitting a real disconnect: **picking a model in the Lab did NOTHING to the engine switches** (`FeatureLab` cleared `switchRows` + loaded only samplers, never switches), while **Tune & measure** (Providers → Tune) DID pre-fill from the model's resolved baseline but was measure-only with stale "Routing by job / Profile" copy. Switch config lived in three disconnected layers (`knob_catalog` vocabulary · `switch_presets` file-grounded per-TYPE baseline · `engine_presets` saved config); the Lab consumed none of the baseline. The model Edit form hand-duplicated metadata the GGUF already carries (`type` is auto-detected at download via `identity.detect_and_store_model_type`; `mtp` — which also drives switches — wasn't even in the form). Plus dead/stale bits (orphaned `LuSwitchPresets.vue`; the "(advanced)" label; "job/Profile" copy in UI + backend).
>
> Validated by a **3-checker rules panel** on the plan (architecture-fit · reuse · grounding — all confirmed **"connect, don't collapse"** as the right FINAL shape: the three switch layers are genuinely distinct, not duplicated truth) + a **per-phase post-task rules-checker** (all folded to PASS). Panel/checkers caught + fixed: the **preset-clobber guard** (a config-object `switchesSource` provenance tag + async token + post-await re-checks — NOT a child-local flag, which couldn't satisfy it); the **shared-helper extraction** (`switchResolve.js`, one source for both the Lab + Tune & measure); the **render-loop** (watch the model STRING, not an array getter that re-fires on every `modelValue` write); the **incomplete copy-sweep** (extended to backend docstrings + re-verified repo-wide); and **docs riding each commit** (not deferred wholesale to Phase 4).
>
> **Phase 0 — copy sweep + dead-code (SHIPPED `just-llm-runner` `b0a9f09`).** Stale "job/Profile/D9/RoutingByJob" re-termed across UI + backend docstrings (per-file:line strict-diff, re-verified repo-wide → zero surviving code hits); orphaned `LuSwitchPresets.vue` deleted (the `/v1/ai/switch-presets` router + `switch_presets` table **KEPT** as API/reset surface — Decision 4; the full router removal is a shared-shapes/test cascade, deferred + flagged); "(advanced)" dropped from the Engine-binaries panel.
> **Phase 1 — connect model → switches (SHIPPED `2b0543f`).** New shared `ui/src/switchResolve.js` (`fetchResolvedSwitches`); `LuModelCatalog.fetchResolved` delegates (one source); `ConfigColumn` seeds the Plane-1 switch KnobGrid from the model's resolved baseline on the model-STRING change, guarded by a `switchesSource` config tag (`'model'|'preset'|'user'`) + async token + post-await re-checks so a late fetch never clobbers a loaded preset (`CompareStrip.presetToConfig` tags `'preset'` atomically) or a user edit; a user model-pick (`patchPin`) re-opens seeding. Probe: dense `qwen3.5-9b`=6 / MoE `qwen3.6-35b`=8 switches (differ, +`no_mmap`/`spec_type`), `seedReqCount=2` (no loop). Also fixed the runner `docs/plans/2026-06-28-ai-state-grid.md:42` stale row.
> **Phase 2 — Tune & measure: kept, relabelled.** No separate code — it now shares `switchResolve.js` (Phase 1) and its "Routing by job/Profile" copy was fixed in Phase 0.
> **Phase 3 — trim the model Edit form + surface mtp (SHIPPED `22827f7`).** `LuModelCatalog` Edit form restructured — download-source note (repo+quant = the one thing you must set), fit-estimate note (pre-download guess; the GGUF sets the real fit), `type` relabeled "auto-detected at download" + demoted into a "Capability flags" Advanced disclosure, new `mtp` `UiCheckbox` (rides the existing catalog PUT — `mtp` round-trips through `stores.py:345,372`; verified live false→true→false).
> **Phase 4 — docs + verify (SHIPPED, JW `f76cb9c`).** Plan persisted to `just-llm-runner/docs/plans/2026-07-02-model-switch-connect.md` (+ LIVE STATUS, all phases marked done); the historical `2026-06-27-switch-and-preset-architecture.md` bannered with the 2026-07-02 evolution; the runner `ai-state-grid.md:42` stale row fixed; this recap entry. Final verify all green: runner ruff + **202 pytest** · `build:vite` · `headless-smoke` **0 JS errors**. **Commit chain: runner `b0a9f09`(P0)→`2b0543f`(P1)→`22827f7`(P3); JW `f76cb9c`(P4). Both repos clean + in sync.**
> **Verified (JustWrite-only, no JV):** runner ruff + **202 pytest**; `build:vite`; `headless-smoke` **0 JS errors**; per-phase Playwright probes (seed fires + dense≠MoE + no loop; Edit-form disclosure/mtp render); a live `mtp` PUT round-trip. Every phase passed an **independent rules-checker** (Phase 0 T6-sweep re-verified; Phase 1 T1-guard + T3; Phase 3 T1–T12).
> **Open:** **Decision 4** (keep the `switch_presets` baseline seed/reset/API-only — my rec — vs a minimal editor; the `/v1/ai/switch-presets` router-removal cascade). QuickSetup `/v1/ai/jobs` copy = the separate deferred **#100**.

---

## Current state (2026-07-02, LATER PM) — **Portable data root + "Install engine" split from "download model" + spawn diagnostics**: Phases 1–3 SHIPPED + PUSHED + VERIFIED — feature COMPLETE

> **Single source of truth: `justwrite-app/docs/plans/2026-07-02-portable-data-root-and-engine-install.md` — read its ⛔ LIVE STATUS first.** Triggered by a real bug on the user's Windows box (RTX 2070 SUPER = Turing → the `cuda12` build): loading a model failed with `RunnerStartError: llama-server failed to become healthy (ngl=32):` — an EMPTY tail, no reason. Root-caused (grounded): stderr was already merged+surfaced (`process.py:363`/`:375`) but `_drain`'s `communicate(timeout=2)` returned `""` on a hang or an OS-loader-level exit; **`cudart64_12.dll` EXISTS on the box → NOT the #91 download-404**, a spawn/health failure we couldn't see. User calls: **(A)** "Install engine" is its OWN button + process, separate from downloading a model, and a load HARD-REQUIRES the engine installed; **(B)** fold in spawn diagnostics (persistent log + exit code) — the "get the llama console output in a window/log" ask; **(C)** ONE user-settable location for ALL app data (projects DB + images + AI engine + models + logs) — a portable data root; **(D)** default = beside the app (`<exe>/data`) when writable, else the OS user dir; **(E)** on change, MOVE everything (incl. models, no refetch); **(F)** no existing users / not in production → NO migration.
>
> Validated by a **3-checker rules panel** on the plan (architecture-fit · reuse · grounding) + a **per-phase post-task rules-checker** (all folded to PASS). Panel/checkers caught + fixed: the destructive-move data-loss window (write-ahead commit: copy→`.jw_moving`→atomic rename→**flip pointer = commit**→delete old→respawn); the images-are-DB-blobs-now grounding error (dropped the images repoint — only autosave repoints); the AppHandle-ordering (resolve via Tauri's `app.path()` in a NEW `.setup()`, not a `dirs` crate — the user's "it's a Tauri app" steer); respawn-on-failure + atomic pointer + `async` in `storage_relocate`; and the `usePoll` composable extraction (kill the duplicated poller). My own audit caught a `with_extension`→`with_file_name` staging-path clobber; the headless smoke caught an `onUnmounted` ReferenceError from the poll refactor.
>
> **Phase 1 — Runner engine install/load split + diagnostics (SHIPPED, `just-llm-runner` `e7664d6`, pushed).** `process.py`: `start_runner(log_path)` redirects merged stdout+stderr to a per-load file (survives hang/crash/kill), captures `proc.poll()` (None=hang / else exit code, e.g. Win `0xC0000135`=DLL-not-found) + tails the log into `RunnerStartError` (was the empty tail); `_tail_file` helper; OOM-backoff append preserved. `lifecycle.py`: a SEPARATE `_engine_state` channel + `_engine_thread`; `engine_status()` / `install_engine(force)` (uses the injectable `self._acquire_binary`) / `engine_log(tail)` (reuses `_tail_file`); `_run_load` HARD-REQUIRES the engine via a new injectable `self._acquired_exe` probe → `error="engine-not-installed"` (no silent download) + passes `log_path`. `api.py`: `GET/POST /v1/llm-runner/engine/{status,install,log}`. Verified: import gate, ruff, **202 pytest** (+10 new).
>
> **Phase 2 — Portable data root (SHIPPED, runner `7892ba3` + JW `1d8a33e`, pushed).** 2a (server): `install_llm(data_dir=…)` → `_wire_runner_catalog(data_dir)` → `configure_service(cache_root=<data_dir>/ai-cache)` so the engine + models live under the app root (optional/None keeps `~/.cache`; JV unaffected). 2b (`src-tauri/src/lib.rs`): `resolve_data_root(app)` via Tauri `app.path().app_data_dir()`/`app_config_dir()` in a NEW `.setup()` closure (spawn_sidecar moved in; the root reaches the server via the `JUSTWRITE_DATA_DIR` env, uniform across all spawn arms); default `<exe>/data` if writable else user dir; a `dataroot.txt` pointer kept OUTSIDE the relocatable root (beside-exe if writable else config dir), locked on first boot; `autosave_dir` repointed under the root (images are DB blobs → not touched); `storage_get_root` + `storage_relocate` (`async`; stop sidecar → crash-safe copy→atomic-rename→**atomic pointer flip = commit**→delete old→respawn at the new root, or respawn at the OLD root on failure) + `SidecarState::set_child`; `tauri-bridge.js` `window.justwrite.storage.{getRoot,relocate}`. Verified: runner 202 + JW **77 pytest**, ruff, `cargo check` clean. **The Rust runtime (resolve/relocate/pointer/respawn) is DESKTOP-GATED — verified on-device, not in CI.**
>
> **Phase 3 — UI (SHIPPED + PUSHED — runner `f93dc63`, JW `468a614`).** New kit `ui/src/components/LuRunnerEngine.vue` ("Local engine" install panel: status + Install/Update + `UiProgress` + View-log + error), mounted in `ProviderForm.vue` ABOVE `LuModelCatalog`; `LuModelCatalog.vue` shows an "install engine ↑" CTA on `engine-not-installed`; a shared `ui/src/common/composables/usePoll.js` (extracted; both panels converged off their hand-rolled timers). JW `SettingsView.vue` gains a **Storage** section (the General "Data location" card MOVED here + a **Change folder…** button → `pickDirectory`→confirm→`storage.relocate`→reload, browser-safe via optional-chained bridge) + `en.json` label; a user help doc `docs/storage.md` + `toc.json` entry; `CLAUDE.md` IPC-bridge block updated (storage + shell). Verified: `build:vite` clean; `node scripts/headless-smoke.mjs` **0 JS errors** (settings + AI + model-manager render); a Playwright probe (engine panel above the catalog, Storage renders, 0 errors). **Committed + pushed** — the Phase-3 checker FAILed T3 (poll dup) + T11 (docs); both fixed (usePoll extracted + both panels converged; CLAUDE.md/help-doc), the smoke caught+fixed an `onUnmounted` ReferenceError, and the checker RE-VERIFY returned PASS → committed runner `f93dc63` (LuRunnerEngine + ProviderForm + LuModelCatalog + usePoll) + JW `468a614` (SettingsView + en.json + docs) and pushed both. **Follow-up (2026-07-02, runner `a1a220b`) — "engine binaries should be under the install engine":** the `LuRunnerBinaries` editor (build picker + editable llama.cpp download-URL editor) was nested as a collapsed "Advanced" drawer UNDER the Install-engine panel (`LuRunnerEngine.vue` `.lu-eng`), removing its standalone card next to the model catalog — the binary URLs belong to the engine you install. Pure relocation (`LuRunnerBinaries` is self-contained: no props/emits, lazy-loads its own `/v1/ai/engine-config` on `<details>` toggle), same `isBuiltin` gate. Verified: `build:vite` + headless smoke **0 JS errors** + a Playwright probe (exactly one `.lu-engbin` nested in `.lu-eng`, before `.lu-mcat`, no standalone mount, drawer still opens, `/v1/ai/engine-config` 200) + rules-checker PASS; the two panel-mention docs (`just-llm-runner/docs/plans/2026-07-01-engine-binaries-download-fix.md` + this recap) freshened.
>
> **Out of scope / flagged (NOT mine to fix here):** (1) **JV server is currently un-importable on this branch** — `justvoice/models.py:23` imports `LLMRolesSettings` from `llm_runner.llm.schema`, which the current shared runner does NOT export (a pre-existing shared-AI-stack convergence skew; my runner commits never touched `schema.py`/`LLMRolesSettings`). Blocks running JV's suite; needs a convergence decision. (2) The RELEASE spawn arm omits the `serve` subcommand (`lib.rs`, pre-existing) — confirm the packaged `justwrite-server` binary defaults to serving. (3) `wait_for_port_free`'s return is ignored in relocate (minor; `spawn_sidecar` re-evicts anyway). (4) #100 QuickSetup `/v1/ai/jobs` repoint still deferred (product decision). Commit chain this feature: **runner** `040ba46`→`e7664d6`(P1)→`7892ba3`(P2a)→`f93dc63`(P3); **JW** `a281a80`→`1d8a33e`(P2)→`468a614`(P3+docs). All pushed; feature complete.

---

## Current state (2026-07-02 PM) — **Preset model A (task owns the preset) + full reset story + UI polish**: DONE + VERIFIED (commit pending this turn)

> **The single source of truth for this follow-up is `just-llm-runner/docs/plans/2026-07-02-preset-model-a-resets.md` — read its ⛔ LIVE STATUS first.** It EVOLVES the user-creatable Tasks feature below (which stays as-is). The user's calls (2026-07-02, no-stop mode): **(A) Plan A — the task owns the preset.** The per-feature preset override tier (`FeaturePresetRef`) was a pre-tasks leftover that made Routing-by-feature show a preset dropdown identical to the Tasks page; it's now **removed**. A feature's preset IS its task's; the cascade is 2-tier (task preset → global default); Routing-by-feature shows the resolved preset **read-only** ("set it on the task"), and the Lab's "use" button sets the feature's **task** preset. **(B) Restore built-ins folded into "Reset all to defaults":** the global reset now also restores the built-in engine presets + built-in task names/descriptions (custom tasks + presets kept). **(C) Per-task Reset** next to Rename (built-in only) — restores one task's name/desc/preset — replacing the per-task preset ↺. **(D)** collapse-list → the **JW `SidebarToggle` icon** in both views. **(E) nav flexes to feature width** (`fit-content(40%)`, no scroll; fixed a pre-existing indent overflow via `align-self:stretch`). **(F)** the Phase-2b **rules-checker findings** (T11 doc gap + 3 advisories) + **(G) a user-facing copy sweep** ("Task", never the internal id/`taskKind`; a shared `taskLabel` resolver; RecommendationsEditor relabeled + a Task picker).
>
> Validated by a **3-checker rules panel** (architecture-fit · reuse · grounding) — all approved Plan A; their FAIL findings were folded in (the critical one: the restore must **`delete → FLUSH → re-seed`**, else it would have permanently deleted the built-in presets under the host's autoflush-off session). **This also resolves the pending Phase-2b rules-check** flagged below: a single rules-checker on `d4d91bf` returned FAIL on T11 (tasks.md missing the reset/edit-in-place controls) + 3 advisories — all folded here (tasks.md updated; `updatePreset` no-rename guard; the reset test asserts custom survival; the reset confirm copy discloses the Default snaps back).
>
> **Backend (runner):** dropped `FeaturePresetRef` (resolver→prompts→presets_api→stores→db→install; `resolve_task_preset`); `reset_routing_to_factory` restores built-in presets (via the shared `stores._delete_engine_preset_rows` teardown — reused by `EnginePresetStore.delete`, which also fixes a latent orphan-children bug) + built-in task defs; `POST /v1/ai/task-kinds/{id}/reset` (built-in only; guards a missing/deleted factory preset). **UI (kit):** FeatureWorkbench read-only preset + use-for-task; TaskKinds per-task Reset; Icon toggle; nav `fit-content`; `common/taskLabels.js`; RecommendationsEditor + ConfigColumn copy. **Verified:** runner ruff + **192 pytest**; JW ruff + **76 pytest**; live curl (2-tier resolve; edit-a-built-in-preset → reset → RESTORED; per-task reset built-in 200 / custom 400); `build:vite`; `headless-smoke` **0 JS errors** (6 AI sub-tabs); a Plan-A Playwright probe PASSED (read-only preset, Reset on built-in only, icon toggles, nav no-overflow `scrollWidth==clientWidth`). **JustVoice untouched** (grep-clean of every removed symbol; mounts none of these routers). **Still deferred (needs the USER's decision):** #100 QuickSetup `/v1/ai/jobs` repoint. Commit chain: **runner** `d4d91bf`→**`46cf11a`** (pushed); **justwrite-app** `39de67c`→(this recap commit).

---

## Current state (2026-07-02) — **user-creatable, testable TASKS** ("jobs, done right"): Phases 1 + 2 + 2b DONE + VERIFIED + PUSHED; awaiting review

> **⛔ RESUME CHECKPOINT (written pre-compaction — read this first).** The full user-creatable Tasks feature is **COMPLETE, VERIFIED, and PUSHED**: Phase 1 (backend: `task_kinds` + `feature_task_kinds` tables + stores + CRUD/feature-assign API + seeders + `_task_kind_of` DB→map→prefix), Phase 2 (UI: shared `FeatureLab`, the `TaskKinds.vue` Tasks page, per-feature Task dropdown, Tasks sub-tab, shared shell CSS, help doc), and Phase 2b (preset **edit-in-place** + **reset-to-defaults** in three places: global on the Tasks page, per-task, per-feature). Both repos clean + in sync with origin. Commit chain on `claude/admiring-galileo-il3q0o`: **runner** `f74625a`→`b221576`→`1d11fbb`→`392d898`→`d4d91bf`; **justwrite-app** `21860eb`→`c0604df`→`e376038`→`175fb7f`→(this recap commit). Verified: runner 189 pytest + ruff · JW 76 pytest + ruff · build:vite · headless-smoke 0 JS errors (6 AI sub-tabs) · live curl (CRUD + reset + factory map + PUT edit-in-place) · a Tasks Playwright probe (create→assign→test→delete→re-float). **⚠ ONE quality step is PENDING — do it FIRST on resume:** a rules-checker on the Phase-2b diff (`d4d91bf`) was NOT run (you asked to save + compact before it); the Phase-1 diff passed its rules-checker (GO) and the Phase-2 diff's NO-GO findings were fixed in `392d898`. **Open, needs YOUR decision (do NOT guess):** #100 QuickSetup `/v1/ai/jobs` repoint — generate-a-preset-per-task vs pick-Default-only. Safe to compact.
>
> **The single source of truth for this work is `just-llm-runner/docs/plans/2026-07-02-user-tasks-model.md` — read its ⛔ LIVE STATUS first.** This EVOLVES the 2026-07-01 taskKind routing (below): taskKinds stay the routing key, but become **user-creatable / testable / assignable DB-backed "Tasks"** with a dedicated **Tasks page** — because review found the taskKind layer had no way to be *set up or tested* (testing was per-feature only; a taskKind has no prompt) and nothing was user-editable (the 9 were a hardcoded constant, the feature→task map an in-memory dict). Decision (user, 2026-07-02): "jobs, done right" on the preset foundation — a Task = name/description + an assigned preset (tuned+tested in the Lab against a member feature) + the features assigned to it (one feature→one task, reassignable from both sides); DB-backed, seeded, nothing hardcoded; NOT restoring the deleted job code; user-facing word "Task", internal id stays `taskKind`.

The plan was validated by a 3-reviewer rules-checker panel (all NO-GO on v1 → additive fixes folded) + a confirmatory re-check = GO. **Phase 1 (backend) is COMPLETE + VERIFIED** (full touch-list + probe results in the plan doc's LIVE STATUS): two new tables (`task_kinds`, `feature_task_kinds`), `TaskKindStore` + `FeatureTaskKindStore`, shared `DEFAULT_TASK_KINDS` (the 9 defs moved out of the hardcoded constant), two seeders, `_task_kind_of` now DB→map→prefix, the task-kinds CRUD + feature-assign API, the rewritten test, and the JW sampler-grounding cross-check. Runner 187 pytest + JW 76 pytest + ruff clean; a live probe on a fresh server confirmed 9 tasks + a 37-key map, with create/reassign/delete + the built-in guard + the cascade re-float all working. **Phase 2 (UI) is now DONE + VERIFIED:** a shared `FeatureLab.vue` extracted from FeatureWorkbench (routing stays in the parent, pin-change emitted); a new `TaskKinds.vue` Tasks page (list + New/rename/delete-custom · members with + Add / Move-to… · preset dropdown + Test-against a member → FeatureLab · empty state · global-default fallback); FeatureWorkbench refactored (dropped the task-kind panel, added a per-feature Task reassign dropdown, mounts FeatureLab); a **Tasks** sub-tab in `AiModelsArea`; the master/detail shell CSS promoted to shared `common/styles.css`; a `docs/tasks.md` help doc. Verified: `build:vite` + `headless-smoke` (0 JS errors, 6 AI sub-tabs) + a Tasks Playwright probe (create → assign → test → delete → re-float, all green). A rules-checker on the UI diff returned NO-GO (3 findings), all resolved in a follow-up: removed the dead pin-write path (CompareStrip is one-way + clones base-config, so the pin-change→saveRouting wiring was unreachable — the pin is now a read-only seed; models persist via Save-as-preset + assign), centralized preset Save-as/Delete in `FeatureLab` (emits `presets-changed`), promoted `.lu-fw` to shared CSS. **Phase 2b (resets + edit-in-place) — now DONE + VERIFIED:** preset **edit-in-place** (ConfigColumn "Update" → FeatureLab PUT, no duplicate presets); a **per-feature reset** ↺ on Routing-by-feature (clears the feature's preset + task overrides → factory); and **both** Tasks-page resets — a global "Reset all to defaults" by the Default control (`POST /v1/ai/task-kinds/reset` → `seed.reset_routing_to_factory`, custom tasks/presets kept) + a per-task ↺ (→ the `factoryTaskPresets` map on the task-kinds GET). Verified: runner 189 pytest + JW 76 pytest + ruff + build + smoke + live curl (reset 200, PUT 200, factory map = the 9). **Only remaining non-blocking note:** `_task_kind_of` reads the feature→task table per dispatch (cache if it ever matters). Migration: the new tables auto-create + merge-seed on a plain restart (no workspace reset required for existing installs; dev may reset for a clean re-seed).

---

## Current state (2026-07-01) — the **taskKind routing** refactor: kill the job/category duality (Phases 1–4 DONE + pushed; ONE deferred product decision)

> **⛔ RESUME CHECKPOINT (written pre-compaction; read this first).** taskKind routing **Phases 1–4 are
> COMPLETE, VERIFIED, and PUSHED**; both repos are clean and in sync with origin — `just-llm-runner` HEAD
> `b1f361f`, `justwrite-app` HEAD `55f9b05`, branch `claude/admiring-galileo-il3q0o`. The refactor's core is
> DONE: the job layer is deleted, `category → group` (nav) + `category → taskKind` (routing) are renamed
> throughout, the seed ships 8 engine presets + 9 taskKind→preset assignments + the action→taskKind map, and
> the AI screen has the inline "Presets by task kind" assignment panel + 3-tier card provenance. Phase 4
> (`c570b15`) ALSO fixed two Phase-2/3 UI regressions I made ON MY OWN (I removed the inline preset-assignment
> panel + downgraded the provenance without re-reading the 06-29 trial log; the user caught it; the fix restored
> both). **The ONLY remaining taskKind item is DEFERRED and needs a USER PRODUCT DECISION (task #100):**
> `QuickSetup.vue` still calls the deleted `/v1/ai/jobs` (`.catch`-guarded → empty, non-breaking) + sends a dead
> `jobs` PUT field (backend ignores it) — repointing it to taskKinds means deciding whether QuickSetup
> GENERATES a preset per taskKind (the recommendations→taskKind→preset chain, Fit-aware) or shrinks to just
> picking the Default model + embedding. **Do NOT guess that direction — wait for the user's call.** Nothing is
> in flight; nothing uncommitted; safe to compact. **Process lesson, do not re-learn: after any
> resume/compaction, re-read the 06-29 `ai-lab-preset-model.md` trial log IN FULL before touching the AI screen
> — bulk assignment lives INLINE in Routing-by-feature, NOT a separate tab (Trial 2 rejected the tab; Trial 3/4
> folded it inline).**
>
> **The single source of truth for this work is the LIVE STATUS tracker at the top of
> `just-llm-runner/docs/plans/2026-07-01-taskkind-routing.md` — read its ⛔ LIVE STATUS section FIRST.**
> This refactor SUPERSEDES the routing/job/category parts of the 2026-06-29 `ai-lab-preset-model.md`
> doc and the 2026-06-28 master plan. The Lab/preset ENTITIES from the 06-29 doc still stand (a preset
> = model + frozen switches + params; a feature is a prompt that points at a preset via a cascade);
> what changes is the ROUTING KEY. The "job" routing layer is now DELETED (not merely demoted); the
> nav grouping field is renamed `category → group` (display-only, zero routing meaning); and the
> preset-cascade routing key is renamed `category → taskKind` — an action-keyed taxonomy of nine
> LLM-work shapes (`prose.generate · prose.edit · ideation · creative.structured · summary.grounded ·
> extract.structured · judge.scored · chat.grounded · chat.inVoice`) that is the ONE routing key, the
> recommendation tag, and the QuickSetup unit. The cascade at call time is
> `FeaturePresetRef`(action override) → `TaskKindPreset`(the action's taskKind) → global default.

This refactor came out of the user's 2026-07-01 decision — after reviewing the two research docs
(`docs/plans/2026-07-01-llm-work-categories-presets-implementation.md`, the OPERATIVE preset spec = "doc 1",
and `-spec.md`, the SUPERSEDED "doc 2" whose `summary.grounded` preset wrongly assumes per-feature
`json_mode`) — that the human-facing feature nav and the LLM routing taxonomy are two different things
and must not be conflated: "clean up any code, I don't want a mix of job or categories … Renaming files
or names is what a professional developer would do … Go." Locked decisions (do NOT re-litigate): **D1**
naming = `group` (nav, display-only) + `taskKind` (the one routing key, action-keyed); **D2** = one
taxonomy, so `model_recommendations.job` is retagged to `task_kind` with the nine fine values (no coarse
second taxonomy); **D3** = the Fast/Balanced/Best quality dial is DELETED (it was dropped 06-29 and its
only UI was already unmounted). The design was validated by five rules-checker passes before any code
landed (one taskKind cascade, `fit.py` preserved so fit-aware auto-pick survives, action-keyed
`_task_kind_of`, atomic phasing, JustVoice-safe). The per-file strict-diff touch-list for everything
below lives in the plan doc — this recap is the map, it points there rather than duplicating it.

**PHASE 1 — DELETE the job routing layer + the quality dial — COMPLETE, VERIFIED, PUSHED.** The entire
inert `job` routing machinery and the dropped quality dial are gone from the shared package and both host
apps. In `just-llm-runner` the commits are `2d49180` (the plan doc as the live tracker), `d3aa712` (the
shared-backend deletion — the six job tables `Job`/`FeatureJob`/`JobRoute`/`JobRouteSwitch`/`JobPreset`/
`JobPresetSwitch`; the whole files `jobs_api.py`, `job_switches_api.py`, `job_presets_api.py`,
`quality.py`, `quality_api.py` and their tests; `_resolve_job`; `LLMJobTarget`; `LLMConfig.jobs`/
`feature_jobs`/`default_job_id`; the `jobs` axis in `routing_api.py`, keeping only `default` + `pins`;
`switch_resolve.resolve_profile_switches`/`prefill_job_switches`; the `seed.py` job seeders + their
`seed_llm` calls + the `__init__.py` exports), `d840da7` (the shared-UI half — job methods stripped from
`useRouting.js`, the `/v1/ai/feature-jobs` fetch + `jobs` axis removed from `FeatureWorkbench.vue`, the
dead `RoutingByJob.vue` deleted), and `d916e41` (cleanup — removed the dead `loadSwitches`/`featureJobs`
from `FeatureWorkbench.vue` that still called the now-deleted `/v1/ai/job-switches`, plus three stale
comments). In `justwrite-app` (this repo): `70f2de1` (the two research docs) → `f35fbc2` (the JW backend
half — `feature_jobs=` dropped from the `install_llm(...)` call in `app.py`, `DEFAULT_FEATURE_JOBS`
deleted from `seed.py`, the catalog docstring fixed, the two job-routing tests in
`server/tests/test_routing.py` rewritten to default+pins) → `4c9b246` (two stale `feature-jobs` comments
scrubbed). The job layer was proven behaviorally INERT before deletion — `job_routes` was never seeded,
so `_resolve_job` always returned None and dispatch already fell through to the first registered provider
— so deleting it changed no real routing behavior. `fit.py`/`coarse_fit` was deliberately KEPT so the
fit-aware auto-pick is preserved (this answered the user's explicit question about whether auto-pick
needs to respect VRAM: yes, and that path is untouched). Verification at each step: `just-llm-runner` 180
pytest + ruff clean; `justwrite-app/server` 76 pytest + ruff clean; `npm run build:vite` compiles the kit
via the `@delebash/llm-ui` alias; `node scripts/headless-smoke.mjs` PASSED with zero JS errors over every
route and all five AI sub-tabs. A rules-checker reviewed each diff; the one FAIL (the dead `loadSwitches`
+ stale comments) was fixed in `d916e41`/`4c9b246`. The lesson the checker forced — recorded so it is not
re-learned — is that **a shared-package change must run the CONSUMERS' gates**: the runner-alone deletion
looked green in isolation but hard-broke the JustWrite consumer (an `install_llm(feature_jobs=)` TypeError
plus JW tests and shared UI calling deleted endpoints), so the fix was to complete the JW backend +
shared-UI cutover and run JW pytest + build + smoke before treating Phase 1 as done.

**PHASE 2 — the RENAMES — COMPLETE, VERIFIED, PUSHED.** Both sub-units shipped: (i) the recommendations
retag as `just-llm-runner` `d05e472`; (ii) the coupled `CategoryPreset → TaskKindPreset` + `category → group`
+ action-keyed resolve + the new seed as `just-llm-runner` `b04bb72` + `justwrite-app` `bb9270a` (detailed in
PHASE 2/3 below). The first Phase-2 sub-unit, `model_recommendations.job → task_kind` (decision D2, one
taxonomy), is COMPLETE, VERIFIED, PUSHED as `just-llm-runner` `d05e472`: the DB column became `task_kind`,
`RecommendationRow.job` became `taskKind`, the `RecommendationStore` (`_rec_to_wire`, list order-by, the
upsert composite key, the `delete(model_id, task_kind)` signature, and the reset loop) and the
`seed_default_recommendations` seeder were repointed, `SUGGESTED_JOBS` was deleted, and the seeded values
were retagged from the coarse four (`chat`/`prose`/`extraction`/`analysis`) to the fine work-shapes
(`chat.grounded` / `prose.generate` / `extract.structured` / `judge.scored`). UI: `RecommendationsEditor.vue`
now edits `taskKind` (field, table column, filter, sort, and the `/v1/ai/recommendations` query params)
via a plain `UiInput`, and `LuJobSelect.vue` was deleted — it was the last caller of the deleted
`/v1/ai/jobs` endpoint. `test_recommendations_catalog.py` was updated to `taskKind` + the new values + the
new alphabetical order. Verified: 180 runner pytest + ruff; `build:vite`; and a FRESH-server reset +
headless smoke (the running server was restarted because the schema changed) PASSED with zero JS errors,
the API confirmed returning `taskKind`-keyed rows.

**PHASE 2/3 — the coupled routing change + the seed — COMPLETE, VERIFIED, PUSHED (`just-llm-runner` `b04bb72`,
`justwrite-app` `bb9270a`).** The rename, the behavior change, and the seed landed together as one unit; the
exhaustive file-level touch-list + full verification log live in the plan doc's LIVE STATUS §"PHASE 2/3"
(this recap is the map). What shipped: (a) `CategoryPreset → TaskKindPreset` across the DB table/col, the
store + getter, the presets_api `TaskKindAssignment` + the route `PUT /preset-assignments/category → /task-kind`
+ `AssignmentsResponse.categories → .taskKinds`, `preset_resolve`, and the `install.py` wiring; (b)
`_category_of → _task_kind_of` made ACTION-KEYED (reads the app's action→taskKind map + a `writerAI.rule.* →
prose.edit` prefix rule, never the nav group) plus the real BEHAVIOR CHANGE in `prompts._resolve_preset`
(`task_kind_of(action) or task_kind_of(feature)`, so writerAI.continue→prose.generate and
writerAI.tighten→prose.edit route to different presets; the None-guard keeps unwired/test paths on legacy
routing); (c) nav `category → group` (display-only) in `routing_api`, JW `feature_catalog.py`, and the
`FeatureWorkbench.vue` nav readers; (d) the NEW seed — `seed_presets.py` (8 engine presets + 9 taskKind
assignments + the action→taskKind map), the two shared FK-safe seeders wired into `seed_llm`,
`configure_app_seed`/`install_llm` grown by the three inputs, `app.py` passing them, and
`seed_feature_prompts.py` given the per-action temps + `json_mode=True` on the JSON actions (doc 1 §4.3;
json_schema stays deferred as #77). The `FeatureWorkbench.vue` nav now groups by `group` and the
per-nav-group set-all preset dropdown was RETIRED (it would have written nav-group names into the taskKind
table); the taskKind→preset assignment surface + full provenance are Phase 4. Verified all-green: runner 180
pytest + ruff; JW 76 pytest + ruff; an end-to-end seed→resolve harness (the writerAI split, recap→p_extract
NOT its Home nav-mate, all nine taskKinds resolve, the B3 no-think-under-json invariant); `build:vite`; a
fresh-server (stale DB deleted) `POST /v1/data/reset` + headless smoke with zero JS errors over every route;
a screenshot of the reworked nav; the live API (8 presets, 9 `taskKinds`, `group` field, `/task-kind` route
works, old `/category` → 405); and a JustVoice shared-symbol import check (JV has its OWN `FeatureCatalogEntry`
and imports none of the renamed symbols — fully insulated). A rules-checker scored the diff PASS on T1–T6 +
shared-consumer-safety + seed-FK-safety; its one FAIL — the 06-29 `ai-lab-preset-model.md` doc still naming
the pre-rename symbols as current — was FIXED with a deprecation banner mapping every renamed symbol.

**PHASE 4 — the taskKind assignment UI + card provenance — DONE (except the QuickSetup repoint) — `just-llm-runner`
`c570b15`.** ⚠ This phase also FIXED a self-inflicted regression: Phase 2/3 (`b04bb72`) had made two UI
decisions ON MY OWN against the user's designed AI screen — it removed the inline bulk preset-assignment control
the user's 06-29 Trial-3/4 log had decided to KEEP (inline in Routing-by-feature, not a separate tab; the user
had corrected that removal once already) and downgraded the card provenance from 3-tier to 2-tier. The user
caught it, told me to re-read the trial log and fix what I broke, and pre-approved my placement recommendation
("keep it in the left list, take your recommendation, fix later if needed"). What shipped: a new shared
`llm_runner/llm/task_kinds_api.py` (the then-canonical `TASK_KINDS` constant — the nine work-shapes with id+label+description; **SUPERSEDED 2026-07-02 → that constant moved to shared `seed.DEFAULT_TASK_KINDS` and tasks are now DB-backed + user-editable; see the 07-02 section at the top** — plus its
`GET /v1/ai/task-kinds` serving the catalog + the resolved action→taskKind map), mounted in `install.py`; and
`FeatureWorkbench.vue` with the **3-tier card provenance RESTORED** (own override → the feature's taskKind
preset → global default, shown as `Continue → Creative prose (voiced) · Generate prose`) and the inline bulk
assignment RESTORED as a **collapsible "Presets by task kind" panel** at the top of the left list (nine taskKind
rows, each a preset dropdown via `PUT /preset-assignments/task-kind`, plus a per-row Reset via
`/clear-features`). Collapsed by default (my one judgment call, user-preapproved) so the feature nav stays
primary. Verified: 182 runner pytest + ruff (new `test_task_kinds.py`); `build:vite`; headless smoke 0 JS errors;
live endpoint (9 taskKinds + map); screenshots of both panel states clean; rules-checker PASS on T1–T12. **The
ONE remaining taskKind item is DEFERRED as a product decision:** `QuickSetup.vue` still calls the deleted
`/v1/ai/jobs` (`.catch`-guarded → empty, non-breaking) + sends a dead `jobs` PUT field (backend ignores it).
Repointing it to taskKinds means deciding whether QuickSetup GENERATES a preset per taskKind vs just picks the
Default model — a real design call the user asked me to stop for, so it's flagged, not guessed (plan doc line 72
sanctions the stub). Full detail in `just-llm-runner/docs/plans/2026-07-01-taskkind-routing.md` §"PHASE 4".

**Bonus finding for bug #91 (engine download 404).** `justwrite-app` DOES mount the shared LLM routers via
`install_llm` (`app.py:156`; the engine-config route is defined at `runner_config_api.py:54` and mounted at
`install.py:99`), so the editor's HTTP 404 on the user's Windows/RTX-2070 box is almost certainly a STALE
LOCAL BUILD, not a missing mount — a pull + rebuild should clear it. The full download-fix plan (correct
cross-platform `DEFAULT_BINARIES`, chip-aware CUDA 12.4-vs-13.3 selection, progress bar, editable
engine-config panel) is captured separately and its first cut is already committed in `just-llm-runner`
(`0bc301e` + `201af78` + `5bbef97`); the remaining verify-on-real-hardware work stays open as tasks
#87–#91. Also open: **#92** — audit that ALL LLM GUI + backend code lives in the shared stack (`just-llm-runner`
+ `@delebash/llm-ui`), not per-app, since the user noted "all llm stuff for jv and jw should be in shared"
and flagged an AI task-queue that may still need migrating.

**Gates (they RUN in this container):** `just-llm-runner` → `python -m pytest` + `ruff check llm_runner/ tests/`.
`justwrite-app/server` → `python -m pytest` + `ruff check`. Renderer → from `justwrite-app`, `npm run build:vite`,
then boot `python -m justwrite_server.cli serve --port 17495` (bg) + `npm run dev:vite` (:1420, bg), `POST
http://localhost:17495/v1/data/reset` after any schema change (RESTART the server first if the schema changed
— a running server holds the old schema), then `node scripts/headless-smoke.mjs` (asserts zero JS errors).

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

**Knob-catalog expansion + Common/Advanced tiers — DONE (2026-06-29; full plan +
`just-llm-runner/docs/plans/2026-06-29-knob-catalog-expansion.md`).** After researching llama.cpp's full
sampler/hardware surface (current `tools/server/README.md` + smcleod guide + llama-param-pal) the user chose
"full set + Common/Advanced split" + "add the free hardware switches + better help." Added a `tier`
(common|advanced) column to `knob_catalog`; seeded **15 new rows** — 11 samplers (repeat_last_n, mirostat
tau/eta, dry base/allowed_length/penalty_last_n, xtc_threshold, dynatemp range/exponent, top_n_sigma,
min_keep) + 4 already-plumbed switches (ubatch_size, threads_batch, cache_reuse, cont_batching) — all with
README-cited defaults; clearer novice help on existing switches. The checklist now shows **Common** rows +
an **"▸ Advanced (N)"** expander (anti-overwhelm). Also fixed a real gap: bool switches now render an
**On/Off select** (not checkbox-only) so default-on flags (cont_batching, mlock) can be set OFF. NO runner
code (samplers ride `extra`; the 4 switches are typed `Overrides` fields). **Schema bump → existing installs
Reset workspace** (drop+reseed policy). Verified: ruff + 179 pytest + build:vite + headless smoke (0 errors,
LuModelCatalog intact) + a 10/10 Playwright check. Run BEFORE coding: a rules-checker on the plan (caught:
cite defaults per-value, ship the upgrade story, include bool in reset, write the doc first).

**LLM-runner engine decision + snappy-edit defaults (2026-06-29; full detail in
`just-llm-runner/docs/plans/2026-06-29-knob-catalog-expansion.md` §DECISION).** After fact-checking a hard
KoboldCpp/TabbyAPI/Aphrodite pitch (most claims outdated/wrong vs current llama.cpp — KV-quant, grammar,
per-request samplers + sampler ORDER, context-shift, cache-reuse are all already in stock llama.cpp; verified,
incl. an empirical test that `/v1/chat/completions` honors a per-request `samplers` order), the user CONFIRMED:
**stay on stock `ggml-org/llama.cpp` + spawn-per-model; router mode deferred** (low-VRAM trap + 1-model common
case); Kobold/Tabby (EXL2 = GPU-only no-offload, NVIDIA-only)/Aphrodite rejected. **Task #27 resolved.** The
three 2026-06-24 router-leaning docs are bannered with this. SHIPPED the snappy-edit defaults: a new
`context_shift` Plane-1 switch (bool, default on) + `cache_reuse` 256, both default-ON via the `base` switch
preset (applied at model load), wired through Overrides/_parse_switch/_apply (--context-shift / --no-context-shift);
SWA-safe (llama.cpp auto-disables on Gemma, no crash) + spawn-tested; ruff + 180 pytest + build + smoke clean.
**Part 3 — sampler dispatch WIRED (2026-06-29; runner `407612b` code + tests, `433b9d1` doc).** The verified gap
(samplers didn't reach production dispatch) is FIXED. `_plane2_extra(spec, body, preset)` in
`just-llm-runner/llm_runner/llm/prompts.py` now applies the resolved PRESET's long-tail samplers as the
lowest-precedence layer (full precedence: per-call `body.samplers` → stored `feature_sampler_params` → the preset's
`engine_preset_samplers`, each guarded by `not in extra`), and BOTH dispatch call sites (`run_feature` +
`stream_feature`) pass the resolved `preset` (which `_resolve_preset`/`resolve_feature_preset` already returns as an
`EnginePresetRow` with `.samplers`). So **every knob from the catalog expansion (top_k, min_p, mirostat, dry, xtc,
…) now actually takes effect in production**, not just in the in-lab Run test. The reserved **`samplers` key is the
per-feature sampler ORDER** — a comma-joined name list (`"dry,top_k,min_p,temperature"`) that `_plane2_extra` splits
into an array for the engine (post-process after all three sampler layers merge). Persistence + load ride the
PRESET (Save-as-preset → `engine_preset_samplers`; `applyPreset`/`presetToConfig` loads them back into the column),
so no separate feature-samplers PUT was needed; the per-feature `feature_sampler_params` store still dispatches as
an override layer. Verified: `ruff` clean + **182 pytest** (2 new: `test_run_applies_preset_samplers_and_order` —
preset samplers reach `extra` + the order → list; `test_run_body_samplers_override_preset` — body overrides preset);
empirically confirmed earlier this session that `/v1/chat/completions` honors a per-request `samplers` order
(garbage↔clean discriminator on stock llama-server). Rules-checked the dispatch diff → PASS. **A per-feature
sampler ORDER is dispatchable TODAY** via the "Add custom sampler" escape (name `samplers`, value
`dry,top_k,min_p,temperature`).

**Sampler-order REORDER UI — DONE (2026-06-29; runner `a07f995` UI + `db21518` doc).** A "Custom sampler order"
control in `ConfigColumn.vue`'s Samplers section: a `UiCheckbox` toggle (off = engine default order), then the
default chain (`dry · top_k · typ_p · top_p · min_p · xtc · temperature`) as a list with ▲▼ `UiButton`s + Reset; it
reads/writes the single reserved `{name:"samplers", value:"<comma names>"}` row in the column's `samplers` array via
the existing `patch('samplers', …)`, so it persists via the preset + dispatches through the backend comma→array
split. `KnobGrid` got a `reservedKeys` prop so the order key is hidden from the checklist's "Other keys" (managed by
this control, not double-shown). Verified: build:vite 0 + headless smoke 0 JS errors + a Playwright check 5/5
(control present; hidden until enabled; default 7-name order; ▼ reorders; `samplers` not in Other keys);
rules-checked → PASS. **Part 3 fully complete (dispatch + order + reorder UI).**

**Samplers UI → flat 3-column grid — DONE (2026-06-30, user decision superseding the Common/Advanced sampler
split).** The user, after living with the tiered samplers checklist: *"why don't we just not have the extra
advanced — anyone who is going to change these params is already at advanced … all in one list … split it into 3
columns, add[s] one to [the] next column and so on."* So the samplers checklist (`ConfigColumn` → `KnobGrid
:columns="3"`) now shows all ~21 samplers in one flat 3-column grid, flowing row-major (each successive/added knob
lands in the next column), no Advanced expander. Built as a reusable `KnobGrid` `columns` prop (`>1` → flat
multi-column grid, no inner scroll); the `tier` field stays (it still orders the list common-first) and the **Engine
switches** editor keeps its single-column tiered expander (only samplers went flat — switches weren't in scope).
⚠️ **This was BELIEVED to also fix the reported layout shift but did NOT** — the scrollbar root-cause described next was
later DISPROVEN by measurement (2026-06-30 cont., correction entry below). Recorded for history, the disproven theory was:
clicking a sampler checkbox visibly shifted the layout, worse in
Advanced: enabling rows / expanding Advanced overflowed the inner `max-height:260px` scroll, and on Windows/WebView2
(classic space-taking scrollbars; headless Chromium uses overlay scrollbars, so it never reproduced in the gate
despite many attempts) the scrollbar's appearance reflowed the column. The 3-column grid removes the inner scroll
(all knobs fit; the column becomes the single scroller — honoring "one scroller per area"), and `scrollbar-gutter:
stable` on `.ui-kg-scroll` + `.lu-fw-edit` reserves scrollbar space as a backstop. Files (all shared kit, runner):
`KnobGrid.vue` (columns prop + flat multi-col grid + scrollbar-gutter + CSS), `ConfigColumn.vue` (`:columns="3"`),
`FeatureWorkbench.vue` (`.lu-fw-edit` scrollbar-gutter). Verified: `build:vite` 0 + `node scripts/headless-smoke.mjs`
PASSED (all routes + AI sub-tabs + the committed `sampler-order` probe still green, 0 JS errors) + screenshot
confirmed the grid; user confirmed the look. Honest caveat: the WebView2 scrollbar shift itself can't be rendered in
headless — the structural fix removes the overflow regardless. *Tracked follow-up (non-blocking, rules-checker
flagged):* the grid is `repeat(3, minmax(0,1fr))` with a fixed 84px value cell — kept at 3 per the user's explicit
ask; at narrow `ConfigColumn` widths (Compare mode ×N columns) the labels squeeze (they ellipse → no break/JS error).
If it ever bites, switch `.ui-kg-check.is-cols` to `repeat(auto-fit, minmax(~180px, 1fr))` for a responsive 3→2→1
fallback (`KnobGrid.vue` ~`.ui-kg-check.is-cols .ui-kg-scroll`).

**Samplers grid stability + persistence investigation — IN PROGRESS (2026-06-30 cont.).** The user reported, after
the 3-column landed, that: (1) clicking a checkbox STILL visibly shifts the layout (worse in Advanced) and the reorder
control "has the same css problem" so it can't be tested; (2) at narrow widths the columns "kept shrinking" instead of
staying their size and scrolling ("code smell in your css design"); (3) the samplers should be "scrollable after a
certain height"; (4) "adding custom samplers doesn't persist to presets." The user re-stated the 8 standing rules
(never guess; verify line-by-line; reuse components; plan is the live SSOT tracker; don't override design docs —
notify; docs always full-detail). A live task tracker was created (#67 shift root-cause, #68 persistence, #69
scroll/shrink, #70 reorder CSS, #71 verify+docs). Findings + actions, each VERIFIED in code (no guessing):

— **#67 (the shift): my earlier scrollbar root-cause is DISPROVEN.** A scroll-chain probe (walking every ancestor of
`.cc`) shows the ONLY scroller in the AI feature area is `.lu-fw-edit`; it is ALWAYS scrolling (content ~1492px > the
~712px viewport) with `scrollbar-gutter: stable` already applied; the page itself never scrolls; toggling a sampler
checkbox changes nothing (no element moves, no scrollbar toggles); the order-reveal only grows height while the
scrollbar was already present. So the scrollbar never appears/disappears — it cannot be the shift, and
`scrollbar-gutter` was already on the right (and only) scroller. Net: I cannot reproduce the horizontal shift in
headless Chromium (it uses overlay scrollbars; even forcing `::-webkit-scrollbar` width did not make it take space),
which strongly implies the shift is specific to the user's Windows/WebView2 rendering in a way headless does not
replicate. I did NOT ship a third guess — instead the user narrowed it on their WebView2 machine (removing the
`ui-checkbox-input` class made the shift vanish; re-adding it brought it back), which UNBLOCKED #67.

— **✅ #67 RESOLVED (2026-07-01, runner `171e0e8`).** The cause was a FOCUS-SCROLL on the visually-hidden
`.ui-checkbox` native input — NOT scrollbars. My earlier headless probes missed it because they toggled the box
PROGRAMMATICALLY (`input.checked = …` + a `change` event), which never FOCUSES the input, so the focus path never
ran (that was the missing ingredient). Corrected probe (a real `.focus()` / label click) proved it: `.ui-checkbox-input`
is `position:absolute` (`just-llm-runner/ui/src/common/styles.css:115`) but its label `.ui-checkbox` was NOT
`position:relative` (`:114`), so the absolute input anchored to a distant ancestor. When the samplers/switches list is
scrolled to reach a checkbox, the VISIBLE box scrolls but the hidden input stays STRANDED — measured **1271px** below
its own box. Clicking the label focuses that stranded input and the browser runs `scrollIntoView` to reveal it, lurching
the `.lu-fw-edit` / `.pane-card` scroller by **~1263px** — the shift the user saw ("worse in Advanced" = more expanded
content strands the input further). A pure `input.focus()` (no toggle) scrolling `.pane-card` `0 → 1352` isolated the
mechanism cleanly. **Fix (one line, shared kit):** add `position: relative` to `.ui-checkbox` so the hidden input is
anchored to its own label and tracks the visible box (offset 1271px → 8px). Head-to-head candidate test: the one-line
fix ALONE drops `boxMovedBy` from −1263 to **0** (belt-and-suspenders `+ top:0;left:0` → 3px, input-overlay → 0px were
measured but unnecessary, so the minimal change shipped). Verified vs the REAL served CSS (no injected style): all 8
checkboxes across the samplers grid AND the switches Advanced section show `boxMovedBy: 0` with
`computedPosition=relative`; full `node scripts/headless-smoke.mjs` PASSED (every route + 5 AI sub-tabs +
sampler-order/model-manager/recs probes, 0 JS errors). It's a SHARED `@delebash/llm-ui` primitive → the fix also lands
in JustVoice (pure robustness win; JV not re-verified per the user's "not now"). A code comment on `.ui-checkbox` records
WHY the `position:relative` must stay (it looks deletable). Sibling class-of-bug swept: `UiToggle` is safe (a
`<button role="switch">`, focus on the visible button, `.ui-toggle` already `position:relative`); the
`.ui-table-pager-size-label` is a non-focusable sr-only `<label>`; the legacy **`.lu-checkbox`**
(`just-llm-runner/ui/src/styles.css:50–68`) has the identical unanchored pattern BUT is DEAD CSS (zero refs across
`*.{js,ts,jsx,tsx,vue,html,mjs}` under `/home/user`) — a pre-`Ui*`-convergence duplicate of `.ui-checkbox`, flagged
for deletion in a dedup/cleanup pass (T3), not a live bug.

— **#69 (scroll cap + no column shrink): FIXED + verified.** Restored a stable capped vertical scroll on the
multi-column samplers grid (was `maxHeight:none` in cols mode → now uses the `scrollMax` cap, 260px, with the
existing `overflow-y:auto` + `scrollbar-gutter:stable`) so it is "scrollable after a certain height" without shifting.
Changed the grid from `repeat(3, minmax(0,1fr))` (which let columns collapse to ~112px in a 360px Compare column) to
`repeat(var(--kg-cols,3), minmax(210px,1fr))` + `overflow-x:auto`, so columns KEEP a usable min width and the grid
SCROLLS horizontally instead of shrinking (matching the user's "it is off scrollable" — not shrink-to-fit). Verified
by measurement: single wide column → 3 tracks at 351px each, vertical scroll on, no horizontal scroll; a 366px Compare
column → 3 tracks HOLD 210px each (no squeeze) with horizontal scroll on. Reused the shared `KnobGrid` `columns` prop
(no fork). Files: `KnobGrid.vue` (`.ui-kg-scroll` maxHeight now always `scrollMax`; `.ui-kg-check.is-cols .ui-kg-scroll`
→ `minmax(210px,1fr)` + `overflow-x:auto`).

— **#68 (custom sampler persistence): VERIFIED WORKING — not a save bug.** Empirical end-to-end test (Rule 4): in the
real UI, "+ Add custom sampler" → typed `zcustomknob=7` → "Save as preset" (inline `.cc-name-in` name field + Enter)
→ `GET /v1/ai/engine-presets` returns the preset with `samplers:[{flagName:"zcustomknob",flagValue:"7"}]`. So a named
custom sampler DOES persist through Save-as-preset (backend also independently confirmed via a direct POST/GET curl).
My first test wrongly reported a failure — it had SELECTOR bugs (the UiInput ROOT element carries the `.ui-kg-name` /
`.ui-kg-val` class, i.e. it IS the `<input>`; `.ui-kg-name input` matches nothing) and looked for a save DIALOG when
the flow uses an inline name field. The remaining gap is by DESIGN, not a bug: per-feature sampler edits do NOT
auto-persist — persistence rides PRESETS (Save-as-preset → `engine_preset_samplers`), there is no per-feature
`/feature-samplers` PUT (knob-catalog doc §Reorder records this). So if the user added a custom sampler and expected it
to stick WITHOUT saving a preset, it won't. Whether to add per-feature auto-persist is a DESIGN change → raised with
the user, who **DECIDED (2026-07-01): KEEP Save-as-preset, do NOT add per-feature auto-persist** — the
`/feature-samplers` PUT idea is dropped (never built). Per-feature edits are intentionally ephemeral until saved into a
preset.

— **Smoke test correctness fix:** the committed `sampler-order` probe's `no-dup` assertion used the same wrong
`.ui-kg-extra .ui-kg-name input` selector, so it was vacuously always-true. Corrected to query `.ui-kg-name`
directly (the input). Full `headless-smoke.mjs` still PASSES (all routes + AI sub-tabs + sampler-order probe green).

— **#70 (reorder control): RESOLVED by the #67 fix (2026-07-01).** It already rendered cleanly after #69 (7 rows,
names `dry · top_k · typ_p · top_p · min_p · xtc · temperature`, no JS errors) with rows that don't shrink (left-aligned
`minmax(140px,200px)` grid); its only remaining issue was the #67 shift on reveal — and its toggle is the SAME
`UiCheckbox`, so the `position:relative` anchor fixes it too. The smoke's `sampler-order` probe (`reorder=true`,
`no-dup=true`) stays green. **#72** (the reorder control's DEFAULT chain — 7 names vs llama.cpp's 9) is now ALSO
FIXED (runner `fc090b0`) — see the ✅ block below.

— **✅ ALL RESOLVED — nothing is awaiting user input now (2026-07-01).** **#68** — user chose **"keep"**: KEEP
Save-as-preset as the samplers persistence path; do NOT add per-feature auto-persist. No code change — custom samplers
already persist correctly through Save-as-preset → `engine_preset_samplers` (verified end-to-end); the `/feature-samplers`
PUT idea is dropped (never built), per-feature edits stay ephemeral until saved into a preset. **#67** (checkbox-click
shift) + **#70** (reorder control) — both RESOLVED above via the `.ui-checkbox` focus-scroll fix (runner `171e0e8`).
**#72** (reorder DEFAULT chain 7→9 names) is now ALSO FIXED (runner `fc090b0`, see the ✅ block below). The only
remaining OPEN item is the separate top_k/min_p prefill (a UX call, the user's decision), noted in the #72 block.

— **✅ #72 FIXED (2026-07-01, runner `fc090b0`): the reorder control's DEFAULT order now matches llama.cpp's real
9-name chain.** Was `ConfigColumn.vue` `DEFAULT_SAMPLER_ORDER = ["dry","top_k","typ_p","top_p","min_p","xtc","temperature"]`
(7 names). Because the `samplers` request field is an ordered name list where OMITTED names are DROPPED from the chain,
enabling "Custom sampler order" with the 7-name default silently DISABLED `penalties` (the combined
repeat/presence/frequency stage) and `top_n_sigma`. **Source-verified (the server README is self-CONTRADICTORY** — its
request-`samplers` doc shows a 7-name default + "these are all the available values", while its CLI `--samplers` shows
9; the authoritative source resolves it): `common/common.h` `common_params_sampling.samplers` default = the 9-name
vector `PENALTIES, DRY, TOP_N_SIGMA, TOP_K, TYPICAL_P, TOP_P, MIN_P, XTC, TEMPERATURE`, and `common/sampling.cpp`
`common_sampler_types_from_names()` explicitly accepts `"penalties"` and `"top_n_sigma"` as valid request names. So
`DEFAULT_SAMPLER_ORDER` is now `["penalties","dry","top_n_sigma","top_k","typ_p","top_p","min_p","xtc","temperature"]`
(the code comment cites common.h/sampling.cpp so it can't drift). The committed smoke `sampler-order` probe
(`justwrite-app/scripts/headless-smoke.mjs`) was updated to assert the 9-name chain (length 9, penalties→temperature,
▼ swaps penalties↔dry). Verified: `build:vite` 0 + full `node scripts/headless-smoke.mjs` PASSED
(`default-chain=true reorder=true no-dup=true errors=0`). **Still OPEN (a separate UX call, NOT fixed — the user's
decision):** llama.cpp documents `top_k=40`, `min_p=0.05`, `top_p=0.95`, `temperature=0.80` defaults but our seed
leaves top_k/min_p blank (enabling gives an empty box that is dropped at dispatch = engine default); prefilling the
real defaults is a UX choice not yet raised/decided — left as-is.

— **✅ #73 Stop sequences ADDED (2026-07-01, runner `6a01e92`).** After the user surveyed KoboldCpp Lite's
Samplers + Tokens tabs and asked "do we need any of these," the survey found we already cover llama.cpp's full
sampler set; the ONE genuine gap was **Stop Sequences** (Tokens tab). User: "yes add it go." Built with **NO DB
schema change / no workspace reset** by REUSING the sampler-ORDER reserved-key pattern: a reserved `stop` row rides
the samplers array (`feature_sampler_params` per-feature + `engine_preset_samplers` per-preset), so it persists +
round-trips through the existing preset machinery. **UI:** a dedicated one-per-line `<textarea class="cc-stops-ta">`
in the Samplers section of `ConfigColumn.vue` (`stopText`/`writeStop`); `stop` added to the KnobGrid `reservedKeys`
so it is NOT double-shown in the checklist "Other keys". **Dispatch:** `_plane2_extra` (`prompts.py`) normalizes the
reserved `stop` value → a string ARRAY (newline-split, robust to `_parse_sampler_value`'s numeric coercion — a
numeric-looking stop like "42" stays "42"). **Adapter mapping, verified from source:** openai-compat + local
llama.cpp take `stop` natively; Gemini already mapped `stop→stopSequences`; Ollama routes it to `options.stop`;
Anthropic needed the one adapter change — a new `_map_extra` renames `stop→stop_sequences` (Claude's field) in both
`chat` + `stream_chat`. **Verified:** ruff + **186 runner pytest** (4 new in `test_plane2_params.py` — split,
numeric-kept-as-string, blank-dropped, anthropic-rename) + `build:vite` + `node scripts/headless-smoke.mjs`
(`stop=true` folded into the sampler-order probe) + a Playwright round-trip probe (type multi-line stops →
Save-as-preset → `GET /v1/ai/engine-presets` returns `{flagName:"stop", flagValue:"END\nUSER:"}`, persisted).
Shared kit → JustVoice gets the field too (not re-verified per "not now"). *(Everything else Kobold shows is
already covered or Kobold-only — not in stock llama.cpp; recorded in the survey answer, not a task.)*

— **✅ #74 License flag → DB (2026-07-01, runner `35d964c`; approved from the ai-state-grid audit of my unapproved
"nothing-hardcoded" calls).** The hardcoded license-warn regex (`LuModelCatalog.vue`
`/community|research|non-commercial|llama|gemma|cc-by-nc/i`) is GONE. Added a per-model **`use_limited`** boolean to
`model_catalog` (`db.py`), threaded through the wire (`CatalogRow.useLimited`), the store both directions
(`_catalog_to_wire` + upsert), and seeded from the license by a one-time helper `_use_limited()` — the keyword match
runs ONCE at seed time to populate the flag, which is then DB-stored + editable, so there is NO hardcoded runtime rule.
The UI reads `m.useLimited` for the ⚠ badge; the add/edit model form gained a **License** input + a **Use-limited**
checkbox (the form had no license field at all before — a real gap filled). Verified: ruff + **186 pytest** +
`build:vite` + full `headless-smoke.mjs` (model-manager green, 0 errors) + a live check (after DB reset,
`GET /v1/ai/model-catalog` returns all 11 rows carrying `useLimited`, ONLY `llama-4-scout` (Llama-Community) flagged —
correct). **Schema change → existing installs Reset workspace** (drop+reseed policy). Resolves ai-state-grid open item
#6.

— **✅ #75 Cloud pricing → DB (2026-07-01, runner `91b6285` backend + UI commit next; approved from the same audit).**
The hardcoded `pricing.py MODEL_PRICING` dict is no longer the runtime source. Added a seeded **`model_pricing`** table
(`db.py`: model_id / input_per_m / output_per_m); `pricing.price_for` now reads the **live DB** via a lazy store call
(`_live_pricing()`), with the renamed `DEFAULT_PRICING` dict kept ONLY as the seed source + a no-DB fallback (bare
tests / pre-seed boot). New `PricingStore` (`stores.py`) + CRUD router **`/v1/ai/pricing`** (GET/PUT/DELETE,
`pricing_api.py`), wired in `install.py`; `seed_default_pricing` seeds from the dict (merge-by-id). **UI:** a
**Cloud pricing** editor (`ui/src/views/PricingEditor.vue`) — an inline-editable table (model id · input $/1M ·
output $/1M · Save/Delete/Add) — mounted in the **Usage** AI sub-tab (`AiModelsArea.vue`). Verified: ruff + **189
pytest** (3 new in `test_pricing.py` — reads-DB, edits-take-effect+delete, case-insensitive) + `build:vite` + full
`headless-smoke.mjs` (`ai-tab Usage errors=0`) + a live API round-trip (`GET` seeds 14 rows, `PUT gpt-5 → 1.11/2.22`,
`GET` reflects it) + a UI round-trip probe (set gpt-5 input in the editor → Save → `GET /v1/ai/pricing` returns 7.77).
**Schema change → existing installs Reset workspace** (drop+reseed). Resolves ai-state-grid open item #7. **Both
approved hardcoded-value fixes (#74 license, #75 pricing) are now done.**

— **✅ Budget guard (grid item 8 / my audit's #3) DONE (2026-07-01, runner `9e43cbd`; user took the recommendation).**
Kept SOFT (never a hard block) but killed the silent hardcoded 8192: the budget window now derives from the column's
OWN `-c` (`ctx_len`) switch — the exact launch value — falling back to the parent's loaded-model ctx, then a **labeled
"(assumed)"** 8192 the user can still override. The window field shows its source (`(-c)` / `(loaded)` / `(assumed)` /
`(set)`) so it's honest. Files: `ConfigColumn.vue` (`ctxFromSwitches` / `winOverride` / `windowSource` / `window`).
Verified: `build:vite` + `headless-smoke` (0 errors) + a probe (no ctx_len → `window (assumed)` 8192; enable ctx_len →
`window (-c)` 4096). Resolves ai-state-grid item 8. **Think-off = KEEP** (user confirmed the B3 JSON-mode reasoning
guard stays; no change).

— **⏸ DEFERRED (user 2026-07-01, "hold off on the json, maybe do later as feature upgrade"): json_schema / GBNF
structured-output upgrade (O3 / #18)** — tracked as task **#77**, NOT being built now. Plan is READY (no schema change /
no workspace reset — reuse the stop-sequences reserved-key pattern): a reserved **`json_schema`** key rides the
samplers array; in `_plane2_extra`, when JSON mode is on + a valid schema is set, dispatch
`response_format:{type:"json_schema", json_schema:{name,schema}}` instead of `json_object` (invalid JSON → ignored →
`json_object`, so a half-typed schema never breaks a call). Adapters: **llama.cpp + OpenAI-compat native**; **Gemini**
→ `responseSchema` + `responseMimeType`; **Ollama** → `format` = the schema object; **Anthropic** → best-effort drop
`response_format` (no native equivalent — would need tools; also fixes the latent raw-`response_format`-to-Anthropic
send). UI: a JSON-schema textarea by the JSON checkbox in `ConfigColumn` (shown when JSON mode on) + a live valid/
invalid hint + `json_schema` in the KnobGrid `reservedKeys`. Verify path: pytest (schema→json_schema; invalid→
`json_object`; Anthropic drops it) + build + smoke + a round-trip probe. (Full plan also in task #77's description.)

— **✅ llama.cpp binary DOWNLOAD FIX — cross-platform, chip-aware, progress bar, editable engine config (2026-07-01,
runner `0bc301e` server + the runner-UI commit).** The user reported "download model is failing and no progress bar"
(screenshots: the status pill went **"llama.cpp binary" → "failed"** on their Windows / RTX 2070 SUPER CUDA box).
Root-caused — and VERIFIED against the GitHub releases API + NVIDIA docs this turn, never from memory — to a real data
bug in TWO layers. **Layer 1** (the download table, `runner/config.py` `DEFAULT_BINARIES`): the Windows CUDA rows
pointed `asset_url` at `cudart-llama-bin-win-cuda-12.4-x64.zip`, which is the CUDA runtime DLLs ONLY — no
`llama-server.exe` — so the download and unzip both succeeded and then `binary._find_server_exe` returned None and
`acquire_binary` raised `RuntimeError: llama-server.exe not found`, surfacing as the bare word "failed"; separately the
CPU/macOS filenames dropped the build token (404), macOS/Linux ship as `.tar.gz` while `_unzip` was zip-only, and there
were NO Linux-CPU, AMD/ROCm, or Vulkan rows at all (so those systems fell through to "no binary configured"). **Layer 2**
(detection, `hardware.detect()`): it only ever set `cuda`/`metal`, always chose `cuda12` (never `cuda13`), and never
detected AMD or Vulkan — so completing the table without fixing detection would have been hollow. **The fix, in order:**
(A) a corrected **10-row cross-platform table** — every filename confirmed present on release b9644 via
`GET api.github.com/.../releases/tags/b9644`, with the build tag interpolated into each name (single source), plus a new
`BinaryAsset.runtime_url` companion (the cudart DLLs) that `acquire_binary` downloads + unpacks into the same dir, and
`_unpack` now handles `.tar.gz` (member-sanitized on Python 3.12+) as well as `.zip`; (B) **chip-aware CUDA** —
`detect()` adds `nvidia-smi compute_cap` (with an old-driver fallback so the GPU is never lost) and `binary._cuda_key`
picks `cuda13` for Blackwell (compute cap ≥ 10.0 → sm_100/sm_120, which needs CUDA ≥ 12.8) else `cuda12` for older cards
and unknowns; (C) **AMD/Intel = ROCm/HIP first, Vulkan fallback** (user decision) — detection-gated (ROCm only when its
runtime is present, else Vulkan), so a HIP build that could not launch is never downloaded, and the NVIDIA fast-path pays
nothing; (D) a **real progress bar** — `stream_download` reads `Content-Length` and calls `on_progress(downloaded,total)`
wired through `acquire_binary`/`acquire_model` into the pollable status, rendered by a NEW reusable kit
`common/components/UiProgress.vue` (the kit had none) in `LuModelCatalog`, which also now surfaces the actual
`status.error` instead of the bare "failed"; (E) **nothing hardcoded** — a new `/v1/ai/engine-config` CRUD
(`runner_config_api.py` + `RunnerConfigStore`, following the pricing `make_*_router(get_store)` convention) behind a
collapsible **Engine binaries (advanced)** editor (`LuRunnerBinaries.vue`, mirroring the inline-editable `PricingEditor`)
in the Built-in provider form (nested under the Local engine install panel since 2026-07-02, not a catalog sibling), so the user can paste a corrected asset URL from the llama.cpp releases page (with a link +
instructions), edit the pinned build + VRAM margin, and Reset to shipped defaults (custom rows preserved). **Schema change
(`runtime_url` column) → Reset workspace required on real installs** (the dev DB was reset here). Reviewed by two
independent rules-checker PASS verdicts (server diff + plan) plus a third on the UI diff. **Verified:** 200 runner pytest
+ ruff clean; JW `build:vite` compiles the kit; the headless smoke renders every route incl. the Providers tab with zero
JS errors; a Playwright probe expanded the panel, edited `windows/cuda12`'s URL, saved (round-tripped the PUT), and Reset
restored the shipped `llama-b9644-bin-win-cuda-12.4-x64.zip` + its cudart companion; and a forced bad-URL load surfaced a
real `404 Client Error: Not Found for url: …` in `status.error` — which also proves a valid URL reaches GitHub through the
proxy, i.e. the corrected URLs will download on the user's machine. Full detail:
`just-llm-runner/docs/plans/2026-07-01-engine-binaries-download-fix.md`. JustVoice inherits the shared-kit change but was
NOT verified this session (user's standing scope).

— **✅ Session state (2026-07-01, post-compact) — SAFE TO COMPACT. Nothing is awaiting user input.** THIS session shipped
the **llama.cpp download fix** (the full entry just above): runner **`0bc301e`** (server — corrected cross-platform table,
cudart companion + tar.gz unpack, byte-progress plumbing, chip-aware detection, and the editable `/v1/ai/engine-config`
endpoint) plus the runner **UI commit** (`UiProgress.vue`, `LuRunnerBinaries.vue`, `LuModelCatalog` progress bar + real
error, `ProviderForm` mount) — both on `claude/admiring-galileo-il3q0o`, verified (200 pytest + ruff, build + smoke, live
probes). The PRIOR session shipped **#67** checkbox focus-scroll fix, **#68** keep-Save-as-preset, **#69/#70** samplers
grid + reorder, **#72** sampler-order default 7→9, **#73** stop sequences, **#74** license flag → DB (`use_limited`),
**#75** cloud pricing → DB + Usage-tab editor, **#3** budget-guard real `-c` (`ctx_len`) window; the **ai-state-grid
audit** is resolved and **Think-off** = keep. Also this session: **FIXED** a pre-existing UI bug the rules-checker caught
(user asked — "#2 fix") — `LuModelCatalog`'s `busy` ref was shared between the row's load/download action and Delete, so
one button's spinner drove the other; Delete now uses a namespaced `del:<id>` key (verified by `build:vite`). **⚠ Real
installs need a Reset workspace** to pick up the schema changes this cycle (`use_limited`, `model_pricing`, and now the
`runtime_url` column). **Deferred follow-ups from the download fix (tracked, none blocking — the editable engine panel is
the manual escape hatch for each):** **#87** AMD/Intel VRAM detection for the Fit *label* (the *download* selection is
already correct; only Fit mislabels GPU models "won't fit" on AMD) · **#88** Intel Arc discrete-GPU auto-routing to Vulkan
· **#89** spawn-time backend retry chain (try the next `_gpu_preference` entry on a spawn failure) · **#90** Linux CUDA
container/docker binary path (`linux/cuda` is docker-only today → raises NotImplementedError). The only DEFERRED
**feature** is **json_schema (#77)** — do NOT build it without a new explicit "go". Full detail for all of the above lives
in `just-llm-runner/docs/plans/2026-07-01-engine-binaries-download-fix.md` (§Fixed follow-up + §Deferred follow-ups).

**Durable coverage for the reorder control — DONE (2026-06-30).** The 5/5 reorder assertions had lived only in an
ephemeral scratchpad script; the user asked to "make it durable," so the check was promoted into the committed
renderer gate as a new probe block inside `scripts/headless-smoke.mjs`. That file already hosts the sibling AI-area
interaction probes (model-manager, recs-job-dropdown, the ai-tab sweep), so the reorder check is one more assertion in
the same single-boot AI-probe sequence — it shares the one browser launch + error-capture already running, and the
standard renderer gate now covers it with nothing extra to run. *(Rationale corrected after a rules-checker FAIL:
an earlier draft justified this as "avoiding duplicated boot scaffolding that the smoke's jscpd/REUSE gate
discourages" — that was wrong on two counts, verified: `.jscpd.json` only scans `src/renderer/src/**`, NOT `scripts/`,
so jscpd never polices smoke files; and the repo's standalone pattern `scripts/book-smoke.mjs` deliberately re-copies
`findChrome`/`waitReady` per the `CLAUDE.md` "copy findChrome()" convention — i.e. duplicated boot scaffolding in a
standalone smoke file is the accepted norm here, not something discouraged. The genuine reason to co-locate is the
shared boot session beside the other AI probes; `book-smoke.mjs` is standalone because it's a self-contained
end-to-end book round-trip, whereas the sampler-order check is just one AI-area assertion.)* The probe navigates
Routing-by-feature ▸ a feature ▸ Samplers, forces the `<details>` open (a collapsed `<details>` `display:none`-hides
its children so the checkbox isn't actionable), normalizes the toggle to OFF (so the invariant is deterministic
regardless of any persisted order — `toggleOrder(true)` always re-seeds DEFAULT), then asserts: the control renders,
the order list is hidden until enabled, enabling shows the engine-default chain (`dry…temperature`), ▼ reorders it
(dry → position 2), and the reserved `samplers` key is not double-shown as an "Other key". The same pass also fixed a
latent probe-hygiene bug it surfaced: the model-manager probe opened the Add-model `AppModal` and never closed it,
leaving a Reka overlay that blocked later probes' actionability (locator) clicks — it now presses Esc to dismiss
(closable AppModal → Esc clears it), and the sampler-order probe defensively does the same on entry. Verified: full
`node scripts/headless-smoke.mjs` PASSED — all routes + every AI sub-tab + model-manager + recs-job-dropdown +
`sampler-order present=true hidden-until-on=true default-chain=true reorder=true no-dup=true errors=0`, with the
jscpd + shared-picker REUSE gates green. A pure-`node:test` unit of the extracted helpers remains an option but is
now redundant for regression-catching — the committed probe exercises the real control end-to-end.

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
