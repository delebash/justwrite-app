#!/usr/bin/env python3
"""Roll up the hard-gate logs into a tally — how often the rules CAUGHT something.

Parses the per-container logs the gates write:
  ~/.claude/hooks/verify-gate.log  — BLOCK/PASS per block (the Stop gate)
  ~/.claude/hooks/pre-action.log   — salience injections (the PreToolUse nudge)

Prints a dated markdown roll-up to paste into EFFECTIVENESS.md. The logs are
EPHEMERAL (they live in ~/.claude, which a fresh container wipes — same reason the
config lives in this bundle), so EFFECTIVENESS.md in the repo is the DURABLE,
cumulative record; run this before a handoff and fold the numbers in.

Honest scope: a BLOCK means the gate FIRED. It is a real "catch" only if it changed
the next action (a re-read / a doc landed / a dup got fixed). Raw counts are the
floor; whether each fire was a true save or a false positive is recorded by hand in
the EFFECTIVENESS.md ledger — a judgment a script cannot make. Counting the misses
(things the gates did NOT catch) matters just as much for honesty.

Usage:  python3 ~/.claude/hooks/gate-stats.py
"""
from __future__ import annotations

import os
import time

_D = os.path.expanduser("~/.claude/hooks")
VG = f"{_D}/verify-gate.log"
PA = f"{_D}/pre-action.log"

BLOCKS = [
    ("rules-gate", "Block 0 — re-read rules/recap after a reset"),
    ("code-claim", "Block 1 — code claim with zero reads (memory answer)"),
    ("reco", "Block 2 — storage/arch reco with no cited precedent"),
    ("docs-with-features", "Block 3 — 'done' + code edit with no doc"),
    ("plan", "Block 4 — plan/decision announced with no rules-pass"),
    ("post-task", "Block 5 — code edit with no rules-pass"),
]


def _count(path: str, needle: str) -> int:
    if not os.path.isfile(path):
        return 0
    try:
        with open(path, encoding="utf-8") as f:
            return sum(1 for line in f if needle in line)
    except Exception:
        return 0


def main() -> None:
    counts = [(label, _count(VG, f"BLOCK {key}")) for key, label in BLOCKS]
    passes = _count(VG, "PASS ")
    injects = _count(PA, "INJECT")
    total = sum(n for _, n in counts)

    print(f"### Roll-up — {time.strftime('%Y-%m-%d')} (this container)\n")
    print(f"- **Gate fires (blocks): {total}**  ·  clean passes: {passes}  ·  "
          f"pre-action salience nudges: {injects}")
    for label, n in counts:
        if n:
            print(f"  - {label}: **{n}**")
    if not total:
        print("  - (no blocks fired in this container's log yet)")
    print("\n_A block = the gate fired. Mark each as a real save or a false positive "
          "in the ledger — and log the MISSES (what slipped past) too; that honesty is "
          "the point of measuring._")


if __name__ == "__main__":
    main()
