# 2026-07-11 — RAG + extraction BUILD plan (executes the armed go)

> ✅ **CLOSED (docs campaign 2026-08-04)** — RAG shipped (src/services/rag/* + server rag_search.py). History/evidence only; live work: `docs/dev/TASKS.md`.

The user's go (verbatim, 2026-07-11): *"i will take your recs, we need to
compact first."* This plan derives the task list from THE SPEC —
`docs/plans/2026-07-10-rag-story-bible-research.md` §10–§11 (four passes,
all citations there; this doc does not restate the research) — with the
taken recommendations locked in: **named-entity-only pinning (no 1-hop
fan-out) · no per-entity hide-from-AI flag (deferred) · sqlite-vec+FTS5
parked · PDF import not now**. Everything below is grounded in current
code at the cited lines (read 2026-07-11, this session).

Cross-repo scope: JustWrite (renderer `services/rag/*`, extraction,
import, ChatPanel, server `api/rag.py` + `seed_feature_prompts.py`) +
just-llm-runner (catalog embed templates: db/seed/stores/api) +
`@delebash/llm-ui` (embedTexts taskType).

---

## T1 — Move 0: per-model embed task templates (runner + kit + JW callers)

**WHY:** the live degradation (spec §9.1/§11.1): nomic REQUIRES
`search_document:` / `search_query:` prefixes on both sides; Qwen3-Embedding
wants a query-side instruction (~+22% relevance); grep-verified NOTHING in
the embed path applies any of it — chunks and questions embed bare on every
model. Catalog-driven so it covers all four seeded embeds and no-ops for
models that need none (incl. online embedders).

**Touch list:**
- `just-llm-runner/llm_runner/llm/db.py` — NEW table `ModelEmbedTemplate`
  (`model_id` String PK · `document_template` Text default "" ·
  `query_template` Text default "" · `built_in` Boolean). **FLAG F1
  (interpretation):** the spec phrased this as "the catalog row gains
  `embed_templates {document, query}`"; the shipped shape is a 1:1 child
  TABLE keyed by model_id, because (a) a NEW table is additive — `create_all`
  (install.py:82) picks it up on existing DBs with NO reset, while new
  COLUMNS on `model_catalog` have no migration machinery (grep-verified:
  no ALTER/add_column anywhere in llm_runner), and (b) the NO-JSON-blob
  standing rule wants two real TEXT columns, not a JSON field. Template
  strings carry a `{text}` slot; empty/absent = pass-through.
- `just-llm-runner/llm_runner/llm/seed.py` — seed rows (insert-if-missing,
  the ModelSampler/test_samples pattern): `nomic-embed-text` → document
  `"search_document: {text}"`, query `"search_query: {text}"`;
  `qwen3-embedding-0.6b` + `qwen3-embedding-8b` → document "" (plain), query
  `"Instruct: Given a question about a novel, retrieve passages and story
  bible entries that answer it\nQuery: {text}"` (task wording per the Qwen3
  paper's instruct format — user-editable; **FLAG F2:** the task sentence is
  my wording, flagged); `bge-m3` → no row (needs none, per the cited docs).
- `just-llm-runner/llm_runner/llm/stores.py` — store accessors:
  `embed_templates_for(model_id)`, list/upsert/delete (mirror the
  model-samplers store shape).
- `just-llm-runner/llm_runner/llm/model_catalog_api.py` — expose templates on
  the catalog row payload for embedding rows + an upsert/delete route
  (NOTHING-hardcoded law: user-editable).
- Kit `ui/src/views/...` model edit form (LuModelCatalog edit / ProviderForm
  model editor — exact component located at build): two template fields
  visible when `embedding` is true. Small, matches existing field rows.
- `just-llm-runner/llm_runner/llm/api.py:162-186` — `EmbeddingsRequest`
  gains `taskType: str = ""` (`"document"|"query"|""`); before
  `adapter.embed`, look up `body.model`'s template row; when the matching
  template is non-empty, wrap each input via `template.replace("{text}", t)`.
  No row / empty template / empty taskType → byte-identical passthrough
  (online models have no catalog row → automatically untouched).
- Kit `ui/src/services/embedApi.js:131-154` — `embedTexts` gains `taskType`,
  passed through in the POST body.
- JW callers: `services/rag/indexer.js:64` (embedAndPersist batch call) →
  `taskType: "document"`; `services/rag/chat.js:115` +
  `services/rag/characterChat.js:139` (query embeds) → `taskType: "query"`.
  (BM25's `queryText` stays RAW — templates apply only to the embedding rail.)

**Rebuild story (decided in the spec §9.1, improved on the second pass):**
document vectors change → ONE full re-embed, shipped together with Move 1's
new card chunks. The re-embed is AUTOMATIC: Move 3 changes every scene
chunk's sha shape (sha over text+links), so the first incremental update
after ship re-embeds every scene through the normal diff path
(indexer.js:113-119) — no forced-rebuild machinery, no reliance on the user
pressing Rebuild (though whats-new still names Rebuild as the
do-it-now option). Recorded limitation: a user EDITING a template later
must hit Rebuild manually (the sha-diff hashes chunk content and cannot see
template changes).

**Acceptance criteria:** runner pytest covers — template applied on
document + query task types for a seeded model; pass-through for bge-m3,
unknown/online model ids, empty taskType; seed rows present after
seed; upsert/delete round-trip via the API. Kit/JW: a vitest case asserts
embedTexts forwards taskType. The probe (T7) asserts the templated text
reaches the embeddings endpoint on an index build (document) and an ask
(query) — **this leg must run against a SEEDED catalog embed model
(nomic-embed-text, 84 MB, CPU-fine) so a template row exists; an arbitrary
test provider would pass through and the assertion could never fire**
(panel note). Existing DB boot picks the new table up with no reset
(verified live in-container against the dev DB).

## T2 — Move 1: story-bible card chunks (JW)

**WHY:** the corpus gap is THE root cause of the user's report — the index
is scenes-only (chunker.js:46-81); "who is X" must be guessed from prose.
Cards make the hand-curated bible retrievable (GraphRAG-with-a-hand-built-
graph, spec §3).

**Touch list:**
- NEW `src/renderer/src/services/rag/cards.js` — THE card-builder module:
  `buildEntityCards(project)` → array of card chunks
  `{ id: "card:<kind>:<entityId>[:pN]", kind, entityId, title, text }`.
  Kinds + content (every derived line from real store fields, verified at
  build against the state factory project.js:534-585):
  - **character** — `buildCharacterProfile(character, extras, { voice: "third" })`
    (the EXISTING builder in characterChat.js:28-71 gains a `voice`
    parameter — second person for the interview persona, third person for
    cards; ONE source, labels/pronouns switch, interview output byte-stable
    when voice is omitted) + group memberships + strand beats naming them +
    the entity's events + the TEMPORAL appearances section — one line per
    scene the character is linked in: "Ch N, scene 'T' — at <locations>,
    with <co-linked characters>[, POV]" from scene.characters/.locations/
    .objects/.pov (write path: SceneLinks.vue:36-54 update/toggle; the
    spec's :66-88 cite is the inline-create block of the same panel).
  - **location / object** — name, kind, note, tags + which chapters/scenes
    link them + group memberships.
  - **group** — name, blurb, member list with kinds.
  - **worldbuilding** — title, category, body; long articles split into
    `:p1/:p2…` card chunks (~1500-char parts — the excerpt truncation at
    excerpts.js:24 is 1200, so parts stay fully visible).
  - **note / strand / architecture / events** — notes (title+body+anchor
    label); strands (name, blurb, beats with scene refs); the architecture
    docs (premise/fabula/setting — one card per doc); per-entity event
    timelines fold into their owner's card, and orphan/global timelines (if
    the shape at build shows any) get their own card. **FLAG F3:** exact
    per-kind field lists are finalized at build from the live state shapes —
    additive detail, not a design change.
- `services/rag/chunker.js` — `chunkProject()` appends
  `buildEntityCards(project)` output after scene chunks; `chunkProjectAsync`
  shas them identically. Scene `excludeFromAi` law unchanged; cards carry no
  exclude flag (rec taken: deferred).
- `services/rag/excerpts.js:14-30` — kind-aware headers: card chunks render
  `Story Bible — Character: Aria` (per-kind label map); scene chunks
  unchanged byte-for-byte. **ONE exported `citationLabel(chunk)`** is the
  single label source (panel catch): `formatExcerpts` AND ChatPanel's
  citation row both import it — today the row's inline template
  (ChatPanel.vue:424-427) is a drifted DUPLICATE of the excerpt header
  (different punctuation/fallbacks); it converges onto the export instead
  of gaining kind-awareness independently.
- `components/ChatPanel.vue:324-325` — citation click-through: card
  citations navigate to the entity's page (route per kind, verified against
  router/index.js at build; worldbuilding/architecture/notes go to their
  views); scene citations unchanged. Citation row label = the shared
  `citationLabel` export above.
- `server/justwrite_server/seed_feature_prompts.py:920-929` — the "chat"
  system prompt notes excerpts may be Story Bible entries (cite them the
  same bracketed way; bible entries are the author's own reference notes).
  "Use ONLY the provided excerpts" stays. **FLAG F4 (mechanism, panel-
  corrected):** prompt seeding is insert-if-missing (llm_runner
  seed.py:1001-1008), so the new text can't reach an existing DB by itself;
  ship the QC-43a stale-heal pattern for PROMPTS with the HOST/SHARED
  boundary respected — the old→new prompt-text MAP is HOST data (JW passes
  `feature_prompt_heals` through `configure_app_seed`/`install_llm`
  alongside `feature_prompts`, seed.py:33-47 + app.py:163-185); only the
  GENERIC exact-old-text heal loop lives in the runner's
  `seed_default_feature_prompts` — no JW prompt text ever enters the shared
  runner seed (the architecture-lens FAIL, fixed here). A user-edited
  prompt (text ≠ old seed byte-exact) is never touched. characterChat's
  prompt is NOT changed (its rules already scope knowledge; cards appearing
  among its excerpts is intended — Move 2 serves other-character cards
  there).

**Non-work confirmed by the spec §9.4:** no forced rebuild needed for cards
alone (sha-diff adds them incrementally — indexer.js:112-119); entity
deletes remove cards via the same diff (`toRemove`); the auto-index watcher
(autoIndex.js:59-65) already re-embeds an edited entity's card since it
subscribes to ALL store mutations.

**Acceptance criteria:** vitest — cards built for every kind from a
fixture project (field content asserted, incl. the temporal lines +
worldbuilding split + third-person profile voice); chunker output = scenes
+ cards with stable ids; excerpts renders kind-aware headers; interview
profile (voice omitted) byte-identical to pre-change. Probe (T7) — a card
citation click lands on the entity page; "who is X" retrieves/pins the card.

## T3 — Move 2: deterministic entity pinning (JW)

**WHY:** for named-entity questions, deterministic name→card injection beats
similarity every time (Novelcrafter/SillyTavern precedent, spec §3). The
user's rec taken: pin the NAMED entity's own card only — no 1-hop fan-out
(relations are already IN the card text).

**Touch list:**
- **Normalizer convergence FIRST (panel catch, T3):** there are THREE
  byte-identical name normalizers today — `norm()` at
  `services/analysis/entityExtraction.js:17-24`, `normName()` at
  `services/analysis/entitySweep.js:21-28`, `norm()` at
  `services/analysis/foreshadowingScan.js:46-48`. Extract ONE shared
  `normalizeName()` into `services/text.js` (the established shared-text
  home from I1) and repoint all three importers — the matcher imports it
  too; a fourth copy is forbidden.
- NEW `src/renderer/src/services/rag/entityMatcher.js` — THE shared
  word-boundary name/alias matcher (also used by E1/E2): build once per call
  from the store (characters + `aliases`, locations, objects, groups,
  worldbuilding titles, strands); `matchEntities(text, entities)` → hits
  with `{ kind, entityId, matched, exact }`. **Options considered (panel
  catch, T4):** the existing precedent is `chapterMentionsTerm`
  (foreshadowingScan.js:54-63) — single-token terms match at word
  boundaries (the "key"/"monkey" guard), multi-word terms as substrings.
  The matcher builds ON that primitive: extract the word-boundary test into
  the shared module and have foreshadowingScan import it (converge, don't
  parallel-author). What `chapterMentionsTerm` does NOT have and the
  matcher adds: many-entities-at-once scanning, alias sets, exact-vs-alias
  ranking, and the common-word guard. Guards (spec §6 risk a):
  word-boundary over case-normalized text, BUT a single-token name that is
  also a common lowercase word in the text (e.g. "Rose") only matches its
  capitalized form. **FLAG F5:** the common-word heuristic (capitalization
  requirement for single-word names) is my design within the spec's stated
  risk — flagged.
- `services/rag/chat.js` (askManuscript, after `search` at :132) — pin:
  matcher over question + recent user turns (history-aware); exact-name
  hits ranked before alias hits; build each hit's card via `cards.js` (the
  SAME builder the index used → identical text) under a TOKEN BUDGET
  (~1200 estimated tokens ≈ chars/4, ≈ 2-3 cards — seeded constant in the
  module, not user-facing); dedupe retrieved hits that are the same card id;
  pinned cards prepend as excerpts [1..n], retrieval keeps its k (pins are
  additive — "her card pinned + her scenes retrieved"). Citations array
  includes pins (`pinned: true` on the citation for the UI's benefit,
  score omitted).
- `services/rag/characterChat.js` — same pinner, excluding the interviewee
  (their profile is already the system prompt).

**Acceptance criteria:** vitest — word-boundary (no substring hits), alias
matches, exact>alias priority, budget cap honored, common-word guard,
history-aware match from a prior turn, interviewee excluded, dedupe against
retrieved card. Probe (T7) — "who is <demo character>?" answers with the
card pinned as [1].

## T4 — Move 3: scene chunks carry their links (JW + JW server)

**WHY:** "what location is this scene in" fails when the prose never names
it; the links exist on the scene record and cost nothing to surface.
Embeddings stay pure prose (spec second pass) — no re-embed of the ship.

**Touch list:**
- `services/rag/chunker.js` — scene chunks gain `links` (one line,
  "Characters: … · Location: … · Objects: … · POV: …", ids resolved to
  names from the store; empty string when unlinked). **Sha covers
  text + links** (`sha1Hex(text + "\n" + links)`): a link edit re-uploads
  (and redundantly re-embeds — same text, same vector, ~1 scene per edit,
  negligible) so the server copy can never go stale; ONE diff mechanism,
  no special path. Existing vectors stay valid at ship (text unchanged);
  the first post-ship incremental re-uploads chunks whose sha changed
  shape — acceptable, it rides the same rebuild the user already does for
  Move 0. **FLAG F6:** the sha-covers-links choice (the spec said "no
  re-embed needed at all"; this keeps that true at ship and trades one
  redundant same-text embed per later link-edit for a stale-proof server
  copy).
- `server/justwrite_server/api/rag.py:101-107` — BM25 scoring text becomes
  `chunk.text + " " + chunk.links` where the search items are built
  (`"text": chunk.get("text","") + …`); vectors, stored chunk, and the
  returned payload unchanged.
- `services/rag/excerpts.js` — scene excerpts render the links line under
  the chapter/scene header (only when non-empty).

**Acceptance criteria:** JW server pytest — a search where the query term
appears only in `links` ranks that chunk (BM25 leg); vitest — chunker emits
links + sha shape, excerpts renders the line. Probe — "where does <scene>
take place" style canned question resolves via links.

## T5 — E1 + E2 + E3: extraction keeps the graph (JW)

**WHY:** for imported books the sweep is the only graph-builder, and today
its accept path drops everything but bare names (EntityReviewModal.vue:56-76
— no links, no aliases; provenance visible at review time then discarded).
Without this, Moves 1-3 stay data-starved on imported books.

**Touch list:**
- **E3 (aliases):** `seed_feature_prompts.py:191-208` `_ENTITY_SYSTEM` — the
  characters array gains `"aliases": [<other names used in the text>]`; the
  json_schema mirror gains the property on the INLINE character item schema
  (seed_feature_prompts.py:229-238) — NOT on `_ENTITY_ITEM` (:216-225),
  which is the shared locations/objects item and must not grow an aliases
  field (panel catch). The same F4 prompt-heal mechanism carries the new
  text to unedited existing DBs. `services/analysis/entityExtraction.js`
  `clean()` (:103-123) keeps a validated `aliases: []`; the sweep merge
  (`services/analysis/entitySweep.js:39-56`) unions aliases across chapters.
  `EntityReviewModal.vue` shows an editable aliases field on character rows;
  accept passes `aliases` into `addCharacter` (the character shape already
  carries `aliases` — characterChat.js:34 reads it).
- **E1 (accept sets presence links):** NEW batched store action
  `applyScenePresenceLinks(entries)` in `stores/project.js` — entries =
  `[{ chapterId, sceneId, field: "characters"|"locations"|"objects", id }]`,
  merged into scene records under ONE `_record("applyScenePresenceLinks")`
  (ACTION_DOMAINS + one entry: `"manuscript"` — same domain as updateScene,
  project.js:374-379; NOT added to COALESCED_ACTIONS). EntityReviewModal's
  `commit()` — for each accepted proposal, run the shared entityMatcher over
  the scenes of its `originChapters` (the provenance the modal already holds,
  :86-88) with the accepted name + aliases; collect matches; apply via the
  ONE batched action after the entities are created. No LLM call.
- **E2 (reviewable link-backfill sweep):** NEW
  `components/LinkBackfillModal.vue` — a no-LLM pass over ALL scenes × all
  bible entities via the same matcher; proposals grouped per entity (which
  scenes would gain which link), tick-to-apply (default ticked like the
  entity sweep), apply via `applyScenePresenceLinks`; never auto-applies
  (spec: common-name risk). Mounted beside the existing Entity-sweep entry
  point (the discoverable sweep button — precedent + exact mount verified at
  build; same modal grammar as EntitySweepModal). **FLAG F7:** entry-point
  placement + label ("Link scenes to the story bible…" or similar) is my
  wording, flagged.

**Acceptance criteria:** vitest — clean() keeps/validates aliases; the
E1 path produces the right link entries from a fixture (matcher-driven,
alias hit included) and ONE history entry; store action merges without
duplicating existing ids; **an E2 apply-path case** — backfill proposals
built over a fixture project apply through `applyScenePresenceLinks` and
set exactly the ticked links (panel note: E2 must have its own assertion,
not ride the smoke alone). Probe/smoke — the review modal renders the
alias field; accepting a proposal visibly sets the scene links (probe
asserts the scene record). Pytest — schema accepts the aliases property on
the character item only.

## T6 — E5: scene-break splitting on import (JW)

**WHY:** imported chapters land as ONE scene (project.js:939-943) — one
diluted embedding per chapter and a 1200-char excerpt window means the LLM
sees only each imported chapter's opening (spec §9.2); links + temporal
lines land at chapter grain.

**Touch list:**
- NEW pure function `splitHtmlIntoScenes(html)` in
  `src/renderer/src/services/sceneSplit.js` (DOM-based, vitest-testable).
  **Options considered (panel catch, T4):** the ONE existing HTML→scenes
  splitter is `splitChapter` (`services/chapterStitch.js:54-110`) — it
  splits on `data-scene-boundary` atom divs (the editor's stitched shape)
  and already handles leading-orphan content and body trimming. Imported
  HTML carries VISIBLE text markers ("* * *", `<hr>`…), not boundary atoms
  — so `splitHtmlIntoScenes` is a marker-normalizing PRE-PASS that converts
  each detected break marker into a `data-scene-boundary` div and then
  DELEGATES to `splitChapter` (one splitter, records in the same
  `{title, body}` shape; no parallel split logic). Marker set: a paragraph
  whose text is only asterisks/hashes/dashes with optional spaces
  ("* * *", "***", "#", "— — —"), an `<hr>`, or an existing `.scene-mark`
  paragraph; the marker is consumed (the boundary replaces it — matching
  how the stitcher re-inserts `<p class="scene-mark">* * *</p>`,
  project.js:697). Runs of empty paragraphs are NOT a break by themselves
  (too many false positives in real docx exports). **FLAG F8:** the exact
  marker set is my curation of the manuscript-standard forms, flagged.
- `stores/project.js` `importChapters` (:915-961) — each imported chapter's
  html runs through the splitter; one scene per segment (scene titles empty;
  a single-segment chapter keeps today's title-mirror behavior exactly).

**Acceptance criteria:** vitest — splitter cases (each marker form, marker
consumed, no-marker → one scene, leading/trailing empties trimmed);
importChapters produces N scenes for a marked chapter and byte-identical
single-scene output for an unmarked one (regression).

## T7 — acceptance probe + full gates

- NEW committed `scripts/rag-probe.mjs` (copies `findChrome()` from
  headless-smoke.mjs — never hardcode the browser path; full DB restore
  after, byte-exact, the standing probe discipline). Legs: create the demo
  book (POST /v1/projects/demo); register a deterministic test embedding
  provider (or the dev-seeded tiny CPU embed — decided at build by what the
  container runs fastest; the probe asserts RANKINGS, per spec §11.3);
  build the index; assert — (1) the canned-question set: "who is X" pins X's
  card as [1]; "where is Y in chapter N" answers from links/temporal lines;
  "what group is Z in" retrieves the group/character card; "who runs the
  customs house" (un-named entity phrasing) retrieves a bible card by
  similarity alone; (2) the embeddings request carried the templated
  document/query text; (3) a card citation click-through lands on the
  entity page; (4) the scene-links line renders in an excerpt-backed
  citation; (5) E1: accepting a seeded proposal sets scene links.
- The standing gates: `npm run test:unit` · `npm run build:vite` · FULL
  headless smoke (zero JS errors) · the probe fleet (qcbatch, b5, qc35,
  qc-quintet, b4, switch, dl2, b29, chip, undo, zero-project) · biome on
  the diff · JW server pytest + ruff · runner pytest + ruff · one GENUINE
  rules-checker diff verdict per code commit (environment lessons: verdict
  notification adjacent to the commit; doc-only commits exempt).

## T8 — docs (ship with the features, T11)

- `docs/whats-new.md` — Ask the book knows the story bible + cite/click
  behavior + "hit Rebuild once" note; import scene-splitting; sweep aliases
  + link-keeping.
- The help corpus page covering Ask the book (located at build in
  `services/helpDocs.js` sources) — bible cards, pinning, citations.
- `just-llm-runner/docs/models.md` — the embed-template fields on embedding
  models (user-facing models doc law).
- `CLAUDE.md` (JW) — the AI-providers section's RAG sentence stays accurate
  (touch only if wording goes stale).
- This plan doc committed with the work; the queue doc gets the BUILD
  RECORD (full prose, flags F1-F8, verify results) + the recap GO pointer —
  same commit series (recap protocol).

## Sequencing + commits

Build order T1 → T2 → T4 → T3 → T5 → T6 → T7/T8 (chunker work lands in one
coherent series; pinning rides the card builder; extraction rides the
matcher). Commits per repo at natural seams (runner/kit Move 0 first, then
the JW series), each code commit verdict-gated. Both repos on
`claude/admiring-galileo-il3q0o`.

## Flags (each reverts on a word)

- **F1** embed templates live in a 1:1 child table (`model_embed_templates`),
  not columns on `model_catalog` — the no-reset additive shape.
- **F2** the Qwen3 query-instruction task sentence (my wording, editable).
- **F3** exact per-kind card field lists finalized at build from live state
  shapes.
- **F4** prompt changes reach existing DBs via a QC-43a-style
  exact-old-text heal; user-edited prompts never touched.
- **F5** the common-word pin guard (capitalized-form requirement for
  single-token names) — REFINED at build: the capitalization requirement
  applies only when the text uses capitals at all; an all-lowercase question
  ("who is rose?" — the lazy-typing chat norm) still matches, because
  capitalization carries no signal there. "The rose garden" (capitals
  present, occurrence lowercase) still never pins Rose.
- **F6** scene-chunk sha covers text+links (stale-proof server copy; one
  redundant same-text embed per link edit).
- **F7** the E2 backfill entry point placement + label.
- **F8** the import scene-break marker set.

## PANEL ROUND (2026-07-11, pre-build — the required load-bearing-design check)

Three independent rules-checkers ran on this plan with diverse lenses.
**Architecture-fit lens: FAIL(1)** — the F4 prompt-heal map would have
crossed the host/shared boundary (JW prompt text baked into the runner
seed); FIXED: the old→new map is HOST-provided via
`configure_app_seed`/`install_llm`, only the generic exact-old-text heal
loop lives in the runner seeder. Its minor notes (aliases belong on the
inline character schema :229-238, not `_ENTITY_ITEM`; the SceneLinks line
ref) are folded in. **Reuse/convergence lens: FAIL(2)** — (T3) three
byte-identical normalizers exist (entityExtraction :17-24, entitySweep
:21-28, foreshadowingScan :46-48) and the citation label is already
drifted duplication (excerpts.js:22 vs ChatPanel.vue:424-427); FIXED: ONE
shared `normalizeName()` in services/text.js repointing all three + the
matcher, and ONE exported `citationLabel(chunk)` consumed by both
formatExcerpts and the ChatPanel row. (T4) `sceneSplit` and
`entityMatcher` lacked Options-considered notes; FIXED: sceneSplit is now
a marker-normalizing pre-pass DELEGATING to chapterStitch's `splitChapter`
(:54-110), and the matcher builds on `chapterMentionsTerm`
(foreshadowingScan :54-63), extracting its word-boundary primitive to the
shared module. **Grounding lens: PASS** — 30+ file:line cites verified
exact; its build-time notes folded in (the probe's template-assertion leg
must run a SEEDED catalog embed model; an explicit E2 apply assertion; the
kit form round-trip is asserted at the API layer). A second-pass find also
folded in: Move 3's sha-shape change makes the Move-0 one-time re-embed
AUTOMATIC through the incremental diff path.
