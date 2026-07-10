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

**Three more precedents examined on the third pass (2026-07-10, the user's
"one more pass"):**
- **SillyTavern World Info / lorebooks** — the second big deterministic-
  injection precedent: entries fire on keyword match against recent chat,
  under a TOKEN BUDGET with per-entry priority ordering, and only the
  entry's content (standalone prose) is injected. Sources:
  https://docs.sillytavern.app/usage/core-concepts/worldinfo/,
  https://rentry.co/world-info-encyclopedia. Adopted from it: the pin cap
  becomes a pin BUDGET (tokens, not just a count) with priority
  exact-name > alias; and cards must read as standalone prose.
- **Microsoft GraphRAG** — extract a knowledge graph from text, embed
  entity/relationship summaries, answer entity questions via "Local Search"
  (the entity + fan-out to its graph neighbors). Sources:
  https://github.com/microsoft/graphrag/blob/main/docs/index.md,
  https://www.microsoft.com/en-us/research/publication/from-local-to-global-a-graph-rag-approach-to-query-focused-summarization/,
  https://arxiv.org/pdf/2408.08921. The insight for US: GraphRAG's expensive
  step (LLM-extracting the graph) is FREE here — the story bible IS a
  human-curated knowledge graph. This proposal is literally GraphRAG Local
  Search with a hand-built graph: entity cards = entity summaries, pinning +
  (optional) 1-hop relations = the local-search fan-out, the existing RRF
  hybrid = the retrieval layer. That both validates the design and gives
  open-decision #2 (pin 1-hop neighbors or not) literature on both sides.
