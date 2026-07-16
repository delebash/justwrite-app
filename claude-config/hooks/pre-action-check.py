#!/usr/bin/env python3
"""PreToolUse NUDGE — salience only. NOTHING here blocks.

NUDGE-ONLY since the 2026-07-15 strip (the user's named go: "pre-action becomes
nudge-only"). This hook used to carry a pre-task DENY: the first code edit of a turn
was blocked until the turn's own text held a plan citation + a 'RISK:' line + a
rules-pass. Its lifetime record argued for its removal:

  - It checked WORDS, not acts — my own prose could (and did) satisfy it, which is the
    defect class that quietly opened the commit gate for an entire session.
  - It denied COMPLIANT turns on a transcript-flush race: mid-turn assistant text
    reaches the transcript unreliably (#253), so an edit whose citation was already
    written got denied and the identical retry passed. Observed repeatedly, live.
  - Its subagent gap made every delegated builder route file changes through generated
    python patch-scripts (the one path it didn't gate) — a measured ~2-3x wall-clock
    tax on every delegated build, hidden for days behind that workaround.
  - No observable catch, ever: its lifetime DENY log is compliance noise and false
    positives, not caught bad plans.

What remains is the part that always worked and costs nothing: a one-line reminder of
the five checks at every code edit, and the checker-panel reminder when a plan is
presented. Salience, not enforcement. The blocking that still exists lives where an
ACT can be checked: Block 0 (a real Read after a reset), Block 6 (a second pass on
proposals), and the delegated-commit gate (a harness-authored verdict).

Fail-OPEN on every error (exit 0): a broken hook must never block tool use.
"""
from __future__ import annotations

import json
import os
import sys
import time

_CLAUDE_DIR = os.path.expanduser("~/.claude")
LOG = f"{_CLAUDE_DIR}/hooks/pre-action.log"

NUDGE = ("R1-R5 — right-not-fast | verify-don't-guess | reuse-don't-copy | whole-job | "
         "run-it. Full text: ~/.claude/CLAUDE.md; incidents: rules-detail.md.")

PLAN_NUDGE = ("PLAN BOUNDARY — check the plan before locking. Routine plan: ONE "
              "rules-checker (subagent_type 'rules-checker'). LOAD-BEARING (wrong = "
              "rewrite: storage/schema, architecture, cross-repo, large deletions): "
              "THREE, one per lens (architecture-fit | reuse | grounding), compared — "
              "disagreement resolves before locking. Checkers don't catch wrong INTENT: "
              "ask the user the doubt you just wrote down.")


def _log(msg: str) -> None:
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def _emit(text: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "additionalContext": text}}))


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)
    tool = data.get("tool_name") or ""

    if tool == "ExitPlanMode":
        _log("NUDGE plan (ExitPlanMode)")
        _emit(PLAN_NUDGE)
        sys.exit(0)

    if tool not in ("Edit", "Write", "MultiEdit"):
        sys.exit(0)

    file_path = (data.get("tool_input") or {}).get("file_path") or ""
    _log(f"NUDGE edit file={file_path}")
    _emit(NUDGE)
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN: a hook bug must never block tool use
