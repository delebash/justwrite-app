# JustWrite → Server Mode Migration Plan

**2026-06-18.** Executes the JW→server decision (full symmetry with JV) from
`docs/plans/2026-06-18-cross-app-runner-and-jw-backend-decision.md`. Target:
JW becomes **Tauri + Vue + FastAPI + SQLite**, the same shape as JustVoice.
Trigger: manuscripts + the RAG vector index outgrow client-side storage.

Status: **scoped, not started.** Largest thread in the cross-app work.

---

## The key enabler (why this is tractable)

JW's entire persistence funnels through **one seam**: `services/storage.js`
— a localStorage-shaped **sync** API (`getItem`/`setItem`/`removeItem`/
`listKeys`/`clearPrefix`) backed by an in-memory `cache` Map + debounced
`idb-keyval` writes, hydrated once at boot by `bootStorage()` before Vue
mounts. Every Pinia store reads/writes through it (`justwrite:*` keys). RAG
vectors persist via `rag/vectorStore.js`; images via `imageStore.js`
(already bridged to the Tauri FS). So most of the migration is **swapping
backends behind stable seams**, not rewriting stores.

## Design rules (from the decision doc — do not violate)

- **Interactive/ephemeral state stays client-side.** TipTap editor content
  and the snapshot-based undo/redo stack (`_past`/`_future`, `markRaw`) live
  in the renderer. SQLite is the **durable** layer, written debounced/
  incrementally. **Never round-trip keystrokes or undo through HTTP** → zero
  typing latency.
- **Critical-path backend.** Tauri spawns + health-checks + supervises the
  Python server at launch (reuse JV's pattern); graceful "backend starting/
  failed" UX so a spawn failure degrades instead of a blank app.
- **camelCase wire**, runner **imported in-process**, inference **direct to
  llama-server** (per the decision doc).

## Phases (each its own item — RULE #2)

**P0 — JW Python server skeleton.** FastAPI + SQLAlchemy/SQLite mirroring
JV's server bootstrap (app_state, settings, `/v1/health`, `data_dir`). Tauri
shell spawns it as the main API server (reuse JV's spawn/health/supervise
Rust). No data yet — just boots + health.

**P1 — Persistence seam swap (Level 1).** Re-back `storage.js` from
`idb-keyval` to the server: `justwrite:*` keys → a `kv` table via REST,
keeping the sync-cache shape (bulk GET at boot to hydrate; debounced PUTs).
**Stores unchanged.** Data now lives in SQLite, multi-client-ready. Still the
whole-snapshot model — the architecture is in place, the scaling win comes in
P2. The browser-only `dev:vite` path now points at the server.

**P2 — Normalize the project (Level 2 — the scaling win).** Replace the
single `justwrite:project` snapshot blob with proper tables (chapters,
characters + extras, locations, objects, groups, notes, strands,
worldbuilding, architecture, chapter bodies) + per-entity REST + incremental
writes. Undo/redo stays snapshot-based **in the renderer** (it already
deep-clones `HISTORY_SLICES` in memory); only persistence becomes
incremental. Largest phase — do it entity-by-entity with current data as
fixtures.

**P3 — RAG → server-side `sqlite-vec`.** Move `rag/vectorStore.js`
(load/save/upsert/removeId/diff/clear) to a server vector store
(`sqlite-vec`); hybrid retrieval server-side. Embedding stays
client-initiated (calls the provider through the shared adapter) or moves
server-side — decide at P3. This is the trigger that motivated the move.

**P4 — Images + project file I/O.** Route `imageStore.js` to the server (or
keep the Tauri FS path), and reconcile the `window.justwrite.project.
save/saveTo/open` Tauri file flows with a server-backed project (export/
import vs the live store).

**P5 — Shared runner + llm-ui.** Mount the shared Python runner in-process;
point JW's `ProviderBackend` adapter at the server's `/v1/llm-providers`;
adopt the shared `llm-ui`. **UX-gated** — building shared components needs
the user's visual direction first.

## Risks / watch-items

- **Boot ordering.** `bootStorage()` must finish before Vue mounts; with a
  server, boot = spawn server → health → bulk-hydrate. Splash + server-down
  handling required.
- **The whole-snapshot → normalized transition (P2)** is where bugs hide.
- **One-time data migration**: existing users' IndexedDB → SQLite on first
  launch of the new version (import-on-upgrade path).
- **Don't regress** undo/redo or the ~600ms keystroke coalescing — keep them
  renderer-side.

## Verification

JW has no test runner today (and we don't add an `npm test`). So: pytest for
the new Python server (per phase), plus a renderer smoke check (boots, CRUD,
undo/redo intact, no typing latency). Each phase must leave the app fully
usable before the next begins.

## Recommended start

**P0** (server skeleton) is the natural first coding step — it's
self-contained, mirrors JV, and unblocks P1. P5's UI work waits on visual
direction.
