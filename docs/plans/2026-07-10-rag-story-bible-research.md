# 2026-07-10 — RAG research: why "who is X?" fails, and the story-bible fix

The user's report (verbatim): *"it is not doing very well since it think it
only scans the scenes. I will has who character is but it comes back with some
generic guess based of a scene. Or maybe what location this scene or character
is in, it again guess only from scene. We have a nice story bible with
everything connected in relations links and groups. How do we make rag work
better? Also are we using sqlit-vec for our vector database…"* — plus the
Google-suggested FTS5 + sqlite-vec + RRF hybrid. This doc is the grounded
research: what today's RAG actually is (file:line), why the failure is exactly
what the user describes, what the industry precedent does, and the proposed
fix. RESEARCH ONLY — nothing here is built; every build item awaits the
user's go.

## 1. What today's RAG actually is (verified)

- **The corpus is scenes, and nothing else.** `services/rag/chunker.js:46-81`
  — `chunkProject()` iterates chapters → scenes and emits one chunk per scene
  (id `chapterId:sceneId`, plain text via `stripText`). No characters, no
  locations, no objects, no groups, no worldbuilding, no notes, no strands,
  no architecture docs, no events ever reach the index. The scene's own
  entity links (`scene.characters` / `.locations` / `.objects` — the fields
  the Relations graph is built from) are NOT even attached as metadata.
- **The prompt then forbids everything else.** The server "chat" prompt
  (`seed_feature_prompts.py:920-929`): *"Use ONLY the provided excerpts."*
  Correct discipline against hallucination — but with a scenes-only index it
  GUARANTEES the reported behavior: ask "who is Aria?" and the model must
  synthesize an answer from whatever 6 prose excerpts ranked highest, i.e. a
  generic guess from scenes.
- **Retrieval is ALREADY hybrid BM25 + cosine + RRF.** `rag_search.py`
  implements Okapi BM25 (K1=1.5, B=0.75), cosine over the stored vectors,
  and Reciprocal Rank Fusion with RRF_K=60 (Cormack et al.) — the exact
  algorithm the user's Google result describes. It runs server-side:
  `api/rag.py:95-110` loads every `rag_vectors` row for the project,
  JSON-parses the vectors, and ranks in Python/numpy per query.
- **We are NOT using sqlite-vec or FTS5.** Vectors live as JSON text in the
  plain `rag_vectors` table (models.py); BM25 is computed in Python per
  query, not by an FTS index.
- **Ask-the-book vs character chat asymmetry.** `rag/characterChat.js:28-71`
  already injects the FULL bible profile (role, voice, motivation, arc,
  backstory — `buildCharacterProfile`) into the character-interview prompt,
  and biases retrieval by prepending the character's name to the embed query
  (:76-83). "Ask the book" (`rag/chat.js`) gets none of that. The fix below
  generalizes the trick that already works.
- **Excerpt labels are chapter/scene only** (`rag/excerpts.js:15-31`), and
  the ChatPanel citation click-through navigates to chapters — both need a
  kind-aware variant when bible cards join the index.
- **Auto-reindex already covers bible edits.** `rag/autoIndex.js:59-65`
  subscribes to ALL project-store mutations and runs the incremental
  `buildOrUpdateIndex()` (sha-diff, `indexer.js:92-120`) a minute after the
  last change — so once bible cards are chunks, editing a character
  automatically re-embeds just that card.

**Answer to the user's direct question:** no, we don't use sqlite-vec — and
the RRF hybrid Google suggested is already implemented, just executed in
Python instead of inside SQLite. The suggestion is the right ALGORITHM (we
agree, we shipped it when retrieval moved server-side) but it is not the
missing piece; the missing piece is the corpus.

## 2. Why sqlite-vec + FTS5 is a LATER infra move, not the fix (verified on the web)

- sqlite-vec is Alex Garcia's SQLite extension: vec0 virtual tables,
  brute-force KNN (no ANN yet — DiskANN is the announced next step), pre-v1
  (v0.1.x; breaking changes possible between minors). Sources:
  https://github.com/asg017/sqlite-vec (+ /releases),
  https://alexgarcia.xyz/sqlite-vec/features/knn.html,
  https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite.
- The canonical hybrid recipe (FTS5 table + vec0 table + one SQL query
  fusing both rankings with RRF k=60) is Garcia's own post:
  https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html
  (summary: https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/).
  Related precedents: https://github.com/sqliteai/sqlite-rag,
  https://github.com/liamca/sqlite-hybrid-search.
- What migrating would buy US: the per-query full-table load + JSON parse in
  `api/rag.py:96-109` disappears (SQL does the scan in C over a real FTS
  index + packed float vectors). What it would NOT buy: better answers —
  ranking output is the same family of hybrid we already compute. At novel
  scale (hundreds of scene chunks + hundreds of bible cards), the Python
  path is comfortably fast; sqlite-vec's own positioning is brute-force for
  exactly this small-local-corpus regime. VERDICT: park as an infra upgrade,
  revisit if chunk counts grow ~10× (e.g. if sub-scene windowing ships) or
  profiling shows search latency; it also couples us to a pre-v1 native
  extension (packaging: bundling a loadable .so/.dylib/.dll per platform
  into the desktop build).

