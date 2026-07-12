#!/usr/bin/env python3
"""PreToolUse companion to the Stop verify-gate — run the rule-tests at the TASK
boundary, nudge at every edit. Shares the registry/turn-scan in `_rules.py`.

A "task" = the turn (everything since the last GENUINE user prompt — `_rules.is_genuine_user`
skips injected user-role messages like <task-notification>/command stdout, which used to
reset the window and fire a spurious DENY mid-task). Three behaviors:

- **Pre-task (the FIRST CODE edit of the turn — prior .md edits don't open the
  window): DENY** unless a rules-pass already exists this turn (the rules-checker
  subagent ran, the answer cites the tests) AND (#237) the turn text cites the
  plan/spec line being executed plus one 'RISK:' doubt. NARROWED (design #6): a first
  edit to a **.md** file, or an EXPLICITLY 'trivial'-attested change, is EXEMPT (nudge
  only, no deny) — the deny guards a bad CODE plan before it's 10 bad files; it should
  not cry-wolf on a doc/recap/plan edit.
- **Every edit: NUDGE** (non-blocking) — a one-line reminder of the rule-tests.
- **ExitPlanMode ("here is the plan"): NUDGE** to run the rules-checker PANEL on the plan.
- **SUBAGENT BYPASS (user-directed 2026-07-12):** a SIDECHAIN edit (a delegated build
  agent) skips the pre-task DENY — subagents structurally cannot clear it (their
  rules-checker verdicts arrive as task-notifications in the COORDINATOR's transcript,
  never their own, so the deny was a deadlock, not a check). The coordinator runs the
  checker/panel before delegating; Stop gate + commit-gate still enforce at the
  main-session boundaries. Detection: the transcript tail is sidechain entries while a
  subagent acts (`isSidechain` on the newest assistant/user entry).

Post-task (turn end) is enforced by the Stop verify-gate; the commit boundary adds the
heavy semantic check (commit-gate.py).

Output schema (PreToolUse), verified at code.claude.com/docs/en/hooks:
  deny  : {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
  nudge : {"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"..."}}
Fail-OPEN on every error (exit 0): a broken hook must never block tool use. If the shared
registry won't import, warn LOUDLY and degrade to nudge-only (never deny on a broken gate).
"""
from __future__ import annotations

import json
import os
import sys
import time

_CLAUDE_DIR = os.path.expanduser("~/.claude")
LOG = f"{_CLAUDE_DIR}/hooks/pre-action.log"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import _rules
    _RULES_OK = True
    _IMPORT_ERR = None
except Exception as _e:  # pragma: no cover - exercised by the fail-open smoke
    _RULES_OK = False
    _IMPORT_ERR = _e

TESTS = (
    "T1 right-not-fast (no proxy justification) · T2 don't-guess (cite file:line/URL, "
    "never memory) · T3 reuse-don't-copy (one shared parameterized component) · "
    "T4 decide-from-both-sides + adopt-before-build · T5 whole-job (Affordance Table, "
    "every row ✅) · T6 audit = per-unit strict-diff · T7 verify-by-running · "
    "T8 save-detail-to-docs-as-it-happens · T9 finish/don't-barrel; confirm destructive · "
    "T10 subagents cautious, Opus never Sonnet · T11 docs-ship-with-features · "
    "T12 stack-defaults (plain JS, shared Vue3/Tauri2). Detail: ~/.claude/rules-detail.md."
)
NUDGE = ("⛔ CODE CHANGE — check it against the rule-tests T1-T12 first (right-not-fast · "
         "don't-guess · reuse-don't-copy · whole-job · docs-with-it; full list in "
         "~/.claude/CLAUDE.md).")


