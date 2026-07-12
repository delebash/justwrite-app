# Sample novel *The Ninth Facet* + data-driven samples + per-project JSON export/import

**Supersedes this doc's earlier hardcoded-replace draft.** The design changed through a
long design conversation with the user (2026-07-12). Their decisions, verbatim-ish:
"data driven" · "export per project no samples folder" · "one full export that covers
importing into another jw app, jv can then just load this folder and parse what it needs" ·
"book1 folder book2 folder, export location defaults to jw data folder but user can choose
another" · "no zip leave it as folder" · "i dont like the server post … remove it from jw" ·
"no shared component it does not make sense" · "dont worry about jv, add that to the jv
stuff we still have outstanding" · **"go"**.

## The four decisions (grounded, cited in code)

1. **The demo/sample must not be hardcoded Python.** Today `create_demo_project`
   (`seed.py:30`) calls `book_io.decompose(db, id, demo_book_snapshot())` where the snapshot
   is a 536-line hardcoded module (`demo_seed.py`). → make it **data-driven**: the seeder
   loads a bundled **book folder** (`book.json`) and decomposes it. Swapping samples = swap
   the folder, no code.
2. **A book = a folder.** `<book>/book.json` (+ an `images/` folder when the book has
   images). `book.json` is the existing snapshot shape (`exportSnapshot()` `project.js:2113`
   = what `book_io.decompose`/`assemble` round-trip). Images are **server bytes**
   (`imageStore.js:52-57,77`), NOT in the JSON — so they travel as real files in `images/`,
   which is why a folder (not one JSON) and not a zip (user's call).
3. **Per-project Export/Import JSON, JW-local (NOT a shared kit component).** Export a
   project → its folder (default location = the JW data root `storage_get_root` `lib.rs:376`,
   user can pick another via `pick_directory` `lib.rs:347`). Import a folder → a **new**
   project (reuse `PUT /v1/projects/<new-id>` = decompose). The whole-DB backup
   (`DataManagement.vue` → `/v1/data/*` `data_api.py:82`) is a different tool and stays.
4. **Remove the JV server POST from JW.** `services/export/justvoice.js` builds a special
   `justwrite/v1` narration doc and POSTs it live to a running JV server (`:142`). The user
   doesn't want the live handoff ("most users won't run both at once"). JV will instead
   **load the same book folder and parse what it needs** — but that is **JV-side work, OUT OF
   SCOPE here** (recorded in JV outstanding: JV's `justwrite` import adapter, `projects_api.py:804`,
   must be rewritten to read `book.json` instead of `justwrite/v1`).

## Seam facts (verified this session, file:line)

- Seed: `seed.py:30` `create_demo_project` → `book_io.decompose(id, demo_book_snapshot())`;
  `demo_seed.py:20` `DEMO_PROJECT_ID`, `:492` `demo_book_snapshot()` (the full snapshot keys).
- Snapshot shape: `project.js:2113` `exportSnapshot()` (canonical keys); `book_io.py:2`
  ("renderer's `exportSnapshot()` shape"); `decompose`=import / `assemble`=export.
- Images: `imageStore.js:9-12` record shapes (server/`serverId` current; `dataurl`/`path`
  legacy read-only); `:52-57` save→server; `:112-121` `readImageBytes` (bytes via
  `GET /v1/images/{id}`). Snapshot's `images` field holds records, not bytes.
- Bridge/FS: `lib.rs` uses `std::fs` to arbitrary paths (`fs::write` `:90,97,314`,
  `fs::create_dir_all` `:108,248`); `pick_directory` `:347`; `storage_get_root` `:376`.
  NO existing folder-write command → each of export/import needs one new command.
- Dead: `exportFullBackup()` `project.js:2110` (no callers). Stale doc:
  `backups-and-data.md:41-51` (claims a JSON snapshot export the UI never does — the live
  Settings backup is the DB zip).

## The book-folder format (the contract used by seed + export + import)

```
<book-slug>/
  book.json      # = exportSnapshot() shape, with each image record's bytes pulled out and
                 #   rewritten to reference images/<file>; re-import re-uploads them to /v1/images
  images/        # only when the book has images; the actual image files
    <id>.<ext>
```

The sample *The Ninth Facet* ships **image-less** for now (`<book>/book.json`, no `images/`) —
simplest; images exercised by the export/import feature, not required by the sample.

## Build order (phased; verify + commit each; PUSH held for the user's word)

**Phase 1 — the data-driven sample novel (the original ask):**
- P1a Author *The Ninth Facet* Act-I as a `book.json` (the bible below) →
  `server/justwrite_server/samples/the-ninth-facet/book.json`.
- P1b Refactor the seed: `demo_seed.py` → a loader that reads a bundled sample folder's
  `book.json` (json.load) and returns the snapshot; `DEMO_PROJECT_ID` from the file (or a
  neutral `prj_demo`). `create_demo_project` unchanged in shape (still `decompose`).
- P1c `test_seed.py` → **content-agnostic**: assert the seed loads + decomposes + assembles
  + round-trips a valid snapshot (not "8 characters"). Ripple: `rag-probe`/`qcbatch` title +
  content, `SettingsView.vue:829` running-head sample, docs.
- P1d Verify: ruff + pytest + `POST /v1/projects/demo` + assemble + build:vite + FULL
  headless smoke + probes. Commit.

**Phase 2 — per-project JSON export/import (JW-local) + remove JV post:**
- P2a Rust: `export_book_folder(dir, book_json, images[])` + `import_book_folder(dir)` in
  `lib.rs` (+ register); bridge methods in `tauri-bridge.js`.
- P2b Renderer: an Export-project→folder + Import-folder→new-project surface (in Settings →
  Backups beside the DB backup, or Import/Export views — decide by precedent at build).
  Export = `exportSnapshot()` + `readImageBytes` per image → the folder; default dir =
  `storage_get_root`, user picks via `pickDirectory`. Import = read folder → new id →
  decompose + re-upload images.
- P2c Remove the JV server POST from JW: `services/export/justvoice.js` + its Export-pane
  card (`ExportView.vue`). Record JV outstanding (the adapter rewrite).
- P2d Cleanup: delete dead `exportFullBackup()`; fix stale `backups-and-data.md`.
- P2e Verify (build + smoke + a real export→import round-trip on desktop path) + docs. Commit.

**Browser caveat (verified):** a folder-of-files write needs the desktop bridge; the
browser-only dev mode can't. Real users are on desktop; the browser path degrades (offer
nothing, or single-file — decided at build, flagged).

