# JustWrite P2 — Real Normalization (design)

**2026-06-18.** Supersedes the shallow first cut of P2 (one `projects` table
with the whole book in a `data` JSON blob + read-only `/chapters`,
`/characters` projections). That was not normalization — it was the kv with
extra columns. This is the genuine domain model, grounded in a file-by-file
read of **both** schemas (not from memory).

## What I verified (no guessing)

- **JustVoice is genuinely normalized.** `server/justvoice/database/models.py`
  = **24 real tables** with parent→child FKs (`projects→scenes→blocks`,
  `personas→persona_channels`, `lexicons→lexicon_entries`,
  `generations→takes→generation_versions`, `render_jobs→render_job_blocks`,
  `stories→story_items`), `position` ints for ordering, composite-PK **join
  tables** for M2M (`project_personas`, `persona_channels`), and
  `ON DELETE CASCADE`/`SET NULL`/`RESTRICT` chosen per relationship.
- **JV uses JSON-TEXT columns sparingly and deliberately** — only for
  genuinely freeform 1:1 sub-payloads (`metadata_json`, `effects_chain`,
  `delivery_json`, `device_ids_json`, `loss_history_json`), **never** for a
  whole entity. UUID/string PKs; `created_at`/`updated_at`.
- So the bar was never "match the blob" — JV has no blob. The bar is JV's
  actual pattern: **typed columns + child tables + join tables; JSON only for
  freeform sub-payloads.**

- **JustWrite's complete domain** (read in full from
  `src/renderer/src/stores/project.js` + `src/renderer/src/domain/seed.js`):
  project root metadata; `parts → chapters → scenes`; scene→entity link sets
  (characters/locations/objects/strands); chapter↔strand sets; characters
  (+ 1:1 freeform `extras`); locations; objects; groups (polymorphic
  members); notes (anchored to chapter/scene); strands (+ child beats);
  worldbuilding (+ user-defined categories); architecture docs; user-defined
  statuses; per-kind tag vocabularies; polymorphic images + events; a set of
  per-project AI artifacts (reverseOutline, plotHoles, marketingPack,
  beatSheets, dailyRecaps, relationshipArcs, voiceCanon, worldRules); and a
  soft-delete trash bucket per kind.

## The JW-specific insight (why this is NOT just a copy of JV)

JV's renderer reads/writes **individual entities** over REST. JW's renderer
is the opposite: **one in-memory reactive Pinia store holding the entire
book**, with **snapshot-based undo/redo** (`HISTORY_SLICES` deep-cloned on
every mutation) and ~600ms keystroke coalescing. It loads the whole book at
once and, today, **re-serializes the entire book on every `_persist()`**.

Consequences that drive the design:

1. **The writing app WANTS the whole book in memory** (search, outline,
   analysis, undo all operate cross-book). So "granular reads" are not a
   desktop win — load-the-whole-book at boot stays, and is correct.
2. **Normalization's real wins for JW are:** (a) a genuine queryable model +
   **per-entity REST** for an external/mobile consumer, and (b) **incremental
   writes** so a keystroke stops re-serializing a 200k-word book.
3. Therefore the migration **keeps the in-memory store + undo/redo intact**,
   changes only the **persistence seam**, and adds the real tables + APIs
   behind it. We do NOT rewrite the store into per-entity reactive loads
   (that would wreck undo and add typing latency — explicitly forbidden by
   the decision doc).

## Schema (per-project; every table FK `project_id → projects(id)` CASCADE)

Convention mirrors JV: `position` ints for ordered collections, JSON-TEXT only
for freeform 1:1 payloads, camelCase on the wire.

**PK + integrity decision (finalized in implementation):** composite PK
`(project_id, id)` on every per-project table — the renderer's ids (`c1`,
`ch4`, `scn_…`) must round-trip unchanged, and the seed demo reuses fixed ids
that could collide across projects, so an id is unique *within* a project.
`project_id` FK → `projects(id) ON DELETE CASCADE` is the one DB constraint
(gives the project-delete cascade); cross-entity refs (`part_id`,
`chapter_id`, anchors, `strand_id`, …) are plain columns with integrity kept
in the app layer — exactly where the renderer already enforces it — to avoid
composite-FK complexity. Implemented in `models.py` + `book_io.py`
(assemble/decompose); round-trip verified by `tests/test_book_io.py`.

**Structure**
- `projects` — id, title, author, subtitle, genre, words_goal, daily_target,
  words_written, started_on, deadline, premise, world_rules, cover_image_json,
  created_at, updated_at.
- `parts` — id, project_id, position, title.
- `chapters` — id, project_id, part_id, position, num, title, words, status,
  is_voice_canon, critique_json, reader_knowledge_json, multi_reader_json.
- `scenes` — id, project_id, chapter_id, position, title, body (TEXT/HTML).

