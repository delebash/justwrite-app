# JustWrite → Server Mode Migration Plan

**2026-06-18.** Executes the JW→server decision (full symmetry with JV) from
`docs/plans/2026-06-18-cross-app-runner-and-jw-backend-decision.md`. Target:
JW becomes **Tauri + Vue + FastAPI + SQLite**, the same shape as JustVoice.
Trigger: manuscripts + the RAG vector index outgrow client-side storage.

Status (2026-06-18, admiring-galileo): **P0 + P1 DONE and verified
end-to-end; P2–P5 not started.** The migration's CORE is achieved —
JustWrite now runs **server-backed**: all `justwrite:*` data (including the
RAG vector index, which rides on `storage.js`) persists to SQLite via the
server. Execution log + deep audit below.

## Execution log + deep audit (2026-06-18)

**Shipped + verified:**
- **P0** — JW FastAPI + SQLite server skeleton; mounts the shared llm-runner
  in-process; `justwrite-server serve` CLI. (pytest; live HTTP.)
- **P1** — `storage.js` re-backed onto the server `/v1/kv` (was IndexedDB) +
  new `services/serverApi.js`. Whole app now server-backed with **no store
  changes** (same sync cache + public API).
- **Headless harness** — `scripts/headless-smoke.mjs` (Playwright + Chromium):
  drives `vite dev` against the live server, sweeps every route, asserts zero
  JS errors. The renderer-verification tool the project lacked headless.

**Deep-audit results (all green):**
- JustVoice: ruff clean; **268 pytest pass** (the 4 fails are container-only —
  `fastmcp` absent — unrelated to any change here).
- JW server: ruff clean; **7 pytest pass**; live HTTP (`/v1/health`, `/v1/kv`
  CRUD, `/v1/llm-runner/manifest`) OK.
- JW renderer: `build:vite` clean; biome clean; **headless whole-app sweep =
  26/26 routes render, zero JS errors**; renderer persists
  `justwrite:projects:*` + `modelList` to `/v1/kv`→SQLite; Node adapter test
  (boot/PUT/overwrite/DELETE/clearPrefix) OK.
- `idb-keyval` now has **zero references** in the renderer (storage.js was its
  only consumer) → a dead dependency, safe to drop from package.json later.
- Studio/Speaker-Lab `ERR_CONNECTION_REFUSED` in the sweep are to optional
  external TTS/LLM backends (voicebox :17493, Ollama :11434, …) not running
  here — expected, unrelated to the migration.

**NOT started — P2–P5 (refinements on the now-working server-backed app; each
now verifiable via the headless harness):**
- **P2 — normalize the project blob** into per-entity SQLite tables + REST.
  Removes the whole-snapshot scaling ceiling. The big project-store renderer
  rewrite — largest remaining item; do entity-by-entity, verify each via the
  harness.
- **P3 — RAG server-side search.** Vectors already persist to SQLite (via P1).
  Remaining: a `/v1/rag` table + cosine search (numpy now; sqlite-vec later)
  so the renderer queries instead of loading the whole vector blob at boot;
  `vectorStore.js` → async (+ indexer/chat).
- **P4 — images → server.** `imageStore.js` (Tauri-bridge / data-URL today) →
  a server image endpoint.
- **P5 — shared `llm-ui` + provider endpoints.** Runner already mounted (P0).
  Remaining: provider CRUD (mirror JV's `llm_providers_api`) + the shared
  `llm-ui` `ProviderBackend` adapter. UI work — pause for visual direction.

**Why P2–P5 weren't landed tonight:** each is a substantial renderer change
that must be wired + verified in the running app (now possible via the new
harness). Per "right the first time / don't ship unwired code," P1 (the core)
was taken to a fully-verified state and the verification harness built, rather
than landing P2–P5 unverified. They are the clear next coding focus.

---

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
