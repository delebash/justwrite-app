# Sample novel *The Ninth Facet* + data-driven samples + per-project JSON export/import

> ⛔ **UPDATE 2026-07-12 (LATER, same session — SUPERSEDES the folder / no-zip / no-server / no-shared
> front matter below).** The user reversed several early calls; the **current design is the Phase 2
> section: a ZIP, server-executed, with an Origin CSRF check.** Their reversing words:
> *"actually i take that back do it as a zip"* · *"zip … unzip as folder book name with images folder
> and book.json inside"* · *"zip file should be name of book"* (⇒ **ZIP**, not a loose folder) ·
> *"i also have no problem with server reading and writing … i do not see why it cant be server side"*
> + *"go"* (⇒ the **SERVER** executes export/import) · *"folde two chooser tasks"* (⇒ Tasks A+B folded
> in) · *"i prefer not locking anyone out dont do bearer do your vector directly"* (⇒ **Origin/Sec-Fetch**
> check, no token). The **JV live-POST removal is unchanged**. The `## The four decisions` and
> `## The book-folder format` sections below are **historical — do not build from them.**

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

> ⚠️ **Partly historical (2026-07-12) — read the Phase 2 section for the current seams.** Phase 1
> already replaced `demo_seed.py` (was ~536 lines; the `:492` cite below is dead) with a ~54-line
> loader. The "NO existing folder-write command → each of export/import needs one new command" line is
> **superseded by the server-executes reversal**: the SERVER builds/parses the zip (Python `zipfile`),
> and the only Rust is the native save/open dialog (`shell_save_file` / a new `pick_file`).

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

**Phase 2 — per-project ZIP export/import + consistent file-chooser mechanism + CSRF/auth hardening + remove JV post.**
FINAL DESIGN (user, 2026-07-12, after a long discussion — supersedes the earlier Rust-folder draft):
a project exports as **`<book title>.zip`** whose contents unzip to **`<book title>/book.json`** +
**`<book title>/images/<id>.<ext>`** (folder structure INSIDE the zip; images are FILES, not inlined).
It's a single file ⇒ works exactly like the DB backup. **The SERVER owns the data** (assemble → zip /
unzip → decompose); **the SHELL owns the native file dialogs** (save/open/folder), each defaulting to
the data folder + remembering its OWN last location. One mechanism, consistent across the DB backup,
per-project export/import, and the data-folder chooser (user decree: "consistent throughout the app").
Server-executes was chosen over Rust because (a) the server already owns the data + image bytes, (b) it
converges import with the sample seeder (one core), (c) it's pytest-testable in-container; the CSRF/
arbitrary-path concern is moot (server only streams/consumes bytes; the shell writes the single file).

- **P2.1 Server (JW `server/`) — zip build/parse + the shared decompose core:**
  `GET /v1/projects/{id}/export` → `book_io.assemble(id)` → **externalize** every image (walk
  `snap["images"]` `{entityId:[records]}` + `snap["project"]["coverImage"]`; pull bytes from the
  `ImageBlob` store, rewrite each record to `{…meta, file:"images/<id>.<ext>"}`) → build an in-memory
  zip `<title>/book.json` + `<title>/images/<file>` → `StreamingResponse` (mirrors the SHARED backup-zip
  idiom `just-llm-runner/llm_runner/platform/data_api.py:82-106`, mounted via `get_data_router` app.py:138
  — there is NO `justwrite_server` data_api; the per-project endpoints are JW-LOCAL, reusing
  `zipfile` + `StreamingResponse`), `Content-Disposition: <slug(title)>.zip`. `POST /v1/projects/import` (multipart zip) → parse
  `<title>/book.json` + `<title>/images/*` → **internalize** (create `ImageBlob` rows, rewrite records
  to server-kind) → mint a NEW project id → decompose → `{id,title}`.
  **Checker T3 (converge):** extract ONE core `import_book_snapshot(db, snapshot, images, project_id)`
  (internalize + decompose) that BOTH the import endpoint (new uuid) AND the sample seeder
  (`seed.create_demo_project`, seed.py:37-40 — today reads book.json but not images/) call.
  **Checker T5 (legacy kinds, CORRECTED):** the SERVER externalize handles server-kind (`ImageBlob`) +
  legacy `dataurl` (decode inline → file). Legacy `file`-kind records `{kind:"file",path}` hold a
  renderer-local Tauri path the server CANNOT read (imageStore.js:11,78-83) → the RENDERER migrates any
  file-kind image to server bytes (images bridge → `POST /v1/images`) BEFORE export; current projects are
  all server-kind so this only bites old ones. **internalize** also restores
  `snap["project"]["coverImage"]` (stored on the Project row, book_io.py:121,438), not just the images
  dict. Verify: pytest round-trip (seeded project → export zip → import → assert new project + images +
  cover survive) — in-container.
