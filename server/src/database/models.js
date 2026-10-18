// SPDX-License-Identifier: MIT
// The JustWrite database's tables — the port of justwrite_server/database/models.py.
//
// The book domain lives in real per-entity tables (docs/plans/2026-06-18-jw-p2-normalization-
// design.md), mirroring JustVoice's schema conventions: `position` ints for ordered
// collections, join tables for many-to-many, and JSON-TEXT columns ONLY for genuinely
// freeform 1:1 sub-payloads — never a whole entity as a blob.
//
// Key decisions:
// - **Composite PK `(project_id, id)`** on every per-project table. The renderer's ids
//   (`c1`, `ch4`, `scn_…`) must round-trip unchanged, and the seed demo reuses fixed ids that
//   could collide across projects — so an id is unique *within* a project, not globally.
// - **`project_id` FK → projects(id) ON DELETE CASCADE** is the one DB-level constraint; it
//   gives the project-delete cascade. Cross-entity integrity (clearing a chapter's strand
//   refs when a strand is deleted, re-anchoring notes when a scene is removed, …) stays in
//   the app layer — exactly where the renderer already enforces it.
//
// Every datum has its own typed table — the old `KvEntry` localStorage seam is gone.
// `projects.data` is the retired legacy snapshot blob column ("{}" on write).
// Pre-production there are NO migrations (user decree 2026-07-06): schema drift = drop the
// dev DB (or POST /v1/data/reset) + reseed.
//
// The tables themselves — the exact DDL Python's create_all writes and each column's kind
// and Python-side default — are GENERATED into models_schema.js by the kit's
// scripts/capture-schema.py (re-run it when a Python model changes, until Python is gone).
// What each table holds (from the Python models):
//   settings              one top-level section of the renderer's settings document per row
//                         (`key` = ui | ai | hardwarePresets | activeProjectId | auth | cors |
//                         autosaveDir | …; `value` = its JSON)
//   projects              a book's root metadata (the entities live in the tables below)
//   parts → chapters → scenes, scene_links (scene → character/location/object/strand),
//   chapter_strands, group_members, characters, locations, objects, groups, notes,
//   strands, strand_beats, worldbuilding, worldbuilding_categories, statuses, tag_vocab,
//   architecture          the book's entities (per project)
//   images, events        polymorphic per-entity attachments
//   project_artifacts     per-project AI artifacts (`kind` + `key`, freeform JSON)
//   trash                 soft-deleted entities (a tombstone payload — the one legit blob)
//   rag_meta, rag_vectors the per-project RAG index (vector + chunk as JSON) — NOT FK'd
//   chat_sessions, chat_session_messages
//                         chat SESSIONS (2026-07-20) and their ordered settled turns
//   chat_messages         LEGACY single-thread rows — read only by the one-time lift in
//                         api/chat_api.js, never written
//   chapter_versions      named, restorable snapshots of a chapter's scenes
//   image_blobs           uploaded image bytes (a content store, not project-scoped)
//   sessions, session_chapter_words, session_meta
//                         the writing-activity log (per install, not per project)
//   sweep_drafts          the entity sweep's per-project working draft

export { TABLES } from "./models_schema.js";

// Additive columns: an existing database gains a column added after it was made, without a
// reset (the kit's createTables runs `ALTER TABLE … ADD COLUMN` when it's missing). Each
// declaration matches its column in models_schema.js, so old and new databases end up alike.
// `[table, column, "SQL type + default"]`.
export const ADDED_COLUMNS = [
  // 2026-10-11: the scene's narration mode and story time (the Links panel) were never stored.
  ["scenes", "pov", "VARCHAR"],
  ["scenes", "when", "VARCHAR NOT NULL DEFAULT ''"],
  // 2026-10-11: the status picker and "Exclude from AI" on scenes and the story-world pages were
  // never stored either (worldbuilding already kept its status).
  ["scenes", "status", "VARCHAR NOT NULL DEFAULT ''"],
  ["scenes", "exclude_from_ai", "BOOLEAN NOT NULL DEFAULT 0"],
  ["characters", "status", "VARCHAR NOT NULL DEFAULT ''"],
  ["characters", "exclude_from_ai", "BOOLEAN NOT NULL DEFAULT 0"],
  ["locations", "status", "VARCHAR NOT NULL DEFAULT ''"],
  ["locations", "exclude_from_ai", "BOOLEAN NOT NULL DEFAULT 0"],
  ["objects", "status", "VARCHAR NOT NULL DEFAULT ''"],
  ["objects", "exclude_from_ai", "BOOLEAN NOT NULL DEFAULT 0"],
  ["groups", "status", "VARCHAR NOT NULL DEFAULT ''"],
  ["groups", "exclude_from_ai", "BOOLEAN NOT NULL DEFAULT 0"],
  ["worldbuilding", "exclude_from_ai", "BOOLEAN NOT NULL DEFAULT 0"],
  // 2026-10-16: the location, object and group sheets (the AI drafting spec §9.1) and the
  // scene's Summary (slice 3).
  ["scenes", "summary", "TEXT NOT NULL DEFAULT ''"],
  ["locations", "atmosphere", "TEXT NOT NULL DEFAULT ''"],
  ["locations", "history", "TEXT NOT NULL DEFAULT ''"],
  ["objects", "properties", "TEXT NOT NULL DEFAULT ''"],
  ["objects", "history", "TEXT NOT NULL DEFAULT ''"],
  ["objects", "where_now", "TEXT NOT NULL DEFAULT ''"],
  ["groups", "goals", "TEXT NOT NULL DEFAULT ''"],
  ["groups", "leadership", "TEXT NOT NULL DEFAULT ''"],
  ["groups", "history", "TEXT NOT NULL DEFAULT ''"],
  // 2026-10-18: slice 4's per-book switch, AI scene drafting (the AI drafting spec §9.7).
  ["projects", "ai_scene_drafting", "BOOLEAN NOT NULL DEFAULT 0"],
];
