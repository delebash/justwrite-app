# Phone ↔ desktop sync — the design discussion (started 2026-10-08)

**Status (2026-10-08, night): DESIGNED — the design is the kit's
`docs/plans/2026-10-08-sync-product-design.md` (its own product repo, Yjs for scene text, the six
ways, JustWrite's prerequisites, the build order, the blast radius); the decisions are TASKS item 7.
Nothing built. This file stays the record of the discussion and round 2.**

**Earlier status (2026-10-08, late): the options were shown and the user decided the shape — offline
first; changes carried three ways (a file by hand, a cloud folder with one file per device, a
server); the books sync, settings and keys stay per device; licences: commercial use allowed and
not copyleft. The engine is open: cr-sqlite or our own build (my rec: our own, on cr-sqlite's
rules), or another database — round 2 tests it (§ "Round 2").** The decisions, verbatim, are
JustWrite TASKS "Sync — offline first, by file, folder and server". The first read below is
kept as shown; shape A in it was rejected ("a is out, these need to be offline first"). The user wants it discussed before anything is chosen. Upstream facts
live in the kit's register (`../just-llm-runner/docs/dev/RESEARCH.md` §2, "Phones" and "Sync"),
with the full records in `../just-llm-runner/docs/plans/2026-10-08-sync-research-platforms.md`
and `…/2026-10-08-sync-research-building-blocks.md`; JustWrite's own facts in
`docs/dev/RESEARCH.md`, "The phone app". The sync is meant for every family app, so its code
would live in the kit; this file stays the discussion's home until the design is decided.

## What the user asked (verbatim, 2026-10-08)

- *"also the phone nad desktop should be able to sync so we should have a cloud options or maybe
  save databawe is dropbox that all apps can access"*
- Answering "3. Still open from before: sync in the first phone release or zip first, your own
  cloud folder or a hosted service, keep both copies or merge when a chapter is changed on two
  devices": *"3 sync but we need to discuss the design, there are several ways to sync sqlite
  turso https://github.com/sqliteai/sqlite-sync and many others"*

- Later the same day, the scope widened: *"no we need to decide on sync method for jw and make it
  so we coudl add it to other apps easily if we decide we want to say sync acrross desktops or
  just run the server in the cloud"* — one design, written so any family app can add it, covering
  phone ↔ desktop, desktop ↔ desktop, and the same server hosted in the cloud.

Before that: ruling 8 (2026-10-05, JustVoice TASKS "The family moves to Electron…") — *phones:
separate libraries moved by zip, cloud-only AI*; the study called sync "a large design of its own"
(JustVoice `docs/plans/2026-10-05-electron-node-study.md` §5.4 (c)). The leans offered in chat
(not decided): zip first and sync next; the user's own cloud folder; keep both copies on a
conflicting chapter.

## What the phone app is (decided so far)

- Quasar (the user, 2026-10-08: "1 quasar"), on Capacitor; standalone on the phone, AI from the
  provider with the user's key (ruling 8). TASKS "The phone app's UI library — the theming test".
- No Node on the phone (Node for phones stops at 18.20.4; the kit needs ≥ 24). The plan is to run
  the same route and book code inside the app, answering the kit's two fetch doors in-app, with a
  different SQLite engine under the kit's synchronous helper. (Chat, 2026-10-08; facts in both
  registers.)

## JustWrite's data today (code, 2026-10-08)

- **35 tables** (`server/src/database/models_schema.js`). Book tables are keyed
  `(project_id, id)`: parts, chapters, scenes, characters, locations, objects, groups, notes,
  strands, strand_beats, worldbuilding(+_categories), statuses, tag_vocab, architecture, images,
  events, chat_sessions, chapter_versions `(project_id, chapter_id, id)`, trash
  `(project_id, id, kind)`. Link tables by their natural keys: scene_links
  `(project_id, scene_id, kind, ref_id)`, chapter_strands, group_members.
- **Keyed by position, not identity:** chat_session_messages `(project_id, session_id, position)`
  and chat_messages `(project_id, mode, character_id, position)` — two devices appending to the
  same conversation would both write position N.
