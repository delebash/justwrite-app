# Hardware class = a named entity (name + VRAM + RAM) holding model-configs — 2026-07-22

**Status: BUILDING (user's "yes go", 2026-07-22 evening).** Supersedes the Pass-4 class panel
(the `vram8|ram32`-as-visible-key + override popup). This is the design the user converged on
across a long chat; their rulings are quoted below.

## The settled design (user's rulings, verbatim where quoted)

- A **hardware class** is identified by its **VRAM + RAM** ("i reverse that vram and ram is
  key") — one class per (VRAM, RAM) pair, so auto-detect always lands on exactly one.
- It carries a **free NAME** ("but name can be anything" · "i have my laptop vram 8 ram 8, then
  my pc vram 16 ram 16") — a human label ("My Laptop"), NOT the identity, NOT matched on.
- It **holds several model-configs** ("a named hardware class that holds several model-configs")
  — one (model + switches) per config under the class.
- **VRAM and RAM are separate whole-GB integer fields** you set ("vram and ram as individual
  text boxes"; "why would ram ever b decimals" → integers only).
- **One add/edit form, no popup, no rename button** ("no change name button, just text box you
  can enter name and click save" · "1 add edit form same, not 2 forms, add/edit has model you
  can choose") — the QC-15 no-naming-popup law. Each in-place editor serves BOTH add and edit.
- **Auto-detect**: detected VRAM/RAM → the class with those exact numbers; none → the computed
  fit fallback (unchanged). **"Use for this PC"** (a selection, not a popup) overrides a wrong
  sensor. ("detection proposes, never dictates".)
- Kill the raw-key splatter, the dropdown-of-one, the "this PC is X" caption dup, the "Change…"
  promptDialog — every problem the user itemized on the Pass-4 panel.

## Why this EXTENDS, doesn't rebuild (adopt-what-exists, not reinvent)

The internal `class_key` string (`vram8|ram32`) already encodes VRAM+RAM and is already the
identity used by `switch_resolve` (the resolution ladder), `current_class_key()`/matching, the
Pass-4 `class_key_override` ("Use for this PC" reuses it), `list_class_tune_refs`, the catalog's
`classTuneRefs`/`myClassKey`, and `pickByClassConfig`. NONE of that changes. The ONLY new thing
is a sidecar table giving each class a **name** + the **editable integer VRAM/RAM** the form binds
to; `class_key` is DERIVED from those integers on save (`vram{v}|ram{r}` / `cpu|ram{r}`).

## REVISION (2026-07-22, user "go" after iGPU/unified-memory research) — TYPE-FIRST

The `vram+ram` identity was dedicated-GPU-only. iGPU shares system RAM (no offload) and
unified memory (Apple Silicon / DGX Spark) is one pool — both break a two-number key, and a
Mac currently mis-keys as `cpu|ram…`. So the class is now **memory-architecture-first**:

- **THREE types**: `discrete` (dedicated VRAM + system RAM — the offload split), `integrated`
  (iGPU, one shared pool), `unified` (SoC, one pool). No "CPU only" — a GPU-less box folds into
  `integrated` (RAM-keyed). TWO FORM SHAPES: discrete shows VRAM+RAM; integrated/unified show
  one memory number. Keys: `dgpu-vram8|ram32` · `igpu-mem16` · `unified-mem192`.
- **Detection (dependency-free — no PyCUDA/PyTorch/pynvml)**: macOS → `unified` (fixes the
  Mac-as-CPU bug); NVIDIA (cuda) → `discrete`; Intel Arc / a scanned GPU with ≥4 GB dedicated
  VRAM → `discrete`; any other detected GPU (iGPU) or none → `integrated`. Verified against
  NVIDIA docs: `cudaDevAttrConcurrentManagedAccess` is NOT a unified signal (`1` on ordinary
  discrete Linux GPUs), so it is deliberately NOT used; a DGX-Spark-style unified-NVIDIA falls
  to `discrete` and is corrected by the "Use for this PC" override (a device-name list is the
  future refinement, not built now).
- **ram_gb reused as the pool**: discrete → vram_gb + ram_gb; integrated/unified → vram_gb 0 +
  ram_gb = the one pool. A new `mem_type` column carries the type.

## Schema (drop+reseed — no migration, standing DB policy)

- **NEW `hardware_class`**: `class_key` (String PK — derived), `vram_gb` (Int), `ram_gb` (Int),
  `name` (Text, default ""), `built_in` (Bool). One row per class.
- **`class_tunes` UNCHANGED**: (model_id, class_key, flag_name, flag_value, built_in) — the
  model-configs under a class; `class_key` joins to `hardware_class`.

## Tasks (backend first — UI last, since the form shape is the one thing to eyeball)

1. **db.py** — add `HardwareClass` (`class_tunes` untouched); `_ADDED_COLUMNS` n/a (new table,
   create_all picks it up).
2. **stores.py** — `HardwareClassStore`: `list_all()`, `save(name, vram_gb, ram_gb, orig_key="")`
   (derive class_key; if editing and the key moved, relocate the row + cascade `class_tunes`;
   reject a collision with an existing class), `delete(class_key)` (row + its class_tunes),
   `ensure(class_key)` (auto-create a blank-named class when a config is saved for a not-yet-known
   class — the Tune-modal "Save for hardware class" path). `class_key` derivation helper shared
   with hardware.py's format (ONE source).
3. **class_key format = ONE source** — factor `vram{v}|ram{r}`/`cpu|ram{r}` so hardware.py's
   `class_key(hw)` and the store's derive agree (no parallel format string).
4. **hardware_class_api.py** (new) — `PUT /v1/ai/hardware-class` {name, vramGb, ramGb, origClassKey?}
   · `DELETE /v1/ai/hardware-class?classKey=`. `GET /v1/ai/class-tunes` (existing) EXTENDED:
   response gains `classes: [{classKey, vramGb, ramGb, name, builtIn}]` beside the existing
   `tunes` (the model-configs) + `classKey` (this box's). Existing PUT/DELETE class-tunes keep
   working; PUT `ensure()`s the class first.
5. **seed.py** — `DEFAULT_HARDWARE_CLASSES = [{class_key:"vram8|ram32", vram_gb:8, ram_gb:32,
   name:""}]` (name blank → plain-words fallback in UI; the user flagged not owning a name string,
   so blank is the honest default) + seed it BEFORE `seed_default_class_tunes` (the gemma config
   needs its class to exist). `seed_default_hardware_classes(s)` merge-by-key.
6. **install.py** — wire the hardware_class store into the class-tunes router + the new
   hardware-class router; `_current_class_key` unchanged (already override-aware from Pass 4).
7. **switch_resolve.py / matching / model_catalog_api.py / modelPick.js / useCatalogMeta.js /
   QuickSetup.vue / LuModelCatalog.vue** — UNCHANGED (they key on `class_key`; the sidecar is
   invisible to them). VERIFY, don't edit.
8. **classTunes.js** — add `saveHardwareClass`/`deleteHardwareClass`; `classKeyLabel(key, name)`
   prefers the class NAME, falls back to the plain-words VRAM/RAM (kill raw-key display).
9. **LuClassTunes.vue** — REWRITE the panel (matching the LuModelCatalog list + in-place-editor
   pattern, NOT a new shape): a grouped list — each **class** is a section header (Name ·
   VRAM/RAM plain words · "this PC" tag · "Use for this PC" · Edit-class · Delete-class), with its
   **model-config rows** beneath (model · settings · Edit/Copy/Delete) + "Add model to this class".
   TWO in-place editors, each serving add AND edit, NO popup: the **class editor** (Name text box,
   VRAM int, RAM int) and the **config editor** (Model picker + KnobGrid). Remove: the raw-key
   `<code>`, the datalist dropdown, the "this PC is X" caption, the "Change…"/`promptDialog`, the
   "Use auto-detect" floating button (its revert lives on the picked class row instead).
10. **Tests** — `test_hardware_class.py`: derive/relocate/collision/ensure/cascade-delete +
    the extended GET; keep `test_class_tune_refs.py` green (refs unchanged); rewrite
    `test_class_tunes.py` for the extended response. `verify-model-pick.mjs` unchanged (39/39).
11. **Docs** — this doc's execution record + README + TASKS.md.

## EXECUTED (2026-07-22, user "go"). Record.

Shipped in three commits: runner `ec693f6` (backend + tests), runner `0340231` (UI),
JW docs (this doc + TASKS). The class is now a named, type-first entity: `HardwareClass`
sidecar (name + `mem_type` + editable VRAM/RAM) keyed by the derived `class_key`
(`dgpu-vram8|ram32` / `igpu-mem16` / `unified-mem192`); `switch_resolve` + the Pass-4
override key on it unchanged. `hardware.mem_arch` sets the type from platform+vendor
(macOS→unified — fixes the Mac-as-CPU mis-key; NVIDIA→discrete; Arc/≥4GB→discrete;
iGPU/none→integrated), no heavy deps, verified against NVIDIA docs that
`concurrent_managed_access` is not a unified signal. Store: save (relocate-on-key-change
+ collision reject), ensure, cascade delete. Router `/v1/ai/hardware-class` PUT/DELETE +
`classes` on `/class-tunes`. UI: LuClassTunes rebuilt as a class list holding its
model-configs, two in-place editors (class: Name·Type·VRAM/RAM; config: Model+KnobGrid),
"Use for this PC" override as a row selection — every Pass-4 wart (raw-key splatter,
datalist-of-one, "this PC is X" dup, the Change… promptDialog) removed.

How verified: runner pytest **687 passed / 1 pre-existing lspci known-bad**; the new
`test_hardware_class.py` (format/parse round-trip, mem_arch matrix, store
relocate/collision/ensure/cascade, router PUT/DELETE + validation) green; `verify-
model-pick.mjs` **39/39**; vitest **429/429**; **build:vite** green (LuClassTunes
compiles). Smoke NOT run — the user's live app held :1420/:17495, so their own hot-reloaded
eyes are the look gate; a headless smoke on alternate ports is the follow-up.

What would reverse it: revert `ec693f6` + `0340231` together (the wire shape `classes`/
`memType` + the derived-key format changed in lock-step). Drop+reseed means an existing
dev DB gets the new `hardware_classes` table on next boot; the old bare `vram8|ram32`
class-tunes rows (if any) become orphans until a reset.

Open: (a) the flagged UI form-shape guess — the user's eyeball on the two-editor layout
(vs a single mega-form); (b) a splash-aware headless smoke on alternate ports; (c) a
known-unified-device-name list for DGX-Spark-class auto-detect (deferred — override covers it).

## THE LAPTOP FACTS + THE DETECTION FIX PACKAGE (2026-07-23, user's "your rec go")

The Core Ultra 7 laptop's `detect-facts.txt` (the kit's first return) settled the parked
decisions with evidence: the display registry names the iGPU plain **"Intel(R) Graphics"**
(no "Arc" — Intel's control panel brands it Arc, the registry doesn't) and reports
**`qwMemorySize: (absent)`**, while the engine's own Vulkan device serves an **18 GB shared
pool** (18361 MiB) on a 31.5 GB-RAM machine. Consequences, shipped as runner **`ea36b0d`**:

- **① Name regex DELETED** (`_INTEL_ARC_RE`): classification keys on dedicated VRAM only —
  ≥4 GB = discrete, small/absent = integrated (the laptop's absent-VRAM case classifies
  correctly; an iGPU whose DriverDesc DOES say "Arc(TM)" — Lunar-Lake style — is now pinned
  integrated by test). **③ resolved: NO DXGI needed** — the feared registry-reports-shared-
  memory case did not materialize (it reports nothing), so the threshold stands.
- **② A2 WIDENED**: any detected Intel GPU + the Vulkan loader → the `vulkan` runtime (the
  old Arc-name gate left this laptop CPU/online-only with a working 18 GB Vulkan device
  idle). The loader still gates (no `vulkan-1.dll` → the online-provider path); the A3
  spawn chain still falls back. Old pin `test_detect_intel_igpu_stays_cpu` REVERSED into
  `test_detect_intel_igpu_routes_vulkan` + a no-loader-stays-cpu guard.
- **④ RAM LADDER (new problem the facts exposed)**: the laptop's 31.5 GB rounded to 31,
  the desktop's 31.9 GB to 32 — two nominal-32 GB machines in different classes from OEM
  reserve jitter. `snap_ram_gb` snaps system RAM to the standard-capacity ladder
  (2…1024, ties take the lower rung); both machines now land in 32. VRAM is deliberately
  NOT snapped (10/11/20 GB boards are real sizes). Exact laptop/desktop byte counts pinned
  in `test_snap_ram_gb_standard_ladder`.
- Kit corrections from the run: the resume logic retries failed combos (the first run
  failed everything on the missing VC++ redistributable and then skipped them as "done" —
  fixed), and the README's prerequisite is the **VC++ redist only** (the laptop already had
  the Arc driver, which carries Vulkan; the extra driver install was almost certainly
  unnecessary).

Verified: runner pytest **689 passed / 1 pre-existing lspci known-bad**. STILL PENDING from
the laptop: `results.jsonl` + `bench-log.txt` (the speed verdict + the `uma:` flag
confirmation — the bench was running when this shipped).

## Acceptance

- Add a class "My PC" 16/16 → appears; add a Gemma config under it → resolves for a 16/16 box.
- Auto-detect on the 8/32 box tags the seeded class "this PC"; "Use for this PC" on another
  class re-points it (reuses `class_key_override`).
- No raw `vram8|ram32` anywhere in the UI; no popup; one form per thing (add+edit); no dropdown-of-one.
- Full fleet green: runner pytest, `verify-model-pick.mjs`, vitest, build:vite, headless smoke.

## RISK

The one guess is the **UI form shape** (step 9) — "1 form not 2" could mean a single mega-form
(class + inline configs) instead of the two in-place editors here. Backend (1–8, 10) is
shape-agnostic and built first; the UI is built last so it's the thing the user eyeballs and
corrects cheaply. Everything in step 7 is asserted UNCHANGED and must be verified by the tests +
smoke, not assumed.
