# Plan — Portable unified data root + separate "Install engine" from "download model" + spawn diagnostics

> **Validated by a 3-checker rules panel (architecture-fit · reuse · grounding).** All three approve the shape
> (no rewrite); their FAIL findings are folded below and marked 【panel】. The biggest one (first-upgrade
> migration, T5) is **removed** by the user's "no existing users / not in production" — day-one greenfield.

## ⛔ LIVE STATUS — where this stands (kept current; single source of truth)
Branch (all repos): `claude/admiring-galileo-il3q0o`.
- **Phase 1 — Runner engine install/load split + spawn diagnostics: SHIPPED + PUSHED** (`just-llm-runner` `e7664d6`). `start_runner(log_path)` redirects merged stdout+stderr to a per-load log + reports exit-code / hang + tail in `RunnerStartError`; `engine_status`/`install_engine`/`engine_log` on a SEPARATE `_engine_state` + `_engine_thread`; `_run_load` HARD-REQUIRES the engine (`error="engine-not-installed"`, injectable `_acquired_exe` probe); `GET/POST /v1/llm-runner/engine/{status,install,log}`. Verified: ruff + **202 pytest** (+10); post-task rules-checker PASS (folded: reuse `_tail_file` in `engine_log`; add an OOM-via-log test).
- **Phase 2 — Portable data root: SHIPPED + PUSHED** (runner `7892ba3` + JW `1d8a33e`). 2a: `install_llm(data_dir)` → `_wire_runner_catalog` → `configure_service(cache_root=<root>/ai-cache)` (optional/None keeps `~/.cache`; JV unaffected). 2b (`src-tauri/src/lib.rs`): `resolve_data_root` via Tauri `app.path()` in a NEW `.setup()`; the root reaches the server via `JUSTWRITE_DATA_DIR`; `<exe>/data`-else-user default; a `dataroot.txt` pointer OUTSIDE the root, locked on first boot; autosave repointed (images are DB blobs → untouched); `storage_get_root` + `async storage_relocate` (crash-safe copy→atomic-rename→**atomic pointer flip = commit**→delete old→respawn; respawns at the OLD root on failure) + `SidecarState::set_child`; bridge `window.justwrite.storage`. Verified: runner 202 + JW **77 pytest**, ruff, `cargo check`. Post-task rules-checker PASS (folded: respawn-on-failure, atomic pointer, `async`, `with_file_name` staging). **Rust runtime is DESKTOP-GATED — verified on-device, not in CI.**
- **Phase 3 — UI: BUILT + VERIFIED; COMMIT PENDING.** `LuRunnerEngine.vue` (new "Local engine" install panel) + `ProviderForm` mount (above the catalog) + `LuModelCatalog` "install engine ↑" CTA + shared `ui/src/common/composables/usePoll.js`; JW `SettingsView` **Storage** section (the General "Data location" card MOVED + a Change-folder button) + `en.json` label + `docs/storage.md`/`toc.json` + `CLAUDE.md` IPC-bridge block. Verified: `build:vite` + headless smoke **0 JS errors** + a Playwright probe (engine panel above the catalog, Storage renders). Phase-3 checker FAILed T3 (poll dup) + T11 (docs) → BOTH fixed (usePoll extracted + both panels converged; CLAUDE.md bridge + `docs/storage.md`); the smoke caught + fixed an `onUnmounted` ReferenceError from the refactor. Checker RE-VERIFY in flight → on PASS, commit runner (LuRunnerEngine/ProviderForm/LuModelCatalog/usePoll) + JW (SettingsView/en.json/docs) + push.
- **Flagged, out of scope:** (1) JV server can't import on this branch — `justvoice/models.py:23` wants `LLMRolesSettings` the shared runner no longer exports (pre-existing convergence skew; needs a decision). (2) release spawn arm omits the `serve` subcommand (packaged-only; verify). (3) ignored `wait_for_port_free` return in relocate (minor). (4) #100 QuickSetup `/v1/ai/jobs` repoint (product decision).

