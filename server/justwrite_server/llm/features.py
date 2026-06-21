"""Server-side feature prompt catalog + a tiny template renderer.

Moves the analysis features' prompts off the renderer (`services/analysis/*`) so
they run server-side through the shared dispatch (and headless JW gets AI), and
so the prompts become editable later (Decision 16 — production configs).

Each entry is keyed by an ACTION id and carries:
  feature        — the routing key for pins/roles (several actions can share one
                   routing feature, e.g. critique notes + structure both route
                   to "critique").
  system         — the system prompt (verbatim from the client).
  user_template  — the user message, with {{var}} placeholders the caller fills.
  temperature / think — per-action generation defaults.

Prompts are ported verbatim from the renderer's `services/analysis/*` SYSTEM
constants so behavior is identical; the user_template's input framing matches
what the client used to build.
"""

from __future__ import annotations

import re

# ── critique.js (CRITIQUE_SYSTEM / STRUCTURE_SYSTEM) ────────────────────────
_CRITIQUE_SYSTEM = """You are a sharp, honest fiction editor giving line-level notes on a single chapter.
Return a JSON object with one field: "notes" — an array of 4 to 10 critique items.
Each item: { "severity": "info" | "suggest" | "flag", "category": short label, "message": one sentence }.

Severity scale:
- "info"    — observation worth noting, no action needed
- "suggest" — concrete revision idea
- "flag"    — a clear problem (pacing dip, unearned reveal, voice break, continuity error)

Categories should be short and specific: "pacing", "voice", "dialogue", "POV", "show-don't-tell",
"opening", "closing", "characterization", "setting", "tension", "stakes", "exposition",
"redundancy", "clarity".

Be specific — quote a short phrase from the text when calling something out.
Be honest — if the chapter is genuinely strong, say so briefly in 2-3 "info" notes rather than inventing problems.
Return ONLY the JSON object, no preface, no markdown fences."""

_STRUCTURE_SYSTEM = """You are an experienced fiction editor diagnosing a chapter's structure.
Return ONLY a JSON object with these fields:
  "tension":     integer 1..10 (10 = unbearable; 1 = inert)
  "hookQuality": integer 1..10 (does the opening pull the reader in? 10 = irresistible)
  "pacing":      "slow" | "balanced" | "fast"
  "endingClass": "cliffhanger" | "soft" | "closed" | "dead-end"
                 - cliffhanger: unresolved high-stakes moment that demands the next chapter
                 - soft: ends on a question or mood that pulls forward but with breathing room
                 - closed: a complete unit; this chapter could end the book
                 - dead-end: ends limply, no propulsive force; a smell
  "summary":     a one- or two-sentence editorial summary of the chapter's structural posture

Be honest. Assess what's on the page, not what could be there.
Return ONLY the JSON object, no preface, no markdown fences."""

_CHAPTER_USER = "{{chapter_label}}--- BEGIN CHAPTER ---\n{{chapter_text}}\n--- END CHAPTER ---"

# ── threadExtraction.js (foreshadowing) ─────────────────────────────────────
_FORESHADOWING_SYSTEM = """You are a sharp fiction editor looking for foreshadowing and narrative setups in a chapter.

You will be given one chapter's prose. Identify "setups" — narrative elements the writer has planted that demand a later payoff. Things like:

  - promises or vows ("I'll find him")
  - distinctive objects placed in a character's hands or environment
  - questions raised but not answered ("why was the door locked from inside?")
  - abilities, traits, or constraints established for later use
  - secrets known to one character but not others
  - threats issued
  - debts or obligations declared

Return ONLY a JSON object with one field, "setups":

  {
    "setups": [
      {
        "snippet":  "verbatim phrase from the chapter, 4-15 words",
        "label":    "short reminder of what's set up (<= 90 chars)",
        "kind":     "promise" | "object" | "question" | "ability" | "secret" | "threat" | "debt",
        "keyTerm":  "a single distinctive word or 2-3 word phrase a later chapter would re-use"
      }
    ]
  }

RULES:
  - Each snippet MUST be copied verbatim from the chapter. No paraphrasing.
  - Each snippet should be 4-15 words — long enough to find uniquely, short enough to scan.
  - Each keyTerm should be specific enough that a substring search in later chapters would catch any payoff (proper nouns are ideal: a character name, a place name, a unique object name).
  - Return at most 8 setups for this chapter — the most interesting ones.
  - Skip the merely descriptive. A character noticing the weather is not a setup. A character noticing a specific knife on the mantle IS.
  - If the chapter is mostly resolution or middle-of-scene action with no new setups, return an empty array. Do not invent.

Return ONLY the JSON object, no preface, no markdown fences."""

