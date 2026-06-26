#!/usr/bin/env python3
"""TaskCreated / TaskCompleted gate — the TASK-grain pre/post checks (option B).

Fires at the REAL task boundaries — but only when plan tasks are tracked as actual
Task entries (the standing rule: "every plan task = one Task entry"):

  TaskCreated  (task BEGIN) — block unless the plan was rules-checked this turn.
  TaskCompleted (task END)  — block unless the result was rules-checked this turn.

"rules-checked this turn" = the rules-checker subagent ran (a Task/Agent tool call),
OR the tests are cited in the answer, OR a trivial change is attested.

Blocks via exit code 2 (the documented universal block; stderr is fed back to the
model). Fail-OPEN on any error (exit 0): a broken gate must never brick a session.
The turn-grain gates (pre-action-check.py first-edit deny + verify-gate Block 5)
remain the backstop for work that isn't tracked as Tasks.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

LOG = os.path.expanduser("~/.claude/hooks/task-gate.log")
# A rules-pass that ACTUALLY happened (not narrated) — clears the BLOCKING task gate,
# so loose prose ("I'll run the checker") must NOT count (dogfood-caught hole). Require
# a real subagent run (detected in _rules_pass), a cited checker VERDICT, or trivial.
VERDICT = re.compile(
    r"\bVERDICT:\s*(PASS|FAIL)\b"
    r"|\bT(1[0-2]|[1-9])\b[^\n]{0,30}\b(PASS|FAIL)\b[^\n]{0,200}?"
    r"\bT(1[0-2]|[1-9])\b[^\n]{0,30}\b(PASS|FAIL)\b",
    re.I,
)
TRIVIAL = re.compile(r"\b(trivial|one[- ]?line|typo|comment[- ]?only|dep bump|rename)\b", re.I)


def _log(msg: str) -> None:
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def _last_user_idx(entries: list) -> int:
    for i in range(len(entries) - 1, -1, -1):
        e = entries[i]
        if e.get("type") != "user" or e.get("isMeta"):
            continue
        c = (e.get("message") or {}).get("content")
        if isinstance(c, str):
            if c.strip():
                return i
        elif isinstance(c, list):
            has_text = any(isinstance(b, dict) and b.get("type") == "text" for b in c)
            has_tr = any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c)
            if has_text and not has_tr:
                return i
    return 0


def _rules_pass(entries: list, start: int) -> bool:
    for e in entries[start:]:
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_use" and b.get("name") in ("Task", "Agent"):
                return True
            if b.get("type") == "text":
                t = b.get("text") or ""
                if VERDICT.search(t) or TRIVIAL.search(t):
                    return True
    return False


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)
    event = data.get("hook_event_name") or "Task"
    tpath = data.get("transcript_path")
    if not (tpath and os.path.isfile(tpath)):
        sys.exit(0)  # fail-open: no transcript → don't block
    try:
        with open(tpath, encoding="utf-8") as f:
            entries = [json.loads(line) for line in f if line.strip()]
    except Exception:
        sys.exit(0)

    if _rules_pass(entries, _last_user_idx(entries)):
        _log(f"ALLOW {event} (rules-pass present)")
        sys.exit(0)

    begin = "Created" in event
    phase = "BEGIN (TaskCreated)" if begin else "END (TaskCompleted)"
    verb = "starting" if begin else "completing"
    what = "this task's plan" if begin else "what this task produced (the diff)"
    _log(f"BLOCK {event} no-rules-pass")
    sys.stderr.write(
        f"TASK GATE — {phase}. No rules-pass this turn. Run the rules-checker subagent on "
        f"{what} (Agent tool, subagent_type 'rules-checker') and address any FAIL — or cite "
        f"the tests it passes / say 'trivial' — before {verb} this task.")
    sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN
