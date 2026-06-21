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
}

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def render(template: str, variables: dict) -> str:
    """Substitute {{name}} placeholders from `variables` (missing → empty)."""
    return _VAR.sub(lambda m: str(variables.get(m.group(1), "")), template)
