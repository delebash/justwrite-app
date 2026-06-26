#!/usr/bin/env python3
"""PreToolUse companion to the Stop verify-gate — run the rule-tests at the TASK
boundary, nudge at every edit (the user's 2026-06-26 design).

A "task" = the turn (everything since the last real user prompt) — the only
mechanical boundary available. Three behaviors:

- **Pre-task (the FIRST Edit/Write/MultiEdit of the turn): DENY** unless a rules-pass
  already exists this turn — i.e. the rules-checker subagent ran (a Task/Agent call),
  or the answer cites the tests, or it's attested trivial. This forces the plan to be
  checked BEFORE the first file is written (catch a bad plan before it's 10 bad files).
- **Every edit: NUDGE** (non-blocking `additionalContext`) — the rule-tests sit in
  front of the model at each change.
- **ExitPlanMode ("here is the plan"): NUDGE** to run the rules-checker on the plan.

Post-task (turn end) is enforced by the Stop verify-gate (Block 5).

Output schema verified at code.claude.com/docs/en/hooks (PreToolUse):
  deny  : {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
  nudge : {"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"..."}}
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

TESTS = (
    "T1 right-not-fast (no proxy justification) · T2 don't-guess (cite file:line/URL, "
    "never memory) · T3 reuse-don't-copy (one shared parameterized component) · "
    "T4 decide-from-both-sides + adopt-before-build · T5 whole-job (Affordance Table, "
    "every row ✅) · T6 audit = per-unit strict-diff · T7 verify-by-running · "
    "T8 save-detail-to-docs-as-it-happens · T9 finish/don't-barrel; confirm destructive · "
    "T10 subagents cautious, Opus never Sonnet · T11 docs-ship-with-features · "
    "T12 stack-defaults (plain JS, shared Vue3/Tauri2). Detail: ~/.claude/rules-detail.md."
)

# A rules-pass already happened this turn: the checker ran, the tests are cited, or
# a trivial change is attested (the cheap escape so a typo isn't a full checker run).
# A rules-pass that ACTUALLY happened — used to clear the BLOCKING pre-task DENY, so
# loose prose ("I'll run the rules-checker") must NOT count (the dogfood-caught hole).
# Require a real subagent run (detected in _scan_turn), a cited checker VERDICT, or
# an explicit trivial attestation.
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


def _emit(obj: dict) -> None:
    obj["hookEventName"] = "PreToolUse"
    print(json.dumps({"hookSpecificOutput": obj}))


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


def _scan_turn(entries: list, start: int) -> tuple[int, bool]:
    """(prior code-edits this turn, rules-pass-present this turn)."""
    edits = 0
    rules_pass = False
    for e in entries[start:]:
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_use":
                name = b.get("name") or ""
                if name in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
                    edits += 1
                if name in ("Task", "Agent"):
                    rules_pass = True
            elif b.get("type") == "text":
                t = b.get("text") or ""
                if VERDICT.search(t) or TRIVIAL.search(t):
                    rules_pass = True
    return edits, rules_pass


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)
    tool = data.get("tool_name") or ""

    if tool == "ExitPlanMode":
        _log("INJECT plan (ExitPlanMode)")
        _emit({"additionalContext":
               "⛔ PLAN BOUNDARY — before finalizing, run a rules-checker PANEL on this "
               "plan: 2-3 INDEPENDENT rules-checker subagents (Agent tool, subagent_type "
               "'rules-checker'), each with a different lens (architecture-fit · "
               "reuse/convergence · grounding), then COMPARE — any FAIL or disagreement = "
               "fix before locking. The 12 rule-tests: " + TESTS})
        sys.exit(0)

    if tool not in ("Edit", "Write", "MultiEdit"):
        sys.exit(0)

    prior_edits, rules_pass = 0, True  # fail-open defaults (no transcript → just nudge)
    tpath = data.get("transcript_path")
    if tpath and os.path.isfile(tpath):
        try:
            with open(tpath, encoding="utf-8") as f:
                entries = [json.loads(line) for line in f if line.strip()]
            prior_edits, rules_pass = _scan_turn(entries, _last_user_idx(entries))
        except Exception:
            prior_edits, rules_pass = 0, True  # parse error → don't block, just nudge

    # PRE-TASK: the first code change of the turn, with no rules-pass yet → DENY.
    if prior_edits == 0 and not rules_pass:
        _log("DENY pre-task (first edit, no rules-pass)")
        _emit({"permissionDecision": "deny", "permissionDecisionReason": (
            "PRE-TASK CHECK — this is the first file change of the task and the plan was "
            "not rules-checked. Before writing, run the rules-checker subagent on your "
            "internal plan (Agent tool, subagent_type 'rules-checker') and address any "
            "FAIL — OR, for a trivial change, say 'trivial' / cite the tests it passes. "
            "Then write. The 12 tests: " + TESTS)})
        sys.exit(0)

    # Every edit gets a SHORT nudge — salience without spam. Repeating the full ~400-char
    # T1-T12 block per edit was learned-ignore noise (dogfood-caught); the full list lives
    # in ~/.claude/CLAUDE.md. One line, every edit.
    _log(f"INJECT {'first' if prior_edits == 0 else 'edit'}")
    _emit({"additionalContext":
           "⛔ CODE CHANGE — check it against the rule-tests T1-T12 first (right-not-fast · "
           "don't-guess · reuse-don't-copy · whole-job · docs-with-it; full list in "
           "~/.claude/CLAUDE.md)."})
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN: a gate bug must never block tool use
