#!/usr/bin/env python3
"""TaskCreated / TaskCompleted gate — the TASK-grain checks, via the shared registry.

Fires at the REAL task boundaries — but only when plan tasks are tracked as actual
Task entries (the standing rule: "every plan task = one Task entry"):

  TaskCreated   (task BEGIN) — rule `task-begin-check`: block unless the plan was
                rules-checked this turn.
  TaskCompleted (task END)   — rule `task-completeness`: block unless the result was
                rules-checked this turn, AND (its inject) the checker was fed the FULL
                acceptance criteria from the plan doc, not the task summary (anti-skim).

The rules + their messages live in `_rules.py`; this hook is the MECHANISM (exit code 2,
the documented universal block; stderr is fed back to the model). Fail-OPEN on any error
(exit 0). The turn-grain gates (pre-action first-edit deny + verify-gate post-task)
remain the backstop for work that isn't tracked as Tasks.
"""
from __future__ import annotations

import json
import os
import sys
import time

LOG = os.path.expanduser("~/.claude/hooks/task-gate.log")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import _rules
    _RULES_OK = True
    _IMPORT_ERR = None
except Exception as _e:  # pragma: no cover - exercised by the fail-open smoke
    _RULES_OK = False
    _IMPORT_ERR = _e


def _log(msg: str) -> None:
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)
    event = data.get("hook_event_name") or "TaskCreated"

    # Registry unavailable → LOUD warn + fail OPEN (never block on a broken gate).
    if not _RULES_OK:
        sys.stderr.write(
            f"⚠ task-gate: rule registry (_rules.py) failed to import ({_IMPORT_ERR}) "
            f"— the {event} gate is OFF. Fix _rules.py.\n")
        _log(f"WARN registry import failed: {_IMPORT_ERR}")
        sys.exit(0)

    tpath = data.get("transcript_path")
    if not (tpath and os.path.isfile(tpath)):
        sys.exit(0)  # fail-open: no transcript → don't block
    try:
        with open(tpath, encoding="utf-8") as f:
            entries = [json.loads(line) for line in f if line.strip()]
    except Exception:
        sys.exit(0)

    ctx = _rules.build_ctx(data, entries, event)
    fails = _rules.run_rules(event, ctx)
    if not fails:
        _log(f"ALLOW {event} (rules-pass present)")
        sys.exit(0)

    rid, inject = fails[0]
    _log(f"BLOCK {rid} ({event})")
    sys.stderr.write(inject)
    sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN
