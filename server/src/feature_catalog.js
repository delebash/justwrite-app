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

import { FeatureCatalogEntry } from "@delebash/core/llm/routing_api";

const e = (key, label, hint, group) => FeatureCatalogEntry({ key, label, hint, group });

// label = the ONE canonical name the user sees wherever they meet the feature
// (point-of-use wins, 2026-06-24): e.g. chat = "Ask the book". hint doubles as the
// Feature Workbench card blurb. LIST ORDER here IS the nav order. Multi-action features
// (writerAI, critique, multiReader, brainstorm) show their per-action labels
// (seed_feature_prompts ACTION_META) under the group; single-action features show this label.
export const FEATURE_CATALOG = [
  // ── Writing — the scene-editor AI menu (Rewrite / Expand / … + Line edits) ──
  e("writerAI", "Writer actions", "The AI menu in each scene's strip — Rewrite, Expand, Tighten, Continue, Describe, Rewrite with direction…, Continue with direction…, Write dialogue…, plus all Line edits.", "Writing"),
  // ── Scene drafting (2026-10-18, slice 4) — its own row so it can run on another model ──
  e("sceneDrafting", "Scene drafting", "Draft from plan in a scene's AI menu: the scene drafted from its Summary and the story context, from the cursor to its end — only in a book with AI scene drafting on (Settings → Project).", "Writing"),
  // ── Drafting tools — get-unstuck / research / ideas ──
  e("sensory", "Research feel", "Structured sensory pack (smell / sound / touch / …) for a selected subject — the editor's “Research feel” modal.", "Drafting tools"),
  e("unstuck", "Unstuck", "Five ways to unblock the current scene — goal shift / interrupt / setting / reveal / time cut.", "Drafting tools"),
  e("brainstorm", "Brainstorm", "The Brainstorm view — name / title / freeform idea generation with thumbs-up steering — plus Name ideas at a name box, Suggest characters and Suggest locations on their pages, and a strand's next beats and plot twists on the Plot board.", "Drafting tools"),
  // ── Planning (2026-10-16, slice 3) ──
  e("planning", "Planning", "Summarize this scene, Fill this template for my story on the Plot board, and Draft from the premise on the Fabula and Setting — reviewed before anything saves.", "Drafting tools"),
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
  e("characterProfile", "Character profile", "Drafts a character's profile fields (description, motivation, arc, backstory) from their scenes, from your description, or a sheet section at a time — reviewed before anything saves.", "Characters"),
  e("characterVoice", "Character voice", "Drafts how a character speaks (register, rhythm, sample lines) from their actual dialogue, or from your description — reviewed before anything saves.", "Characters"),
  e("relationshipArc", "Relationship arc", "Chapter-by-chapter warmth / tension / power tracking for a pair of characters.", "Characters"),
  // ── Story world — the location, object and group sheets and Worldbuilding (2026-10-16) ──
  e("storyWorld", "Story-world sheets", "Drafts a location's, object's or group's sheet from your description, and a worldbuilding article's body from its title and summary — reviewed before anything saves.", "Story world"),
  // ── Chat ──
  e("chat", "Ask the book", "RAG question/answer over your manuscript — the chat panel's “Ask the book” mode.", "Chat"),
  e("characterChat", "Character chat", "The chat panel's “Talk to a character” mode — first-person, in-voice answers from your cast.", "Chat"),
  // ── Home ──
  e("briefing", "Resume briefing", "Generates the Home “Previously on your novel” recap card.", "Home"),
  e("recap", "Session recap", "End-of-day “Wrap up session” recap + open-thread suggestions.", "Home"),
];

