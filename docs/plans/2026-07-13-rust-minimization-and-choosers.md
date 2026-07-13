# Plan — Rust→server minimization + autosave/backup choosers + samples→data-dir + #293

## Context

The user's rule: **Rust is only the desktop shell** — anything that can run server-side must be a plain JS `fetch` → the Python server; Rust stays minimal (native file/folder dialogs + OS-browser open + spawn/relocate the server). Today ~1138 lines of Rust expose 17 commands, several doing file IO under the data dir the server already owns (`JUSTWRITE_DATA_DIR`). Alongside the migration the user wants: autosave + backup each with their **own** folder selector (default = data dir, remember last), the **choosers-open-at-home bug** fixed, **autosave select/delete (individual + all)**, samples in **`<data>/samples/`** (Option A: one-time materialize, source shipped as a bundled resource), and **#293** (embed card stuck on "loads on first search" after an index build).

Three read-only Opus audits grounded the code; a 3-lens rules-checker panel then vetted this plan (all three returned FAIL — every finding is folded in below, and the Tauri `bundle.resources` fact was verified against v2.tauri.app/develop/resources). End state: **Rust = 5 native dialogs + OS browser + spawn/relocate; everything else = fetch → server.**

## Decisions (flagged — approve or adjust)

- **D1 — Autosave stays a client-triggered 10 s POST** to a new `/v1` endpoint; the server writes the rotating file (not "server auto-writes on every book PUT" — that fires ~400 ms, far too often). Bonus: autosave then works in browser-dev too (today Tauri-only, `project.js:93` guard).
- **D2 — Delete legacy `images_read`/`images_delete` — AWAITING the user's call (explained 2026-07-13; rec: delete).** These 2 Rust fns only read/delete OLD disk-file image records (pre-server-images); the app now saves every image to the server (`POST /v1/images`) and never writes disk-file records, and a DB reset wipes any old ones — dead code. Delete = one more bit of Rust gone; keep = harmless but pointless.
- **D3 — "Autosave changeable" = its own folder picker** writing an `autosaveDir` setting (default `<data>/projects`), remembering last. **(D3a) LOCKED: on change, MIGRATE the existing rotating files to the new folder** (don't lose the user's autosaves). **(D3b) LOCKED + BROADENED (user, 2026-07-13): NO user-changed folder path EVER resets.** The data root (already survives via the `dataroot.txt` pointer kept outside the wiped root), `autosaveDir`, the backup folder, AND every remembered chooser location are CONFIG, preserved across a workspace reset — `data_admin.py` reset (`DELETE /v1/settings`) must PRESERVE those keys (a folder-path whitelist) and wipe only non-path workspace data. A folder path only changes when the user reverts it.
- **D4 — Samples ship as a bundled resource; the server materializes `<data>/samples/` once when missing, with a read-time fallback.** Verified mechanics below. Source moves `server/justwrite_server/samples/` → `justwrite-app/samples/` (out of the Python package).
- **D5 — autosave close/unload capture — LOCKED: Option A (user's rec, 2026-07-13).** Moving the write to `fetch` means the app-close flush is best-effort: browsers drop in-flight `fetch` on unload, `keepalive` caps at 64 KB (a full snapshot exceeds it), and `CloseRequested` (`lib.rs:1127-1133`) kills the sidecar racing the POST. *Note: the DB save (`projectApi.js` PUT `/book`) ALREADY has this exact close-fragility today (it flushes with `keepalive` on `pagehide`), so the Rust autosave being more-reliable-at-close is an asymmetry, not a guarantee elsewhere.*
  - **Option A (recommended):** autosave POST gains `keepalive` (matching the DB save) + the `CloseRequested` handler drains in-flight / brief grace before `kill_child`. Autosave fully server-side; close-capture as reliable as the DB save already is; document the abrupt-kill worst case (≤10 s). The grace is shell lifecycle — legitimately Rust.
  - **Option B:** retain a minimal Rust write invoked ONLY on `pagehide`/close (in-process, most reliable) while periodic autosaves + list/read/delete/dir go server-side. Keeps one Rust write command for the critical moment.

---

## Phase 0 — Delete the 3 dead Rust commands (pure removal, low risk)

`lib.rs`: delete `project_save_to` (:94/95), `images_save` (:278/279), `detect_gpu` (:795/796) + drop from `invoke_handler![]` (:1107-1125); remove orphaned `sysinfo`/GPU-parse code + the `sysinfo` dep (**Cargo.toml:34**). `tauri-bridge.js`: delete `project.saveTo` (:85), `images.save` (:101-107), `system.detectGpu` (:156) + the empty `system` object. Audits confirm zero callers. → `cargo check` + `build:vite` + smoke.

## Phase 1 — Autosave → server (enables delete + dir chooser)

**WHY:** `project_autosave*` is pure data-dir file IO; the renderer already `PUT`s the same snapshot to the server (`projects.py:91`). Consumers: `stores/project.js` (the WRITER, `:106`) + `SettingsView.vue` (reader).

**Server — new `server/justwrite_server/api/autosave.py`, mounted in `app.py`:** port the Rust logic verbatim (3-gen rotation current/prev/prev2 + tmp→rename crash-safety, `lib.rs:120-142`; the list-parse `lib.rs:160-216`) to Python; base dir from an `autosaveDir` setting (default `<AppState.data_dir>/projects`):
- `POST /v1/projects/{id}/autosave` — body = the snapshot (renderer keeps bundling `_workspace.settings`; server writes verbatim). Rotate + write.
- `GET /v1/projects/autosaves` → `[{projectId,title,savedAt,generation,key}]` (**key = `id__generation`**, server-safe; not an abs path).
- `GET /v1/projects/autosaves/{key}` · `DELETE /v1/projects/autosaves/{key}` · `DELETE /v1/projects/autosaves` (all).
- `GET`/`PUT /v1/projects/autosave-dir` (display + D3 chooser target).

**Renderer:**
- New `src/renderer/src/services/autosaveApi.js` — ride the kit `serverApi` (`get/post/put/del`, confirmed exported).
- `stores/project.js`: `flushDiskAutosave` (defined :99, call :106) → `autosaveApi.post(id, snap)`; drop BOTH Tauri guards (**:93 AND :105**) so autosave runs in browser-dev; keep the 10 s debounce (:87-97); implement the D5 close path (Option A: keepalive + `CloseRequested` drain, or B).
- `SettingsView.vue`: repoint `autosaveDir`/`autosaveList`/`autosaveRead`/restore (:405,:440-443,:463, card :1352-1394) to `autosaveApi`; update the list row `entry.path` → `entry.key` at **`:1382` (`:key`) and `:463` (restore arg)**.

**Delete the Rust:** `project_autosave`/`_dir`/`_list`/`_read` (:120-223) + `autosave_dir` helper (:103-110) + the 4 bridge wrappers (:87-94). (Option B keeps ONE minimal write command.)

## Phase 2 — Legacy images off Rust (D2)

Delete Rust `images_read` (:323), `images_delete` (:335), `images_dir` helper (:245) + bridge `images.read`/`images.delete` (:108-112). `imageStore.js`: drop the legacy `{path}` branches in `urlFor` (:78-88) + **`removeImage`** (:102-104) + the `hasNativeImages` flag (:22); server records only (bridge `images` object then empty → remove).

## Phase 3 — Choosers: default to data-dir + remember-last (repro-first)

**WHY + honesty flag (panel T2):** my earlier root cause ("`storage_get_root` returned undefined") is WRONG — that command returns a fully-populated struct synchronously (`lib.rs:376-384`), so it can't be undefined. The true cause is unverified and **not reproducible in this headless container (no native dialog).** So: reproduce on the user's box first; regardless of cause, HARDEN `chooserDir` with a guaranteed data-dir fallback.

- **New shared `src/renderer/src/services/chooserDirs.js`** (T3 fix): move `chooserDir`/`rememberDir` out of `bookTransfer.js` (currently module-private, :30-39) + add a module-cached `serverDataDir()` (fetch `GET /v1/health` → `dataDir`, `health.py:24`). Repoint ALL readers: `bookTransfer.js` fallback (:33-34), `SettingsView.vue`'s existing inline health fetch (**:92-97** — converge it, don't add a second reader), and the new autosave-dir chooser. `chooserDir` gets a hard fallback so it never yields `undefined`.
- **Autosave-dir chooser (D3):** `SettingsView.vue` autosave card → "Change folder…" → `shell.pickDirectory({ defaultPath })` → `autosaveApi.putDir(chosen)`; remember-last via shared `chooserDirs`. (D3a migrate + D3b reset-survival per the endpoint.)
- Backup chooser already wired (`saveBackupBlob` + `chooserDir("backup")`, remember-last confirmed) — inherits the hardened default.

