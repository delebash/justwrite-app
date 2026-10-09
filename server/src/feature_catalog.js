// SPDX-License-Identifier: MIT
// JustWrite's AI feature catalog — the port of justwrite_server/feature_catalog.py.
//
// The canonical list of routable features with their human label, a one-line hint, and the
// nav group. A per-app feature seed (registered with the shared LLM stack via `installLlm`).
//
// The `group` is the nav group (display-only — how features are grouped in the UI). It is
// NOT the routing key: each action routes via its own preset ref (see
// seed_presets.DEFAULT_FEATURE_PRESETS, 2026-07-15 one-source model).
//
// Server-side + headless-first (the shared `/v1/ai/routing` endpoint serves it).

import { FeatureCatalogEntry } from "@delebash/llm-runner/llm/routing_api";

const e = (key, label, hint, group) => FeatureCatalogEntry({ key, label, hint, group });

// label = the ONE canonical name the user sees wherever they meet the feature
// (point-of-use wins, 2026-06-24): e.g. chat = "Ask the book". hint doubles as the
// Feature Workbench card blurb. LIST ORDER here IS the nav order. Multi-action features
// (writerAI, critique, multiReader, brainstorm) show their per-action labels
// (seed_feature_prompts ACTION_META) under the group; single-action features show this label.
export const FEATURE_CATALOG = [
  // ── Writing — the scene-editor AI menu (Rewrite / Expand / … + Line edits) ──
  e("writerAI", "Writer actions", "The AI menu in each scene's strip — Rewrite, Expand, Tighten, Continue, Describe, plus all Line edits.", "Writing"),
  // ── Drafting tools — get-unstuck / research / ideas ──
  e("sensory", "Research feel", "Structured sensory pack (smell / sound / touch / …) for a selected subject — the editor's “Research feel” modal.", "Drafting tools"),
  e("unstuck", "Unstuck", "Five ways to unblock the current scene — goal shift / interrupt / setting / reveal / time cut.", "Drafting tools"),
  e("brainstorm", "Brainstorm", "The Brainstorm view — name / title / freeform idea generation with thumbs-up steering.", "Drafting tools"),
  // ── Analysis — per-chapter passes ──
  e("critique", "Critique", "The Critique modal — line-level Notes (flags / suggestions / observations) and the Structure pass (tension, hook, pacing, ending).", "Analysis"),
  e("multiReader", "Multi-reader panel", "Four reader personas (genre reader / literary critic / agent intern / book-club reader) react to a chapter in parallel.", "Multi-reader panel"),
  // ── Whole book — draft-wide scans ──
  e("plotHoles", "Plot-hole audit", "Whole-book continuity scan for contradictions, timeline issues, and character-knowledge errors.", "Whole book"),
  e("reverseOutline", "Reverse outline", "Reads the whole draft and produces the act structure the book actually has — plot points, act breaks, per-chapter beats.", "Whole book"),
  e("beatSheet", "Beat sheet", "Maps your draft to Save the Cat, Hero's Journey, or 7-Point Story Structure beats.", "Whole book"),
  e("marketingPack", "Marketing pack", "Logline, back-cover blurbs, synopsis, and elevator pitch for querying and pitching.", "Whole book"),
  e("foreshadowing", "Foreshadowing scan", "Whole-book scan for setups that may not have paid off.", "Whole book"),
  e("readerKnowledge", "Reader knowledge", "Tracks dramatic irony — what the reader knows vs. what the POV character knows, chapter by chapter.", "Whole book"),
  e("voiceDrift", "Voice drift", "Diagnoses what shifted between an outlier chapter and the writer's baseline voice in the Analysis dashboard.", "Whole book"),
  // ── Characters / story bible ──
  e("entitySweep", "Entity sweep", "Scans chapters for new characters / locations / objects to add to the story bible.", "Characters"),
  e("characterAudit", "Character audit", "Per-character consistency audit (profile + their scenes → flagged actions) on the Characters view.", "Characters"),
  e("characterProfile", "Character profile", "Drafts a character's profile fields (description, motivation, arc, backstory) from their scenes — reviewed before anything saves.", "Characters"),
  e("characterVoice", "Character voice", "Drafts how a character speaks (register, rhythm, verbatim sample lines) from their actual dialogue — reviewed before anything saves.", "Characters"),
  e("relationshipArc", "Relationship arc", "Chapter-by-chapter warmth / tension / power tracking for a pair of characters.", "Characters"),
  // ── Chat ──
  e("chat", "Ask the book", "RAG question/answer over your manuscript — the chat panel's “Ask the book” mode.", "Chat"),
  e("characterChat", "Character chat", "The chat panel's “Talk to a character” mode — first-person, in-voice answers from your cast.", "Chat"),
  // ── Home ──
  e("briefing", "Resume briefing", "Generates the Home “Previously on your novel” recap card.", "Home"),
  e("recap", "Session recap", "End-of-day “Wrap up session” recap + open-thread suggestions.", "Home"),
];
