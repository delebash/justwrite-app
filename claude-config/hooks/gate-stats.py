#!/usr/bin/env python3
"""Roll up the hard-gate logs into a tally — how often the rules CAUGHT something.

The rule ids + labels come from `_rules.py` (the SINGLE source). The old version kept
its own parallel `BLOCKS` list, which silently fell out of sync — that is exactly how
the "Block 5 uncounted" miss happened (a real fire rolled up as 0). Importing the
registry means a new rule is counted automatically.

Counts `BLOCK <id>` across ALL gate logs in ~/.claude/hooks/*.log (verify-gate,
task-gate, commit-gate all log `BLOCK <rule-id>`; a rule that fires at more than one
boundary — e.g. task-completeness at TaskCompleted AND commit — is summed). The logs
are EPHEMERAL (a fresh container wipes ~/.claude), so EFFECTIVENESS.md in the repo is
the DURABLE record; run this before a handoff and fold the numbers in.

Honest scope: a BLOCK means the gate FIRED. It is a real "catch" only if it changed the
next action. Raw counts are the floor; true-save vs false-positive vs MISS is recorded
by hand in the EFFECTIVENESS.md ledger — a judgment a script cannot make.

Usage:  python3 ~/.claude/hooks/gate-stats.py
"""
from __future__ import annotations

import glob
import os
import sys
import time

_D = os.path.expanduser("~/.claude/hooks")
PA = f"{_D}/pre-action.log"

# Single source: the rule ids/labels come from the registry.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import _rules
    LABELS = _rules.labels()          # [(id, label)] in registry order
except Exception as e:                # pragma: no cover
    LABELS = []
    sys.stderr.write(f"⚠ gate-stats: _rules.py import failed ({e}); cannot label rules.\n")


def _count_all(needle: str) -> int:
    """Count lines containing `needle` across every gate log."""
    n = 0
    for path in glob.glob(f"{_D}/*.log"):
        try:
            with open(path, encoding="utf-8") as f:
                n += sum(1 for line in f if needle in line)
        except Exception:
            pass
    return n


def main() -> None:
    counts = [(rid, label, _count_all(f"BLOCK {rid}")) for rid, label in LABELS]
    passes = _count_all("PASS ")
    injects = _count_all("INJECT")
    pretask_denies = _count_all("DENY pre-task")
    total = sum(n for _, _, n in counts)

    print(f"### Roll-up — {time.strftime('%Y-%m-%d')} (this container)\n")
    print(f"- **Gate fires (blocks): {total}**  ·  clean passes: {passes}  ·  "
          f"pre-task denies: {pretask_denies}  ·  pre-action salience nudges: {injects}")
    for rid, label, n in counts:
        if n:
            print(f"  - {rid} — {label}: **{n}**")
    if not total:
        print("  - (no blocks fired in this container's log yet)")
    if not LABELS:
        print("  - ⚠ registry unavailable — per-rule labels missing.")
    print("\n_A block = the gate fired. Mark each as a real save or a false positive "
          "in the ledger — and log the MISSES (what slipped past) too; that honesty is "
          "the point of measuring._")


if __name__ == "__main__":
    main()