def _log(msg: str) -> None:
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def _emit(obj: dict) -> None:
    obj["hookEventName"] = "PreToolUse"
    print(json.dumps({"hookSpecificOutput": obj}))


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

    file_path = (data.get("tool_input") or {}).get("file_path") or ""

    # Registry unavailable → LOUD warn + nudge-only (never deny on a broken gate).
    if not _RULES_OK:
        sys.stderr.write(
            f"⚠ pre-action-check: rule registry (_rules.py) failed to import "
            f"({_IMPORT_ERR}) — nudging only, no pre-task deny this turn.\n")
        _log(f"WARN registry import failed: {_IMPORT_ERR}")
        _emit({"additionalContext": NUDGE})
        sys.exit(0)

    # fail-open defaults (no transcript → just nudge). The deny window counts prior
    # CODE edits only (checker-caught: counting .md edits let a doc-edit-first turn
    # bypass the first-CODE-edit check — and record-first is the normal work pattern).
    prior_code_edits, rules_pass, plan_ref, risk_line, trivial = 0, True, True, True, True
    sidechain = False
    tpath = data.get("transcript_path")
    if tpath and os.path.isfile(tpath):
        try:
            with open(tpath, encoding="utf-8") as f:
                entries = [json.loads(line) for line in f if line.strip()]
            ctx = _rules.build_ctx(data, entries, "PreToolUse")
            prior_code_edits, rules_pass = ctx["code_edits"], ctx["rules_passed"]
            plan_ref, risk_line = ctx["plan_ref"], ctx["risk_line"]
            trivial = ctx["trivial_explicit"]
            # SUBAGENT BYPASS (user-directed 2026-07-12): while a subagent acts, the
            # transcript tail is its sidechain entries — skip the pre-task deny for it
            # (see the module docstring; nudge still fires below).
            for e in reversed(entries):
                if e.get("type") in ("assistant", "user"):
                    sidechain = bool(e.get("isSidechain"))
                    break
        except Exception:
            prior_code_edits, rules_pass = 0, True  # parse error → don't block, just nudge
            plan_ref, risk_line, trivial = True, True, True

    # NARROW the pre-task DENY: exempt a first edit that is .md-only (docs/recap/plan) or
    # EXPLICITLY trivial-attested. The deny exists to catch a bad CODE plan before it
    # becomes 10 bad files. #237 (think-twice) adds the plan-line check: the first code
    # edit must be preceded, in the turn's own text, by (a) a citation of the governing
    # plan/spec line being executed and (b) one 'RISK:' line on what could be wrong —
    # the second look at the keyboard, BEFORE the write, that empirically changes
    # decisions. ONE combined deny lists everything missing (compliance = one round).
    is_md = file_path.endswith(".md")
    if sidechain and prior_code_edits == 0 and not is_md:
        _log(f"BYPASS pre-task deny (sidechain/subagent edit) file={file_path}")
    if prior_code_edits == 0 and not is_md and not trivial and not sidechain:
        needs = []
        if not rules_pass:
            needs.append(
                "• The plan was not rules-checked: run the rules-checker subagent on your "
                "internal plan (Agent tool, subagent_type 'rules-checker') and address any "
                "FAIL — or cite the tests it passes. The 12 tests: " + TESTS)
        if not (plan_ref and risk_line):
            needs.append(
                "• THINK-TWICE (#237): state in your turn text, before this edit — (a) WHAT "
                "you are executing: cite the governing plan/spec line (doc.md:line, a "
                "§-section, the queue/plan doc item, or the user's words), and (b) one "
                "'RISK: <what could be wrong with this change>' line. Look at the plan line "
                "again as you write them — that second look is the point.")
        if needs:
            _log(f"DENY pre-task (first code edit; missing={len(needs)}) file={file_path}")
            _emit({"permissionDecision": "deny", "permissionDecisionReason": (
                "PRE-TASK CHECK — this is the first CODE change of the task. Before it "
                "runs:\n\n" + "\n\n".join(needs) +
                "\n\nThen retry the edit. (A .md edit is exempt; a genuinely trivial "
                "change: say 'trivial'.)")})
            sys.exit(0)

    # Every edit gets a SHORT nudge — salience without spam (the full T1-T12 lives in
    # ~/.claude/CLAUDE.md; repeating it per edit was learned-ignore noise).
    _log(f"INJECT {'first' if prior_code_edits == 0 else 'edit'} file={file_path}")
    _emit({"additionalContext": NUDGE})
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN: a gate bug must never block tool use