## Context (why this change)
Two asks this session, on the back of a real bug on the user's Windows box (RTX 2070 SUPER = Turing → the
`cuda12` build): loading a model failed with `RunnerStartError: llama-server failed to become healthy
(ngl=32):` — **empty tail, no reason**. Grounded (cited) analysis:
- stderr is ALREADY merged + surfaced (`process.py:363` `stderr=subprocess.STDOUT`, `:375` appends
  `output[:300]`); the tail is empty because `_drain` (`:278-283`) does `communicate(timeout=2)` → `""` when the
  process is still alive at the 30 s health deadline (**hang**) or died at the OS-loader level before writing.
  **`cudart64_12.dll` exists on the box** → NOT the #91 download-404; the binary installed. Undiagnosable today.
- A model **load** silently installs the engine as step 1 (`lifecycle._run_load` → `_acquire_binary`,
  `:330-333`) before the weights (`:336`) — fusing a once-per-machine install into every load buries
  install failures and is the wrong lifecycle.

**User decisions (locked):** (1) **Install engine = its own button + process**, separate from downloading a
model; a load **hard-requires** the engine installed (decision A). (2) **Fold in spawn diagnostics** (persistent
log + exit code) — also the "get the llama console output in a window or log" ask. (3) **One user-settable
location for ALL data the app writes** (projects DB + assets + AI engine + models + logs) — a portable unified
root. (4) **Default = beside the app** (`<exe-dir>/data`) when writable, **else** the OS user-data dir. (5) On
change, **MOVE all data** (incl. models — no refetch). (6) **No existing users / not in production** → no
migration of legacy/scattered data; the unified root is the fresh default from day one.

## Grounding (verified this session + by the panel, cited)
- Server ALREADY has a unified data dir + accepts it: `paths.default_data_dir()` = `platformdirs
  user_data_dir("JustWrite")` (`server/justwrite_server/paths.py:14`); `create_app(data_dir)` → `init_db`
  (DB `data_dir/justwrite.db`, `database.py:42`) + `AppState` + file log (`app.py:71-78`); `serve` takes
  `--data-dir`/`JUSTWRITE_DATA_DIR` (`cli.py:39`); `install_llm` is called INSIDE `create_app(data_dir)`
  (`app.py:160`) → `data_dir` is in scope to thread. 【panel: feasibility CONFIRMED】
- `configure_service` (`runner/lifecycle.py:372`) + `RunnerService.__init__` (`:168`) ALREADY accept
  `cache_root`; `configure_service` is NOT passed one today (`llm/install.py:155`). No runner schema change.
  【panel: redundant `RunnerConfig.cache_dir` field correctly dropped】
- **Images are SQLite BLOBs** in `justwrite.db` (`server/justwrite_server/api/images.py`; `services/
  imageStore.js` → `POST /v1/images`, data-URL fallback) — the Tauri `images_dir()` path (`lib.rs:243-248`) is
  legacy-read-only. 【panel T2: so images ride the DB move — do NOT repoint images】
- Only real Tauri-owned file path to repoint: `autosave_dir()` (`lib.rs:103-105`, uses `app_data_dir()`).
  `spawn_sidecar()` (`lib.rs:701`, called pre-app at `:848`) passes NO `--data-dir` today; `cargo check` runs here.
- Install split blocks: `binary.acquired_server_exe` (`binary.py:88`, no-download probe) + `acquire_binary`
  (`:114`, install). Runner REST in `runner/api.py`; `get_service()` singleton; `RunnerService` load-state
  machine, injectable acquire/start (`lifecycle.py:162-235`); `status()` touches only `_state` (`:217-221`).
- **JV mounts the shared runner router directly** (`JustVoice/server/justvoice/app.py:190`) and does NOT call
  `install_llm`/`_wire_runner_catalog`/`configure_service`. 【panel: safe IFF the new param is optional/None】
