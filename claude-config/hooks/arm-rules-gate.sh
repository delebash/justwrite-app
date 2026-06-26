#!/usr/bin/env bash
# SessionStart HARD-GATE ARM — NO soft injection (user law: "never do soft").
#
# Fires on every startup / resume / clear / compact (SessionStart with no matcher
# fires on all four — verified at code.claude.com/docs/en/hooks). It records the
# CURRENT transcript length into the sentinel so the Stop verify-gate (Block 0)
# can BLOCK the turn until the FULL rules + project CLAUDE.md + MORNING_RECAP.md
# have been RE-READ (a real Read tool call) since this reset. We force a Read of
# the whole file rather than inject it because additionalContext caps at 10k chars
# and the rules file is ~52k — injection would silently truncate to a summary.
#
# Counts NON-BLANK lines to match how verify-gate.py builds its entry list
# (`if l.strip()`). Always exits 0 with valid JSON so it can never break startup.

input="$(cat 2>/dev/null)"
HOOK_INPUT="$input" python3 <<'PY'
import json, os
SENT = os.path.expanduser("~/.claude/hooks/.rules_gate")
try:
    data = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except Exception:
    data = {}
tpath = data.get("transcript_path") or ""
n = 0
try:
    if tpath and os.path.isfile(tpath):
        with open(tpath, encoding="utf-8") as f:
            n = sum(1 for line in f if line.strip())
except Exception:
    n = 0
try:
    with open(SENT, "w", encoding="utf-8") as f:
        json.dump({"line": n, "blocks": 0}, f)
except Exception:
    pass
print("{}")
PY
exit 0
