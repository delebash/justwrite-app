#!/usr/bin/env python3
"""Stop-hook VERIFY-GATE — mechanical enforcement via the shared rule registry.

HARD GATES ONLY (no soft reminders). A rule can't fix a discretionary failure
(following a rule is optional). This gate is NOT discretionary: it runs when the turn
tries to FINISH and acts on EVIDENCE in the transcript, not on intentions. The user's
law: "never do soft — all hard gates."

The rules themselves now live ONCE in `_rules.py` (regexes + turn-scan + the registry);
this hook is the Stop-event MECHANISM. It BLOCKS the turn ({"decision":"block",
"reason":...}; the reason is fed back to the model) on:

  BLOCK 0 (rule id `rules-gate`) — RULES/STATE NOT RE-READ AFTER A MEMORY RESET.
    SessionStart arms a sentinel on compact/clear/startup — NOT on resume, which reloads
    the transcript intact (arm-rules-gate.sh). Until the FULL global rules
    (~/.claude/CLAUDE.md), the project CLAUDE.md, and MORNING_RECAP.md have EACH been
    Read (a real Read tool call) since that reset, the turn is blocked. This is an
    EVIDENCE-recheck rule (it self-heals when the Read actually happens) and keeps its
    bespoke sentinel mechanics here — it is NOT dispatched by run_rules.
  BLOCK 6 (rule id `second-pass`) — the ONE remaining text rule, dispatched through
    `_rules.run_rules("Stop", ctx)`: a PROPOSAL turn must end with an explicit
    "SECOND PASS —" section (what changed · what was re-verified · the sharpest doubt).
    Kept by the user's explicit call at the 2026-07-15 strip: 3 lifetime fires, 3
    materially changed answers. Blocks 1-5 (code-claim · reco · docs · plan ·
    post-task) were DELETED the same day — 15 lifetime fires, every one a regex over
    the agent's own prose, plus repeated false positives (the act-not-word law).

HONEST SCOPE: this catches a MISSING action (didn't read / didn't cite / didn't doc). It
canNOT verify a read was understood, or that a citation is the RIGHT one — that stays a
semantic, human check. It forces the act; it cannot force comprehension.

Fail-OPEN on every error (exit 0): a broken gate must never brick a session. If the
shared registry fails to import, this hook warns LOUDLY (stderr) and fails open — a
registry bug must be VISIBLE, never a silent disablement of every gate. Block 0 also
fail-safes after MAX_REBLOCKS consecutive re-blocks so a detection bug cannot loop.
"""

from __future__ import annotations

import json
import os
import sys
import time

_CLAUDE_DIR = os.path.expanduser("~/.claude")     # portable: not hardcoded /root
LOG = f"{_CLAUDE_DIR}/hooks/verify-gate.log"
SENTINEL = f"{_CLAUDE_DIR}/hooks/.rules_gate"
MAX_REBLOCKS = 5                                    # anti-brick fail-safe for Block 0

# Import the shared rule registry from this hook's own directory (on sys.path[0] when
# run as a script, but be explicit so it resolves from any cwd). A failure here must
# NOT silently disable the gate — warn loudly + fail open (see main()).
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


def _disarm() -> None:
    try:
        os.remove(SENTINEL)
    except Exception:
        pass