- UI: kit `UiProgress`, `LuModelCatalog.vue` (poll + `UiProgress` + `status.error`), `LuRunnerBinaries.vue`
  (advanced config editor) both under `ProviderForm.vue` `isBuiltin` (two-sibling pattern). JW App Settings
  `SettingsView.vue`: tab sections `:54-60`; a **"Data location" card already exists in the GENERAL section**
  (`:1116-1124`, `dataDir` fetch `:86-94`). 【panel T2/T3: move that card, don't duplicate】

---

## Phase 1 — Engine install/model-load split + spawn diagnostics (shared runner) — container-verifiable

### 1a. Spawn diagnostics — persistent log + exit code (`runner/process.py`)
- `start_runner(...)` gains `log_path: Path | None`. When set → spawn `stdout=<log file>,
  stderr=subprocess.STDOUT` (redirect to file: robust, survives hang/crash/kill). When `None` (standalone /
  injected-`_popen` tests) → keep the PIPE + `_drain` path.
- On health-fail: `rc = proc.poll()` (None → killed on timeout; else exit code — Win `0xC0000135` = DLL-not-
  found); read the **tail** (~40 lines) of the log; `_looks_like_oom` reads that tail (OOM backoff preserved).
  `RunnerStartError` → `...(ngl={n}, exit={rc}): {tail}  [log: {path}]`.
- `lifecycle._start` passes `log_path = <cache_root>/llamacpp/logs/runner-<model>-<ts>.log`; store `_last_log_path`.

### 1b. Engine status + install methods (`runner/lifecycle.py`)
- `self._engine_state` — a SEPARATE channel from `_state` (`{status: idle|installing|installed|error,
  downloaded, total, detail, error}`); `install_engine` runs on its OWN `self._engine_thread` (never `_thread`)
  so it can't clobber an in-flight load. 【panel】
- `engine_status()` → `{installed, build, gpu, serverExe, hasRuntime, platform, **engine_state}` via
  `acquired_server_exe` + `select_binary` + a cudart-present check.
- `install_engine(force=False)` → bg thread → **`self._acquire_binary(...)`** (the injectable, same path as
  `_run_load` uses — preserves offline testability) into `_engine_state`. 【panel: use the injectable, not the
  module fn】

### 1c. Hard-require engine on model-load (`runner/lifecycle.py:_run_load`)
- Replace `self._acquire_binary(...)` (`:330-333`) with the probe `acquired_server_exe(...)`; if `None` →
  `_state = {status:"error", error:"engine-not-installed", detail:"Install the engine first"}` and return
  (decision A). **This changes shared `_run_load` semantics for every mounter** (removes auto-install-on-load);
  JV never auto-loads via this path, but re-verify JV boot/import. 【panel T2: not "additive" — disclose】

### 1d. Endpoints (`runner/api.py`)
- `GET /v1/llm-runner/engine/status`, `POST /v1/llm-runner/engine/install` (`{force?}`),
  `GET /v1/llm-runner/engine/log?tail=200`.

## Phase 2 — Portable unified data root — desktop-gated (cargo check here + user-box runtime)

### 2a. Runner cache under the data root (server; container-verifiable via pytest)
- Add an **optional keyword** `data_dir` param to `install_llm` (`llm/install.py:38`) + forward to
  `_wire_runner_catalog` (`:121`), which calls `configure_service(cache_root=data_dir / "ai-cache", …)`.
  `create_app` passes its `data_dir` (`app.py:160`). Default `None` → today's `~/.cache` behavior (JV + any
  non-JW caller unaffected). 【panel: optional/None = JV-safe】 Engine + models now live at
  `<root>/ai-cache/{llamacpp,hf}`. No legacy fallback needed (no users).