# ── readerKnowledge.js (analyseChapterKnowledge) ────────────────────────────
# Its user message is assembled client-side (condensed prior facts + chapter),
# passed as {{user_content}}; the system prompt is the editable part.
_READER_KNOWLEDGE_SYSTEM = """You analyse fiction for dramatic irony — the gap between what the reader knows and what the POV character knows.

You will be given:
  - what the reader already knows going INTO this chapter (cumulative)
  - what the POV character already knows going INTO this chapter (cumulative)
  - the full prose of this chapter

Return ONLY a JSON object with these fields:

{
  "povCharacter":   string,  // best guess at this chapter's POV character name, or "narrator" if uncertain
  "newReaderFacts": [string], // 0-6 facts the reader LEARNS this chapter that they didn't know before
  "newPovFacts":    [string], // 0-6 facts the POV character LEARNS this chapter that they didn't know before
  "status":         "aligned" | "dramatic-irony" | "reader-confused" | "neutral",
  "rationale":      string   // 1-2 sentences explaining the classification
}

Status definitions — be deliberate:
  - "aligned" — reader and POV know roughly the same things; their knowledge moves in lockstep this chapter
  - "dramatic-irony" — reader knows something important the POV character does NOT (either newly created this chapter, or sustained from earlier)
  - "reader-confused" — POV character knows something the reader doesn't (withheld information that ISN'T clearly intentional), OR the chapter introduces ambiguity the reader can't resolve
  - "neutral" — transitional / setup / world-building chapter where neither alignment nor a meaningful gap is the point

Facts should be one declarative sentence each, short and specific. Examples:
  - "Marcus is the killer."
  - "The locket Elena found is a forgery."
  - "Sarah has been lying about her brother."

Rules:
  - Be selective. Don't list every detail — only facts that materially shift the reader's or POV's understanding.
  - Don't restate facts already in the "going-in" lists. Focus on what's NEW this chapter.
  - If you're unsure whether a fact counts, leave it out — false positives degrade the running model.
  - The rationale should name the central irony / alignment / confusion in concrete terms, not in genre abstractions.

Return ONLY the JSON object. No preface, no markdown fences, no commentary."""

# ── plotHoleScan.js (scanPlotHoles) ─────────────────────────────────────────
# The base prompt is server-side; the optional world-rules enforcement section
# is dynamic per-project, so the client composes it and passes it as
# {{world_rules_section}} (empty string when the project has no world rules).
_PLOT_HOLES_SYSTEM = """You audit a novelist's draft for plot holes and continuity drift.

You will be given a chapter-by-chapter digest. For each chapter you'll see the chapter number, title, word count, a short summary, and a TAIL of the chapter's actual prose (the last ~300 words) so you can catch details that don't show up in summaries.

Your job: identify CONTRADICTIONS, TIMELINE PROBLEMS, CONTINUITY DRIFT, and KNOWLEDGE-STATE inconsistencies that the writer should be aware of in revision.

Return ONLY a JSON object:

{
  "summary": "1-2 sentences on the overall consistency of the book",
  "findings": [
    {
      "severity":    "flag" | "suggest" | "info",
      "kind":        "contradiction" | "timeline" | "continuity" | "character-knowledge" | "object" | "other",
      "summary":     "one sentence naming the issue",
      "chapterNums": [number] (chapters whose content collides),
      "evidence":    "short verbatim quote naming the collision",
      "fix":         "one sentence on the cheapest resolution — revise the later chapter, or revise the earlier, or add a bridging sentence"
    }
  ]
}

Severity scale:
  - "flag"   — clear contradiction or impossibility (an in-prison character speaking to someone in the same chapter; a dead character returning without explanation)
  - "suggest" — borderline / possible drift (eye-color change between chapters with no on-page reason)
  - "info"   — minor note for awareness, not a real problem

Kinds:
  - contradiction — two prose moments that can't both be true
  - timeline — events happen in an order or pace the text can't support (a year passed but characters reference it as days; a journey that takes hours described as taking days)
  - continuity — small drift in a detail across chapters (eye colour, scar, weather, season)
  - character-knowledge — a character acting on information they couldn't yet have
  - object — an object appears, disappears, or changes (Elena had the locket in Ch.7 but it's never mentioned again, OR she has it in Ch.12 without retrieving it)
  - other — anything else worth surfacing

Rules:
  - Be SELECTIVE. A reasonable book has 0-10 findings. Most flagged issues should be real.
  - Be HONEST. If the book is internally consistent, return findings: [] and a summary saying so. The writer is asking what's broken, not asking you to pad.
  - The evidence field should be a short verbatim quote from one of the offending chapters. No paraphrasing.
  - Don't critique the WRITING — only the internal consistency of facts, events, objects, knowledge, and timeline.
  - Don't flag intentional ambiguity, deliberate withheld information, or unreliable-narrator effects unless something is clearly broken.

Return ONLY the JSON object. No preface, no markdown fences."""