## Phase 4 — Autosave select/delete UI

`SettingsView.vue` list (:1379-1391): checkbox per row + "Delete selected" + "Delete all" (kit `confirmDialog`, already imported :455) → `autosaveApi.delete(key)`/`deleteAll()` → refresh. No toast (QC-37).

## Phase 5 — Samples → `<data>/samples/` (Option A, D4) — reworked per the panel ×2

**IN SCOPE (dev + tests): the server-side materialize + state-independent read.** DEFERRED with the not-yet-wired packaged build (OUT OF SCOPE this cycle): the Tauri resource bundling.

- Move `server/justwrite_server/samples/` → `justwrite-app/samples/`.
- `demo_seed.py`: replace the `_SAMPLES_DIR` module constant with a **state-independent `_samples_dir()`** — try `get_state().data_dir/"samples"`, BUT `get_state()` **raises `RuntimeError` when unset** (`app_state.py:24-26`), so wrap in try/except and, when state is unset OR `<data>/samples/` is absent **or yields no `book.json`** (guards a partial materialize), **fall back to the bundled source** (`JUSTWRITE_SAMPLES_SRC` env, else `Path(__file__).parents[2]/"samples"` = repo `justwrite-app/samples/`). `load_sample`/`list_samples`/`load_sample_images` read through it. This keeps the **direct-call** `test_a_sample_is_bundled` (`test_seed.py:119-122` — never builds a client/`create_app`) green WITHOUT relying on a global-state leak, and stops a failed materialize from 500-ing "Try tutorial project". Shared core `book_io.import_book_snapshot` (`seed.py:41` + `book_transfer.py:107`) untouched.
- **Materialize in `create_app`** (`app.py:73` — the layer BOTH pytest fixtures AND `serve` call): **best-effort** (a missing source NEVER crashes boot) — if `<data_dir>/samples/` absent, copy from `JUSTWRITE_SAMPLES_SRC` / the repo fallback **via temp-dir+rename so a mid-copy crash can't leave an empty `<data>/samples/`** (same crash-safety idiom as the autosave write).
- **Tests:** `test_seed.py` stays green via the state-independent fallback above (verify, no content edit expected). `test_book_transfer.py` references **no** samples/demo symbols (it builds inline snapshots) — no sample-location edit; it only needs the materialize to be best-effort.
- **Packaged-build resource plumbing — DEFERRED / not tested this cycle:** `tauri.conf.json` `bundle.resources` + resolving the dir in the setup hook (`lib.rs:1097`, has `app`) via `app.path().resolve(…, BaseDirectory::Resource)` threaded into `spawn_sidecar` (new param, since spawn_sidecar has no AppHandle) → `JUSTWRITE_SAMPLES_SRC`. The **exact resource path/config must be verified against v2.tauri.app/develop/resources when the packaged build is wired** — Tauri encodes a `../` parent-traversal source under a mapped subdir and a directory may need a glob; today `tauri.conf.json` has no `externalBin`/`resources` + no `*.spec`/package-data, so no installer exists yet. In dev + tests the resource path is empty and the **Python repo-fallback is what delivers samples** → Phase 7's "samples-present" probe validates the FALLBACK, not the resource mechanism. `storage_relocate`'s `copy_dir_all` (`:436`) already carries `<old>/samples`→`<new>/samples`.
- `The Salt-Iron Road.zip` moves along (still user-imported; `list_samples` only enumerates `book.json` folders).

