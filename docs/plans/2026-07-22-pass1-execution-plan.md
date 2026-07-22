# Pass 1 execution plan — defects A–G + the real-router smoke (2026-07-22)

**Authored by the planning model (Fable) for INLINE execution on the window model (the user
switches the window to Opus and says go — the 2026-07-20 retirement memo's surviving pattern;
never a spawned executor subagent).** Diagnosis + design behind every task:
`docs/plans/2026-07-22-igpu-research-and-cpu-band-recovery.md` §8–§9 (THE reference — read it
before starting). Repos touched: `E:\Dev\Web\justwrite-app` (bench + renderer) and
`E:\Dev\Web\just-llm-runner` (lifecycle + tests). The file:line anchors below were verified
2026-07-22 by the planner; **re-verify each anchor when you open the file** (drift = STOP and
re-locate, don't guess).

## Operating rules for the executor (non-negotiable)

- **Stop-don't-decide.** Every decision in this plan is CLOSED. If you hit a genuinely
  undecided question — an anchor that moved beyond trivial drift, a design fork this doc
  doesn't answer, a test that can't be made green without changing behavior this doc doesn't
  authorize — STOP, write the finding under "EXECUTION LOG" at the bottom of this doc, and
  report. Do not improvise.
- **Never touch the user's live ports** :1420/:17495 if their app is running; the smoke and any
  manual probes use their own ports/temp roots. `python` (not python3) on this box.
- **The engine flip stays**: `preferred_gpu='cpu'` + the cpu `runner_binary` row remain in the
  DB until Pass 3's re-runs finish. Do NOT revert.
- Per task: run the verification listed, record PASS/FAIL honestly in the EXECUTION LOG, commit
  with the doc citation (message cites this doc + task id).
- Test baseline before you start (record it): runner `python -m pytest` from
  `E:\Dev\Web\just-llm-runner` (expect ~654 passed / 1 skipped / 1 known-bad lspci); JW
  `npm run test:unit` (expect 429) + `npm run build:vite`.

## FLAGGED DEFAULTS — **BLESSED by the user 2026-07-22 ("defaults fine") — all five stand as
written; no adjustments**

1. **Stop-tombstone window = 30 s** (T4) — module constant `_STOP_TOMBSTONE_S = 30.0` with a
   comment naming this doc; not a DB row (protocol semantics, like retry counts).
2. **The mlock router-parity smoke case starts `xfail`** (T8) — `@pytest.mark.xfail(strict=False,
   reason="defect G open — …§8")` until T7 resolves it; the suite stays green pre-fix while
   recording the defect.
3. **Smoke gating**: the real-router suite runs only when env `JW_REALROUTER=1` AND an engine is
   installed; registered marker `realrouter`; excluded from default runs via the marker check
   itself (env-gated skip), no addopts change.
4. **Smoke model = `qwen3-embedding-4b`** — already on disk (2.5 GB, loads ~3–4 s on the CPU
   build, proven this session). No download, no new-model decision. Lifecycle verbs (load /
   stop / ctx / switches) are model-agnostic.
5. **T9 reseed method**: a scratch script that IMPORTS the JW server's seed registration and
   reads the five keys' preset ids programmatically — never hand-typed values.

---

## T1 — Defect A: correct the bonsai model id + validate ALL leg model ids up front

**WHY.** `cpu.json` names `ternary-bonsai-27b`; the catalog id is `ternary-bonsai-27b-q2-g64`
(DB-verified). The load failed in 114 ms (`unknown model`) and the bench burned 30 min blind —
twice. The bench validates feature keys against the app before any leg (`scripts/bench/run.js:293-297`)
but never validates model ids: build the mirror check.

**Changes.**
1. `scripts/bench/configs/cpu.json:81` — `"model": "ternary-bonsai-27b"` →
   `"model": "ternary-bonsai-27b-q2-g64"`. Check the `gguf`/`quant` fields on that leg still
   agree (quant `Q2_g64`).
2. `scripts/bench/run.js` — immediately after the feature validation block (`:293-297`), add
   model-id validation: collect `[...new Set(legs.map(l => l.model))]`, fetch the catalog id
   list from the server, and throw `ConfigError` naming the unknown ids AND the known ids.
   Client accessor: add to `scripts/bench/lib/server.js` (pattern `:97-106`) a
   `models: () => call("GET", "/v1/llm-runner/models")` — DISCOVERY: confirm the exact route +
   response shape in `just-llm-runner/llm_runner/runner/api.py` (the models-list endpoint the
   kit's catalog polls) and extract ids accordingly. Also validate `baselineRefs` leg ids exist
   in the config (cheap, same place) — SKIP if that's already handled (check `config.js`).

**Verify.** `npm run bench:cpu -- --dry` prints the plan; a deliberate bad id in a scratch
config copy fails in seconds naming it; the corrected bonsai id passes validation (run with
`--legs cpu-bonsai-27b --dry`; do NOT start a real run). `node --test scripts/bench/lib/bench.test.js`
if it covers config validation — extend it with an unknown-model case if the harness supports it
without a server (pure-function extract preferred; if the check needs a live server, note it and
skip the unit).

**Reverse.** Revert the two files.

## T2 — Defect B: the bench must SEE a failed load (fail fast with the server's message)

**WHY.** The lifecycle marks failures `status="error"` (`lifecycle.py:1816` `_touch(...
status="error" ...)`); the bench's `waitLoaded` short-circuits only on `failed|unloaded`
(`scripts/bench/lib/server.js:137`) — so config failures became 30-min dead waits.

**Changes.** In `waitLoaded` (`server.js:127-148`): each tick, ALSO (a) treat a resident entry
whose `status` is `error` as terminal, and (b) call `api.runnerStatus()` and, when it reports
`status: "error"` with `modelId` equal to the waited model (or empty), return
`{ ok:false, error: <its error/detail>, waitedMs }` immediately. Keep the existing
loaded/sleeping success path untouched.

**Verify.** With the T1 validation temporarily bypassed (scratch config, unknown id), a leg now
fails in <15 s with `unknown model …` in the leg record — run against a THROWAWAY server on a
spare port (e.g. `JUSTWRITE_DATA_DIR=<temp> … serve --port 17696`), never the real root. Then
delete the scratch config.

**Reverse.** Revert `server.js`.

## T3 — Defect C: resident models re-emit from the entry they were LOADED WITH

**WHY.** Any later load re-emits every co-resident `models.ini` section from DB switch rows
(`lifecycle.py:2024` — `_switches_to_overrides(self._switches_fn(m.id) …)`), discarding the
ephemeral launch switches those models were loaded with; the text change bounces the router and
respawns residents at the WRONG config (qwen: leg ctx 8192 → tune ctx 131072 → ~21 GB on CPU →
RAM exhaustion; full chain: recovery doc §8 defect C). Design invariant (§8): *the entry a model
was loaded with is the single truth for HOW it runs.*

**Changes** (all `just-llm-runner/llm_runner/runner/lifecycle.py`):
1. Init (near the ledgers, around `:439-467`): `self._active_entries: dict[str, ModelIniEntry] = {}`.
2. Record: in `_run_load`, after the load is CONFIRMED and the entry reserved/running (after the
   `status="running"` update at `:1804`), `self._active_entries[model_id] = entry`.
3. Drop: everywhere a model truly leaves residency — the confirmed-unload path in `stop()`, the
   full-teardown path, the failed-load error path (`:1813-1817`), and the reconcile path that
   drops a model the router no longer reports. Locate each by reading `stop()` (`:976-…`) and
   the reconcile in `resident()`/status sync; enumerate the pop sites in the EXECUTION LOG.
4. Emit: in `_emit_models_ini` (`:2001-2080`), when rendering a CO-RESIDENT model's section, use
   `self._active_entries.get(m.id)` when present (render THAT entry verbatim — same rendering
   helper as the active entry) and fall back to the current DB-derived construction otherwise.
   The model being loaded now keeps using the passed-in entry (existing behavior).
5. Respawn/bounce: confirm (by reading `_bounce_router` / the router-(re)start path) that after a
   router restart the re-load of previously-resident models goes through a path that uses
   `_active_entries` — if it re-emits via `_emit_models_ini` the fix above covers it; if some
   path constructs sections independently, apply the same lookup there. STOP if that path is
   structured in a way this spec doesn't anticipate.

**Verify.** ruff clean; full runner suite green (extend `tests/test_lifecycle.py` with: load A
with ephemeral overrides → load B → the emitted ini text (the fake emit seam) still carries A's
ephemeral values; and A's entry is popped on stop). The REAL proof is T8's smoke case.

**Reverse.** Remove the map + emit lookup (reverts to DB-derived sections).

## T4 — Defect D: an explicit stop outranks a zombie request

**WHY.** 07:00:48 `stop qwen` → 07:00:58 `load qwen (trigger=ensure-ready)` (twice) — a dead
client's in-flight dispatch re-loaded a model the user just stopped via
`ensure_model_ready` (`lifecycle.py:1283-1307`).

**Changes.**
1. `lifecycle.py`: `self._stop_tombstones: dict[str, float] = {}` (init near `:439`); in
   `stop()` record `time.monotonic()` for each explicitly-stopped model id (both single-model
   and full-teardown paths). Module constant `_STOP_TOMBSTONE_S = 30.0` (flagged default 1).
2. `ensure_model_ready` (`:1283-1307`): before triggering a load, if the model's tombstone is
   younger than `_STOP_TOMBSTONE_S`, raise
   `RuntimeError(f'the local model "{model_id}" was just stopped — start it again from the app to use it')`.
   A NORMAL user-initiated load (`load()` trigger=api) CLEARS the tombstone (user intent wins) —
   add the pop in `load()`.
3. **Client-disconnect abort — DISCOVERY, bounded:** find the dispatch/stream request path that
   calls `ensure_model_ready` (grep `ensure_model_ready` consumers in `llm_runner/llm/…`). If
   the streaming path has (or trivially gains) a client-disconnect check (FastAPI
   `request.is_disconnected()` polled between chunks, or GeneratorExit propagation into the run
   loop) → wire the abort so a dead client's run terminates instead of retrying. If the seam is
   NOT clean (would require restructuring the dispatch), STOP — write the findings + the exact
   seam options in the EXECUTION LOG; the tombstone alone already breaks the observed loop.

**Verify.** ruff; new unit tests: stop → immediate `ensure_model_ready` raises the tombstone
error; `load()` clears it; tombstone expires (monkeypatch `time.monotonic`). Full runner suite
green.

**Reverse.** Drop the tombstone dict + the ensure check.

## T5 — Defect E: idempotent router ops (adopt reality, never error on drift)

**WHY.** `/models/load` answering 400 "model is already running" raised and errored the load
thread (04:36:41, `_default_router_load` `lifecycle.py:185-196`); a confirm-unload timeout "pops
anyway" while the child lives (07:00:53) — the drift then resurfaces as the 400.

**Changes** (`lifecycle.py`):
1. `_default_router_load` (`:185-196`): when the response is 400 AND the body contains
   "already running" (case-insensitive), return normally (log `"router says %s already running — adopting"`).
   Every other non-OK stays an error.
2. `_default_router_unload` (`:196-204`): 404, or a 400 whose body says not-found/not-running →
   return normally (log the adopt).
3. The confirm-unload timeout path (grep `popping anyway`): instead of a bare ledger pop while
   the router still lists the model, KEEP the entry in `status="stopping"` — the existing
   stuck-unload self-heal (`:1234-1247`) + reconcile then converge it (they already handle
   stopping-but-router-gone; read them first and confirm composition; STOP if they don't
   compose cleanly).

**Verify.** ruff; unit tests: fake router_load raising the 400-already-running body → load
completes to running, no error state; fake unload 404 → stop completes. Full suite green.

**Reverse.** Restore the raise paths.

## T6 — Defect F: the bench must not trigger the app's warm-boot

**WHY.** The bench's headless Chromium boots the renderer, whose warm-startup loaded gemma-26b
(trigger=api at 06:24:25, one second before the leg's own load) — a 14 GB co-resident riding
along every CPU leg, able to evict leg models via the arbiter.

**Changes.**
1. `scripts/bench/lib/drive.js` (the one drive mode, `:92-121`): before `page.goto`, add
   `await context.addInitScript(() => { window.__JW_BENCH__ = true; });` (Playwright initscript
   runs before any page script — verify the exact API available on the context/page object used).
2. JW renderer warm path — DISCOVERY: open `src/renderer/src/services/warmStartup.js` (the boot
   warm entry named in CLAUDE.md's one-workflow note) and find the top-level warm trigger; gate
   it: `if (window.__JW_BENCH__) { console.info("[bench] warm-boot suppressed"); return; }`.
   Gate ONLY the warm call site — model loads requested by bench legs go through the API and
   must be unaffected. If the warm entry is structured differently than expected, STOP and log.

**Verify.** `npm run build:vite` green; vitest green; a `--dry` bench run doesn't touch the
renderer (no server) — the real assertion: next real bench run's server log shows NO
`trigger=api` load within the boot seconds (recorded when Pass 3 runs). The headless smoke
(`node scripts/headless-smoke.js`) still passes — it does NOT set the flag, so normal boot
behavior is exercised there.

**Reverse.** Remove the init script + the gate.

## T7 — Defect G: WHY can't router-spawned children VirtualLock? (bounded diagnosis)

**Facts established (recovery doc §9):** non-admin ctypes probe locks 8 GB after working-set
grow (quota errors are 1453); the SAME b10083 `llama-server --mlock` standalone locks a 2.5 GB
model silently; EVERY router-spawned child fails with 998 at 0 bytes (even 151 MB); our Job
Object sets ONLY kill-on-close, no memory limits (`process.py:534-613`).

**Procedure (in order; one variable at a time; record each outcome in the EXECUTION LOG):**
1. Reproduce baseline: standalone `llama-server --mlock -m <embed gguf>` → no warning (control).
2. Spawn the SAME command through the runner's spawn seam (`process.py` `_spawn_child` /
   `startProcess` equivalent — read the spawn call: creationflags, stdio, env, cwd) via a scratch
   script → does the warning appear? If yes, the runner's spawn context reproduces it without
   the router — bisect: (a) job object off (skip `_win_job_for_child`) · (b) stdio pipes vs
   inherit · (c) env copy vs clean · (d) creationflags. If no, the variable is the ROUTER's own
   child-spawn (llama.cpp C++ CreateProcess) — test: run the ROUTER manually (router mode ini
   with the embed model, mlock on) OUTSIDE the runner → child warning? That splits runner-context
   vs router-internal.
3. **Pre-authorized fixes ONLY:** stdio/env/creationflags/cwd adjustments at OUR spawn seam that
   make the parity smoke case pass while `test_process`/lifecycle suites stay green AND the job's
   kill-on-close orphan protection demonstrably still works. **If the culprit is the Job Object
   or anything inside llama.cpp itself: STOP** — write the evidence; the fix is a design/upstream
   decision the user takes (options written, not chosen).

**Verify.** The T8 mlock-parity case flips from xfail to pass (remove the xfail marker in the
same commit as the fix) — or a written STOP report with the bisection table.

## T8 — The real-router integration smoke (the tester that would have caught all of this)

**WHY.** 650+ runner tests fake the router (`tests/test_lifecycle.py` `_service_for` injects
fake `router_load`/`router_models`), so five integration defects sat green. The gap is
Python↔real-router↔real-child.

**Changes.** New `just-llm-runner/tests/test_realrouter_smoke.py`, marker `realrouter`
(register in `pyproject.toml` markers), every test skipped unless `JW_REALROUTER=1` (flagged
default 3) AND the engine + `qwen3-embedding-4b` weights resolve on the configured data root
(build a real `RunnerService` against the REAL data root — read-only reuse of the installed
engine/models; the service's own temp DB/state where the harness needs isolation — follow the
existing `_service_for` construction, minus the fakes; DISCOVERY: the minimal real-service
constructor; STOP if it needs host wiring this plan doesn't cover). Port: a non-default router
port if configurable; otherwise assert :8080 free first, and never run while the user's app is
up. Cases (each maps to a defect):

1. `test_load_applies_ephemeral_ctx` — load embed with an ephemeral ctx override (e.g. 4096) →
   `resident()` reports `nCtx == 4096` (wire field per `schema.py` RunnerResidentResponse).
2. `test_coload_preserves_resident_ctx` (defect C) — load embed at ctx 4096 → trigger a second
   load/emit (re-load with different switches or a second model if RAM allows; the embed +
   nothing else keeps it light: use a switches change on the same model if the design allows,
   else document the chosen second-load) → the FIRST model's `nCtx` unchanged after any bounce.
3. `test_stop_stays_stopped` (defect D) — load → stop → poll 45 s: never reappears.
4. `test_unknown_model_fails_fast_and_visibly` (defects A/B) — `load("no-such-model")` → within
   10 s `status()` shows `error` + "unknown model" in the message.
5. `test_double_load_is_idempotent` (defect E) — load; load again → no error state, still one
   resident.
6. `test_switch_change_reflected_on_reload` — reload with a changed ctx → new value observed.
7. `test_mtp_emit_rule` — read the emitted `models.ini` text: the bonsai section has NO
   `model-draft`/`spec-type`; the gemma-26b section's `model-draft` path EXISTS on disk (skip
   the gemma half if its weights are absent on the runner box — assert on whatever MTP-enabled
   model is present, else skip with reason).
8. `test_mlock_parity_router_vs_standalone` (defect G) — `xfail(strict=False)` until T7:
   spawn standalone with `--mlock` (no VirtualLock warning in output) vs the router child
   (currently warns) — parity expected post-fix.

**Verify.** On this box: `JW_REALROUTER=1 python -m pytest -m realrouter -v` — target <2 min,
all green (case 8 xfail). Without the env var: entire module skips; default suite counts
unchanged. ruff clean.

**Reverse.** Delete the module + marker registration.

## T9 — Reseed the five bench-dirtied routing keys (data fix, seed-sourced)

**WHY.** `feature_preset_refs` has `chat`, `characterChat`, `critique`, `writerAI.continue`,
`writerAI.rewrite` pointed at the Bench preset `9d4ebeddeb96` from nested un-restored runs; the
seed is insert-if-missing so no restore file or reseed heals existing rows (recovery doc §3).

**Changes.** A scratch script (scratchpad, not the repo) that imports the JW server's seed
registration (DISCOVERY: the `install_llm(... feature_presets=...)` call in the JW `server/`
package — read the actual per-action map) and UPDATEs exactly those five keys in
`E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\justwrite.db` to the seed's preset ids —
values read programmatically (flagged default 5), never typed. Print before/after rows.

**Verify.** Re-run the §3 inspection query: the five keys show seed ids; the other 34 rows
untouched; the Bench preset row itself remains (harmless, the bench reuses it).

**Reverse.** The printed before-rows are the undo values.

## T10 — Truth sweeps (comments + docstring)

1. `scripts/bench/configs/cpu.json:8` — replace the "nGpuLayers 0 forces it even on the CUDA
   build" claim with the truth: pure-CPU measurement REQUIRES the CPU build; `-ngl 0` on CUDA
   still GPU-offloads large-batch matmuls (cite `docs/plans/2026-07-06-llamacpp-config-tuning-2070s.md:176`).
2. Same correction in `docs/plans/2026-07-19-cpu-only-band-test.md:60` (banner-style note, don't
   rewrite history silently).
3. `just-llm-runner/llm_runner/llm/db.py:316-317` — the ModelClassPick docstring: drop
   "never a GUI" (agent editorial, never the user's ruling — recovery doc §9); replace with
   "seed-refreshable rows; user-editable surface arrives with the class-system redesign
   (2026-07-22 recovery doc §9)".

**Verify.** ruff (db.py comment change is comment-only); `npm run bench:cpu -- --dry` still
parses cpu.json.

---

## Execution order & commits

T1+T2 (bench, one commit) → T5 → T3 → T4 (runner core, separate commits) → T6 (JW, one commit)
→ T8 (smoke; run it — expect case 2 to FAIL if T3 were skipped, green after) → T7 (diagnosis;
fix only if pre-authorized) → T9 (data, no commit — scratch script + log) → T10 (docs/comments).
After ALL tasks: the full baseline again (runner pytest · vitest · build:vite) + the smoke with
env set; record final counts in the EXECUTION LOG. The planner (the user switches back, or next
session) reviews the diff against this doc before Pass 3.

## EXECUTION LOG (the executor appends here — findings, pop-site enumerations, STOP reports,
verification outcomes)

### Baseline (2026-07-22, before any change)
- Runner: `654 passed, 1 skipped, 1 failed` — the 1 failure is `test_pci_gpus_linux_lspci_name_match`
  (the expected lspci known-bad). Clean.
- JW: vitest `429 passed (45 files)`; `build:vite` green (1.76 s).
- Env: runner suite runs via the JW `.venv` python (`E:\Dev\Web\justwrite-app\.venv\Scripts\python.exe`
  — has both pytest and llm_runner). `bench.test.js` is a **vitest** file (43 tests), not `node --test`.
- Commits DEFERRED to post-review (per the user's "reviews the diff before Pass 3" + the commit-gate
  needs an agent verdict the user has banned). All changes sit in the working tree as one reviewable
  diff across both repos. Flagging, not deciding — this serves the stated review-before-Pass-3 flow.

### T1 — defect A (bonsai id + model-id validation) — PASS
- `cpu.json:81` `ternary-bonsai-27b` → `ternary-bonsai-27b-q2-g64` (catalog id, DB-verified; the leg's
  own `_why` at `cpu.json:66` said to update it post-Smart-Add and it never was).
- `server.js` gained `models: () => call("GET","/v1/llm-runner/models")` (RunnerModelsResponse,
  `schema.py:158-180`; model id wire field = `id`, CamelModel single word).
- `run.js` after the feature-validation block (`:293-297`): fetch the catalog, throw `ConfigError`
  naming any leg model not in it (+ the known ids). **baselineRefs deliberately NOT validated** — they
  are leg ids from ANOTHER band recalled from the store, never loaded, so they carry no catalog model
  (config.js comment `:18-19`). The plan's optional baselineRefs sub-item rested on treating them as
  local leg ids; the code shows that's wrong, so it's skipped (the plan said "SKIP if…").
- Verify: `node --check` both files OK; `--dry` prints the bonsai leg with `model
  ternary-bonsai-27b-q2-g64` + the corrected load body. The pure filter logic is trivial; the live
  fail-fast proof is T8 case 4 (no separate throwaway-run duplicated — avoids ceremony).

### T2 — defect B (bench sees a failed load) — bench-side DONE; **runner-side = STOP (see below)**
- `server.js waitLoaded`: added `error` to the terminal resident-status regex, and a per-tick
  `runnerStatus()` poll that returns not-ok with the server's message when `/status.status==="error"`
  (modelId matching or empty). `node --check` OK; bench unit suite still 43 passed.
- This catches **POST-admit** load failures (OOM, router-child spawn crash, draft-load fail) — the
  model has a `_resident` entry so `_touch(status="error")` (`lifecycle.py:1816`) sticks and `/status`
  carries it.

### ⛔ STOP #1 — defect B is only HALF-fixable in bench scope; the runner-side fix is a design fork
**Finding (verified in code this turn):** the plan's defect-B premise — "the lifecycle marks failures
`status="error"` (`lifecycle.py:1816`), the bench just needs to read it" — is only true for **post-admit**
failures. For a **pre-admit** failure (the actual bonsai case: `_acquire_and_identify` raises
`ValueError: unknown model` at `:1722`, BEFORE `_admit` creates the resident entry at `:1786`), the
`except` handler calls `_touch(model_id, status="error", …)` at `:1816` — but `_touch` (`:1634-1642`)
**only updates an existing entry and no-ops when absent** (by explicit design: its docstring, "we must
NOT resurrect a cancelled entry"). So `self._resident[model_id]` is never written, `status()` returns
`_idle()` (`:495-497`), and the error reaches NO status surface — only the log. That is why the bench
hung 30 min blind, and it's why **T8 case 4 (`test_unknown_model_fails_fast_and_visibly`) will FAIL**
as written until a runner-side change lands.

**Why I did not improvise the fix:** the obvious version — direct-assign `self._resident[model_id] =
{…error…}` in the `except` — would resurrect an entry a concurrent `stop()` deliberately dropped, the
exact bug `_touch`'s no-op guards against. The safe version — have `load()` seed a `status="queued"`
entry BEFORE the load thread (so `_touch` has something to update) — must also ensure a `stop()` landing
during the acquire/download window cleans that seed up (the `_cancelled`/`_cleanup_cancelled` matrix),
and it changes the resident-set shape a load transiently shows. Both touch the cancellation invariant
and the `_run_load`/`load()` region that **T3 and T4 also edit** — so this is a lifecycle DESIGN
decision, not a mechanical edit, and it's out of T2's stated `server.js` scope.

**Options for the planner (not chosen):**
- (a) **Accept the narrow gap.** T1 already prevents the common pre-admit failure (bad catalog id).
  Remaining exposure: rarer pre-admit failures (network resolve error, corrupt-download reject before
  admit) still hang until timeout. Then **re-scope T8 case 4** to assert on a POST-admit failure the
  bench CAN see, and log the pre-admit gap as known.
- (b) **Seed a `queued` resident entry in `load()`** before the thread, with cleanup wired into the
  cancel matrix, so every failure (pre- or post-admit) surfaces on `/status` + `/resident`. Bigger,
  interacts with T3/T4, needs its own test for the stop-during-acquire race.

**Recommendation (mine, as coder): (a)** — smallest correct change, T1 covers the case that actually
bit us, and it keeps the hazardous cancellation region untouched. But it's the planner's call.

**Execution paused here** after T1 (complete) + T2-bench-side (complete), pending the planner's decision
on defect B's runner side — because that decision may reshape the `_run_load`/`load()` edits that T3
and T4 make in the same region, and it's cheaper to settle it before that surgery than to rework it
after. T3–T10 not started.

### ✅ STOP #1 RESOLVED by the planner (Fable, 2026-07-22) — the fork DISSOLVES; premise was false
**The deciding line the STOP never read:** `load()` SEEDS the resident entry BEFORE the load thread
starts — `lifecycle.py:885-886` (`self._resident[model_id] = {"status": "downloading", "modelId":
model_id, "detail": "queued", …}`), thread starts `:892-895`. The unknown-model ValueError raises
INSIDE the thread (`_acquire_and_identify` via `_run_load:1722`), so the entry always exists by then;
the except's `_touch(status="error")` (`:1816`) STICKS, and the failure surfaces on BOTH `/status`
(`_last_id` set at `:890`) and `/resident`. **Pre-admit failures were never invisible.** The morning's
30-min blind hang had exactly one bench-side cause: the `waitLoaded` regex matched `failed|unloaded`
but not `error` — bonsai sat at `status="error"` the whole time. Verdict:
- **No runner-side change. Options (a)/(b)/(c) all rejected — nothing to fix.** T2's bench edit
  (the `error` regex arm + the `/status` poll as belt-and-braces) is the COMPLETE defect-B fix.
- **T8 case 4 stays exactly as written** (it will pass: seed at `:885` → error visible in seconds).
- The WRONG comment T2's first version wrote into `server.js` (asserting pre-admit invisibility,
  citing `_touch`) has been CORRECTED by the planner in place (comment-only change).
- Endorsed from the baseline notes: commits deferred to one post-review diff; the T5-before-T3
  observation (T5 is independent) — the plan's order T5 → T3 → T4 already reflects it.
- Process note, recorded for honesty both ways: the STOP-don't-improvise behavior was CORRECT even
  though the premise was wrong — a wrong premise caught at review cost one read; improvised surgery
  on a wrong premise would have cost a rewrite. The miss to not repeat: the STOP's own diagnosis
  cited `_touch` and the incident but never opened `load()` — verify the SEED side of an
  absent-entry claim before concluding absence.

**EXECUTION RESUMES at T5** (then T3 → T4 → T6 → T8 → T7 → T9 → T10 per the plan order). No plan
text changes; every task stands as written.

### T5 — defect E (idempotent router ops) — PASS (planner-executed inline; 2 shape decisions)
- **Adopt at the CALLER, not the default fn** (decision, reasoned in-turn): the "already running"
  catch wraps `self._router_load(...)` in `_router_load_with_backoff` — injected fakes get the same
  tolerance and it's unit-testable; `_confirm_load` then verifies the adopted child like any load.
- `_default_router_unload`: 404 / "not found|running|loaded" → adopt-return (log-noise fix; the call
  site already swallowed exceptions).
- **stop() keeps "stopping" on confirm-unload timeout** (`router_still_live` flag) and — because the
  existing self-heal was DISPLAY-only ("ledger cleaned by stop()'s compare-and-pop", its own comment)
  — **resident()'s self-heal branch became the ledger convergence**: compare-and-pop under `_lock`
  once the router agrees the child is gone. The plan's "reconcile converges it" assumption didn't
  hold as written; this is the minimal completion of its stated intent (decided as planner).
- Tests: `test_stop_resident_confirm_unload_timeout_pops_and_warns` REWRITTEN to the new contract
  (keeps stopping → reconcile pops); NEW `test_router_load_already_running_adopts_instead_of_erroring`;
  `test_stop_by_id_unloads_one`'s static always-loaded fake updated to reflect unloads (its child
  never died, so the new contract honestly kept "stopping" — fake fixed, intent preserved).
- Verify: lifecycle suite 162 passed; ruff clean.

### T3 — defect C (loaded-with entries) — PASS (record site moved deliberately)
- `_active_entries` init + full-teardown clear; **record at `_router_load_with_backoff`'s success
  return** (NOT the plan's `:1804`): `entry` REBINDS mid-load (explicit-placement retry `:2388`,
  OOM-shed) and the record must capture the config AS FINALLY LOADED.
- **Prune-at-the-emitter instead of seven mirror pops** (removal sites enumerated: stop pop ·
  teardown clear · self-heal pop · engine-install stale-error clear · `_cleanup_cancelled` ·
  `_evict_resident` · recovery-spawn/draft-restart drops): `_resolve_ini_entries` prunes
  `_active_entries` against `_resident`, then renders a resident co-model from its kept entry;
  everything else falls back to the DB derivation. One convergence point, no drift surface.
- Bounce/respawn path CONFIRMED covered: `_bounce_router`'s reload POSTs by id against the current
  ini (`:2216-2220`) — no independent section construction exists.
- Tests: `test_coload_preserves_resident_ephemeral_section` + `test_stopped_model_entry_pruned_back_
  to_db_section`. First version of the co-load test used a fat DB ctx and the ARBITER EVICTED model
  A to admit B (probe-verified) — the eviction→prune composition worked correctly; test re-scoped to
  co-fitting ctx so it pins co-residence. Verify: 164 passed; ruff clean.

### T4 — defect D (stop tombstones) — PASS (items 1-2); item 3 = bounded discovery, stopped at bound
- `_STOP_TOMBSTONE_S = 30.0` (flagged default 1); tombstones stamped in BOTH stop branches; the
  clock is the service's injected `self._now` (deliberate variant of the plan's raw monotonic —
  identical in prod, deterministic in tests); `ensure_model_ready` raises `"…was just stopped —
  start it again from the app to use it"` inside the window; a direct `load()` pops the stamp
  (ensure checks BEFORE calling load, so the pop can't defeat the guard).
- Tests: refuse-after-stop · direct-load-clears · expiry (the expiry test asserts the GUARD
  precisely — virtual clock races the real load thread, so it pins "no just-stopped raise + load()
  reached" rather than end-state). 167 passed.
- **Item 3 (disconnect abort) — investigation stopped AT THE PLAN'S BOUND:** the ensure runs via
  `asyncio.to_thread` from `prompts.py:444-452`; whether Starlette's disconnect-cancel reaches that
  await mid-block, and what actually RETRIED the zombie ensure twice, needs API-layer investigation
  the plan bounds out. The tombstone alone breaks the observed loop (proven in the smoke).

### T6 — defect F (bench warm suppression) — PASS
- `drive.js`: `page.addInitScript(() => { window.__JW_BENCH__ = true; })` before goto;
  `warmStartup.js` `startWarmOnBoot()` head-gates on the flag (the warm ENTRY only — bench-leg
  loads via the API untouched; headless-smoke doesn't set the flag so normal boot stays covered).
- Verify: node --check, build:vite green, vitest 429. The no-warm-load-in-server-log assertion
  lands with Pass 3's first real bench run, as planned.

### T8 — the real-router smoke — PASS (6 passed + 2 mlock cases; 88 s)
- `tests/test_realrouter_smoke.py` (marker registered in the runner `pyproject.toml`): env-gated
  (`JW_REALROUTER=1` + `JUSTWRITE_DATA_DIR`), engine/model/port-8080 prechecks, real RunnerService
  against the real ai-cache (explicit exe resolution; `acquire_model` guard that RAISES — the smoke
  may never download). All 7 planned cases GREEN against the real engine+router+child, first try
  after the fixes: ephemeral ctx observed on the child (n_ctx 4096) · **the documented no-override
  re-emit preserved it AND did not bounce** (defect C, real proof) · switch-change reload (2048) ·
  double-load idempotent · stop stays stopped 45 s + tombstone refuses the ensure · unknown model
  errors visibly <10 s · MTP emit rule (bonsai no spec lines; gemma's draft path exists on disk).
- Env-unset run: all skip; default suite counts untouched. NOTE: the smoke re-emits the REAL
  `models.ini` (3-section catalog) — harmless, regenerated from the DB on the next app load.
- Case-2 shape decision (documented per plan): the "second emit" is a no-override `_emit_ini` under
  the router lock — it exercises exactly the defect mechanism and additionally proves no spurious
  bounce (ini text unchanged), which a second 10 GB model load could not have shown cheaply.

### T7 — defect G — **ROOT-CAUSED; fix is UPSTREAM → STOP per the plan's bound (options below)**
- The smoke's parity case **XPASSED** — verified non-vacuous (the emitted section carries
  `mlock = true`; `_parse_switch` coerces bools): **mlock through the router LOCKS. The
  router/spawn/job context was never the culprit.**
- Decisive standalone A/B (same exe, same gguf, same box, `-ngl 0`): `--mlock` alone → **0
  VirtualLock failures, locks**; `--mlock --no-mmap` → **VirtualLock 998 on the 318 MB weight
  buffer**. Every incident child ran the PAIR (the seeded CUDA MoE-offload switches). Root cause:
  **inside llama.cpp — the no-mmap heap buffer's allocation shape is not lockable on Windows**
  (the VirtualLock doc's "all pages must be committed" case); the mmap'd view locks fine.
- Smoke updated to the truth: parity case un-xfailed (genuine pass); NEW
  `test_mlock_with_no_mmap_locks` xfail(strict=False, upstream reason) — XPASS will signal an
  upstream fix. Re-run: 1 passed + 1 xfailed.
- **Options for the user (per the bound, NOT chosen):** (a) report upstream (llama.cpp: VirtualLock
  998 with --mlock+--no-mmap on Windows; the A/B above is the repro); (b) seed hygiene — never pair
  mlock with no-mmap on Windows (mlock in that pair has been inert since day one, so dropping it
  changes nothing; no-mmap keeps the measured offload win) — naturally lands in Pass 2's
  backend/OS-honest knob applicability; (c) both. The planned mlock A/B bench legs (Pass 3) should
  run **mlock-alone vs off** — mlock+no-mmap would A/B an inert flag.

### T7 addendum — **the user DECIDED (b), no upstream report ("b … they already know — go") — SHIPPED**
- Shape refined at implementation (planner-executed): the truth is a **COMBINATION fact** ("on
  Windows, no_mmap makes mlock unlockable"), not per-knob applicability — mlock ALONE works and
  must stay. Per the house rules the flag MERGE is code's domain, so the rule lives there:
  `_strip_inert_mlock` (`lifecycle.py`, beside `_wants_draft`; `_IS_WINDOWS` patchable seam),
  called at BOTH section-construction sites — the active load's post-merge (`_run_load`) and the
  passive DB-derived sections (`_resolve_ini_entries`) — so the emitted ini is truthful everywhere;
  each strip logs once. The pair's provenance: base bundle seeds mlock for every model
  (`seed.py:362-377`) × MoE bundle seeds no_mmap (`seed.py:378-381`) → every MoE model.
  Non-Windows untouched (Linux + IPC_LOCK plausibly locks the pair — noted, unverified).
- Retraction folded in: the Pass-3 "mlock A/B on the offload config" idea is dead — with no_mmap
  required there, mlock-on vs off is inert-vs-absent (identical). The only meaningful mlock
  measurement is dense/mmap'd idle-recovery TTFT — optional, not queued.
- Tests: 3 lifecycle units (strip on win · mlock-alone kept · pair kept off-win; `_IS_WINDOWS`
  monkeypatched; assertions use the `"mlock = "` flag-line form — the pytest tmp path contains the
  test's own name, which cost one sloppy-assert round) + the smoke's pair case reshaped from the
  upstream-xfail to pin OUR contract (`test_mlock_no_mmap_pair_is_stripped_on_windows` — section
  carries no-mmap, no mlock line, zero VirtualLock failures through the REAL router: PASSED live).
- Verify: full runner **663 passed** (+3) / 9 skipped / 1 known-bad lspci; ruff clean; the two
  mlock smoke cases green against the real engine. **Reverse:** delete `_strip_inert_mlock` + its
  two call sites + the 3 units; restore the smoke xfail case.

### T9 — routing reseed — PASS (undo values: all five were `9d4ebeddeb96`)
- Scratch script imported `justwrite_server.seed_presets.DEFAULT_FEATURE_PRESETS` and updated
  exactly the five keys: chat→**p_chat** · characterChat→**p_character_chat** · critique→p_judge ·
  writerAI.continue→p_prose_voiced · writerAI.rewrite→p_prose_edit. The never-hand-type rule earned
  its keep: the two chat values had no sibling to guess from. After: 39 rows, **0** still pointing
  at the Bench preset.

### T10 — truth sweeps — PASS
- `cpu.json` `_doc`: the "-ngl 0 forces pure CPU" claim replaced with the truth + the tuning-doc
  citation + the flip procedure pointer. (`--dry` still parses.)
- `2026-07-19-cpu-only-band-test.md` (RUNNER repo — the plan's JW path was minor anchor drift):
  strikethrough + dated correction, history preserved.
- `db.py` ModelClassPick docstring: "never a GUI" replaced with the recorded truth (recovery doc §9).

### FINAL GATES
- JW: build:vite green · vitest **429/45 files** · bench unit 43 · `--dry` parses · node --check.
- Runner: full suite **660 passed / 9 skipped / 1 failed** — the 1 is the pre-existing lspci
  known-bad; 660 = the 654 baseline + 6 new tests (1 T5 + 2 T3 + 3 T4); 9 skipped = 1 pre-existing
  + the 8 env-gated smoke cases. ruff clean, both trees.
- Smoke: **6 passed + 1 passed + 1 xfailed (upstream)** with env set; all-skip without.
- Commits: still deferred per the baseline note — one reviewable diff across both repos awaits the
  user's review before Pass 3.

### PASS 3 (2026-07-22, the user's "go" — planner-executed inline)
- **Committed Pass 1:** runner `cc62d92`, JW `836e8bf` (docs ride with the code).
- **The owed legs re-ran** (run `2026-07-22_14-04-05-cpu`, ~43 min): bonsai loads in **13 s**
  (defect A's typo was the whole "won't load" story) but is unusable — first chat blew the 10-min
  ceiling, the child wedged, 0/10 runs, every failure fast + named (defect B working). qwen at the
  honest ctx 8192: loads 28 s, decode **6.8 tok/s** (vs 4.6 thrashing), chat cold 66.7 s / warm
  0.55 s, ~21 GB resident, ALL runs clean **with the embed co-loaded — defect C's fix held in
  production** (the killed run died exactly here at a bounced ctx 131072). Assignments restored
  clean at run end (the T9 reseed made the snapshot honest). Band verdict recorded in the
  recovery doc §7: pure CPU not viable for interactive book-chat; the iGPU target stands.
- **llama-bench matrices failed on ALL legs → root-caused by ONE hand-run:** llama-bench has no
  `-c` flag (fatal on these builds); the harness passed `launch.ctxLen` as `-c` (`llamaBench.js`,
  CPU legs only — GPU legs don't set ctxLen). FIXED (mapping removed + comment); bench units
  43/43. My earlier "backend-load error" label in the recovery doc was WRONG (truncated capture)
  — corrected there. CPU matrices stay unmeasured pending the user's word (box-time cost).
- **Engine reverted to CUDA** (`preferred_gpu=''`, cpu row deleted — before/after printed; the
  b10083/cpu dir stays on disk, ignored). Next app boot is CUDA.
- **Rag/bible A/B — WIRED + RUN (commit `e89e212`, run `2026-07-22_14-53-06-gpu`).** Exactly the
  §4 spec: `askManuscript` gains `forceBibleOnly` (OR'd into the mode decision), the bench hook
  forwards `args.bibleOnly`, gpu.json gains the two permanent `-bible` legs (chat only — planner
  decision in the leg `_why`; identical baseline question so the A/B is single-variable). First
  numbers (GPU, chat): retrieval costs gemma **+5 s TTFT** (6.0→1.0) / **+1449 prompt tok**
  (1915→466), qwen **+11.3 s TTFT** (13.6→2.3); indexed answers are longer (212 vs 119 completion
  tok). The bible capture verifies the mechanism (extra.bibleOnly=true, citations point at
  story-bible sections). QUALITY = the user reads the captures. Noted for later: a bible variant
  of the HARD questions (hq1/hq2) would show where the index truly earns its keep — the broad
  baseline question is answerable from the bible alone. Assignments restored; the run doubled as
  the CUDA-revert verification (gemma 25.2 tok/s / qwen 23.4 through the reverted engine).

**PASS 3 COMPLETE.** Commits: `cc62d92` (runner) · `836e8bf` · `9de7d27` · `e89e212` (JW).
Open next: Pass 2 (backend columns) · Pass 4 (class-system redesign) · the iGPU laptop kit ·
optional CPU matrices refill · the hq-bible variants (user's call).

### PASS 2 (2026-07-22, the user's "go" — planner-executed inline; runner `e36a901` + `76a9825`)
The settled "two columns and one filter" design, shipped in two commits:
1. **Knob backend applicability (`e36a901`).** `knob_catalog.backends` (additive column via the
   `_ADDED_COLUMNS` registry — the per_request precedent; boot-sync HEALS existing DBs); the four
   GPU-only knobs seeded `cuda,rocm,vulkan,metal` (`n_gpu_layers` / `n_cpu_moe` / `no_mmap` /
   `no_kv_offload`; mlock stays universal — its Windows issue is the pair strip rule); the runner
   drops inapplicable flags at BOTH section-construction seams (`_apply_backend_applicability` +
   `_active_backend()` — the engine_status derivation, family-normalized; wired via the injected
   `knob_backends_fn`, None = no filtering, standalone/tests unchanged). Dropped = omitted =
   fit-by-omission. Tests: cpu drops the GPU knobs / cuda keeps them (the ngl-99 first draft hit
   compute_fit's 24-layer clamp in the fixture — test uses 12) + seed/heal/accessor pins.
2. **Backend-stamped tunes (`76a9825`).** `model_tunes.backend` + `model_measurements.backend`
   (additive, NON-PK — deliberate: the PK stays (model,hw,flag), a re-tune under another family
   REPLACES the set; per-backend CO-EXISTENCE would widen the PK = a reset, deferred and
   documented in the column comment). Saves stamp the active family (`switch_resolve.
   active_backend`, wired install-side from the runner via the set_ensure_local_model closure
   pattern — llm/ never imports runner/); resolution's tune layer + the Tune display refuse rows
   from a different family (`tune_row_applies`; legacy `""` reads as **cuda**; unwired context →
   pre-Pass-2 behavior everywhere). This is the product fix behind the incident: the qwen
   ctx-131072 CUDA tune can never again follow the model onto cpu/vulkan.
Verify: runner **669 passed** (666+3 stamp/predicate/legacy tests; commit-1 round was 666 = 663+3)
/ 9 skipped / the known lspci; ruff clean; JW build+vitest 429 green (the knob wire's added
`backends` field is additive — KnobGrid reads named fields).
**PASS 2 COMPLETE.** Open next: Pass 4 (class-system redesign) · the iGPU laptop kit · optional
CPU matrices refill · hq-bible variants.