- **Per-device by nature:** sessions `(day)`, session_chapter_words `(chapter_id)`, session_meta
  (writing stats); rag_meta / rag_vectors (the search index — derived, rebuildable); settings
  `(key)` (app settings, including AI provider settings — API keys among them).
- Other: projects `(id)` holds a `data TEXT` column beside its fields; image_blobs `(id)`;
  project_artifacts `(project_id, kind, key)`; sweep_drafts `(project_id)`.
- **Ids:** `uid(prefix)` = `${prefix}_${Date.now() base 36}_${4 random base-36 chars}`
  (`src/stores/project.js:29`) — unique in practice, not guaranteed across devices; the bundled
  tutorial book uses fixed ids (`l1`, …), the same on every device.
- **Saving sends the whole book:** `PUT /v1/projects/{id}/book` with the full snapshot, which the
  server splits into the tables (`src/services/projectApi.js:10-11, 83`). Nothing today records
  *which* rows changed.

What any sync needs from this, whatever the tool: ids unique across devices; no position keys;
writes per row (or a diff of the snapshot); deletes kept as tombstones (the `trash` table is a
start); a schema version both devices check; the derived and per-device tables left out.

## Options looked at so far

**1 · The live database file in Dropbox — no.** SQLite's own page lists broken locking on
network filesystems, a background copy taken mid-transaction ("might contain some old and some
new content, and thus be corrupt"), and copying a database without its `-wal`/`-journal` as
corruption causes (sqlite.org/howtocorrupt.html, *web 2026-10-08*). A sync service copying the
file behind SQLite is that case (our reading — the page names network filesystems and background
backups, not Dropbox).

**2 · Changes through a cloud folder (Joplin's way).** Each device keeps its own database; sync
moves items, not the database. Joplin (notes, desktop + phones) syncs through Dropbox, OneDrive,
Nextcloud, WebDAV, S3, Joplin Cloud or a local folder, via drivers that only "read, write,
delete and list items"; a note changed on two devices: the local copy goes to a Conflicts
notebook and the remote wins (joplinapp.org/help/apps/sync/, …/apps/conflict/, *web 2026-10-08*).
No server of ours; we would write the item format, the change log and the merge.

**3 · sqlite-sync (github.com/sqliteai/sqlite-sync)** — *web 2026-10-08, the README*:
- A SQLite extension (`.load ./cloudsync`), turned on per table with `cloudsync_init()`: "turns
  any SQLite database into a conflict-free, offline-first replica"; changes queue locally and
  merge on reconnect.
- CRDTs: "Causal-Length Set, Delete-Wins, Add-Wins, and Grow-Only Set". Opt-in **block-level LWW**
  per column: "Line-level merge for text/markdown columns" (otherwise a cell is replaced whole).
- Syncs through SQLite Cloud (hosted), or self-hosted PostgreSQL or Supabase: "Sync to SQLite
  Cloud, PostgreSQL, or Supabase — no central coordinator required". A "Custom Network Layer"
  can replace its built-in libcurl networking; no other transport is named.
- Platforms: Linux, macOS, Windows, iOS, Android, WASM; packages for the SQLite CLI/C, Swift,
  Android (Maven), Flutter, Expo, React Native, WASM (npm). **Capacitor and Node are not named.**
- Every device must create the same tables; the server checks a schema hash and "rejects payloads
  whose hash it does not recognize". Its examples key rows `id TEXT PRIMARY KEY` with
  `cloudsync_uuid()`.
- **Licence: Elastic License 2.0**, and "contact SQLite Cloud, Inc for a commercial license" for
  production or managed-service use. Not MIT. Latest version and date: not on the page.

**4 · Turso — checked 2026-10-08** (the pages moved to `docs.turso.tech/sync/*`). Turso Sync
(the newer Turso Database, Rust, MIT, 0.8.2 of 2026-10-06, pre-1.0; sync launched as "Beta" in
2025-10): two-way, offline writes stay in the local file until `push()`; `pull()` rolls back to
the last synced state, applies remote changes, replays local ones; conflicts **"last push
wins"**. The docs assume Turso Cloud; `tursodb --sync-server` speaks the same protocol but is
documented for development and testing. Its own engine would replace better-sqlite3; its WASM
build needs COOP/COEP; Capacitor isn't named. "Turso is joining Supabase" (2026-10-02). libSQL's
embedded replicas still work but send writes to the remote unless `offline: true`, and libSQL's
README sends new projects to Turso.

**5 · The rest of the field — checked 2026-10-08** (full records in the kit, see the top). None
fits "our own SQLite schema, self-hosted, MIT-compatible, Node and Capacitor":
- PowerSync — needs Postgres/MongoDB/MySQL/SQL Server as the backend (not SQLite), writes go
  through our own API, self-hosted Service is FSL-1.1-ALv2, Capacitor SDK beta.
- ElectricSQL — Postgres, read path only. Zero — Postgres, "does not support offline writes".
  Replicache — maintenance mode, conflicting licence terms.
- RxDB — its own JSON documents; the SQLite storage is paid. Evolu — its own schema and system
  columns, TypeScript 7, no Capacitor (it has the only built-in end-to-end encryption found).
- Jazz — 2.0 alpha. Triplit — AGPL-3.0, site down. InstantDB — sunsetting 2027-08-31. PouchDB —
  last release 2024-06.
- cr-sqlite — last release 2024-01; its author is on Zero "for at least 1-2 years". sqlite-sync —
  Elastic License 2.0 (1.2.0, 2026-09-28).
- Automerge 3.5.0 (MIT) merges rich text, but the data lives in Automerge documents, not our
  tables, and its ProseMirror binding is "beta quality" with a restricted schema.

**6 · The building blocks — checked 2026-10-08:**
- **SQLite's session extension** — part of SQLite itself: records every row change by primary key
  into a changeset; applying one runs a conflict handler (DATA / NOTFOUND / CONFLICT / CONSTRAINT
  / FOREIGN_KEY → OMIT / REPLACE / ABORT). No text merge, transport or clock. Engines:
  **better-sqlite3 has none** (measured; "no plans" since 2020); **`node:sqlite` has it**
  (measured in Electron 44.7's Node 24.21; the module is "Release candidate"; better-sqlite3 is
  ~2× faster per the kit register); **the official SQLite WASM has it** (measured; `opfs-sahpool`
  storage, no COOP/COEP; OPFS in phone webviews unverified); `@capacitor-community/sqlite` has
  none (its own date-based JSON export, no conflict handling).
- **Yjs + `@tiptap/extension-collaboration`** (both MIT; TipTap Cloud not needed) — TipTap's own
  way to merge rich text: offline edits on any number of devices merge "without merge
  conflicts"; a chapter's Yjs document is a BLOB in our SQLite; any transport.
- **Litestream** (Apache-2.0, active) — one-way backup of a server's database to S3 and the like:
  fits a cloud-hosted server's backups, not device sync.
- No maintained hybrid-logical-clock package exists on npm.

## The questions the design has to answer

1. **What syncs:** the books (manuscript, story bible, images, versions)? App settings? AI
   provider settings — which hold API keys? Writing stats and chats?
2. **Through what:** the user's own cloud folder · the user's own desktop (home network or a
   tunnel) · a server the user runs · a vendor's cloud.
3. **How changes merge:** per row (last write wins per column) · per line or block of text · per
   chapter, keeping both copies on a conflict.
4. **Chapter text written on two devices at once:** prose is TipTap HTML, so a line merge of the
   HTML can break markup — a text CRDT, or keep both copies?
5. **Privacy:** an unpublished book on someone's servers — encrypted before it leaves the device?
6. **Licence:** MIT-compatible only?
7. **Engines:** desktop SQLite is better-sqlite3 in Node; the phone's is still open (a Capacitor
   SQLite plugin, or SQLite compiled to WebAssembly). A sync tool must run on both.
8. **Order:** zip first and sync in a later release, or sync in the first phone release.

## First read of the field — prepared for the discussion (NOT shown to the user, NOT decided)

Written 2026-10-08 so the next session starts from it instead of re-deriving it. These are my
readings of the facts above; each needs checking against code where marked, and the user decides.

**What the three cases need.**
- **"Just run the server in the cloud"** needs no sync at all: the same server already runs
  headless (`npm run server`, the `<name>-server` launcher; the kit's app standard §0.4), with
  bearer-token auth for the headless path and Settings → Server holding the headless URL and
  tokens in every app (`../just-llm-runner/docs/app-structure.md` §0.4, §11). Every device would
  be a client of one server — online only. To check in code before saying it: whether a desktop
  or phone renderer can be pointed at a remote server today (`src/services/serverApi.js`'s
  origin-aware base). Backups of that server: Litestream.
- **Desktop ↔ desktop and phone ↔ desktop with offline work** need a local copy on each device,
  so they need sync.
- One shape covers all three: **every device runs the app's own server code on its own SQLite,
  and a kit sync module swaps changes between two servers over HTTP.** The cloud server is then
  just an always-on peer that every device syncs with; your own desktop can be that peer too.

**The candidate shapes to present:**
- **A · Cloud server only, no sync.** Simplest; nothing new but the hosting and pointing the
  apps at it; no offline work.
- **B · Turso Sync.** The nearest ready-made fit; but pre-1.0, "last push wins", its own engine in
  place of better-sqlite3 in the kit, a self-hosted sync server documented only for dev/test, and
  an acquisition under way.
- **C · A kit sync module on SQLite's session extension + Yjs for chapter text.** Standard parts
  (SQLite's own change recording; TipTap's own collaboration format), our transport and merge
  rule. Costs: the kit's database layer moves from better-sqlite3 to `node:sqlite` on the desktop
  (sessions; ~2× slower; "Release candidate"), the phone uses the official SQLite WASM; we write
  the clock, the sync routes and the per-row rule.
- **D · As C, but changes captured by our own triggers into a change-log table** — works on
  better-sqlite3 and any phone engine; less standard (the capture is ours, not SQLite's).
- **E · PowerSync with Postgres in the cloud** — a different server database for the hosted case;
  FSL licence on the self-hosted service.
- A folder transport (Joplin-style: the change files in your own cloud folder, no server) can sit
  under C or D later.

My lean, to offer, not decided: **A first** (it needs no sync code and answers "just run the
server in the cloud"), **then C**, keeping JustWrite's data ready for it (ids unique across
devices, no position keys, tombstones, chapter text as Yjs).

**Questions to put to the user** (with the eight above): which shape; whether API keys and other
settings ever leave the device; whether changes are encrypted end-to-end before they reach a
cloud server or folder; MIT/Apache-only licences (rules out FSL, ELv2, AGPL); whether the phone
release waits for sync or ships with zip first.

## Checked before presenting shape A (2026-10-08)

- JustWrite's server serves its own UI at `/` (`server/src/app.js:255-283`) and has bearer tokens,
  off until set in Settings → Server (`server/src/app.js:192-197`, `api/server_auth_api.js`).
- JustWrite's renderer can't be pointed at another server and sends no token: `installLlmUi` gets
  no `serverOverrideKey` and `configureServerApi` no `authToken` (`src/main.js:50-74`); the kit
  supports both (`ui/src/installLlmUi.js:96-110`, `ui/src/common/services/serverApi.js:25-28`).
- JustVoice has both (`jt:server`, `jt:token`: `src/main.js:53,141`), but nothing calls the
  store's `setServer`/`setToken` (`src/stores/api.js:21-28`) — no screen sets them.

## Round 2 — tests and research (2026-10-08, under "your rec on all go do the testing")

### Your library, measured (a copy of `data/justwrite.db`, read only)

- The real library is the tutorial book: 1 book, 4 chapters, 12 scenes, 8 characters; the 31 MB
  file is mostly free pages (7,796). Prose lives in `scenes.body` (HTML).
- **5.48 bytes per word** as stored (35,514 bytes of HTML for 6,479 words). So a 90,000-word
  novel ≈ 0.5 MB, 30 novels ≈ 15 MB of prose. Story-bible rows: 13.8 KB for this book.
- No images and no saved chapter versions in it — their sizes can't be measured from this
  library; images stay the large item (already compressed), versions multiply the prose.

### The schema, as sync sees it

- Every book table is keyed `(project_id, …)` with `project_id` → `projects(id) ON DELETE
  CASCADE` — the one database-level constraint (`server/src/database/models.js:13`); deleting a
  book relies on the cascade.
- No unique indexes beyond primary keys (good: per-field merges can't break a uniqueness rule).
- Most columns are NOT NULL with no default.
- Still keyed by position: `chat_messages`, `chat_session_messages` (chats come later).
- Per-device by nature: the AI/engine/model tables, settings, sessions, the search index.

### cr-sqlite, tested (vlcn-io v0.16.3 and the Fly.io fork's v0.18.0-v2-migration-alpha23, both win-x86_64, loaded into the kit's better-sqlite3 13.0.3 under Node 26.5)

- **Both load** into better-sqlite3 with `loadExtension(dll, "sqlite3_crsqlite_init")`.
- **Both refuse the schema as it is.** v0.16.3, on each of the 25 book tables: "Table … has
  checked foreign key constraints. CRRs may have foreign keys but must not have checked foreign key
  constraints as they can be violated by row level security or replication", and for `projects`
  and `image_blobs` "has a NOT NULL column without a DEFAULT VALUE. This is not allowed as it
  prevents forwards and backwards compatibility between schema versions." The Fly.io fork first
  demands a timestamp ("call crsql_set_ts() first or set default-ts"), then gives the same NOT NULL
  refusal.
- **So cr-sqlite needs a schema change:** foreign keys off (and the cascade on book delete
  replaced by our own deletes) and a default on every NOT NULL column.
- With the schema adjusted that way (v0.16.3): first sync of a new device = 693 changes,
  278 KB as JSON, 25 ms, equal ✓. The four cases — A edits a scene's title while B edits its
  body: both kept ✓ · both edit the same body: one wins (B), the other's text is lost (so prose
  needs Yjs) · A deletes a character while B renames it: deleted (delete wins) · each inserts a
  note: both kept ✓ · converged ✓.
- Write cost, 2,000 saves of a 7.5 KB scene (WAL): 336 ms with cr-sqlite vs 132 ms plain.
- Bookkeeping: a naive "changes since" sends back what a device received (B→A 695 rows after a
  10-row edit) — the app tracks per-device versions; the Fly.io fork leaves all of it to the app.
- The Fly.io fork was not run past `crsql_as_crr`: it needs `crsql_set_ts()` per transaction and
  the app's own gap tracking (its README).

### Our own build, tested (a throwaway script in the session scratchpad — nothing in any repo)

Triggers generated from the schema record each changed field with a hybrid-clock stamp (time +
counter + device id) into a log; applying = the newer stamp wins per field, a delete beats older
edits, a later re-insert brings a row back; changes apply in one transaction with
`defer_foreign_keys`. On a copy of the real database, **schema unchanged — foreign keys and the
cascade on, NOT NULL kept**:
- First sync of a new device: 889 changes, 168 KB as JSON, 30 ms, equal ✓.
- The same four cases give the same results as cr-sqlite (both fields kept · one body wins ·
  delete wins · both notes kept) · converged ✓.
- A third device that only syncs with the second ends equal to the first ✓ (relay works).
- Deleting the whole book: SQLite's cascade fires our delete triggers on every child table (all
  rows recorded), and the other device applies it with a clean `foreign_key_check` ✓.
- Write cost, 2,000 saves of a 7.5 KB scene (WAL): 1,020 ms with the log vs 106 ms plain — the
  test's log keeps a full copy of every save (2,892 rows after them). A history-free design (what
  cr-sqlite does: a clock table plus the current row, no log of old values) removes both costs;
  either way it's under 1 ms a save.
- The same bookkeeping point as cr-sqlite: a device must not send a peer what came from it
  (B→A 910 rows after an 11-row edit) — per-device versions, or a merkle tree as Actual Budget
  does (to be checked in the research below).

### The phone keeps SQLite inside the app — Android, tested

The user: "i am sure this pc has adriod emulator either visual studio or jetbrains softwar, chec
and install what you need". Found: Visual Studio's Android SDK (`E:\Program Files (x86)\Microsoft
Visual Studio\Shared\Android\android-sdk` — command-line tools, build-tools 36, platform 36, JDK
21; no emulator, no platform-tools, no system image; not writable without admin). Installed into a
new SDK at `E:\Android\Sdk` (licences accepted by `sdkmanager --licenses`): platform-tools 37.0.1,
emulator 37.2.12, platform 36, build-tools 36.0.0 (Gradle added 35.0.0 itself), system image
`android-36;google_apis;x86_64`; AVD `jvtest` (Pixel 7). `E:\Android\jdk-21` is a junction to
Visual Studio's JDK 21 (its batch tools break on the `(x86)` path). Acceleration: "WHPX
(10.0.26300) is installed and usable".

The test app (session scratchpad, not a repo): Capacitor 8.5.3, a page plus a module worker that
opens `@sqlite.org/sqlite-wasm` 3.53.4-build2 on `opfs-sahpool` and uses its synchronous API — the
way our server code works. On Android 16, WebView 133.0.6943.137 (the image's own; phones update
theirs):
- origin `https://localhost`, secure context ✓; OPFS ✓; `createSyncAccessHandle` in the worker ✓;
  the session extension's API is present.
- **The database survives a force-stop and an app update** (runs 1 → 2 → 3, each finding the
  earlier rows); it lives in the app's private `app_webview` folder (20 MB after the test).
- `navigator.storage.persist()` → false (what that means for eviction: the storage record below).
- 2,000 single saves of a 7.5 KB scene, each its own transaction: 14–27 s (7–13 ms a save, on the
  emulator) · 15 MB of prose in one transaction: 0.23–0.9 s. Fine for autosave every few seconds.
- **iOS is not tested** — it needs a Mac, or a macOS CI runner with the iOS simulator.
- **But webview storage is best-effort** (the kit's `…-round2-phone-storage-onedrive.md` §A.3):
  Android WebView always denies `persist()`, Capacitor's docs say the OS reclaims webview storage
  when the phone runs low, and one Capacitor app reported losing everything at ~3 % free space. So
  the phone's database must never be the only copy of unsynced work. My idea, not decided: the
  phone also writes its outgoing change files to the app's own native data folder (not webview
  storage; `@capacitor/filesystem`, async is fine there), so if the webview's database is wiped the
  app rebuilds it from those files. The other route — a native SQLite plugin — is Promise-only, so
  the phone's data layer would turn async.
- **OneDrive from the phone** (same record §B): picking a cloud folder through the phone's file
  picker isn't reliable today; the cloud APIs' own app folders are (OneDrive `approot`, Dropbox App
  Folder, Google's app-data folder — each a sign-in in the system browser). On the desktop the
  synced folder on disk works.

### What the research found

Full records in the kit (`docs/plans/2026-10-08-sync-research-round2-*.md`), summary in the kit's
RESEARCH §2 "Sync, round 2".
- **No open-source tool does our job:** syncing our own SQLite tables by file, folder and server,
  on Node and in a phone webview. Closest: Syncular (Apache-2.0, pre-1.0, one maintainer, its own
  server and schema manifest, no file/folder) · backless-core (our folder design exactly — one
  changeset folder per device on Google Drive/OneDrive, snapshots, compaction, pruning — but on 2023
  cr-sqlite WASM, browser-only, repo gone) · TinyBase (MIT, would replace our data layer).
- **No other database is better for us:** every serious one means rewriting the schema, every
  query and the data layer, mostly into async code — to save only the merge, the smallest part.
- **What the open-source apps do:** they build their own sync on standard parts. None syncs the
  SQLite file; latest-write-wins by timestamp is the default; rich text gets a conflict copy or
  Yjs. **Actual Budget (MIT)** is our plan, running for years: per-cell changes stamped with a
  hybrid clock, applied to its own SQLite tables (better-sqlite3 on desktop), a merkle tree to find
  where two devices differ, and a thin store-and-forward server. **Trilium** (AGPL, design only)
  runs its whole server in a web worker on the official SQLite WASM over `opfs-sahpool` in its
  Capacitor app — our phone plan, which the Android test above now backs.
- **Phone → laptop over the internet:** every zero-setup path needs a public machine somebody runs
  (a meeting point and a relay). On the same Wi-Fi it's easy (the laptop announces itself; a QR code
  pairs). Built-in open-source options for the internet: WebRTC with our own signalling and a coturn
  relay, or iroh. Separate programs: Syncthing (moves a folder between devices), Headscale.

### How authors would use it (the walk-through the user asked for)

One library per device; every device has a name ("Dan's laptop"); the sync status always shows
the last sync, from which device, and changes waiting. Five ways, all on the same change format:

1. **Laptop as home base, phone pairs to it.** The desktop app already runs a server. Settings →
   Sync → "Pair a phone" shows a QR code; the phone scans it on the same Wi-Fi. From then on they
   sync whenever both are on the same network. Away from home the phone works offline and catches
   up later. Over the internet without router setup needs a meeting point someone runs — the open
   question below.
2. **A cloud folder (the user's tablet scenario).** Settings → Sync → "Use a cloud folder": on the
   desktop, pick a folder inside Dropbox/OneDrive; on the tablet, "Sign in to Dropbox/OneDrive" —
   the app uses the service's own app folder (`Apps/JustWrite`), which is the same folder the
   desktop sees on disk (Dropbox's App Folder lives under `/apps`; OneDrive's is an ordinary folder
   per Microsoft's docs — the desktop syncing it is the record's inference; Google's app-data
   folder is hidden, so Google Drive would need a visible folder instead). The phone's file picker
   can't reliably keep a cloud folder. Each device
   writes only its own change file there. The app merges the others' files when it opens, when it
   closes, and every few minutes while online. The author writes on the desktop, closes it, opens
   the tablet: "Synced 2 min ago · from Dan's laptop", and the chapter is there. If the cloud
   service hasn't uploaded the desktop's file yet, the status says when the laptop last wrote, so
   the author can tell.
3. **By hand.** Export changes → the picker shows the books changed since the last export, ticked →
   one file → AirDrop, cable or email → Import on the other device, which merges. For travel, no
   cloud accounts, or privacy.
4. **Your own server.** `justwrite-server` on a home NAS or a rented machine. Desktop and phone pair
   with it (address + token, or a QR code) and sync their own copies with it; any browser can use it
   directly. The same server can be the meeting point for 1.
5. **No copy on the device.** A phone short on storage, or a borrowed computer: "Use the server
   directly" — online only, nothing stored (today's thin client: JustVoice has half of it, JustWrite
   none, per "Checked before presenting shape A").

Behind every way: field by field, the latest edit wins; chapter text merges (Yjs), so a writer
never sees a conflict dialog for prose; a deleted item stays deleted unless restored later; nothing
is lost silently (see the questions). JustWrite, JustVoice and docgen each keep their own library
and folder, on one kit module.

### Should we roll our own? — the judgement

Yes — a kit sync module of our own, copying proven designs rather than depending on a library:
- Nothing open source does the job (above), and cr-sqlite would cost a schema change (foreign keys
  and the cascade off, defaults everywhere), native builds per platform, and a WASM build we'd have
  to make ourselves for the phone — on an unmaintained original or a server-bound fork.
- Our own works on the schema unchanged (tested), is plain JavaScript, and runs on better-sqlite3
  and on the SQLite WASM the phone test just proved.
- The design is proven: Actual Budget's per-cell hybrid-clock merge and merkle-tree catch-up (MIT,
  years in production), backless-core's per-device folder with snapshots and compaction, Yjs for
  prose.
- What we own: correctness (guarded by a convergence test — random edits on three copies, synced
  in random orders, must end equal), the hybrid clock, compaction, a schema-version check, and the
  "what does each device already have" bookkeeping (Actual's merkle tree, or per-device versions).
- Not yet run: our change log inside the phone's SQLite WASM (it needs SQL functions from JS —
  the WASM build supports them; to prove when the module is built).