## 3. Precedent — how the genre leader does it (T4 options-considered)

**Novelcrafter's Codex** (the closest product analog to our story bible)
does NOT rely on similarity search for entity knowledge: mentioning an
entity's name or alias in the chat/prose pulls that Codex entry into the AI
context DETERMINISTICALLY, case-insensitive; the relations panel makes
linked entries come along transitively (A relates B,C; C relates E → mention
A, get B,C,E); "global" entries are always included. Sources:
https://www.novelcrafter.com/features/codex,
https://www.novelcrafter.com/help/docs/codex/codex-relations,
https://www.novelcrafter.com/courses/ultimate-beginners-guide/codex-and-chat.
The lesson: for "who/what/where is X" questions, deterministic name→card
injection beats embedding similarity every time — RAG's job is the prose
evidence, the bible's job is the facts. Option compared and not chosen:
pure-RAG-over-everything (index the bible and hope similarity ranks the card
first) — strictly weaker than pinning for named entities and identical
otherwise, so we take both: index cards AND pin on name match.

## 4. THE PROPOSAL (awaits the user's go — nothing built)

**Move 1 — index the story bible as first-class "card" chunks** (the big
one). Extend `chunkProject()` with synthetic documents per entity, each with
`kind` + `entityId` metadata:
- **Character card** — assembled by the SAME `buildCharacterProfile()` the
  character chat already uses (one source, no copy), PLUS derived relations:
  group memberships (names), co-appearance ("shares scenes with Bren (Ch 3,
  7), Maren (Ch 7)" — from `scene.characters`), locations they appear at,
  strand beats naming them, their per-entity events, and an appearances line
  ("appears in Ch 1 Sc 2 'The customs house' …"). This is exactly the
  "relations links and groups" web the user built — flattened into prose the
  retriever and the LLM can use.
- **Location / Object cards** — name, kind, note, tags + which
  scenes/chapters reference them + group memberships.
- **Group cards** — name, blurb, member list (with kinds).
- **Worldbuilding article cards** — title, category, summary, body (split
  long articles).
- **Notes, Architecture docs (premise/fabula/setting), Strand cards
  (name + beats with scene refs), and the per-entity events timelines.**
- Citations: `excerpts.js` + the ChatPanel citation panel learn kind-aware
  labels ("Story Bible — Character: Aria") and click-through to the entity's
  page instead of a chapter.
- Costs: one-time index rebuild (new chunk ids); ongoing upkeep is free (the
  existing sha-diff + the all-mutations auto-watcher).

**Move 2 — deterministic entity pinning (the Novelcrafter move).** At ask
time, scan the question + recent turns for entity names/aliases (the store
holds every name — a word-boundary match over a few hundred strings is
sub-millisecond, client-side). Any hit → that entity's card is PINNED into
the excerpts regardless of retrieval rank (first-degree relations optional,
flag at build). The k retrieved slots then carry prose evidence + whatever
else ranks. "Who is Aria?" becomes: her card (pinned) + her scenes
(retrieved) — the generic-guess failure mode is structurally gone. This also
upgrades follow-ups ("what does SHE want") since cards ride history-aware
pinning from prior turns.

**Move 3 — scene chunks carry their links.** Prepend a one-line header into
each scene chunk's indexed text — "Ch. 7 Sc. 2 'The customs house' —
characters: Aria, Bren; location: Customs House" — from the scene's link
fields. BM25 and the embedding then connect pronoun-heavy prose to entity
names, and the LLM sees the header in the excerpt (fixes "what location is
this scene in" even when the prose never names it). One-time re-embed (every
scene sha changes).

**Move 4 (optional, flagged) — retrieval-mix + granularity levers.** Reserve
1-2 of the k slots for bible cards when entities are detected; consider
sub-scene windowing (~400-token overlapping windows) for long scenes — this
is the point where the sqlite-vec + FTS5 migration (§2) becomes worth its
weight, as chunk counts multiply.

**Sequencing recommendation:** Moves 1+2+3 together as one build (they share
the chunker + prompt-path edits; a rebuild is needed once anyway), Move 4 and
the sqlite-vec migration as separate later items. The "chat" prompt keeps its
"ONLY the provided excerpts" law — the excerpts just finally contain the
bible.

## 5. Open decisions for the user (nothing proceeds without a word)

1. GO/no-go on Moves 1+2+3 as one build?
2. Pin first-degree RELATIONS along with a named entity (Novelcrafter-style
   transitive pull — richer context, bigger prompts), or pin only the named
   entity's own card (leaner)? Recommendation: named-entity-only first;
   relations data is already IN the card text.
3. Should notes marked/anchored to unwritten material and `excludeFromAi`
   analogs apply to bible cards (e.g. a "spoilers" flag per entity)? Today
   only scenes have the exclude flag (chunker.js:61). Recommendation: defer —
   no bible-level flag exists yet; add only if the user wants it.
4. sqlite-vec + FTS5 migration: park (recommended) or schedule now?