- **The long-context alternative ("don't retrieve — include the whole
  bible")** — considered and NOT chosen as the primary mechanism. A typical
  bible digest (~10-15k tokens) fits the locked 32k window, and llama.cpp's
  per-slot prefix cache (cache_prompt, on by default: the server skips
  prefill for the longest common prefix between consecutive requests on a
  slot — https://github.com/ggml-org/llama.cpp/discussions/13606,
  https://github.com/ggml-org/llama.cpp/discussions/8860) would amortize it
  within a chat session. Rejected because: it stops scaling when the bible
  grows; a monolithic blob can't carry per-source [n] citations (the
  citations panel is load-bearing UX); the prefix cache breaks whenever any
  OTHER feature (critique, extraction…) runs on the same slot between asks,
  re-billing the full prompt eval on writer hardware; and it does nothing
  for locating PROSE evidence. RECORDED as a possible later complement in
  miniature: an always-on "global digest" (premise + main-cast one-liners,
  ~500 tokens — SillyTavern's "global entries" pattern) placed as a stable
  prompt prefix.

## 4. THE PROPOSAL (awaits the user's go — nothing built)

**Move 1 — index the story bible as first-class "card" chunks** (the big
one). Extend `chunkProject()` with synthetic documents per entity, each with
`kind` + `entityId` metadata:
- **Character card** — assembled by the SAME `buildCharacterProfile()` the
  character chat already uses, PARAMETERIZED for voice (third pass: the
  existing builder addresses the character in second person — "What you
  want:" — which is right for the interview persona and wrong for an index
  card; one builder, a `voice: "second"|"third"` option, no copy), PLUS
  derived relations: group memberships (names), co-appearance, strand beats
  naming them, their per-entity events, and a TEMPORAL appearances section
  (third pass — "where is X" is a timeline question, so each appearance line
  pairs place and company: "Ch 1 Sc 2 'The customs house' — at Customs
  House, with Bren", from the scene's `characters`/`locations`/`objects`/POV
  links, SceneLinks.vue:66-88). This is exactly the "relations links and
  groups" web the user built — flattened into standalone prose the retriever
  and the LLM can use.
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

**Move 2 — deterministic entity pinning (the Novelcrafter/SillyTavern
move).** At ask time, scan the question + recent turns for entity
names/aliases (the store holds every name — a word-boundary match over a few
hundred strings is sub-millisecond, client-side). Any hit → that entity's
card is PINNED into the excerpts regardless of retrieval rank, as a normal
[n]-cited excerpt (citations UX unchanged). Pinning runs under a TOKEN
BUDGET with priority ordering (third pass, the SillyTavern pattern):
exact-name matches outrank alias matches, and pinned cards can never crowd
out prose evidence (budget ≈ 2-3 cards). First-degree relations fan-out
optional — open decision #2. "Who is Aria?" becomes: her card (pinned) + her
scenes (retrieved) — the generic-guess failure mode is structurally gone.
This also upgrades follow-ups ("what does SHE want") since cards ride
history-aware pinning from prior turns, and character chat can reuse the
same pinner for OTHER characters named mid-interview.

**Move 3 — scene chunks carry their links.** (Refined on the second pass —
the first draft said "prepend the header into the indexed text", which would
perturb every scene's EMBEDDING with name lists.) The refined shape: the
chunk gains a separate `links` line ("characters: Aria, Bren; location:
Customs House", from the scene's link fields); the server's BM25 scores over
text + links (one-line change where `api/rag.py:101-107` builds the item
text), the excerpt formatter renders the header for the LLM, and the
EMBEDDED text stays pure prose — keyword matching and the prompt get the
entity names, semantic vectors stay unpolluted, and no re-embed is needed at
all (vectors unchanged; only the stored chunk JSON gains a field). Fixes
"what location is this scene in" even when the prose never names it.

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

## 6. Second-pass notes (the re-derivation, 2026-07-10)

Re-deriving the fix from scratch confirmed the two-pronged shape: pinning
alone misses un-named entity questions ("who runs the customs house?" — needs
retrieval over cards), and cards-in-the-index alone can lose vague phrasings
to prose ranking — so Moves 1+2 are both load-bearing, not redundant. The
second look CHANGED Move 3 (links as a separate BM25+excerpt field instead of
embedded text — see the refined text above; strictly better and cheaper: no
re-embed). New risks the second look surfaced, for the build spec: (a)
common-word character names ("Rose", "Grace") could over-pin — the matcher
needs word-boundary + capitalization heuristics and a pin cap (≤2-3 entities
per ask) so pinned cards never crowd out prose evidence; (b) card retrieval
quality vs prose is unmeasured — the build must include a canned-question
retrieval probe over the demo book (assert the right card pins/ranks for
"who is X / where is Y / what group is Z in") before it ships.

## 7. Third-pass notes (the user's "one more pass", 2026-07-10)

The user asked for one more pass with fresh research ("the concept is just to
make rag work better"). What it CHANGED: (1) character-card appearances
became TEMPORAL lines (place + company per scene) because "where is X" is a
timeline question a static relations blob can't answer; (2) the pin cap
became a token BUDGET with exact-name>alias priority (the SillyTavern World
Info pattern); (3) `buildCharacterProfile` reuse is now specified as a voice
parameter (second person for the interview, third person for the card) —
one source, not a copy; (4) the options-considered set grew by three
precedents with sources (§3): SillyTavern lorebooks, Microsoft GraphRAG
(whose Local Search this design IS, minus the extraction cost — our graph
is hand-curated), and the long-context "include the whole bible"
alternative, examined against llama.cpp's verified prefix-cache behavior
and NOT chosen (scaling, per-source citations, cross-feature cache
fragility), with a ~500-token always-on "global digest" recorded as a
possible later complement. What it CONFIRMED: Moves 1+2+3 stand as the
build; scenes carry all three link kinds + POV (SceneLinks.vue:66-88,
RelationsView.vue:162-163) so every derived line in the cards is real data;
rerankers, query rewriting (HyDE/multi-query), and agentic lookup tools were
surveyed and deferred — each adds a model call or latency on writer
hardware before the corpus gap is even fixed.

## 8. The import→extraction connection (the user's follow-up, 2026-07-10)

The user asked whether GraphRAG's Local Search relates to OUR entity
extraction (import a PDF book → propose characters/objects). It does —
directly: the import + entity sweep IS the "graph construction" half of
GraphRAG for imported books (for hand-built projects the user constructs the
graph themselves). And grounding it exposed a REAL gap:

**What the sweep produces today (verified):** the per-chapter LLM scan
(`entityExtraction.js:48-130`, prompt `seed_feature_prompts.py:191-206`,
schema-enforced) proposes characters/locations/objects with name, role/kind,
oneLiner/note, and an evidence quote; the review modal's accept path
(`EntityReviewModal.vue:60-70`) then creates BARE entities:
`addCharacter({name, role, oneLiner})` / `addLocation({name, kind, note})` /
`addObject({name, kind, note})`. **No scene links are ever set** — the sweep
UI even knows the originating chapters at review time
(`EntitySweepModal.vue:168`) and drops that provenance on accept. No aliases
either.

**Why this matters to the RAG plan:** the relations web (shared
scenes/groups/strands) is what the character cards' co-appearance and
TEMPORAL lines derive from, and what the Relations graph draws. For an
IMPORTED book the sweep is the only graph-builder — so today an imported
book yields a bible of bare names: the Relations graph stays empty, and the
future RAG cards would carry a name + one line and no "where/with whom"
data. "Where is X" would stay unanswerable for imported books even after
Moves 1–3 ship.

**Proposed improvement (E-moves — extraction; awaits the user's go):**
- **E1 — keep the provenance through accept.** When an entity proposal is
  accepted, also set the presence links (`scene.characters` /
  `.locations` / `.objects`) for the scenes it appears in. Mechanism: a
  deterministic name/alias scan of scene text — the SAME word-boundary
  matcher Move 2's pinning needs (ONE shared matcher, T3) — not an extra
  LLM call; the LLM already found the names, linking is string matching.
- **E2 — a "link backfill" sweep.** A one-shot reviewable pass over ALL
  scenes proposing entity-presence links for projects that predate links
  (imported books AND old hand-built manuscripts). Same matcher; review
  list + tick-to-apply like the entity sweep; populates the Relations graph
  and makes the RAG cards rich retroactively.
- **E3 — the sweep prompt also proposes aliases** (small schema addition:
  `aliases: []` per character) — improves dedupe, pinning, and the E1/E2
  matcher for nickname-heavy prose.
- **E4 (later, defer) — relationship extraction proper** (GraphRAG's edge
  labels: "sister of", "employer of") into character extras/notes — heavier,
  LLM-driven, only worth it after E1-E3 prove out.

Sequencing: E1+E3 ride naturally WITH the RAG build (they share the
matcher); E2 is a small follow-on using the same pieces.