- **P2.2 Shell (lib.rs + bridge) — consistent native dialogs + per-chooser last-dir:**
  add a `default_dir` param to `shell_save_file` (lib.rs:466 — sets a filename but no directory today);
  add `pick_file({filters, default_dir}) → bytes` for the import open (native, returns the zip bytes to
  upload — mirrors the project_open pattern but generic bytes). Per-chooser **last location** persists in
  a settings row (`chooserDirs:{export,import,backup,dataRoot}`); the renderer passes the remembered dir
  as `default_dir` and writes it back on a successful pick (Task B2). Bridge: extend
  `shell.saveFile({…,defaultDir})`, add `shell.pickFile(...)`.
- **P2.3 Renderer surfaces (SettingsView Backups tab :1315-1363, JW-local + shared DataManagement):**
  (i) a NEW `.card` beside `<DataManagement>` (:1362): **Export this project** → `GET …/export` → blob →
  `shell.saveFile({blob, suggestedName:"<title>.zip", defaultDir})`; **Import a project** →
  `shell.pickFile` → `POST …/import` → `switchProject(newId)`. (ii) **Task B1** — DataManagement (SHARED
  kit `ui/src/components/DataManagement.vue`) backup export switches from silent browser-download to
  `shell.saveFile` (default data folder, remember-last) — a shared-kit change (JV must expose the same
  bridge method; gate on presence). (iii) **Task A** — under the autosave card, surface the EXISTING
  data-root chooser (`storage.getRoot`/`relocate`, default `exe_dir/"data"` lib.rs:789) — reconcile with
  Settings → Storage, do NOT duplicate.
