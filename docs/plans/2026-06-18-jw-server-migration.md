> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-27-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# JustWrite → Server Mode Migration Plan

**2026-06-18.** Executes the JW→server decision (full symmetry with JV) from
`docs/plans/2026-06-18-cross-app-runner-and-jw-backend-decision.md`. Target:
JW becomes **Tauri + Vue + FastAPI + SQLite**, the same shape as JustVoice.
Trigger: manuscripts + the RAG vector index outgrow client-side storage.

Status (2026-06-18): **Migration functionally COMPLETE.** P0–P4 done; P5's
provider endpoints + gateway + `providerBackend` adapter done; only the shared
`llm-ui` component library (UX-gated) and the deferred optimizations (P2.5,
sqlite-vec) remain. (Corrected after a file-by-file audit — the earlier
"P2–P4 not started" line was stale; all had in fact been built and wired.) JustWrite runs
**server-backed**: `justwrite:*` config rides `storage.js`→`/v1/kv`, and the
**book itself lives in the normalized P2 tables** — the renderer's project store
persists through `projectApi.js`→`/v1/projects/{id}/book` (assemble/decompose),
not a blob. Execution log + deep audit below.

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

**Remaining (each verifiable via the headless harness):**
- **P2 — DONE.** Schema (`models.py`, ~22 tables), assemble/decompose
  (`book_io.py`), the boot blob→tables migration (`migrations.py`), and the
  renderer repoint (`projectApi.js`→`/book`, wired into the project store's
  `_persist`/boot) are all done, wired, and green (49 pytest). The whole
  `/v1/projects` resource reads/writes the normalized tables (the legacy
  `Project.data` blob `/{id}` endpoints were a silent-data-loss trap after
  normalization — fixed so `/{id}` GET/PUT now alias assemble/decompose).
  **Remaining under P2:** **P2.5** — incremental per-scene writes (the renderer
  still re-PUTs the whole `/book`, async-debounced; typing isn't blocked, but a
  large book re-serializes on each flush) — and full per-entity *write* REST,
  deferred until a mobile client needs it.
- **P3 — DONE** (verified file-by-file 2026-06-18). `/v1/rag` table + endpoints
  (`api/rag.py`: status/shas/PUT/search/remove/clear) with server-side hybrid
  BM25 + cosine + RRF (`rag_search.py`, ported line-for-line from the old JS);
  `test_rag` + `test_rag_search` green. Renderer fully repointed: `vectorStore.js`
  calls `/v1/rag`, `indexer.js` embeds→PUTs, `chat.js` + `characterChat.js`
  retrieve via the server search, `autoIndex.js` drives the incremental build —
  the old client-side vector blob + `bm25.js`/`hybrid.js` are gone (only
  chat-thread history still rides kv). Contract verified to match on both sides.
  Remaining: **sqlite-vec** — server `search` loads all vectors and ranks in
  numpy today (fine for a single book; an ANN index is the scale optimization),
  same deferred-until-needed shape as P2.5.
- **P4 — DONE** (verified file-by-file 2026-06-18). `/v1/images` blob store
  (`api/images.py`: upload/fetch/delete, base64 — no multipart dep; `ImageBlob`
  table; `test_images` green). `imageStore.js` repointed: `saveImage` POSTs to
  `/v1/images` and returns a `{kind:"server", serverId}` record; `urlFor` /
  `readImageBytes` / `removeImage` resolve it via `/v1/images/{id}`; legacy
  file/data-URL records still READ for back-compat. Every upload consumer
  (Characters, cover, RichEditor, ImagesModal, import) goes through `imageStore`;
  the image *records* round-trip through the P2 `images` table. Project file I/O
  reconciled: save→export snapshot, open→`loadSnapshot` (→ store → server), with
  the Tauri disk autosave kept as a one-shot local recovery mirror. (Dead: the
  Tauri `images_save` write path — `images_read`/`delete` still serve legacy
  records.)
- **P5 — DONE except the shared UI (UX-gated)** (audited file-by-file
  2026-06-18). Provider CRUD (`/v1/llm-providers`, `api/llm_providers.py`) + the
  LLM gateway (`api/llm.py`, `/v1/llm/{id}/…` — inference proxies through the
  server with the server-held key) are built, wired, and tested
  (`test_llm_providers`, `test_llm_gateway`). The renderer is repointed: the
  `providerBackend.js` adapter (bootProviders/listProviders/saveProviders →
  `/v1/llm-providers`) is consumed by the `ai` store (provider registry off the
  kv blob), and `openai-compat.js` is a thin gateway client. **Remaining:** the
  shared **`llm-ui` component library** itself — extracting JW's + JV's provider
  UI into common components on top of the `providerBackend` seam — isn't built
  (`llm-ui/` doesn't exist). UI work, cross-repo; pause for visual direction.

**Update (2026-06-18 audit):** P2–P4 were in fact landed + wired in subsequent
work — this status doc had lagged the code (and was re-verified file-by-file).
The remaining migration work is P5's shared-`llm-ui` adapter (UX-gated) and the
deferred scale optimizations (P2.5 incremental writes; sqlite-vec for RAG).

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