---

## Novel bible — *The Ninth Facet* (working title; all names placeholders)

Register **V1-warm + V3 puzzle-box**, single close-third on the artificer, Act-I slice
(~4 chapters / ~10–12 **full** scenes — the current demo's scenes are 50–150-word excerpts;
these are real scenes). Author *Tamsin Vale*.

**Premise.** In the guild-city of **Threnn**, magic is one shattered art tiered into
**Facets** — cheap **Artifice** (magitech) at the bottom, trained **Schools** above, and the
feared deep Facets of **Fold** (space) and **Hour** (time) at the apex. A mid-rank
adventuring party takes a routine commission to clear a collapsed magitech manufactory and
finds it **folded and looping the same hour** — with a survivor inside who remembers them
from loops they haven't lived, and a shard of the un-shattering Whole at its heart.

**The Facets (magic).** Artifice = glimmerwork on refined **lumen** (a guild trade). Schools
= academy mages (Flame/Ward/Mind/Green). Deep = **Fold** (gates, pockets, rooms bigger
inside, blink-steps) + **Hour** (loops, stasis, foresight, decay). Secret: the Facets were
split on purpose at the **Sundering**; something is **un-shattering** the Whole — a shard
(the **Keystone**) is the engine.

**Cast.** c1 **Cael Ferren** (she, 26) artificer protagonist, secretly *feels* the deep
Facets, hides it (Wardens take such people) — FULL extras. c2 **Iven Sarraz** (he, 29) School
mage, artifice-snob, softens — FULL extras. c3 **Brick Halvorn** (he, 34) enchanted-arms
front-liner, warm ballast — FULL extras. c4 **Nettle** (she, 22) scout, **Fold**-touched
(unknowing). c5 **Odeline "Ode" Marran** (she, ~40s) the survivor, **Hour**-stuck. c6
**Haldane Threll** guild handler. c7 **Consul Auberon Vasht** the Lumen Concern. c8 **Warden
Ophra Kell** the order that buries deep finds. Full extras: {c1, c2, c3}.

**Groups.** Kettle-Iron Company (party) · Commission Hall (guild, ranks brass→silver→gold) ·
Lumen Concern (magitech corp) · Warden Order · the Schools.

**Locations.** Cael's workshop (Kettle Lane) · the Commission Hall · Threnn (lumen-lit city) ·
the Glimmer-Ruin (Manufactory Nine, exterior) · the Folded Interior (looping) · the Lumen
Counting House · the Warden Cloister.

**Objects.** Cael's resonance fork (hums near deep Facets) · Gudgeon (Brick's maul) · the
Keystone (the shard) · Ode's stopped watch (Hour relic) · a commission-token · Nettle's
blink-charm.

**Strands (scene-anchored beats).** s1 The Commission · s2 The Whole · s3 Cael's Hum · s4 The
Same Hour · s5 Concern & Cloister.

**Outline (Part I The Commission: Ch1 "Brass Rank", Ch2 "Bigger Inside"; Part II The Hour:
Ch3 "The Same Hour", Ch4 "The Keystone"; ~3 full scenes each).**
- Ch1: workshop (establish Artifice + Cael's hidden hum) → Commission Hall (party + guild +
  factions foreshadow; take the job) → Kettle Lane party beat.
- Ch2: the road (Nettle blinks — first deep-Facet taste) → the ruin is Folded (bigger inside;
  fork screams) → first Hour tremor (a candle un-burns).
- Ch3: prove the loop (puzzle-box) → find Ode (greets them by names not yet given) → Ode names
  the Whole; Cael's secret cracks.
- Ch4: work the break (Cael's artifice + Nettle's Fold + Iven's Ward + Ode's Hour) reach the
  Keystone → Concern + Warden Kell converge (Kell clocks Cael's hum) → the choice; the slice
  ends, the Whole's un-shattering now their problem.

**Entity-sweep beat (for `rag-probe`):** two scenes name an un-cast entity so the sweep
proposes it (Ch2 names road-warden "Old Sedge"; Ch3 Ode mentions "the Gattick line"); the rest
propose nothing. Re-point `rag-probe.mjs` to these.
