"""JustWrite's AI feature catalog — the canonical list of routable features with
their human label, a one-line hint, and the nav category. A per-app feature seed
(registered with the shared LLM stack via `install_llm`); each feature's JOB
classification is separate seed DATA (`seed.py` `DEFAULT_FEATURE_JOBS`).

Server-side + headless-first (the shared `/v1/ai/routing` endpoint serves it).
"""

from __future__ import annotations

from llm_runner.llm import FeatureCatalogEntry

# label = the ONE canonical name the user sees wherever they meet the feature
# (point-of-use wins, 2026-06-24): e.g. chat = "Ask the book". hint doubles as the
# Feature Workbench card blurb. category is the nav group; LIST ORDER here IS the
# nav order. Multi-action features (writerAI, critique, multiReader, brainstorm)
# show their per-action labels (seed_feature_prompts `_ACTION_META`) under the
# category; single-action features show this label.
FEATURE_CATALOG: list[FeatureCatalogEntry] = [
    # ── Writing — the scene-editor AI menu (Rewrite / Expand / … + Line edits) ──
    FeatureCatalogEntry("writerAI", "Writer actions", "The AI menu in each scene's strip — Rewrite, Expand, Tighten, Continue, Describe, plus all Line edits.", "Writing"),
    # ── Drafting tools — get-unstuck / research / ideas ──
    FeatureCatalogEntry("sensory", "Research feel", "Structured sensory pack (smell / sound / touch / …) for a selected subject — the editor's “Research feel” modal.", "Drafting tools"),
    FeatureCatalogEntry("unstuck", "Unstuck", "Five ways to unblock the current scene — goal shift / interrupt / setting / reveal / time cut.", "Drafting tools"),
    FeatureCatalogEntry("brainstorm", "Brainstorm", "The Brainstorm view — name / title / freeform idea generation with thumbs-up steering.", "Drafting tools"),
    # ── Analysis — per-chapter passes ──
    FeatureCatalogEntry("critique", "Critique", "The Critique modal — line-level Notes (flags / suggestions / observations) and the Structure pass (tension, hook, pacing, ending).", "Analysis"),
    FeatureCatalogEntry("multiReader", "Multi-reader panel", "Four reader personas (genre reader / literary critic / agent intern / book-club reader) react to a chapter in parallel.", "Multi-reader panel"),
    # ── Whole book — draft-wide scans ──
    FeatureCatalogEntry("plotHoles", "Plot-hole audit", "Whole-book continuity scan for contradictions, timeline issues, and character-knowledge errors.", "Whole book"),
    FeatureCatalogEntry("reverseOutline", "Reverse outline", "Reads the whole draft and produces the act structure the book actually has — plot points, act breaks, per-chapter beats.", "Whole book"),
    FeatureCatalogEntry("beatSheet", "Beat sheet", "Maps your draft to Save the Cat, Hero's Journey, or 7-Point Story Structure beats.", "Whole book"),
    FeatureCatalogEntry("marketingPack", "Marketing pack", "Logline, back-cover blurbs, synopsis, and elevator pitch for querying and pitching.", "Whole book"),
    FeatureCatalogEntry("foreshadowing", "Foreshadowing scan", "Whole-book scan for setups that may not have paid off.", "Whole book"),
    FeatureCatalogEntry("readerKnowledge", "Reader knowledge", "Tracks dramatic irony — what the reader knows vs. what the POV character knows, chapter by chapter.", "Whole book"),
    FeatureCatalogEntry("voiceDrift", "Voice drift", "Diagnoses what shifted between an outlier chapter and the writer's baseline voice in the Analysis dashboard.", "Whole book"),
    # ── Characters / story bible ──
    FeatureCatalogEntry("entitySweep", "Entity sweep", "Scans chapters for new characters / locations / objects to add to the story bible.", "Characters"),
    FeatureCatalogEntry("characterAudit", "Character audit", "Per-character consistency audit (profile + their scenes → flagged actions) on the Characters view.", "Characters"),
    FeatureCatalogEntry("relationshipArc", "Relationship arc", "Chapter-by-chapter warmth / tension / power tracking for a pair of characters.", "Characters"),
    # ── Chat ──
    FeatureCatalogEntry("chat", "Ask the book", "RAG question/answer over your manuscript — the chat panel's “Ask the book” mode.", "Chat"),
    FeatureCatalogEntry("characterChat", "Character chat", "The chat panel's “Talk to a character” mode — first-person, in-voice answers from your cast.", "Chat"),
    # ── Home ──
    FeatureCatalogEntry("briefing", "Resume briefing", "Generates the Home “Previously on your novel” recap card.", "Home"),
    FeatureCatalogEntry("recap", "Session recap", "End-of-day “Wrap up session” recap + open-thread suggestions.", "Home"),
]