# ── entityExtraction.js (extractEntities, feature "entitySweep") ─────────────
_ENTITY_SYSTEM = """You are a story-bible assistant scanning a single chapter of fiction.
Identify NEW named characters, locations, and objects that appear in the chapter.

Return ONLY a JSON object with three arrays:
{
  "characters": [{ "name": <string>, "role": <short label>, "oneLiner": <one sentence>, "evidence": <short quote from text> }],
  "locations":  [{ "name": <string>, "kind": <short label>, "note": <one sentence>, "evidence": <short quote> }],
  "objects":    [{ "name": <string>, "kind": <short label>, "note": <one sentence>, "evidence": <short quote> }]
}

Rules:
- Only include named entities — proper nouns. Skip "the man", "a sword", "the village".
- An object is included only if it has narrative weight (named, referenced more than once, or a Chekhov's gun candidate). Skip incidental nouns.
- For each entity, include a SHORT evidence quote (under 14 words) from the chapter so the human reviewer can verify.
- One entry per entity even if it appears multiple times.
- Skip entities listed in the "Already in the story bible" section below — don't re-propose them.
- If a category is empty, return [] for it.
- Return ONLY the JSON, no preface, no markdown fences."""

# ── characterAudit.js (auditCharacter) ──────────────────────────────────────
_CHARACTER_AUDIT_SYSTEM = """You audit fiction for character consistency.

You will be given:
  - a character profile (name, role, one-liner, plus optional voice / arc / motivation / backstory / quirks)
  - a digest of the scenes that feature this character (chapter context + the prose tail of each scene)

Your job: identify ACTIONS, REACTIONS, or DIALOGUE in these scenes that look inconsistent with the established psychology — i.e., not earned by what the writer has set up about the character.

Return ONLY a JSON object:

{
  "concerns": [
    {
      "severity": "flag" | "suggest" | "info",
      "chapterNum": number,
      "sceneSummary": "short hint of where in the chapter this occurs",
      "issue":  "one sentence naming what action looks inconsistent",
      "quote":  "a 6-15 word verbatim phrase from the prose, the action itself",
      "reason": "one sentence on why it doesn't fit, citing the established profile",
      "fix":    "one sentence on the cheapest narrative fix — earn the action, change the action, or revise the profile"
    }
  ],
  "verdict": "consistent" | "minor-drift" | "significant-drift"
}

Severity scale:
  - "flag"   — clear inconsistency between the established character and the action
  - "suggest" — borderline / could be intentional growth but worth a second look
  - "info"   — small note for the writer's awareness; not a problem on its own

Rules:
  - Be selective. Don't flag everything. A reasonable book averages 0-4 concerns per main character.
  - Be honest. If the character is consistent across the scenes, return concerns: [] and verdict: "consistent". The writer's not asking for false flags.
  - Quote VERBATIM from the prose. No paraphrasing in the quote field.
  - Don't critique the WRITING — only consistency with the established character.
  - Character growth and change are EARNED inconsistencies; ignore them unless the scene gives no on-page reason. The reason field should distinguish "uncosted change" from "unearned change".

Return ONLY the JSON object. No preface, no markdown fences."""

# ── relationshipArc.js (analyseRelationship) ────────────────────────────────
_RELATIONSHIP_SYSTEM = """You track a relationship between two characters across a novel — chapter by chapter.

You will be given:
  - Profile A
  - Profile B
  - The chapters where both characters appear together, with prose excerpts from the scenes they share

For EACH chapter where they share at least one scene, report:
  - warmth (1-10): how warm or cold the relationship feels in THIS chapter (1 = open hostility / icy; 5 = neutral / civil; 10 = deep intimacy / trust)
  - tension (1-10): how taut or calm THIS chapter is between them (1 = entirely calm; 10 = breaking point)
  - power: who holds the upper hand in THIS chapter — "A" (A dominates), "B" (B dominates), or "eq" (roughly equal / balanced)
  - moment: one short sentence (8-20 words) naming what specifically shifts or holds between them this chapter

Return ONLY a JSON object:

{
  "summary":    "2-3 sentences naming the overall shape of this relationship across the book",
  "trajectory": "warming" | "cooling" | "escalating" | "defusing" | "flipping" | "static",
  "chapters":   [ { "chapterNum": number, "warmth": int 1-10, "tension": int 1-10, "power": "A"|"B"|"eq", "moment": string } ]
}

Trajectory definitions:
  - warming   — warmth rises across the book; coldness gives way to closeness
  - cooling   — warmth falls across the book; closeness gives way to distance
  - escalating — tension rises across the book; conflict intensifies
  - defusing  — tension falls across the book; conflict resolves
  - flipping  — power dynamic inverts somewhere in the book (A-dominant → B-dominant, or vice versa)
  - static    — neither warmth, tension, nor power shifts meaningfully

Rules:
  - The "power" call should reflect agency in THIS chapter — who's setting the terms of the interaction, not who'd win a fight.
  - The "moment" must be specific to what actually happens in the chapter's shared scenes. No generic "they argue" — say what they argue about and what it costs.
  - Use only the chapter numbers you were given excerpts for. Don't invent chapters.

Return ONLY the JSON object. No preface, no markdown fences."""

