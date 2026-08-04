> ⛔ **NOT THE CURRENT PLAN** — but **THE DB RULING IN IT IS LIVE** (banner amended by
> the docs campaign 2026-08-04): "drop and reseed, no migrations" is the standing
> storage policy `CLAUDE.md` cites this doc for. The migration PLAN below is history;
> the ruling is not. (The master it defers to is itself archived now:
> `just-llm-runner/docs/plans/archive/2026-06-28-MASTER-PLAN.md`.)

# Storage: full SQL rewrite — no IndexedDB, no localStorage shim (JW + JV)

**2026-06-18, decided with the user.** Replace the kv / localStorage-shim
half-measure with a proper SQL data layer in **both** apps. No IndexedDB, no
generic blob store, no `storage.js` emulation layer. Every datum is a real SQL
resource fetched over a typed API.

## Corrections to the earlier (wrong) framing

- **Per-device settings is orthogonal to SQL.** Settings live in SQL; "per
  device" is just *scoping*. Desktop already gives it for free — each install
  runs its own local server + SQLite, so its settings are its own. A future
  central server would scope by a device id. IndexedDB is never the answer.
- **The sync-cache shim is NOT a hard requirement.** Pinia stores can hydrate
  asynchronously: `await bootX()` before `app.mount()`, the store holds a
  reactive object, views read it. JV's domain stores already work this way
  (`reload()`). So `storage.js` is **deleted**, not "kept for Pinia."

## Target

- **Settings** → `settings` table + `GET` / `PATCH /v1/settings`; an
  async-hydrated `settings` store. Holds appearance/ui, button knobs, feature
  routing, active-project id, onboarding, hardware presets. (JV: fold
  `settings.json` in here — one backend.)
- **Collections** → real tables + REST: `sessions` (per-day word-count log),
  `chat_threads` (+ messages). Project registry **derived** from `projects`.
- **Undo tail** → a small `history` table, or drop cross-restart persistence
  (in-memory undo/redo is unaffected). Decide at that slice.
- **Delete** `services/storage.js`, `/v1/kv`, the `kv` table, and the
  `idb-keyval` dependency — both apps.

## Staging (vertical slices, each left working + verified)

JW: `sessions` → `chat_threads` → `settings` (the big one) → registry-derive →
undo tail → delete `storage.js`/`kv`/`idb-keyval`. Then JV: the same, ending
with `idb-keyval` removed. pytest + headless after each slice.

## Not in scope

JW keeps its in-memory book store + snapshot undo/redo (correct for a writing
app; P2 decided it). This is a storage-*backend* rewrite, not a
renderer-architecture change. The apps converge on the backend + API shape, not
on JW adopting JV's per-view-fetch model.

**No per-collection data migration.** Each slice creates real tables + API and
points the renderer at them; the orphaned `justwrite:*` kv blobs are abandoned
(then dropped wholesale when `kv` is deleted). This is dev/demo data on a
pre-release app — slice 1 (sessions) set the precedent. Not worth a one-time
copy per collection.

## Execution log

- **Slice 1 — sessions ✓** (commit `9d41287`). `sessions` / `session_chapter_words`
  / `session_meta` tables + `/v1/sessions`; async-hydrated `sessions` store.