- **P2.4 CSRF hardening via ORIGIN enforcement — NO auth token (user, 2026-07-12: "prefer not locking
  anyone out, dont do bearer, do the vector directly").** A server middleware on MUTATING `/v1` requests
  (POST/PUT/PATCH/DELETE) that rejects ONLY the actual CSRF vector — a cross-site browser page. Allow when
  there is **no `Origin` header** (non-browser clients + the Tauri `reqwest` path send none) OR the
  `Origin` is in the app allowlist; **reject (403) a foreign `Origin`** (optionally also honor
  `Sec-Fetch-Site: cross-site`). REUSE the existing CORS origins as the ONE allowlist (app.py:111-122
  `_cors`) + the dev origin — don't invent a second list. Needs **no token**, so it can't lock a USER out;
  the only failure mode is a mis-set allowlist blocking the app itself, caught instantly by the smoke.
  **VERIFY-AT-BUILD (don't guess):** confirm the REAL request origins first — what the Tauri webview→server
  call sends (routed through `reqwest` per tauri-bridge.js `shouldRouteThroughTauri` → likely no `Origin`)
  and what `dev:vite` (localhost:1420) + the headless smoke send — so the allowlist can't self-block.
  Verify: a mutating `/v1` with a foreign `Origin` → 403; app + dev + smoke → pass. (Bearer + the whole
  auth-token/`requireForLoopback` path is DROPPED — no lockout risk was the user's deciding factor.)
- **P2.5 Remove JV post + dead code:** strip the `justvoice` format card from ExportView.vue (:31,
  :186-239, :108-139, imports :11-17) + delete `services/export/justvoice.js`; record the JV-side
  adapter-rewrite (read the zip) in the ledger. Delete dead `exportFullBackup()` (project.js:2110-2112);
  fix stale `backups-and-data.md` (:43,51).
- **P2.6 Verify + docs + commit (PUSH HELD):** ruff + pytest (incl. the round-trip) + cargo check +
  build:vite + biome + FULL headless smoke + vitest (image externalize/internalize) +
  a probe; docs (whats-new, backups-and-data.md, this BUILD RECORD, recap, ledger JV follow-up); genuine
  rules-checker verdict on the diff. Commit. Hold push.

**Container/testability note (honest):** the SERVER round-trip (export→import, images, cover) IS
pytest-testable in this container — the key win of server-executes. The SHELL native dialogs
(save/open/folder) need the desktop bridge, so those are a your-box check; the renderer verifies via the
smoke (buttons render; the browser path degrades where `window.justwrite` is absent).

---

## Phase 2 BUILD RECORD (shipped 2026-07-12 — verified in-container, push HELD)

**Server (P2.1 + P2.4).** `api/book_transfer.py` — `GET /v1/projects/{id}/export` (assemble → externalize
images → in-memory zip `<title>/book.json` + `<title>/images/<file>` → `StreamingResponse`,
`Content-Disposition: <safe_title>.zip`) + `POST /v1/projects/import` (base64 `{zipBase64}` → parse the
single `<folder>/book.json` + `images/` → internalize → mint `prj_<uuid4>` → decompose). `book_io.py` —
`externalize_images` / `internalize_images` / `import_book_snapshot` (the ONE decompose-a-book core; walks
the `images` dict + `project.coverImage`; handles server-kind `ImageBlob` + inline `dataurl`; legacy
`file`-kind records are UNRESOLVABLE server-side — the P2.1-T5 renderer-side migration was NOT built; per
the user's "Accept + defer" it is a tracked follow-up, see the REMEDIATION section). `seed.create_demo_project` now calls
`import_book_snapshot` (T3 converge) with `demo_seed.load_sample_images` (image-less today → `{}`).
`csrf.py` `CsrfOriginMiddleware` — 403s a MUTATING `/v1` request with a cross-site `Origin`; allows
no-Origin (Tauri reqwest / non-browser) + the app allowlist (dev + tauri origins + the CORS `_cors` list);
no token, so it can't lock a user out. Mounted outermost in `app.py`.

**Shell (P2.2).** `lib.rs` — `shell_save_file` gains `x-save-dir` → `set_directory`; new `pick_file`
(native open dialog → `{name, dir, dataBase64}`), registered. `tauri-bridge.js` — `shell.saveFile({…,
defaultDir})` + `shell.pickFile(...)`. (Rust = cargo-check only in-container; the dialogs are a your-box check.)

**Renderer (P2.3).** `services/bookTransfer.js` — `exportProject` / `importProject` / `saveBackupBlob` +
`safeTitle` (keeps spaces; strips only illegal filename chars) + per-chooser last-dir in the settings doc
(`chooserDirs`). `SettingsView.vue` Backups tab — a "This book" export/import card + a "Data folder" card
(Task A, reuses the existing `changeFolder`/`storageRoot`) + passes `:save-file` to `DataManagement`
(Task B1). `project.js` — `_registerAndOpen` shared by `openDemoProject` + new `openImportedProject`;
dead `exportFullBackup()` deleted. Shared kit `DataManagement.vue` — optional `saveFile` host hook
(browser `<a download>` fallback when absent) — JV unaffected (it doesn't mount `DataManagement` today).

**Removals (P2.5).** `ExportView.vue` de-JV'd (format card + template + handlers + imports);
`services/export/justvoice.js` deleted (0 importers left).

**Verified.** ruff · **90 pytest** (incl. `test_book_transfer.py` round-trip w/ images + cover, and
`test_csrf.py`) · `cargo check` exit 0 · `build:vite` · biome (touched files clean; the one warning is
pre-existing in unrelated `project.js:1096`, left alone) · **full headless smoke** — every route
`errors=0`, incl. `#/settings` + `#/export`; server log 0 CSRF-403s; DB restored byte-exact `0be0e2ef`.
Rules-checker on the diff: run at commit (commit-gate). **NOT PUSHED.**

**JV follow-up (JV outstanding — NOT done here):** rewrite JV's `justwrite` import adapter
(`/home/user/JustVoice/server/justvoice/api/projects_api.py:783,804`) to read the exported `book.json` zip
instead of the dropped live `justwrite/v1` POST. **SIZING — DECIDED (user, 2026-07-12): a SEPARATE bulk
stress-test book.** *The Ninth Facet* stays the crafted ~6.5k-word tutorial (good first-run experience); a
separate large book is authored purely for the 20×-import stress test. The per-project import (Phase 2)
enables loading it many times. Build TBD on the user's go (size + shape to confirm).

---

## Phase 2 REMEDIATION (2026-07-12 continuation — the commit-gate FAILs closed; still push-HELD)

The genuine diff rules-checker run before the Phase-2 commit returned **FAIL (2)**, and per the standing
rule (a checker FAIL = STOP AND ASK, never self-resolve) the ship was halted and both were addressed this
session.

**FAIL 1 (T7) — a broken `requestBlob` call, fixed at TWO sites.** The shared kit's public `requestBlob`
is **PATH-FIRST** (`requestBlob(path, {method="GET"})`, `just-llm-runner/ui/src/client.js:65`, exported via
`index.js:14` which shadows the method-first `common/services/serverApi.js:127`). Two JW call sites passed
it method-first `requestBlob("GET", path)` → they fetched the literal path `"GET"`: the NEW
`bookTransfer.js:46` (export — would have thrown on every use) and the pre-existing `imageStore.js:118`
(the EPUB/PDF cover read, `services/export/epub.js:68` — today throws → is caught → returns null → the
cover was silently omitted). Both corrected to single-arg `requestBlob(path)` (the checker AFFIRMED fixing
the second now — identical verified bug, fixing it *restores* cover export and can't regress a working
path). Guarded by two NEW vitest suites (`services/__tests__/bookTransfer.test.js` + `imageStore.test.js`)
asserting the sole argument is the path (a two-arg `("GET", path)` call fails `toHaveBeenCalledWith(path)`)
and that `readImageBytes` decodes the blob to real bytes — the cover-read fix proven at the unit level.

**FAIL 2 (T2) — a false migration comment + the P2.1-T5 gap → a USER decision.** The plan (P2.1, "Checker
T5") specified a **renderer-side file-kind→server migration BEFORE export**, and both the
`book_io._record_bytes` docstring AND the BUILD RECORD claimed it existed — but it was **never built**
(grep-confirmed: no such migration anywhere in the renderer). So a legacy `{kind:"file",path}` image's
bytes silently never enter the export zip (its record travels, the image breaks on the target machine).
Because the current app only ever writes server-kind + data-URL images (`imageStore.saveImage`), this bites
only pre-P4 projects — but a silent drop still violates the "save ALL data" decree, and the false comment
meant the plan was approved on a false premise. **Surfaced to the user as a genuine decision (migrate-now
vs accept-and-defer); the user chose "Accept + defer" (2026-07-12, AskUserQuestion).** So: both `book_io`
docstrings are corrected to the truth (a `file`-kind record is unresolvable server-side; its record travels
but its bytes do not; the migration is a tracked follow-up), and the renderer-side migration is a FOLLOW-UP
(below), not shipped. The server externalize still handles server-kind + inline data-URL losslessly (the
round-trip test proves it).

**Remediation verification (in-container).** vitest **139** (16 files; +3 new path-first/decode cases) ·
server ruff clean + **90 pytest** · `build:vite` · biome clean (4 touched files) · **full headless smoke**
— every route `errors=0`, shell-structure ✓, incl. `#/export` + `#/settings` · **live curls**: `GET
…/export` → a valid `application/zip` named `The Ninth Facet.zip` containing `The Ninth Facet/book.json`
(no `images/` — the sample has zero ImageBlobs); `POST /v1/images` then `GET /v1/images/{id}` →
byte-identical (the server side of the corrected `readImageBytes`); `POST /v1/projects/import` → a NEW id
`prj_088ccd51…` ≠ the source (import-many-times works); CSRF — cross-site POST **403**, no-Origin &
app-origin POST **200**, cross-site GET **200**, exactly one intentional 403 in the server log. DB restored
byte-exact `0be0e2ef`. This corrects the BUILD RECORD's "Rules-checker: run at commit" line above (the
checker ran, FAILed, and was remediated). **Still NOT PUSHED — push HELD for the user's word.**

**Follow-ups (from the remediation):**
1. **Renderer-side file-kind→server migration before export (P2.1-T5) — ⛔ DROPPED, not needed (user,
   2026-07-12).** The user's word: *"this is not production so i am reseting db so we dont need migration,
   correct?"* — correct. A `{kind:"file",path}` image only exists in a pre-P4 DB that was never re-saved;
   the current app never writes file-kind (`imageStore.saveImage` → server/data-URL only), and a DB reset
   (the standing drop-and-reseed, no-migrations policy) wipes any that existed and re-seeds server-kind. So
   on a reset pre-release DB, NO file-kind image survives to reach export → the migration is unnecessary.
   The "Accept + defer" thus resolves to "not needed." (The `book_io` externalize behavior + honest
   docstrings are unchanged and correct; only this follow-up is retired.)
2. **Kit `requestBlob` DUPLICATE (T3 one-source-of-truth).** The kit ships TWO `requestBlob` signatures —
   path-first `client.js:65` (the public export) and method-first `common/services/serverApi.js:127` (the
   "app standard" transport, and what JustVoice's `projects.js:87,176` call). Unify to one signature
   kit-wide and confirm path-first is the INTENDED canonical (not an accidental export shadow that could
   flip and silently re-break JW). Affects both apps → its own change.

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