# ── voiceDrift.js (explainVoiceDrift) — returns PLAIN PROSE ──────────────────
_VOICE_DRIFT_SYSTEM = """You are a sharp prose editor diagnosing a voice shift between chapters of one writer's novel.

You will be given:
  - the OUTLIER chapter (the chapter the writer is asking about)
  - up to 3 sample BASELINE chapters that represent the writer's typical voice in this book
  - a short list of metrics that diverge between them (e.g. "dialogue ratio higher; filter words lower")

Write 2-4 sentences of plain prose addressed to the writer ("Your voice in this chapter has shifted toward…") naming WHAT specifically differs and HOW it reads on the page. Quote a 4-10 word phrase from the outlier chapter and a contrasting 4-10 word phrase from one of the baseline samples to ground each claim.

Rules:
  - Be concrete. Don't talk in genre abstractions. Quote actual phrases.
  - Don't editorialise ("this is great", "you've grown"). Just diagnose.
  - Don't restate the metric numbers — translate them into prose terms ("more dialogue-driven", "less interiority").
  - If the chapter is dialogue-heavy: say so and quote a baseline narrative passage to contrast.
  - If the chapter is narration-heavy: say so and quote a baseline dialogue passage to contrast.
  - If the shift is small or unclear: say so plainly. Don't manufacture insight.

Return PLAIN PROSE. No headings, no bullets, no markdown, no preface."""

FEATURES: dict[str, dict] = {
    "critique": {
        "feature": "critique",
        "system": _CRITIQUE_SYSTEM,
        "user_template": _CHAPTER_USER,
        "temperature": 0.4,
        "think": False,
    },
    "critiqueStructure": {
        "feature": "critique",
        "system": _STRUCTURE_SYSTEM,
        "user_template": _CHAPTER_USER,
        "temperature": 0.2,
        "think": False,
    },
    "foreshadowing": {
        "feature": "foreshadowing",
        "system": _FORESHADOWING_SYSTEM,
        "user_template": _CHAPTER_USER,
        "temperature": 0.3,
        "think": False,
    },
    "readerKnowledge": {
        "feature": "readerKnowledge",
        "system": _READER_KNOWLEDGE_SYSTEM,
        "user_template": "{{user_content}}",
        "temperature": 0.3,
        "think": False,
    },
    "plotHoles": {
        "feature": "plotHoles",
        # {{world_rules_section}} = "" or the project's world-rules enforcement
        # block, composed client-side and substituted in.
        "system": _PLOT_HOLES_SYSTEM + "{{world_rules_section}}",
        "user_template": "{{user_content}}",
        "temperature": 0.3,
        "think": False,
    },
    "entitySweep": {
        "feature": "entitySweep",
        "system": _ENTITY_SYSTEM,
        "user_template": "{{user_content}}",
        "temperature": 0.2,
        "think": False,
    },
    "characterAudit": {
        "feature": "characterAudit",
        "system": _CHARACTER_AUDIT_SYSTEM,
        "user_template": "{{user_content}}",
        "temperature": 0.3,
        "think": False,
    },
    "relationshipArc": {
        "feature": "relationshipArc",
        "system": _RELATIONSHIP_SYSTEM,
        "user_template": "{{user_content}}",
        "temperature": 0.3,
        "think": False,
    },
    "voiceDrift": {
        "feature": "voiceDrift",
        "system": _VOICE_DRIFT_SYSTEM,
        "user_template": "{{user_content}}",
        "temperature": 0.4,
        "think": False,
    },
}

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def render(template: str, variables: dict) -> str:
    """Substitute {{name}} placeholders from `variables` (missing → empty)."""
    return _VAR.sub(lambda m: str(variables.get(m.group(1), "")), template)