**Relationships (join tables — the real win over the blob)**
- `scene_links` — (scene_id, kind, ref_id) PK, project_id, position. kind ∈
  character|location|object|strand. Makes "which scenes feature X" a real
  query (Relations view, `speakersByChapter`) instead of scanning a blob.
- `chapter_strands` — (chapter_id, strand_id) PK, project_id, position.
- `group_members` — (group_id, kind, ref_id) PK, project_id, position.

**Entities**
- `characters` — id, project_id, position, name, main, age, gender, pronouns,
  life_status, one_liner, role, aliases_json, tags_json, extras_json,
  audit_json. (`extras_json` = the rich 1:1 voice/arc/motivation/backstory/
  quotes blob — JSON column, exactly JV's `metadata_json` precedent.)
- `locations` — id, project_id, position, name, kind, note, tags_json.
- `objects` — id, project_id, position, name, kind, note, tags_json.
- `groups` — id, project_id, position, name, blurb, color.
- `notes` — id, project_id, position, title, body, tag, updated_at,
  anchor_chapter_id (nullable FK), anchor_scene_id (nullable FK). (Anchor as
  two nullable FKs → `notesForChapter`/`notesForScene` become indexed.)
- `strands` — id, project_id, position, name, color, blurb, body, status.
- `strand_beats` — id, strand_id, project_id, position, chapter_id (nullable),
  scene_id (nullable), label, note.
- `worldbuilding` — id, project_id, position, category_id, title, status,
  words, summary, body, tags_json, related_json.
- `worldbuilding_categories` — id, project_id, position, label, icon, hue.
- `statuses` — id, project_id, position, label, color.
- `tag_vocab` — id, project_id, kind, position, label.
- `architecture` — id, project_id, position, title, blurb, status, words, body.

**Polymorphic attachments**
- `images` — id, project_id, entity_kind, entity_id, position, added_at,
  data_json.
- `events` — id, project_id, entity_kind, entity_id, position, when, title,
  note.

**AI artifacts (freeform, individually addressable)**
- `project_artifacts` — (project_id, kind, key) PK, data_json, updated_at.
  kind ∈ reverseOutline|plotHoles|marketingPack|beatSheet|dailyRecap|
  relationshipArc; key = '' for singletons, dayKey/templateKey/pairKey else.
  Regenerating one beat sheet writes one row, not the book.

**Soft delete**
- `trash` — id, project_id, kind, payload_json, deleted_at. The one
  legitimate blob: a tombstone of a removed entity + its restore metadata,
  heterogeneous by nature.

~22 tables — same order as JV's 24. (RAG's `rag_meta`/`rag_vectors` from P3
already follow this convention.)

## APIs

- **Aggregate seam (drop-in for `projectApi` today):**
  - `GET /v1/projects/{id}/book` → assemble all tables into the snapshot JSON
    the store already expects (`exportSnapshot` shape).
  - `PUT /v1/projects/{id}/book` → decompose + upsert transactionally, content-
    diffing so only changed rows are touched.
- **Per-entity REST (the "load book → see JSON" the user wants + mobile):**
  `GET/PUT/DELETE /v1/projects/{id}/{chapters|scenes|characters|locations|
  objects|strands|notes|worldbuilding|groups|…}` returning structured JSON.

## Migration

1. One-time: existing `projects.data` blobs → decompose into tables on first
   boot of the new server (idempotent; the `PUT /book` decompose path reused).
2. Renderer: re-point `projectApi.getSnapshot/putSnapshot` from
   `/v1/projects/{id}` (blob) to `/v1/projects/{id}/book`. **Store shape
   unchanged.** Then convert the hot path (scene body/title) to granular
   `PUT /scenes/{id}` so typing no longer re-PUTs the book.

## Staging (RULE #2 — one slice, verified before the next)

- **P2.1** Server schema (all tables) + assemble (`GET /book`) + decompose
  (`PUT /book`) transactional upsert with content-diff. pytest: round-trip the
  seed book; assert per-entity rows + byte-stable reassembly. **Inert — does
  not touch the renderer.**
- **P2.2** One-time blob→tables migration + boot decompose. pytest.
- **P2.3** Per-entity read/write REST. pytest.
- **P2.4** Renderer: repoint projectApi boot+save to `/book`. Verify via the
  headless harness (book loads, edits persist, undo intact, no typing latency).
- **P2.5** Renderer: incremental hot-path writes (scenes) + dirty tracking.
  Verify typing latency + persistence.

## Non-goals for P2 (kept honest)

- App-level config (AI providers, appearance, studio cast/queue, sessions)
  stays out of these tables — providers get a real table/API in **P5**
  (mirroring JV's `llm_providers_api`); appearance/ui prefs stay a simple
  store, consistent with JV keeping settings in `settings.json` rather than
  the relational DB.
- No change to undo/redo, keystroke coalescing, or the editor — renderer-side
  and staying that way.
