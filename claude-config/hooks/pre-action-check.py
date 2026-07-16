#!/usr/bin/env python3
"""PreToolUse — R1-R5 salience nudges + ONE act-keyed deny (the go-gate).

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

ONE deny lives here — THE GO-GATE (added 2026-07-15, the user's "fix that", after the
same violation three times in one day): when the user's LATEST message is a QUESTION
with no action word, a main-session edit to a product file is DENIED — answer in words
and WAIT for the go. It keys on the USER's own typed text (an act the agent cannot
forge), so it obeys the act-not-word law. Exempt: delegated agents (they execute under
a spawned go), and scratchpad/temp files (diagnostic scripts written to ANSWER the
question are the point). Honest limit: a mixed message ("why is X broken? fix it")
passes on its action word; this catches pure questions — the actual repeat offender.

Fail-OPEN on every error (exit 0): a broken hook must never block tool use.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

_CLAUDE_DIR = os.path.expanduser("~/.claude")
LOG = f"{_CLAUDE_DIR}/hooks/pre-action.log"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import _rules
    _RULES_OK = True
except Exception:
    _RULES_OK = False  # go-gate degrades to off; nudges keep working

_QWORDS = {"why", "what", "whats", "how", "when", "where", "who", "which",
           "is", "are", "am", "was", "were", "do", "does", "did",
           "can", "could", "should", "would", "will"}
_ACTION = re.compile(
    r"\b(go|fix|proceed|push|ship|apply|implement|update|change|remove|delete|add|"
    r"create|build|make|finish|continue|revert|rename|move|install|write|correct|"
    r"adjust|strip|do it|clean ?up)\b", re.I)
_SCRATCH = re.compile(r"[/\\](scratchpad|Temp[/\\]claude|tmp)[/\\]", re.I)


def _pending_question(data: dict) -> str:
    """The user's latest genuine message, iff it is a pure question — else ''."""
    if not _RULES_OK:
        return ""
    try:
        tpath = data.get("transcript_path") or ""
        if not os.path.isfile(tpath):
            return ""
        entries = []
        with open(tpath, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    entries.append(json.loads(line))
        for e in reversed(entries):
            if not _rules.is_genuine_user(e):
                continue
            text = (_rules._user_text(e)[0] or "").strip()
            if not text:
                return ""
            first = re.split(r"[\s,;:!?]+", text.lower(), 1)[0]
            q_shape = text.rstrip(" !").endswith("?") or first in _QWORDS
            if q_shape and not _ACTION.search(text):
                return text[:120]
            return ""
    except Exception:
        return ""
    return ""

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

    # THE GO-GATE (see the module docstring). Main session + product files only.
    if not data.get("agent_id") and not _SCRATCH.search(file_path):
        q = _pending_question(data)
        if q:
            _log(f"GO-DENY (pending question) file={file_path} q={q[:80]!r}")
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    "GO-GATE — the user's latest message is a QUESTION with no action "
                    "word:\n  " + q + "\nRule #1: a question is ONLY a question. Answer "
                    "it in words and WAIT for their go — do not edit product files. "
                    "(Diagnostic scripts in the scratchpad are exempt and encouraged "
                    "for grounding the answer.)")}}))
            sys.exit(0)

    _log(f"NUDGE edit file={file_path}")
    _emit(NUDGE)
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN: a hook bug must never block tool use
