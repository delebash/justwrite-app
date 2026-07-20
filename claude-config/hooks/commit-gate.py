#!/usr/bin/env python3
"""PreToolUse(Bash) COMMIT GATE — the post-task heavy check, LAYERED on top of Stop.

A `git commit` is the truest "task end" the harness can see for untracked work: the
model decided a unit of work is done and is recording it. This gate runs the shared
registry's `commit` rules at that boundary:

  - `docs-with-features` — a CODE commit with no doc updated/cited → inject "update all
    relevant docs" (docs ship WITH the feature).
  - `task-completeness`  — a CODE commit with no rules-pass this turn → inject "run the
    rules-checker on the diff AND the FULL acceptance criteria (not the summary)".

It is a HARD DENY (PreToolUse permissionDecision=deny), not a nudge (panel residual:
keep it hard). ESCAPES (reuse the existing rules_passed set, not a stricter one):
  - `git commit --amend` / `--dry-run` / `--help`  → allowed (not a new unit of work)
  - a DOC-ONLY commit (every staged path is .md)    → allowed (no code → rules inert)
  - an attested 'trivial' commit (TRIVIAL/VERDICT in the message or this turn)  → allowed

The Stop gate (verify-gate Blocks 0-6) STAYS as the turn-grain backstop — this ADDS the
semantic check; it never replaces the cheap structural Stop gates (a turn that edits code
then stops-to-ask commits nothing, so without Stop there'd be zero post-task check).

ANTI-LOOP: a sentinel counts consecutive denies; after MAX_DENIES it fail-safes (allow)
so a detection bug can't permanently wedge a commit. A clean pass clears the counter.
Fail-OPEN on every error (exit 0); LOUD warn if the registry won't import.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import time

_CLAUDE_DIR = os.path.expanduser("~/.claude")
LOG = f"{_CLAUDE_DIR}/hooks/commit-gate.log"
SENTINEL = f"{_CLAUDE_DIR}/hooks/.commit_gate"
MAX_DENIES = 4  # anti-loop fail-safe

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import _rules
    _RULES_OK = True
    _IMPORT_ERR = None
except Exception as _e:  # pragma: no cover - exercised by the fail-open smoke
    _RULES_OK = False
    _IMPORT_ERR = _e

_SEG = re.compile(r"&&|\|\||;|\|")
_ESCAPE_FLAGS = {"--amend", "--dry-run", "-h", "--help"}
# git GLOBAL options that take a SEPARATED value — the value must be skipped so it
# isn't mistaken for the subcommand (e.g. `git -C /path commit`).
_GIT_VALUE_OPTS = ("-c", "-C", "--git-dir", "--work-tree", "--namespace", "--super-prefix")


def _log(msg: str) -> None:
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def _emit_deny(reason: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))


def _classify_commit(cmd: str):
    """None (not a git commit) | 'escape' (amend/dry-run/help) | 'commit' (gate it).

    Per shell segment: require `git` to be the segment's COMMAND (`toks[0]`, so wrappers
    like `man git commit` / `echo git commit` do NOT qualify), shlex-tokenize (so
    `--amend` inside a -m message isn't read as the flag, and `git log --grep commit`
    isn't a commit), and skip git GLOBAL options — including the ones that take a
    SEPARATED value (`-C <dir>`, `--git-dir <p>`, ...) — to land on the real subcommand.
    `git add -A && git commit` works because each `&&`-segment starts with `git`."""
    for seg in _SEG.split(cmd):
        try:
            toks = shlex.split(seg)
        except Exception:
            toks = seg.split()
        if not toks or toks[0] != "git":
            continue
        rest = toks[1:]
        i = 0
        while i < len(rest):  # skip git global options to reach the subcommand
            t = rest[i]
            if t in _GIT_VALUE_OPTS and i + 1 < len(rest):
                i += 2
                continue
            if t.startswith("-"):
                i += 1
                continue
            break
        if i < len(rest) and rest[i] == "commit":
            sub = rest[i + 1:]
            if any(o in _ESCAPE_FLAGS for o in sub):
                return "escape"
            return "commit"
    return None


def _git_cwd(cmd: str, fallback: str) -> str:
    """The repo dir a `git -C <dir>` targets — so the staged-tree inspection reads the
    RIGHT repo (Checker A's secondary gap), else the hook's own cwd."""
    fallback = fallback or "."
    for seg in _SEG.split(cmd):
        try:
            toks = shlex.split(seg)
        except Exception:
            toks = seg.split()
        if not toks or toks[0] != "git":
            continue
        for j in range(1, len(toks) - 1):
            if toks[j] == "-C":
                d = toks[j + 1]
                return d if os.path.isabs(d) else os.path.join(fallback, d)
    return fallback


def _counter() -> int:
    try:
        with open(SENTINEL, encoding="utf-8") as f:
            return int(json.load(f).get("denies", 0))
    except Exception:
        return 0


def _set_counter(n: int) -> None:
    try:
        with open(SENTINEL, "w", encoding="utf-8") as f:
            json.dump({"denies": n}, f)
    except Exception:
        pass


def _clear_counter() -> None:
    try:
        os.remove(SENTINEL)
    except Exception:
        pass


def _commit_files(cmd: str, cwd: str):
    """The paths this commit will record (staged; + unstaged-tracked for `-a`/`-am`).
    Returns a list, or None if git couldn't be inspected."""
    cwd = cwd or "."
    calls = [["git", "-C", cwd, "diff", "--cached", "--name-only"]]
    if re.search(r"(^|\s)-(a|am|ma)\b|--all\b", cmd):
        calls.append(["git", "-C", cwd, "diff", "--name-only"])
    files, ok = set(), False
    for args in calls:
        try:
            r = subprocess.run(args, capture_output=True, text=True, timeout=5)
            if r.returncode == 0:
                ok = True
                files.update(l.strip() for l in r.stdout.splitlines() if l.strip())
        except Exception:
            pass
    if not ok:
        return None
    return sorted(files)


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)
    if (data.get("tool_name") or "") != "Bash":
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command") or ""

    kind = _classify_commit(cmd)
    if kind is None:
        sys.exit(0)  # not a git commit → allow instantly
    if kind == "escape":
        _log("ALLOW commit escape (amend/dry-run/help)")
        _clear_counter()
        sys.exit(0)

    # Registry unavailable → LOUD warn + fail OPEN (never block a commit on a broken gate).
    if not _RULES_OK:
        sys.stderr.write(
            f"⚠ commit-gate: rule registry (_rules.py) failed to import ({_IMPORT_ERR}) "
            "— the commit gate is OFF. Fix _rules.py.\n")
        _log(f"WARN registry import failed: {_IMPORT_ERR}")
        sys.exit(0)

    # Anti-loop fail-safe: don't wedge a commit forever on a detection bug.
    if _counter() >= MAX_DENIES:
        _log(f"ALLOW commit fail-safe after {_counter()} denies")
        _clear_counter()
        sys.exit(0)

    entries = []
    tpath = data.get("transcript_path")
    if tpath and os.path.isfile(tpath):
        try:
            with open(tpath, encoding="utf-8") as f:
                entries = [json.loads(l) for l in f if l.strip()]
        except Exception:
            entries = []

    ctx = _rules.build_ctx(data, entries, "commit")
    # A self-typed "VERDICT: PASS" no longer clears a code commit — only a GENUINE
    # independent-agent verdict does (ctx["agent_pass"], read from a harness-authored
    # task-notification in build_ctx; the main agent cannot forge a user-role result).
    # A 'trivial' attestation is still a full escape (cheap path for typo/rename commits).
    trivial = bool(_rules.TRIVIAL.search(cmd)) or bool(_rules.TRIVIAL.search(ctx["answer"]))

    files = _commit_files(cmd, _git_cwd(cmd, data.get("cwd") or ""))
    if files:
        code = [f for f in files if _rules.CODE_FILE.search(f)]
        md = [f for f in files if f.endswith(".md")]
        ctx["commit_has_code"] = bool(code)
        ctx["commit_docs_ok"] = bool(md) or ctx["doc_ok"]
        ctx["commit_low_risk"] = _rules.commit_low_risk(files)
    else:
        # Couldn't inspect / nothing detected → conservative: gate as a code commit.
        ctx["commit_has_code"] = True
        ctx["commit_docs_ok"] = ctx["doc_ok"]
        ctx["commit_low_risk"] = False   # can't inspect → HIGH (default)

    # FULL escapes (design #4) — allow the commit outright, before the rules run:
    #   doc-only (no code staged) · attested 'trivial' · RISK-TIER low-risk (every
    #   code file is test infra / copy data, nothing under the gate's own tree).
    #   Any product/storage/DB/Rust/migration file never matches LOW_RISK, so a
    #   HIGH commit still needs BOTH docs and the genuine independent-agent verdict.
    # (`--amend`/`--dry-run`/`--help` were already handled as 'escape' above.)
    if not ctx["commit_has_code"]:
        _clear_counter()
        _log("ALLOW commit (doc-only)")
        sys.exit(0)
    if trivial:
        _clear_counter()
        _log("ALLOW commit (trivial attested)")
        sys.exit(0)
    if ctx["commit_low_risk"]:
        _clear_counter()
        _log("ALLOW commit (low-risk: tests/copy only)")
        sys.exit(0)

    # A CODE commit: require BOTH docs (docs-with-features) AND a verdict (task-completeness).
    fails = _rules.run_rules("commit", ctx)
    if not fails:
        _clear_counter()
        _log(f"ALLOW commit (has_code={ctx['commit_has_code']} docs_ok={ctx['commit_docs_ok']} "
             f"rules_passed={ctx['rules_passed']})")
        sys.exit(0)

    for rid, _ in fails:
        _log(f"BLOCK {rid} (commit)")
    _set_counter(_counter() + 1)
    reason = ("COMMIT GATE — this commit is blocked until the post-task checks pass:\n\n"
              + "\n\n".join(inj for _, inj in fails)
              + "\n\nEscapes: a doc-only commit, `git commit --amend`, or an attested "
                "'trivial' commit (say so in the message) are exempt.")
    _emit_deny(reason)
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail-OPEN: a gate bug must never block tool use
