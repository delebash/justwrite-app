"""JustWrite's AI feature catalog — the canonical list of routable features with
their human label, a one-line hint, and the role they fall back to when unpinned.

Server-side + headless-first (the shared `/v1/ai/routing` endpoint serves it), so
the renderer no longer owns this list. It consolidates what used to live in two
places that risked drift: the renderer's `SettingsView.vue` `AI_FEATURES` (labels
+ hints) and `llm/config.py`'s `DEFAULT_FEATURE_ROLES` (the per-feature role).
`config.py` now derives the role map from here, and JustVoice will ship its own
catalog of the same shape.
"""

from __future__ import annotations

from llm_runner.llm import FeatureCatalogEntry

# Label + hint are copied verbatim from the renderer's prior AI_FEATURES; role is
# the prior DEFAULT_FEATURE_ROLES value. Analysis/whole-book features ride the
# careful "accuracy" role; interactive/drafting features ride fast "quick".
FEATURE_CATALOG: list[FeatureCatalogEntry] = [
    FeatureCatalogEntry("critique", "Critique", "The Critique modal — line-level notes (flags / suggestions / observations) and the structural pass (tension, hook, pacing, ending).", "accuracy"),
    FeatureCatalogEntry("chat", "Manuscript chat", '"Ask the book" RAG question/answer mode in the chat panel.', "quick"),
    FeatureCatalogEntry("plotHoles", "Plot-hole audit", "Whole-book continuity scan for contradictions, timeline issues, and character-knowledge errors.", "accuracy"),
    FeatureCatalogEntry("reverseOutline", "Reverse outline", "Reads the whole draft and produces the act structure the book actually has — plot points, act breaks, per-chapter beats.", "accuracy"),
    FeatureCatalogEntry("multiReader", "Multi-reader panel", "Four distinct reader personas (genre reader / literary critic / agent intern / book-club reader) react to a chapter in parallel.", "accuracy"),
    FeatureCatalogEntry("marketingPack", "Marketing pack", "Logline, back-cover blurbs, synopsis, and elevator pitch for querying and pitching.", "accuracy"),
    FeatureCatalogEntry("entitySweep", "Entity sweep", "Scans chapters for new characters / locations / objects.", "accuracy"),
    FeatureCatalogEntry("writerAI", "Writer actions", "The AI dropdown in each scene's strip — Rewrite, Expand, Tighten, Continue, Describe, plus all Line edits.", "quick"),
    FeatureCatalogEntry("brainstorm", "Brainstorm", "The Brainstorm view — name / title / freeform idea generation with thumbs-up steering.", "quick"),
    FeatureCatalogEntry("briefing", "Resume briefing", 'Generates the Home "Previously on your novel" recap card.', "quick"),
    FeatureCatalogEntry("recap", "Session recap", 'End-of-day "Wrap up session" recap + open-thread suggestions.', "quick"),
    FeatureCatalogEntry("unstuck", "Unstuck moves", 'The AI dropdown\'s "Unstuck — five ways out" diagnostic that proposes goal shift / interrupt / setting / reveal / time cut.', "quick"),
    FeatureCatalogEntry("sensory", "Sensory research", 'The AI dropdown\'s "Research feel…" modal — structured sensory pack for a selected subject.', "quick"),
    FeatureCatalogEntry("foreshadowing", "Foreshadowing scan", "Whole-book scan for setups that may not have paid off.", "accuracy"),
    FeatureCatalogEntry("readerKnowledge", "Reader knowledge", "Tracks dramatic irony — what the reader knows vs. what the POV character knows, chapter by chapter.", "accuracy"),
    FeatureCatalogEntry("voiceDrift", "Voice drift explainer", "Diagnoses what shifted between an outlier chapter and the writer's baseline voice in the Analysis dashboard.", "accuracy"),
    FeatureCatalogEntry("characterAudit", "Character audit", "Per-character consistency audit (profile + their scenes → flagged actions) on the Characters view.", "accuracy"),
    FeatureCatalogEntry("beatSheet", "Beat sheet overlay", "Maps your draft to Save the Cat, Hero's Journey, or 7-Point Story Structure beats.", "accuracy"),
    FeatureCatalogEntry("characterChat", "Character chat", 'The chat panel\'s "Talk to a character" mode — first-person, in-voice answers from your cast.', "quick"),
    FeatureCatalogEntry("relationshipArc", "Relationship arc", "Chapter-by-chapter warmth / tension / power tracking for a pair of characters.", "accuracy"),
]