- **Slice 2 — chat_threads ✓.** Manuscript-RAG threads off `justwrite:rag:thread:*`.
  - **Collapsed "chat_threads + messages" into a single `chat_messages` table**
    keyed `(project_id, mode, character_id, position)`. A thread's identity is
    fully its key and the renderer never lists threads or stores thread-level
    metadata — a parent table would be an empty-but-for-the-key ceremony row
    (RULE #2: size to actual need). `project_id` FKs projects → a book delete
    cascades its threads away (the kv blobs used to orphan).
  - `/v1/chat` GET/PUT/DELETE (PUT = delete-all-then-insert for the thread key);
    `services/chatApi.js`; ChatPanel hydrates async with a stale-load token and
    **persists only settled turns** (was: every streamed token via the kv
    debounce) — a whole-thread replace can't run per-token. Mid-stream thread
    switches don't persist under the wrong key (identity captured at ask-time).
- **Slice 3 — settings ✓.** ui + ai-prefs + hardwarePresets off `justwrite:ui` /
  `justwrite:ai` / `justwrite:hardwarePresets`.
  - One `settings` table (key=section, value=JSON), `GET` / `PATCH` / `DELETE
    /v1/settings` — mirrors JV's GET/PATCH shape. **Shallow per-section upsert,
    NOT deep merge**: each section has one renderer-side owner that writes it
    wholesale, and a deep merge would fail to propagate key *deletions* (clearing
    a `modelTiers` override). Values are real JSON, not kv's opaque strings.
  - `services/settingsApi.js` + `services/settings.js` (boots the doc into an
    in-memory copy before mount so Pinia `state:()` reads its section sync;
    debounced per-section PATCH; unload flush; `clearSettings`). ui/ai/
    hardwarePresets stores read `readSetting`/`writeSetting`. Providers stay in
    their own `/v1/llm-providers` table — dropped from the `ai` section entirely
    (and the dead kv-provider fallback in `initialProviders`).
  - main.js `await bootSettings()` before hydrateProjects; early appearance reads
    `readSetting("ui")`. SettingsView "Reset workspace" now also `clearSettings()`.

## Discovered scope (beyond the original staging line)

Enumerating every `justwrite:*` key showed more than the staging line listed.
Full remaining queue to reach **zero kv**:

- **registry-derive** ✓ (slice 4): `justwrite:projects:registry` was doubly
  persisted (kv *and* the projects table via putSnapshot) — dropped the kv copy;
  `projectApi.bootProjects` now also GETs `/v1/projects` into a `listRegistry()`
  cache the store's `_projects` seeds from. `justwrite:projects:active` →
  `activeProjectId` settings key (one-time kv-fallback read so existing installs
  keep their place). New bootstrap branch: no pointer but projects exist → open
  the most-recent (prefetched by hydrateProjects) instead of re-seeding.
  `ensureActiveProjectPersisted()` (main.js, post-boot) writes the fresh-seed
  row so a brand-new install survives a reload (registry derives from the row).
- **undo tail** ✓ (slice 5): `justwrite:project:history` — **dropped** cross-restart
  persistence (the plan's offered alternative). Persisting 50 deep-clone snapshot
  blobs is exactly the opaque-blob anti-pattern the rewrite rejects; in-session
  undo/redo is unchanged, and durable rollback is the per-chapter version history.
  Removed loadHistory/saveHistory, `_scheduleHistoryPersist`, the persist
  constants, and the now-vestigial `scenesMigrationRan` flag (it existed only to
  discard a stale persisted tail).
- **usage ledger** ✓ (slice 6): `justwrite:ai:usage` → `llm_usage` table +
  `/v1/llm-usage` (GET recent log + SQL-computed lifetime totals, POST a row,
  DELETE all). Totals are computed from the rows (overall + GROUP BY feature/
  provider), so trimming the displayed log never loses cost history — the old
  side-totals object existed only because its in-memory log was capped at 1000.
  `services/usageApi.js`; the ai store hydrates **lazily** when Settings → Usage
  opens (not at boot — most sessions never view it), records via local-append +
  fire-and-forget POST, clears via DELETE. This removed the last `storage.js`
  import from `ai.js`.
- **version history** ✓ (slice 7): `justwrite:versions` → `chapter_versions`
  table + `/v1/versions` (GET a project's versions grouped by chapter; PUT a
  chapter's list wholesale — same replace-all shape as chat). project_id FK
  cascades on book delete. `services/versionsApi.js`; the store hydrates per
  project lazily (shared in-flight promise so concurrent ops can't race an empty
  list), and the VersionHistoryModal calls `ensureLoaded()` on open. Save/delete/
  restore-undo became async (await ensureLoaded) so a command-palette save
  without the modal open can't wipe a chapter's existing versions.
- **model-list cache** ✓ (slice 8): `justwrite:modelList` → dropped persistence;
  `useModelList` keeps an in-memory reactive cache rebuilt per session on first
  pick (a disposable /v1/models cache doesn't earn a SQL home).
- **autosave/backup timestamps** ✓ (slice 9): `justwrite:lastBackupAt` /
  `lastAutosaveAt` → `lastBackupAt` / `lastAutosaveAt` settings keys. Removed the
  last `getItem`/`setItem` from SettingsView.
- **JustVoice export URL** ✓ (slice 9): `services/export/justvoice.js` used real
  `localStorage` (`jw.justvoice.url`) — moved to a `justvoiceUrl` settings key
  (a thin client must get it from the server too). No `localStorage.*Item`
  data use remains in the renderer.
- **legacy** `justwrite:project` single-key + `justwrite:projects:active` kv
  fallback: ✓ (slice 10b) removed the transitional migration branches.
- **Reset-workspace cross-cut**: ✓ (slice 10b) `DELETE /v1/workspace` wipes every
  table in one call (children-first), replacing `clearPrefix("justwrite:")`.
- **Backup bundle**: ✓ (slice 10a) `_workspace` carries the settings document
  (`getAllSettings`/`applySettings`) instead of kv keys.
- **Delete** ✓ (slice 10b): removed `services/storage.js`, `api/kv.py` + the
  `KvEntry` model (+ `DROP TABLE IF EXISTS kv` migration), `test_kv.py`,
  `bootStorage` from main.js, and the `idb-keyval` dependency.

## JW status: COMPLETE

Zero `justwrite:*` kv keys, zero `localStorage`/`IndexedDB` data use, no
`storage.js`. Every datum is a typed SQL resource over a typed API
(settings, projects, sessions, chat, versions, llm-usage, llm-providers,
workspace). **Next: JustVoice** — fold `settings.json` into the same SQL
backend and remove any IndexedDB there, ending with `idb-keyval` gone in JV too.