### 2b. Data-root resolution + pointer + move (`src-tauri/src/lib.rs`) — the portable core
- **`resolve_data_root(app: &AppHandle)`** — resolve in a NEW **`.setup(|app| …)`** closure (where the handle
  exists) using **Tauri's OWN path resolver** `app.path()` (already used at `lib.rs:104`/`:244` — no new crate):
  read the **pointer** file `dataroot.txt` (beside `current_exe()` if that dir is writable — portable — else
  `app.path().app_config_dir()`); else the DEFAULT = `<exe-dir>/data` if writable (probe: mkdir + temp-file
  write) else `app.path().app_data_dir()`. 【panel T1 + user "it's a Tauri app, use its data folders": resolve
  BEFORE the sidecar/DB opens — the Electron "setPath before `ready`" lesson, done in `.setup()`】
- **Move `spawn_sidecar()` from the pre-builder site (`:848`) INTO the `.setup()` closure** so it receives the
  resolved root + `AppHandle`; add `--data-dir <root>` to all three spawn arms (`:729/:732/:743`) and
  `app.manage(SidecarState::new(child))`. Server then owns DB + logs + (2a) `ai-cache` under `<root>`. The
  renderer's connection gate (15 s retry, `services/connection.js`) tolerates the slightly-later spawn.
- **Repoint the ONE real Tauri file path:** `autosave_dir()` (`:103-105`) → `<root>/projects`. **Do NOT touch
  `images_dir()`** — images are DB blobs, they ride the DB. Both helpers read the single `resolve_data_root()`
  (no re-implementation). 【panel T2 + reuse】
- **New commands** (register in `invoke_handler![]` + `tauri-bridge.js` `window.justwrite.storage.*` +
  `capabilities/default.json`): `storage_get_root()` → `{root, default, source, writable}`;
  `storage_pick_folder()` → native folder dialog (existing `dialog:default`; this command HAS the `AppHandle`);
  `storage_relocate(newPath)`.