def _rules_gate(data: dict, entries: list) -> bool:
    """BLOCK 0 (rule id `rules-gate`). Evidence-recheck + sentinel mechanics live here;
    the "which files are still unread" judgment comes from _rules.block0_missing.
    Returns True if it emitted a block (caller must then exit)."""
    if not os.path.exists(SENTINEL):
        return False
    try:
        with open(SENTINEL, encoding="utf-8") as f:
            meta = json.load(f)
        arm_n = int(meta.get("line", 0))
        blocks = int(meta.get("blocks", 0))
        source = str(meta.get("source") or "")
    except Exception:
        arm_n, blocks, source = 0, 0, ""

    missing = _rules.block0_missing(data, entries, arm_n)

    if not missing:
        _disarm()
        _log("PASS rules-gate satisfied")
        return False

    if blocks >= MAX_REBLOCKS:
        _disarm()  # anti-brick: detection bug / refusal — don't infinite-loop
        _log(f"WARN rules-gate fail-safe after {blocks} reblocks missing={missing}")
        return False

    try:
        with open(SENTINEL, "w", encoding="utf-8") as f:
            json.dump({"line": arm_n, "blocks": blocks + 1, "source": source}, f)
    except Exception:
        pass

    files = "\n".join(f"  - {m}" for m in missing)
    _log(f"BLOCK rules-gate source={source!r} missing={missing}")
    what = {"compact": "a compaction", "clear": "a /clear", "startup": "a fresh session"}.get(
        source, "a memory reset")
    print(json.dumps({"decision": "block", "reason": (
        f"VERIFY-GATE (rules/state) — {what} occurred (context lost). Before ANYTHING "
        "else, RE-READ each of these IN FULL, slowly, per line, with the Read tool NOW "
        "— not from memory, not a summary:\n" + files +
        "\nThen open the plan doc(s) the recap points to for the active task. This gate "
        "keeps blocking until the files above have been read this session."
    )}))
    return True


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)  # no/garbled input → allow

    # Registry failed to import → LOUD warn + fail OPEN (never a silent gate-off).
    if not _RULES_OK:
        sys.stderr.write(
            f"⚠ verify-gate: rule registry (_rules.py) failed to import ({_IMPORT_ERR}) "
            "— the Stop gate is OFF this turn. Fix _rules.py.\n")
        _log(f"WARN registry import failed: {_IMPORT_ERR}")
        sys.exit(0)

    tpath = data.get("transcript_path")
    if not tpath:
        sys.exit(0)
    try:
        with open(tpath, encoding="utf-8") as f:
            entries = [json.loads(l) for l in f if l.strip()]
    except Exception:
        sys.exit(0)
    if not entries:
        sys.exit(0)

    # BLOCK 0 — runs FIRST and even on a stop-hook re-entry, so it persists until the
    # rules/state files are actually re-read (compliance disarms it; MAX_REBLOCKS caps).
    if _rules_gate(data, entries):
        sys.exit(0)

    # Loop protection for the text rules: if our block already fired this stop-sequence,
    # allow (the model is mid-fix).
    if data.get("stop_hook_active"):
        sys.exit(0)

    ctx = _rules.build_ctx(data, entries, "Stop")

    # Nothing said AND nothing changed → nothing to gate. (A code-editing turn that ends
    # with no trailing text is STILL gated — post-task / Block 5 — via code_edit.)
    if not ctx["answer"] and not ctx["code_edit"]:
        sys.exit(0)

    # Blocks 1-6 — the text-recheck rules, from the shared registry. run_rules applies
    # the hedge exemption (Stop-only) and skips the evidence rule (Block 0, above).
    fails = _rules.run_rules("Stop", ctx)
    if fails:
        rid, inject = fails[0]   # registry order = B1..B6 precedence; one at a time
        _log(f"BLOCK {rid}  answer[:120]={ctx['answer'][:120]!r}")
        print(json.dumps({"decision": "block", "reason": inject}))
        sys.exit(0)

    _log(f"PASS code_claim={ctx['code_claim']} evidence={ctx['evidence']} "
         f"reco_arch={ctx['reco_arch']} has_cite={ctx['has_cite']} done={ctx['done_claim']} "
         f"doc_ok={ctx['doc_ok']} plan_lock={ctx['plan_lock']} "
         f"rules_passed={ctx['rules_passed']} code_edit={ctx['code_edit']} "
         f"proposal={ctx.get('proposal')} second_pass={ctx.get('second_pass')} "
         f"agent_pass={ctx.get('agent_pass')}")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN: a gate bug must never brick a session