// The catalog keys for each row's words (the seeded-words plan, the kit's
// ../just-core/docs/plans/2026-10-18-seeded-words-in-the-users-language.md): the kit's AI page shows a feature,
// its hint and its group in the interface's language. The words above stay as they are — the
// English the kit falls back to.
const FEATURE_KEYS = {
  "writerAI": { labelKey: "aiData.feature.writerAI.label", hintKey: "aiData.feature.writerAI.hint" },
  "sceneDrafting": { labelKey: "aiData.feature.sceneDrafting.label", hintKey: "aiData.feature.sceneDrafting.hint" },
  "sensory": { labelKey: "aiData.feature.sensory.label", hintKey: "aiData.feature.sensory.hint" },
  "unstuck": { labelKey: "aiData.feature.unstuck.label", hintKey: "aiData.feature.unstuck.hint" },
  "brainstorm": { labelKey: "aiData.feature.brainstorm.label", hintKey: "aiData.feature.brainstorm.hint" },
  "planning": { labelKey: "aiData.feature.planning.label", hintKey: "aiData.feature.planning.hint" },
  "critique": { labelKey: "aiData.feature.critique.label", hintKey: "aiData.feature.critique.hint" },
  "multiReader": { labelKey: "aiData.feature.multiReader.label", hintKey: "aiData.feature.multiReader.hint" },
  "plotHoles": { labelKey: "aiData.feature.plotHoles.label", hintKey: "aiData.feature.plotHoles.hint" },
  "reverseOutline": { labelKey: "aiData.feature.reverseOutline.label", hintKey: "aiData.feature.reverseOutline.hint" },
  "beatSheet": { labelKey: "aiData.feature.beatSheet.label", hintKey: "aiData.feature.beatSheet.hint" },
  "marketingPack": { labelKey: "aiData.feature.marketingPack.label", hintKey: "aiData.feature.marketingPack.hint" },
  "foreshadowing": { labelKey: "aiData.feature.foreshadowing.label", hintKey: "aiData.feature.foreshadowing.hint" },
  "readerKnowledge": { labelKey: "aiData.feature.readerKnowledge.label", hintKey: "aiData.feature.readerKnowledge.hint" },
  "voiceDrift": { labelKey: "aiData.feature.voiceDrift.label", hintKey: "aiData.feature.voiceDrift.hint" },
  "entitySweep": { labelKey: "aiData.feature.entitySweep.label", hintKey: "aiData.feature.entitySweep.hint" },
  "characterAudit": { labelKey: "aiData.feature.characterAudit.label", hintKey: "aiData.feature.characterAudit.hint" },
  "characterProfile": { labelKey: "aiData.feature.characterProfile.label", hintKey: "aiData.feature.characterProfile.hint" },
  "characterVoice": { labelKey: "aiData.feature.characterVoice.label", hintKey: "aiData.feature.characterVoice.hint" },
  "relationshipArc": { labelKey: "aiData.feature.relationshipArc.label", hintKey: "aiData.feature.relationshipArc.hint" },
  "storyWorld": { labelKey: "aiData.feature.storyWorld.label", hintKey: "aiData.feature.storyWorld.hint" },
  "chat": { labelKey: "aiData.feature.chat.label", hintKey: "aiData.feature.chat.hint" },
  "characterChat": { labelKey: "aiData.feature.characterChat.label", hintKey: "aiData.feature.characterChat.hint" },
  "briefing": { labelKey: "aiData.feature.briefing.label", hintKey: "aiData.feature.briefing.hint" },
  "recap": { labelKey: "aiData.feature.recap.label", hintKey: "aiData.feature.recap.hint" },
};
const GROUP_KEYS = {
  "Writing": "aiData.group.writing",
  "Drafting tools": "aiData.group.draftingTools",
  "Analysis": "aiData.group.analysis",
  "Multi-reader panel": "aiData.group.multiReaderPanel",
  "Whole book": "aiData.group.wholeBook",
  "Characters": "aiData.group.characters",
  "Story world": "aiData.group.storyWorld",
  "Chat": "aiData.group.chat",
  "Home": "aiData.group.home",
};
for (const f of FEATURE_CATALOG) Object.assign(f, FEATURE_KEYS[f.key] ?? {}, { groupKey: GROUP_KEYS[f.group] ?? "" });
