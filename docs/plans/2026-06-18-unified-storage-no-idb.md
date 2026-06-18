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
