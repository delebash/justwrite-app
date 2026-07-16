#!/usr/bin/env python3
"""PreToolUse(Bash) COMMIT GATE — for DELEGATED-AGENT commits ONLY (2026-07-15 strip).

A payload without `agent_id` (the main session) exits 0 immediately — see the guard in
main() for the lifetime evidence. Everything below the guard applies to a subagent's
`git commit`: docs must ship with code, and a genuine rules-checker verdict must exist
in the AGENT'S OWN transcript (`_rules.agent_transcript`).

A `git commit` is the truest "task end" the harness can see for untracked work: the
model decided a unit of work is done and is recording it. This gate runs the shared
registry's `commit` rules at that boundary:

  - `docs-with-features` — a CODE commit with no doc updated/cited → inject "update all
    relevant docs" (docs ship WITH the feature).
  - `task-completeness`  — a CODE commit with no rules-pass this turn → inject "run the
    rules-checker on the diff AND the FULL acceptance criteria (not the summary)".

It is a HARD DENY (PreToolUse permissionDecision=deny), not a nudge (panel residual:
keep it hard). THE ESCAPES, exhaustively — this list is the contract, keep it TRUE:
  - `git commit --amend` / `--dry-run` / `--help`  → allowed (not a new unit of work)
  - a NO-CODE commit (no staged path matches `_rules.CODE_FILE`) → allowed (no code →
    rules inert). NOT "every path is .md": the predicate is `commit_has_code`, so .md
    docs AND any other non-code path ride it. RESIDUAL, recorded not fixed: CODE_FILE
    needs a dotted extension from a fixed list, so extension-less infra (Makefile,
    Dockerfile, LICENSE, .gitignore) and .ps1/.bat/.tf escape here. Widening CODE_FILE
    is a real change with its own blast radius — weigh it, don't sleepwalk into it.
  - a LOW-RISK commit (every code file is test infra or copy DATA, nothing under the
    gate's own tree — `_rules.commit_low_risk`)      → allowed (risk tier, 2026-07-14)
  - an attested 'trivial' commit → allowed, via ONE channel: the commit MESSAGE
    (`_commit_message` — the -m/--message text ONLY, never the paths, never my prose).
    The turn-TEXT channel was DELETED 2026-07-15 (see the note at the `trivial =` line):
    it matched a mention, not an attestation, and silently opened this gate for a whole
    session. A `-F -`/heredoc commit therefore cannot attest trivial at all — by design:
    if it is trivial, type `-m 'trivial: …'`.
There is NO "VERDICT" escape: a self-typed `VERDICT: PASS` does NOT clear a code commit —
only a GENUINE agent verdict (`ctx["agent_pass"]`, read from a harness-authored result)
satisfies `task-completeness`. That is the v3 self-certification fix; do not re-open it by
"simplifying" this list.

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
# The `git commit` message flag, SEPARATED (`-m msg`) vs GLUED (`-m"msg"`, `--message=x`).
# Short-flag CLUSTERS carry it too — `-am`, `-sm`, `-ma"x"` — which the first draft of
# _commit_message missed, silently denying a legitimate `git commit -am 'trivial: typo'`.
_M_SEP = re.compile(r"-[a-zA-Z]*m|--message")
_M_GLUED = re.compile(r"(?:-[a-zA-Z]*m|--message=)(.+)")
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


def _git_commit_argv(cmd: str):
    """Yield the token list AFTER `commit` for each `git … commit …` segment of `cmd`.

    THE one parser. Per shell segment: require `git` to be the segment's COMMAND
    (`toks[0]`, so wrappers like `man git commit` / `echo git commit` do NOT qualify),
    shlex-tokenize (so `--amend` inside a -m message isn't read as the flag, and
    `git log --grep commit` isn't a commit), and skip git GLOBAL options — including the
    ones taking a SEPARATED value (`-C <dir>`, `--git-dir <p>`, …) — to land on the real
    subcommand. `git add -A && git commit` works because each `&&`-segment starts with
    `git`.

    Extracted 2026-07-15 (checker-caught): `_classify_commit` and `_commit_message` each
    carried a verbatim copy of this walk, and the copies had ALREADY drifted (`_commit_files`
    knew the combined `-am`/`-ma` forms; `_commit_message` did not, silently breaking the
    `git commit -am 'trivial: typo'` escape). The docstring claimed "reuses … so the two
    can't drift" — a copy is precisely the thing that drifts. One generator, two consumers,
    claim now true by construction.
    """
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
            yield rest[i + 1:]


def _classify_commit(cmd: str):
    """None (not a git commit) | 'escape' (amend/dry-run/help) | 'commit' (gate it).

    Per shell segment: require `git` to be the segment's COMMAND (`toks[0]`, so wrappers
    like `man git commit` / `echo git commit` do NOT qualify), shlex-tokenize (so
    `--amend` inside a -m message isn't read as the flag, and `git log --grep commit`
    isn't a commit), and skip git GLOBAL options — including the ones that take a
    SEPARATED value (`-C <dir>`, `--git-dir <p>`, ...) — to land on the real subcommand.
    `git add -A && git commit` works because each `&&`-segment starts with `git`."""
    # EVERY segment is evaluated and a REAL COMMIT WINS (2026-07-15, checker-caught):
    # returning on the FIRST segment let `git commit --amend --no-edit && git commit -m
    # "feat: rewrite storage"` classify as "escape" — segment 1's flag laundering segment
    # 2's real commit through the entire gate.
    seen = False
    for sub in _git_commit_argv(cmd):
        seen = True
        if not any(o in _ESCAPE_FLAGS for o in sub):
            return "commit"
    return "escape" if seen else None


def _commit_messages(cmd: str) -> list:
    """The -m/--message TEXT of each `git commit` segment — never the paths, never prose.

    WHY (checker-caught 2026-07-15): the trivial escape used to run the loose `TRIVIAL`
    family (trivial/typo/one-line/rename/dep bump/comment-only) over the WHOLE Bash
    command — which includes the staged PATHS. So
        git add src/rename/index.js && git commit -m "feat: big refactor"
    matched `\\brename\\b` on a directory name and FULL-escaped the boundary (docs AND
    verdict) on an accident of naming. The escape's whole rationale is that writing
    "trivial" in the MESSAGE is a deliberate attestation; reading it from a path is the
    opposite. Same hazard as the answer-side one narrowed to TRIVIAL_EXPLICIT — this is
    the other half.

    Consumes the ONE parser (`_git_commit_argv`) — not a copy of it. Short-flag CLUSTERS
    count: `-am`/`-sm`/`-ma…` all carry the message (checker-caught 2026-07-15 — the first
    draft matched only a bare `-m`, so `git commit -am 'trivial: typo'` silently lost its
    LEGITIMATE escape and got denied. Fail-safe direction, but a false contract).
    `-F <file>` / `-F -` (heredoc) payloads are NOT in `cmd`, so they yield no message and
    cannot escape — the safe direction.

    Returns ONE STRING PER commit segment, never a joined blob (2026-07-15,
    checker-caught): the message is now the ONLY trivial channel, so joining let one
    segment launder another — `git commit -m 'trivial: x' && git commit -m 'feat: rewrite
    storage'` escaped BOTH. The caller requires EVERY segment to attest.
    """
    out = []
    for sub in _git_commit_argv(cmd):
        msg = []
        j = 0
        while j < len(sub):
            t = sub[j]
            if _M_SEP.fullmatch(t) and j + 1 < len(sub):      # -m / -am / --message <msg>
                msg.append(sub[j + 1])
                j += 2
                continue
            glued = _M_GLUED.fullmatch(t)                      # -m"msg" / -am"msg" / --message=msg
            if glued:
                msg.append(glued.group(1))
            j += 1
        out.append("\n".join(msg))
    return out


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
    # SUBAGENT-ONLY (2026-07-15, the user's named go: "keep commit gate for sub agent").
    # The MAIN session's commits are ungated here — lifetime record: 25 decisions, 15 of
    # them the word-escape bug, 6 blocks ever; the coordinator's discipline is the
    # once-per-task checker + Block 6, both of which actually worked. A DELEGATED
    # agent's commit keeps the boundary: the coordinator cannot watch it mid-flight,
    # and since `_rules.agent_transcript` its OWN genuine verdict is what counts.
    if not data.get("agent_id"):
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
    # A DELEGATED AGENT's commit is judged on the AGENT's OWN transcript (2026-07-15).
    # The harness passes the MAIN transcript even for a subagent's call, so a builder's
    # own rules-checker verdict — which lands in its subagents/agent-<id>.jsonl — was
    # INVISIBLE here: ctx["agent_pass"] read the COORDINATOR's turn, the builder could
    # never clear this boundary no matter how many checkers it ran, and it escaped only
    # by burning MAX_DENIES above. This STRENGTHENS the gate (the real verdict now
    # counts) rather than bypassing it. Falls back to the main transcript for a
    # main-session commit, or a missing/rogue agent id.
    tpath = _rules.agent_transcript(data) or data.get("transcript_path")
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
    # The ANSWER-side trivial escape is TRIVIAL_EXPLICIT (the literal word "trivial"), not
    # the loose TRIVIAL (which also matches rename/typo/one-line). Tightened 2026-07-15
    # with the agent-transcript redirect above: ctx["answer"] is now a DELEGATED AGENT's
    # text, and a builder's whole run is ONE turn — so an incidental "renamed the prop" in
    # thousands of words of build prose would have FULL-ESCAPED this boundary (docs AND
    # verdict). The commit MESSAGE keeps the loose form: "trivial: rename" there is a
    # deliberate attestation, not an accident of narration.
    # THE COMMIT MESSAGE IS THE ONLY TRIVIAL ATTESTATION (2026-07-15, user's go).
    # The answer-text channel is DELETED: it matched a MENTION, not an attestation.
    # `TRIVIAL_EXPLICIT` is `\btrivial\b`, so any turn discussing the escape cleared the
    # gate — even "this is NOT a trivial change". Measured that day: 12 consecutive
    # `ALLOW commit (trivial attested)` in commit-gate.log while the session's topic WAS
    # this escape; the checker verdicts being run were not what let those commits through.
    # That is the self-certification hole the v3 fix closed, reborn one channel over: a
    # gate keyed on my words, satisfied by my words. The message is deliberate — you type
    # `-m 'trivial: typo'` on purpose; you cannot type it by discussing it.
    # The message must ATTEST, not merely DESCRIBE. TRIVIAL_EXPLICIT (`\btrivial\b`), not
    # the loose family: "rename"/"typo" in a message are DESCRIPTIONS you type to describe
    # the change — `-m "refactor(store): rename the undo domains"` is not a claim that the
    # commit is trivial. Same mention-vs-attestation defect as the deleted prose channel.
    msgs = _commit_messages(cmd)
    trivial = bool(msgs) and all(_rules.TRIVIAL_EXPLICIT.search(m) for m in msgs)

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
