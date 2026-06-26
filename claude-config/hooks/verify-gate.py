#!/usr/bin/env python3
"""Stop-hook VERIFY-GATE — mechanical enforcement. HARD GATES ONLY (no soft reminders).

A rule can't fix a discretionary failure (following a rule is optional). This gate is
NOT discretionary: it runs when the turn tries to FINISH and acts on EVIDENCE in the
transcript, not on intentions. The user's law: "never do soft — all hard gates."

It BLOCKS the turn ({"decision":"block","reason":...}; the reason is fed back to the
model) on any of:

  BLOCK 0 — RULES/STATE NOT RE-READ AFTER A MEMORY RESET. SessionStart arms a sentinel
    on compact/clear/startup — NOT on resume, which reloads the transcript intact
    (arm-rules-gate.sh). Until the FULL global
    rules (~/.claude/CLAUDE.md), the project CLAUDE.md, and the project MORNING_RECAP.md
    have EACH been Read (a real Read tool call — never a truncated injection: the rules
    file is ~52k chars, additionalContext caps at 10k) since that reset, the turn is
    blocked. This replaces the old SOFT SessionStart/UserPromptSubmit reminders.
  BLOCK 1 — CODE CLAIM (a source/config filename or path:line) with ZERO evidence tools
    this turn and no honest hedge (answered from memory).
  BLOCK 2 — STORAGE/ARCHITECTURE RECOMMENDATION made without a cited precedent.
  BLOCK 3 — DOCS-WITH-FEATURES. A "feature done/shipped" claim that edited code this
    turn but neither edited nor cited a doc — docs ship WITH the feature, in detail.

HONEST SCOPE: this catches a MISSING action (didn't read / didn't cite / didn't doc). It
canNOT verify a read was understood, or that a citation is the RIGHT one — that stays a
semantic, human check. It forces the act; it cannot force comprehension.

Fail-OPEN on every error (exit 0): a broken gate must never brick a session. Block 0
also fail-safes after MAX_REBLOCKS consecutive re-blocks so a detection bug cannot
infinite-loop, while still refusing an easy bypass on the normal path.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time

_CLAUDE_DIR = os.path.expanduser("~/.claude")     # portable: not hardcoded /root
LOG = f"{_CLAUDE_DIR}/hooks/verify-gate.log"
SENTINEL = f"{_CLAUDE_DIR}/hooks/.rules_gate"
GLOBAL_RULES = f"{_CLAUDE_DIR}/CLAUDE.md"          # always required after a reset
STATE_DOCS = ("CLAUDE.md", "MORNING_RECAP.md")    # required in cwd when present
MAX_REBLOCKS = 5                                   # anti-brick fail-safe for Block 0

# Tools that constitute real EVIDENCE this turn (read OR authored OR ran).
EVIDENCE_TOOLS = {
    "Read", "Grep", "Glob", "WebFetch", "WebSearch", "NotebookRead",
    "Write", "Edit", "MultiEdit", "NotebookEdit",  # authoring = current knowledge
}
# A Bash command counts as evidence only if it reads/tests/builds/inspects.
BASH_EVIDENCE = re.compile(
    r"\b(cat|head|tail|sed|awk|rg|grep|ls|find|less|more|jq|git|"
    r"pytest|ruff|npm|node|cargo|python3?|curl|diff|wc)\b"
)
# A source/config filename in the answer = a code claim worth verifying.
# (.md docs are deliberately EXCLUDED — casual doc mentions shouldn't block;
#  a specific doc claim written as path:line is still caught by CITE below.)
CODE_FILE = re.compile(
    r"\b[\w./-]+\.(py|js|mjs|cjs|ts|tsx|jsx|vue|rs|go|java|rb|c|h|cpp|cc|"
    r"css|scss|html|sh|bash|sql|toml|ini|cfg|ya?ml|json)\b"
)
CITE = re.compile(r"[\w./-]+\.\w+:\d+")       # path:line
CITE_MD = re.compile(r"[\w./-]+\.md:\d+", re.I)  # a DOC path:line (Block 3 escape)
HEDGE = re.compile(
    r"haven'?t (checked|verified|confirmed|read|run|looked|opened)"
    r"|not (yet )?verified|un-?verified|let me (check|read|verify|look|open)"
    r"|checking now|i'?ll (verify|check|read|look)|need to (check|verify|read|look)"
    r"|to verify|before (i|claiming)|no (existing )?precedent",
    re.I,
)

# Block 2 — a DESIGN/STORAGE RECOMMENDATION made before grounding it.
RECO = re.compile(
    r"\b(i recommend|my recommendation|i suggest|i'?d (recommend|suggest|put|use|go|store|seed)"
    r"|we should|you should|should (live|go|be|use|seed|store)|let'?s (use|put|store|seed|go)"
    r"|better to|best to|the right (home|place|fit|spot) is|go with"
    r"|(put|store|seed) (it|them|these|those|that|the \w+) in)\b",
    re.I,
)
ARCH = re.compile(
    r"\b(json|database|sqlite|\bdb\b|in-?memory|flat[- ]?file|seed(ed|ing|er)?|schema"
    r"|\btable\b|indexed-?db|local-?storage|persist(ed|ence)?|migration|manifest)\b",
    re.I,
)

# Block 3 — "feature done/shipped" language, and the proof-a-doc-was-handled escapes.
DONE = re.compile(
    r"\b(done|shipped|complete[d]?|finished|implemented|landed|wired up|"
    r"ready to (commit|merge|push)|feature (is )?(done|complete|ready|built))\b",
    re.I,
)
DOC_MENTION = re.compile(
    r"\b(recap|morning[_ ]?recap|docs?/plans?|documented|"
    r"updated? the docs?|docs? updated|wrote the docs?|handoff)\b",
    re.I,
)


def _log(msg: str) -> None:
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def _is_real_user(e: dict) -> bool:
    """A genuine human prompt — NOT a tool_result (those are also role=user)."""
    if e.get("type") != "user" or e.get("isMeta"):
        return False
    content = (e.get("message") or {}).get("content")
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, list):
        has_text = any(isinstance(b, dict) and b.get("type") == "text" for b in content)
        has_tr = any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
        return has_text and not has_tr
    return False


def _realpath(p: str) -> str:
    try:
        return os.path.realpath(p)
    except Exception:
        return p


def _required_state_files(cwd: str) -> list[str]:
    """The files that MUST be re-read after a reset: global rules + (if present in
    cwd) the project CLAUDE.md and MORNING_RECAP.md."""
    files = [GLOBAL_RULES]
    if cwd:
        for name in STATE_DOCS:
            p = os.path.join(cwd, name)
            if os.path.isfile(p):
                files.append(p)
    return files


def _reads_since(entries: list, start_idx: int) -> set:
    """realpaths of every file Read in entries[start_idx:] (post-reset reads)."""
    paths = set()
    for e in entries[start_idx:]:
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "Read":
                fp = (b.get("input") or {}).get("file_path")
                if fp:
                    paths.add(_realpath(fp))
    return paths


def _disarm() -> None:
    try:
        os.remove(SENTINEL)
    except Exception:
        pass


def _rules_gate(data: dict, entries: list) -> bool:
    """BLOCK 0. Returns True if it emitted a block (caller must then exit)."""
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

    required = _required_state_files(data.get("cwd") or "")
    read = _reads_since(entries, arm_n)
    missing = [p for p in required if _realpath(p) not in read]

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

    # Loop protection for blocks 1-3: if our block already fired this stop-sequence, allow.
    if data.get("stop_hook_active"):
        sys.exit(0)

    # This turn = everything after the last genuine human prompt.
    start = 0
    for i in range(len(entries) - 1, -1, -1):
        if _is_real_user(entries[i]):
            start = i + 1
            break
    turn = entries[start:]

    evidence = 0
    code_edit = False
    doc_edit = False
    texts: list[str] = []
    for e in turn:
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if not isinstance(b, dict):
                continue
            bt = b.get("type")
            if bt == "tool_use":
                name = b.get("name") or ""
                if name in EVIDENCE_TOOLS:
                    evidence += 1
                if name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
                    fp = (b.get("input") or {}).get("file_path") or ""
                    if fp.endswith(".md"):
                        doc_edit = True
                    elif CODE_FILE.search(fp):
                        code_edit = True
                elif name == "Bash":
                    cmd = (b.get("input") or {}).get("command") or ""
                    if BASH_EVIDENCE.search(cmd):
                        evidence += 1
            elif bt == "text":
                texts.append(b.get("text") or "")

    answer = "\n".join(texts).strip()
    if not answer:
        sys.exit(0)  # nothing said → nothing to gate

    hedged = bool(HEDGE.search(answer))
    has_cite = bool(CITE.search(answer))
    code_claim = bool(CODE_FILE.search(answer)) or has_cite
    reco_arch = bool(RECO.search(answer) and ARCH.search(answer))
    done_claim = bool(DONE.search(answer))
    doc_ok = doc_edit or bool(CITE_MD.search(answer)) or bool(DOC_MENTION.search(answer))

    # An honest hedge ("haven't verified — checking" / "no precedent") exempts 1-3.
    if hedged:
        _log(f"PASS hedged code_claim={code_claim} reco_arch={reco_arch} done={done_claim}")
        sys.exit(0)

    # Block 1 — CODE CLAIM with zero evidence tools this turn (answered from memory).
    if code_claim and evidence == 0:
        _log(f"BLOCK code-claim no-evidence  answer[:120]={answer[:120]!r}")
        print(json.dumps({"decision": "block", "reason": (
            "VERIFY-GATE (code) — this turn claims code (a filename or file:line) but "
            "used NO evidence tool this turn (Read/Grep/Glob/WebFetch/Write/Edit/"
            "read-Bash) and did not hedge. The exact failure the user is sick of: "
            "answering from memory. STOP. Open the file, read it per line, re-answer "
            "with file:line for every code claim — or say what you have NOT checked."
        )}))
        sys.exit(0)

    # Block 2 — a STORAGE/ARCHITECTURE RECOMMENDATION made WITHOUT grounding.
    if reco_arch and (not has_cite or evidence == 0):
        _log(f"BLOCK reco no-grounding has_cite={has_cite} evidence={evidence}  answer[:120]={answer[:120]!r}")
        print(json.dumps({"decision": "block", "reason": (
            "VERIFY-GATE (decision) — this turn RECOMMENDS a storage/architecture "
            "choice (where data lives / what shape) without grounding it: no precedent "
            "cited and/or nothing read this turn. Before recommending, OPEN how the app "
            "ALREADY does this class (the seeder, the existing store/table, the manifest "
            "loader) and CITE it file:line — or state plainly there is no precedent. Do "
            "NOT decide before reading the deciding code. (Honest limit: this checks you "
            "cited A precedent, not that it's the RIGHT one — that's still on you.)"
        )}))
        sys.exit(0)

    # Block 3 — DOCS SHIP WITH FEATURES. A "done/shipped" claim that edited code but
    # neither edited nor cited a doc. Escapes: edit a .md, cite a doc:line, or mention
    # the recap/docs (or hedge above). Forces detailed docs to land WITH the feature.
    if done_claim and code_edit and not doc_ok:
        _log(f"BLOCK docs-with-features done+code no-doc  answer[:120]={answer[:120]!r}")
        print(json.dumps({"decision": "block", "reason": (
            "VERIFY-GATE (docs) — this turn claims a feature done/shipped AND edited code, "
            "but updated or cited NO doc. Docs ship WITH the feature, in DETAIL (full "
            "prose, not headers): update MORNING_RECAP.md + the relevant docs/plans/*.md "
            "now — what changed, WHY, file:line, how to verify, what would reverse it — or "
            "cite the doc:line that already covers it. Then finish."
        )}))
        sys.exit(0)

    _log(f"PASS code_claim={code_claim} evidence={evidence} reco_arch={reco_arch} "
         f"has_cite={has_cite} done={done_claim} doc_ok={doc_ok}")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN: a gate bug must never brick a session
