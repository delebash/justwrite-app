# RAG design — the distilled decisions (story-bible retrieval)

Distilled 2026-08-04 by the docs campaign from the 2026-07-10 research + 2026-07-11
build plans (now in `../plans/archive/`). ARCHITECTURE.md names the modules; THIS
doc keeps the design decisions a `src/services/rag/` maintainer needs.

- **Retrieval is hybrid and always was**: Okapi BM25 (K1=1.5, B=0.75) + cosine +
  RRF (RRF_K=60), computed server-side in `rag_search.py`; `api/rag_api.py` loads every
  `rag_vectors` row per query and JSON-parses it. **sqlite-vec + FTS5 is PARKED,
  not rejected** — it removes the per-query full-table load but buys no better
  ranking; revisit when chunk counts grow ~10× or profiling shows search latency
  (cost: a per-platform native extension in a pre-v1 desktop build).
- **The historical failure was the CORPUS, not the algorithm** — one chunk per
  scene and nothing else, under a prompt that forbids outside knowledge, made
  "who is X?" structurally a guess. The fix was entity CARDS + pinning, not a
  fancier ranker.
- **Entity cards** (`cards.js` → `buildEntityCards`): `card:<kind>:<entityId>[:pN]`
  for characters (profile via the ONE `buildCharacterProfile`, `voice:
  "second"|"third"` parameterized — interview output stays byte-stable), groups,
  strand beats, events, locations/objects, worldbuilding (split at ~1500 chars into
  `:pN` parts because excerpts truncate at 1200), notes, architecture. Characters
  get a TEMPORAL appearances section ("Ch N, scene 'T' — at <locations>, with
  <characters>[, POV]"). Cards carry no `excludeFromAi` flag yet (deferred).
- **Deterministic pinning beats similarity for "who/what is X"** (Novelcrafter
  Codex / SillyTavern World Info precedent; GraphRAG's expensive step is free here
  — the story bible IS a curated knowledge graph). Pins run under a ~1200-token
  budget (≈ 2-3 cards), exact-name > alias, NO 1-hop fan-out (the user's call —
  relations are already in the card text), additive to retrieval's k.
- **Scene links do NOT enter the embedded text** — the chunk gains a separate
  `links` line; BM25 scores text + links, the vectors stay pure prose, and adding
  links required NO re-embed.
- **Embedding task templates are a 1:1 child TABLE** (`ModelEmbedTemplate`:
  document_template / query_template), chosen over catalog columns because
  `create_all` picks up new TABLES with no reset while new COLUMNS have no
  migration machinery. Qwen3 embeds get an instructed QUERY template, documents
  plain; nomic got `search_document:`/`search_query:`; online models have no row →
  byte-identical passthrough. BM25's queryText stays RAW. Callers: indexer =
  document; chat + characterChat = query.
- **Local embedding stays the recommendation**: nomic v1 already beat ada-002 and
  3-small on MTEB retrieval; online adds per-token cost + latency on every ask AND
  every auto-reindex, and sends manuscript text off-machine. The default later
  moved to **Qwen3-4B** (won the 2026-07-12 on-box A/B, +6.6 English retrieval).
- **Rebuild semantics**: changing document vectors = ONE automatic full re-embed
  (the sha covers text+links, so the first diff re-embeds everything). **Recorded
  limitation: editing an embed TEMPLATE later needs a manual Rebuild** — sha-diff
  can't see template changes (tracked for an affordance).
- **Convergence rules that must not re-break**: ONE `citationLabel(chunk)` shared
  by excerpt formatting and ChatPanel's citation row; ONE `normalizeName()` in
  `services/text.js` (it replaced three byte-identical copies; a fourth is
  forbidden).
- **Prompt-seed healing is host-data**: seeding is insert-if-missing, so new prompt
  text reaches existing DBs only via the old→new text MAP passed through
  `configure_app_seed`/`install_llm`; a user-edited prompt is never touched.
- **Known corpus defect (tracked)**: imported chapters land as ONE scene
  (`stores/project.js` import path) → one diluted embedding per chapter; fix is
  scene-break splitting on import (E5).
- The two temperature-pinning callers, and only these two: `chat.js` sends 0.3,
  `characterChat.js` 0.7.