## Phase 6 — #293: embed card refresh-edge fix (kit)

**WHY (confirmed at `AiModelsArea.vue:110-122`):** `_loadedSig` starts `null`, so the FIRST resident tick sets the baseline (`:120`) without `refreshRunnerModels()` (guard `:119` needs `_loadedSig !== null`); an off-page embed load (RAG build) is swallowed → `useRunnerModels` keeps stale `status:"disk"` → `LuModelCatalog.vue:750` shows "loads on first search". Server truth is correct throughout.

- Fix: **init `_loadedSig = ""` (`:110`)** so the first tick is treated like any other and refreshes when the resident set is non-empty. `refreshRunnerModels()` only re-reads the models list (it does not perturb `/resident`) → one-shot, no loop (panel-confirmed). Shared kit → JustVoice benefits too.

## Phase 7 — Verify + docs + ship

- **JW:** `cargo check` · `build:vite` · `test:unit` · server `ruff` + `pytest` (**update** `test_seed`/`test_book_transfer`; **new** autosave + samples-materialize tests) · **FULL headless smoke** · Playwright probes: autosave delete, chooser-default, **autosave close/unload capture (D5 — assert the last edit lands in `<id>.autosave.json` after a simulated quit)**, samples-present · DB restored byte-exact.
- **Kit/#293:** `build:vite` both apps · resident-refresh probe (load embed off-page → card reads "loaded").
- **Docs (T11):** `MORNING_RECAP.md` pointer · this plan → `docs/plans/2026-07-13-rust-minimization-and-choosers.md` · **`CLAUDE.md` "IPC bridge" + "Image storage" + "When adding a new Tauri command" sections** (Rust surface shrinks; autosave/images now server) · whats-new (autosave delete + folder pickers) · ledger · **`demo_seed.py` docstring + docs note samples now live at repo-root `justwrite-app/samples/`**.
- **Ship:** genuine rules-checker verdict per code commit; **push only on your explicit word.**

## Sequencing / end state

- Phases 0→1→(2,3,4) = migration core; 5 (samples) + 6 (#293) independent, any order. Each phase is separately approvable.
- KEEP in Rust (target ~8): `project_save` · `project_open` · `pick_directory` · `pick_file` · `shell_save_file` · `open_external` · `storage_relocate` (+ `storage_get_root` beside it) · `spawn_sidecar` (+ any D5-Option-B minimal write). GONE: `project_save_to` · `images_save` · `detect_gpu` · `project_autosave`×4 · `images_read` · `images_delete`. Net 17 → ~8; bridge drops to dialogs + relocate.
- `project_save`/`project_open` (TitleBar native `.jw.json`) stay (native dialogs). Whether that overlaps the ZIP export/import is a separate product question — out of scope.
