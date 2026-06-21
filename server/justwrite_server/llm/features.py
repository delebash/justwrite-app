"""Feature assembly utilities.

The template renderer today; going forward, the home for each feature's
server-side assembly (input contract + context-gathering from the project DB +
filling the DB template + shaping the result). Holds assembly LOGIC, never prompt
text — prompt text lives in the DB, seeded by `seed_feature_prompts.py`. See
docs/plans/2026-06-21-feature-prompts-db-seed.md.
"""

from __future__ import annotations

import re

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def render(template: str, variables: dict) -> str:
    """Substitute {{name}} placeholders from `variables` (missing → empty)."""
    return _VAR.sub(lambda m: str(variables.get(m.group(1), "")), template)