- **Crash-safe, user-initiated move** (`storage_relocate`, runs while the app is up so the webview shows a
  "Moving…" overlay): **stop the managed sidecar `Child`** (drops the `justwrite.db` handle — `database.py:43`)
  → copy `oldRoot` → `<newRoot>.tmp` → fsync → **atomic rename to `newRoot`** → **write the pointer = the commit
  point** → delete `oldRoot` → clear the pending record → respawn the sidecar at `newRoot`. The pending record
  lives beside the pointer (OUTSIDE both roots); the op is idempotent/resumable (re-run detects "source gone,
  pointer already new"); cross-volume falls back to copy-then-delete with the same commit point. On any failure
  → keep `oldRoot`, surface the error, never delete before the rename+pointer commit. 【panel T1: write-ahead
  commit, no data-loss window】 Restart of the server is intrinsic (sidecar respawn) — disclosed in the UI.

## Phase 3 — UI (kit + JW)
### 3a. Engine install panel (new kit `ui/src/components/LuRunnerEngine.vue`) — 【panel: justified, not a fork】
- "Local engine" card for the Built-in provider: `engine_status()` (Installed ✓ build/gpu · or Not installed),
  **Install engine** / **Update**(`force`) `UiButton`, `UiProgress` during install (reuse #83; a small distinct
  poll — do NOT hand-copy `LuModelCatalog`'s loop), surfaced `status.error`, **View log** (`/engine/log`).
  Mounts in `ui/src/views/ProviderForm.vue` under `isBuiltin`, ABOVE the collapsible `LuRunnerBinaries`.
### 3b. Model-catalog prompt (`ui/src/components/LuModelCatalog.vue`)
- On a load `error === "engine-not-installed"` → **Install engine first** CTA (not a raw error) → the Engine panel.
### 3c. JW App Settings → Storage (`justwrite-app/src/renderer/src/views/SettingsView.vue` + en.json + helpDocs.js)
- New **`storage`** tab section (`:54-60`) + `settings.sections.storage` i18n. **MOVE** the existing General
  "Data location" card (`:1116-1124`) here (one data-location surface — no parallel) and extend it: current
  root + source (portable vs user dir) via `storage_get_root()`, a **Change folder…** button (→
  `storage_pick_folder` → confirm "Everything moves here and the app restarts" → `storage_relocate` → respawn),
  progress overlay during the move, and copy that this one folder holds projects + images + AI engine + models
  + logs. Browser-only dev (no `window.justwrite`) shows the root read-only. Add a Storage/Engine help entry
  (`services/helpDocs.js`). 【panel T3 + T11】

## Phase 4 — Tests, verify, docs, ship
- **Container-verifiable:** runner `ruff`+`pytest` (log-redirect + exit-code + tail; engine_status/
  install_engine on the injected acquire + its own thread; `_run_load` `engine-not-installed`; OOM backoff
  intact) · JW server `ruff`+`pytest` (`install_llm(data_dir=…)` → `configure_service(cache_root=<dir>/ai-cache)`;
  `--data-dir` arg via `test_cli`) · `cargo check` (2b compiles — no new crate; Tauri `app.path()` +
  `.setup()` restructure) · `npm run build:vite` ·
  headless smoke (Storage section + Engine panel render, 0 JS errors) · Playwright probes (Engine panel states;
  Storage shows the root; General no longer double-shows data location).
- **Desktop-only (user's box):** engine install; the data-root resolution + relocate/move + respawn; native
  folder pick; the live spawn diagnostics on the failing load. Called out honestly — not claimed verified here.
- **JV safety:** JV `ruff`+`pytest` + boot/import (all runner changes additive; `install_llm` param optional →
  JV keeps `~/.cache`; `_run_load` no-auto-install re-checked) + grep JV for removed symbols (none).
- **Docs:** new `justwrite-app/docs/plans/2026-07-02-portable-data-root-and-engine-install.md` (this plan +
  LIVE STATUS); update `MORNING_RECAP.md`; note this is NOT #91 (cudart present). rules-checker on the final
  diff (single, post-task) before each commit. Pre-production → drop-and-reseed on any schema touch is free.
- **Commit** per-repo on `claude/admiring-galileo-il3q0o` (runner + JW), push `-u`. No PR unless asked.

## Options considered (T4 — portable data root + relocation)
Chosen: a **beside-app portable data folder** resolved via **Tauri's `app.path()` in `.setup()`** (before the
server opens the DB), a **file pointer** for the override, and a **stop→crash-safe-move→respawn** relocation.
Grounded in adopted precedents, not invented:
- **VS Code Portable Mode** — data folder beside the app so "all data… lives near itself… moved around across
  environments" (https://code.visualstudio.com/docs/setup/portable) → the beside-app default (decision 4).
- **Electron `app.setPath('userData')`** — relocatable user-data root that **must be set before `ready`**
  (https://www.electronjs.org/docs/latest/api/app) → resolve the root BEFORE spawning the sidecar / opening the
  DB (the panel's ordering fix).
- **Tauri path plugin** (`app_data_dir`/`app_config_dir`) + the **in-repo `--data-dir`/`JUSTWRITE_DATA_DIR`**
  seam (`cli.py:39`) = the existing override the shell drives.
Alternatives weighed + rejected: env-var/registry pointer (less portable, OS-coupled) → file pointer beside-exe;
symlink old→new (Windows-fragile, permissioned) → real move; server-owned move endpoint (DB is open in-process)
→ shell-owned move with the sidecar stopped; full app relaunch → respawn just the sidecar (sufficient).

## Out of scope
- Migration of legacy/scattered data (N/A — no existing users). Live streaming in-UI console (log + tail +
  View-log suffices). JV's own portable-root shell + Storage UI (inherits the shared cache-under-root wiring;
  desktop pieces adopt later). #91 (editable download-URL editor) — separate. Headless `justwrite-server serve`
  (no shell) resolves the server's own `platformdirs` default, not beside-app — deliberate + disclosed.

## Parallel (not blocking): the actual spawn failure
Still undiagnosed (empty tail). Phase 1a makes it self-report on the user's box (exit code + log). If the user
grabs the exit code / new log sooner it likely pinpoints it (hang vs CUDA-init vs a missing cublas DLL).
