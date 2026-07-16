#!/usr/bin/env python3
"""Shared rule REGISTRY for the rules-as-checks hooks — the ONE place the rules live.

WHY THIS FILE EXISTS: the Stop gate (verify-gate.py), the PreToolUse gate
(pre-action-check.py), the Task gate (task-gate.py) and the commit gate
(commit-gate.py) each used to carry their OWN copy of the same regexes
(VERDICT / TRIVIAL / CODE_FILE / ...) and the same turn-scan logic. Three-plus
copies DRIFT — the "Block-5 uncounted" miss came from exactly a parallel hand-kept
list. This module defines the regexes, the turn-scan, the genuine-user detection,
and the RULE REGISTRY once; every hook imports it. The rule `id` is ALSO the
gate-stats log-key, so there is a single source for the metrics too.

SAFETY (panel-caught): sharing code makes this a single point of failure — a bug
here could disable EVERY gate at once, where today a bug fails open ONE block. So
each hook keeps its OWN `try/except import _rules` and, on failure, FAILS OPEN with
a LOUD warning (never silently). The smoke test asserts this module imports AND that
run_rules returns ARMED for every event — "doesn't brick" is not enough.

A rule = {
  id:           str    # stable log-key (gate-stats rolls up by this) + identity
  label:        str    # short human description (gate-stats roll-up label)
  events:       [str]  # hook events it runs at: Stop | commit | TaskCreated | TaskCompleted
  kind:  "structural"|"semantic"
         #  structural = satisfied by a concrete cheap act detectable in the
         #               transcript (a Read, a file:line citation, a doc write)
         #  semantic   = the intended remedy is the rules-checker subagent (judgment
         #               a script cannot do); satisfied by a real checker run, a cited
         #               VERDICT, or a trivial attestation
  recheck: "evidence"|"text"
         #  evidence = heals when a TOOL ACTION appears next (Block 0: the Read
         #             happened). Has bespoke per-hook mechanics (a sentinel loop) and
         #             is NOT dispatched by run_rules — it stays in RULES for identity,
         #             stats and the smoke's "armed" check.
         #  text     = heals when the ANSWER is rewritten, re-checked on the next Stop.
  hedge_exempt: bool   # an honest hedge ("haven't verified") exempts it — but only at
                       # the Stop event (preserves the original behavior; never at commit)
  detect: fn(ctx)->bool   # True == the rule FAILS (should fire)
  inject: str             # the instruction injected / fed back when it fails
}

run_rules(event, ctx) -> [(id, inject)]   # the failing TEXT rules for this event
"""
from __future__ import annotations

import os
import re

# --------------------------------------------------------------------------
# Shared regexes — the SINGLE source (were triplicated across the hooks).
# --------------------------------------------------------------------------

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
# --- commit-gate RISK TIER (generic; names no task/project) ------------------
# A commit is "low-risk" only when EVERY code file matches LOW_RISK: test infra
# and copy DATA. Path-segment / basename-anchored, NEVER a bare substring (so
# `latest.py` / `contest.py` are not mistaken for tests). This is an ALLOWLIST of
# universal conventions — everything else (storage, migrations, Rust, DB, UI,
# services, any product code, in any repo) is HIGH by DEFAULT, nothing to enumerate.
LOW_RISK = re.compile(
    r"(^|/)tests?/|(^|/)__tests__/|(^|/)e2e/"                          # test dirs
    r"|(^|/)test_[^/]+\.py$|(^|/)[^/]+_test\.py$|(^|/)conftest\.py$"    # python tests
    r"|\.(test|spec)\.[cm]?[jt]sx?$"                                   # js/ts tests
    r"|(^|/)[^/]*-(probe|smoke)\.mjs$"                                 # harness scripts
    r"|(^|/)(locales?|i18n|lang)/[^/]*\.(json|po|pot|ftl|csv|ya?ml|txt)$",  # copy DATA only
    re.I,
)
# The gate's OWN tree is NEVER low-risk — a commit here (incl. its test harness)
# keeps the full checker so the gate can't be weakened via a "low-risk" escape.
GATE_TREE = re.compile(
    r"(^|/)(claude-config/hooks|\.claude/hooks)/"                      # vendored subdir + installed
    r"|(^|/)hooks/(_rules|commit-gate|verify-gate|pre-action-check"    # standalone repo: named
    r"|task-gate|gate-stats|test_gates|arm-rules-gate|self-update)\."  # gate files at hooks/ root
)
CITE = re.compile(r"[\w./-]+\.\w+:\d+")            # path:line
CITE_MD = re.compile(r"[\w./-]+\.md:\d+", re.I)    # a DOC path:line (docs-rule escape)
HEDGE = re.compile(
    r"haven'?t (checked|verified|confirmed|read|run|looked|opened)"
    r"|not (yet )?verified|un-?verified|let me (check|read|verify|look|open)"
    r"|checking now|i'?ll (verify|check|read|look)|need to (check|verify|read|look)"
    r"|to verify|before (i|claiming)|no (existing )?precedent",
    re.I,
)
# A DESIGN/STORAGE RECOMMENDATION made before grounding it.
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
# "feature done/shipped" language, and the proof-a-doc-was-handled escapes.
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
# A PLAN/DECISION announced (an event, like "done").
PLAN_LOCK = re.compile(
    r"\bhere'?s? (is )?(the|my|our) plan\b"
    r"|\bplan is (locked|set|final|finalized|ready)\b"
    r"|\block(?:ed|ing)?\s+(?:(?:the|this|my|our|it)\s+)?(?:plan|design)\b"
    r"|\block(?:ed)?\s+down\s+the\s+plan\b"
    r"|\bthe (locked|final) plan\b|\bplan locked\b|\bdesign is locked\b"
    r"|\bwe'?ve decided\b|\bwe have decided\b|\b(final|locked) decision\b"
    r"|\bdecision is (made|final|locked)\b",
    re.I,
)
# A rules-pass that ACTUALLY happened (not merely narrated). For the BLOCKING gates,
# loose prose like "I'll run the rules-checker next" must NOT count — that was the
# escape hole the dogfood panel caught. Require a real subagent run (detected in the
# turn scan), a cited checker VERDICT, or an explicit trivial attestation.
VERDICT = re.compile(
    r"\bVERDICT:\s*(PASS|FAIL)\b"
    r"|\bT(1[0-2]|[1-9])\b[^\n]{0,30}\b(PASS|FAIL)\b[^\n]{0,200}?"
    r"\bT(1[0-2]|[1-9])\b[^\n]{0,30}\b(PASS|FAIL)\b",
    re.I,
)
TRIVIAL = re.compile(r"\b(trivial|one[- ]?line|typo|comment[- ]?only|dep bump|rename)\b", re.I)
# A PROSE tests-citation ("T1 <why> · T2 <why> · T5 <why>") — the format the
# task-begin/post-task injects always ASKED for ("cite the tests it passes") but
# VERDICT never accepted (it requires literal PASS/FAIL words). #253 recurrence,
# 2026-07-10: two live task-gate denials fired on exactly this mismatch — the
# turn text cited eight T-numbers with reasons and was still blocked. Three or
# more DISTINCT T-numbers = a deliberate citation (ordinary prose says "T1–T12"
# — two distinct — or names one test); the hard boundaries (commit, plan lock)
# are unaffected — they read agent_pass, never this.
TESTS_CITED_TOKEN = re.compile(r"\bT(1[0-2]|[1-9])\b")


def tests_cited(text: str) -> bool:
    return len(set(TESTS_CITED_TOKEN.findall(text or ""))) >= 3


def commit_low_risk(files) -> bool:
    """True iff this commit is entirely LOW blast-radius: it has code, touches
    NOTHING under the gate's own tree, and EVERY code file matches LOW_RISK (test
    infra + copy data). Reuses CODE_FILE for the code filter (one source, can't
    drift from commit-gate's own `code = [...CODE_FILE...]`). Default-HIGH: an
    uninspectable / empty / mixed / gate-tree / product commit returns False.
    Generic — names no task or project."""
    code = [f for f in files if CODE_FILE.search(f)]
    if not code:
        return False                                   # no code → doc-only handled upstream
    if any(GATE_TREE.search(f) for f in files):
        return False                                   # the gate's own tree is never low-risk
    return all(LOW_RISK.search(f) for f in code)       # every code file must be low-risk


# ---- #237 think-twice regexes (2026-07-09) ---------------------------------
# WHY: the user's finding — "when I asked you to think twice you change severla
# decsions" — a second pass empirically changes outcomes, and a text rule alone
# decays ("if it is a rule you just ingore it halft the time"). These power the
# three #237 gates: the hardened plan rule, the second-pass rule (Block 6), and
# the pre-edit plan-line check in pre-action-check.py.
#
# A PROPOSAL put to the user (a design/approach/fix I authored). Broader than a
# plan LOCK: every proposal must END with an explicit "SECOND PASS —" section.
PROPOSAL = re.compile(
    r"\b(i propose|my proposal|proposed (design|approach|fix|change|spec|upgrade)"
    r"|here'?s (the |my )?(design|approach|proposal)"
    r"|i recommend|my recommendation|recommended (approach|design|fix|order))\b",
    re.I,
)
# The section marker itself ("SECOND PASS — what changed / what re-verified /
# sharpest remaining doubt"). A pasted marker with no re-derivation defeats its
# own purpose — that residual stays semantic, same honest ceiling as everywhere.
SECOND_PASS = re.compile(r"\bsecond pass\b", re.I)
# Provenance escape on the plan rule: a turn that merely RECORDS the USER's own
# decision is not my design and needs no checker. Writing this when the decider
# was actually me is a flagrant lie in the transcript — same class as the
# decoy-agent residual documented on agent_pass, visible, not a casual self-cert.
USER_DECIDED = re.compile(
    r"\b(the user('s)? (decision|word|words|call|pick)|user[- ]decided"
    r"|per the user|user, verbatim|the user('s)? said"
    r"|you decided|your (decision|call|word|words))\b",
    re.I,
)
# What a first code edit must cite: the governing artifact being executed — a
# doc path:line, a §-section, the plan/queue doc by name, or the user's word.
PLAN_REF = re.compile(
    r"[\w./-]+\.md:\d+|§\s?[\dA-Z]|\bqueue doc\b|\bplan doc\b"
    r"|\bper the (revised |committed )?(plan|spec)\b"
    r"|\bexecuting[^\n]{0,120}(plan|spec|doc)\b"
    r"|\b(the user('s)? (word|words|verbatim|instruction)|user, verbatim)\b",
    re.I,
)
# ...and the one-line doubt it must carry ("RISK: <what could be wrong>").
# No ASCII hyphen in the class after "risk" — it would match the boilerplate
# word "risk-free" (checker-caught); the prescribed form is "RISK:".
RISK_LINE = re.compile(
    r"\brisk\s*[:—–]|\bwhat could (be|go) wrong\b|\bcould be wrong\s*[:—–-]"
    r"|\bfailure mode\s*[:—–-]",
    re.I,
)
# The EXPLICIT trivial attestation for the pre-edit plan-line check. Deliberately
# narrower than TRIVIAL: words like "rename"/"one-line" appear in ordinary task
# names (a build turn for a rename task would silently skip the check).
TRIVIAL_EXPLICIT = re.compile(r"\btrivial\b", re.I)

# A GENUINE rules-checker verdict comes from a HARNESS-authored <task-notification>
# (a type:user message the main agent CANNOT write — it emits only assistant messages),
# inside <result>...</result>. The whole anti-self-certification point: the gate reads
# the verdict from the AGENT's result, never from my own typed "VERDICT:" text.
TASK_NOTIF = re.compile(r"<task-notification>", re.I)
RESULT_TAG = re.compile(r"<result>(.*?)</result>", re.S | re.I)
_V_PASS = re.compile(r"\bVERDICT:\s*PASS\b", re.I)
_V_FAIL = re.compile(r"\bVERDICT:\s*FAIL\b", re.I)

# A user-role transcript entry that is actually a SYSTEM/TOOL INJECTION, not a genuine
# human prompt — so it must NOT be treated as a turn boundary (the live bug: a
# <task-notification> arriving mid-turn reset the "first edit of the turn" window and
# fired a spurious pre-task DENY). Anchored to the wrapper tag at the start of the
# message. `<command-name>` (slash commands the user typed) and plain text stay
# genuine; verified against the real transcript shapes.
#
# #253 (2026-07-10, evidence: the full 31k-entry live-transcript sweep in the queue
# doc's #253 record): the CURRENT harness records ToolSearch replies as tool_results
# and hook feedback as isMeta — both already excluded — and every bare plain-text
# user entry in the sweep was a genuine prompt. The three plain-text prefixes below
# are DEFENSIVE: they are the 2026-07-09 EFFECTIVENESS-recorded injection shapes
# ("Tool loaded." reset the turn window as a bare user entry pre-restart), kept so a
# harness that ever emits them bare again cannot reset the window. No genuine human
# prompt starts with these strings.
INJECTED_USER = re.compile(
    r"^\s*<(task-notification|task-reminder|system-reminder|local-command-stdout"
    r"|local-command-stderr|bash-input|bash-stdout|bash-stderr|post-tool-use"
    r"|local-command-caveat)\b"
    r"|^\s*Tool loaded\."
    r"|^\s*The task tools haven'?t been used recently"
    r"|^\s*\[SYSTEM NOTIFICATION",
    re.I,
)

# --------------------------------------------------------------------------
# Block-0 (reset-reread) constants + helpers (lifted from verify-gate).
# --------------------------------------------------------------------------
_CLAUDE_DIR = os.path.expanduser("~/.claude")
GLOBAL_RULES = f"{_CLAUDE_DIR}/CLAUDE.md"          # always required after a reset
STATE_DOCS = ("CLAUDE.md", "MORNING_RECAP.md")     # required in cwd when present


def realpath(p: str) -> str:
    try:
        return os.path.realpath(p)
    except Exception:
        return p


def required_state_files(cwd: str) -> list:
    """The files that MUST be re-read after a reset: global rules + (if present in
    cwd) the project CLAUDE.md and MORNING_RECAP.md."""
    files = [GLOBAL_RULES]
    if cwd:
        for name in STATE_DOCS:
            p = os.path.join(cwd, name)
            if os.path.isfile(p):
                files.append(p)
    return files


def reads_since(entries: list, start_idx: int) -> set:
    """realpaths of every file Read in entries[start_idx:] (post-reset reads)."""
    paths = set()
    for e in entries[start_idx:]:
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "Read":
                fp = (b.get("input") or {}).get("file_path")
                if fp:
                    paths.add(realpath(fp))
    return paths


def block0_missing(data: dict, entries: list, arm_n: int) -> list:
    """Required state files not yet Read since the sentinel was armed (Block 0)."""
    required = required_state_files(data.get("cwd") or "")
    read = reads_since(entries, arm_n)
    return [p for p in required if realpath(p) not in read]


# --------------------------------------------------------------------------
# Turn boundary + turn scan (shared by every hook).
# --------------------------------------------------------------------------

def _payload_text(data: dict) -> str:
    """The me-authored ATTESTATION strings inside the HOOK PAYLOAD's tool_input
    — ONLY the keys that carry a task's own stated plan (a TaskCreate
    subject/description/activeForm), NEVER content-bearing keys. build_ctx is
    shared with pre-action-check, so joining ALL values would let an Edit's own
    old_string/new_string satisfy the first-code-edit deny — editing the gate
    files themselves (saturated with 'trivial'/'RISK:'/doc:line tokens) would
    silently void the #237 second-look (checker-caught, 2026-07-10). The
    allowlisted keys are absent from Edit/Write payloads, so the pre-edit gate
    never sees payload text at all. This is the one attest source that is
    deterministically present at hook time (#253: the remote harness strips
    thinking content and flushes mid-turn text unreliably)."""
    try:
        ti = (data or {}).get("tool_input") or {}
        if not isinstance(ti, dict):
            return ""
        keys = ("subject", "description", "activeForm")
        return " ".join(str(ti[k]) for k in keys if isinstance(ti.get(k), str))
    except Exception:
        return ""


def _user_text(e: dict):
    """(text, has_tool_result) for a non-meta user entry, else (None, False)."""
    if e.get("type") != "user" or e.get("isMeta"):
        return None, False
    c = (e.get("message") or {}).get("content")
    if isinstance(c, str):
        return c, False
    if isinstance(c, list):
        has_tr = any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c)
        text = " ".join(
            b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"
        )
        return text, has_tr
    return None, False


def is_genuine_user(e: dict) -> bool:
    """A real HUMAN prompt — not a tool_result, not meta, and not a system/tool
    injection wrapped as a user message (task-notification / command stdout / a bare
    reminder). These injections must not reset the turn window."""
    text, has_tr = _user_text(e)
    if text is None or has_tr:
        return False
    t = text.strip()
    if not t:
        return False
    if INJECTED_USER.search(t):
        return False
    return True


def last_user_idx(entries: list) -> int:
    """Index just-after which the current turn begins (the last genuine human prompt)."""
    for i in range(len(entries) - 1, -1, -1):
        if is_genuine_user(entries[i]):
            return i
    return 0


def scan_turn(entries: list, start: int) -> dict:
    """Raw facts about the assistant's actions since `start`: evidence count,
    code/doc edits, edit count, whether a subagent ran, joined text — plus the
    joined THINKING text (#253, 2026-07-10: in the remote harness, assistant
    TEXT blocks flush to the transcript unreliably mid-turn — a live window
    showed 2 of ~6 text messages present against 23/23 thinking and 21/21
    tool_use blocks — so thinking is the one authored channel a mid-turn gate
    can depend on)."""
    f = {"evidence": 0, "edits": 0, "code_edits": 0, "code_edit": False,
         "doc_edit": False, "subagent_ran": False, "answer": "", "thinking": ""}
    texts = []
    thinks = []
    for e in entries[start:]:
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if not isinstance(b, dict):
                continue
            bt = b.get("type")
            if bt == "thinking":
                thinks.append(b.get("thinking") or "")
            elif bt == "tool_use":
                name = b.get("name") or ""
                if name in EVIDENCE_TOOLS:
                    f["evidence"] += 1
                if name in ("Task", "Agent"):
                    f["subagent_ran"] = True
                if name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
                    f["edits"] += 1
                    fp = (b.get("input") or {}).get("file_path") or ""
                    if fp.endswith(".md"):
                        f["doc_edit"] = True
                    elif CODE_FILE.search(fp):
                        f["code_edit"] = True
                        f["code_edits"] += 1
                elif name == "Bash":
                    cmd = (b.get("input") or {}).get("command") or ""
                    if BASH_EVIDENCE.search(cmd):
                        f["evidence"] += 1
            elif bt == "text":
                texts.append(b.get("text") or "")
    f["answer"] = "\n".join(texts).strip()
    f["thinking"] = "\n".join(thinks).strip()
    return f


def agent_pass(entries: list, start: int):
    """The latest GENUINE rules-checker verdict this turn: 'pass' / 'fail' / None.

    Genuine = the output of a rules-checker AGENT I spawned, in a HARNESS-authored entry
    that the main agent cannot forge (the main agent emits only assistant messages). Two
    real transcript shapes (verified against the live transcript):
      • SYNC  — a type:user `tool_result` whose `tool_use_id` matches an Agent/Task
        tool_use I made. The agent-id link is REQUIRED: a Read/Bash tool_result that
        merely CONTAINS "VERDICT: PASS" (e.g. reading a doc with that text) must NOT count.
      • ASYNC — inside `<result>` of a type:user `<task-notification>` (only the harness
        emits those, for an agent that finished).
    A self-typed "VERDICT:" in MY assistant text is ignored on purpose — that is the whole
    anti-self-certification point. Latest verdict wins (FAIL → fix → re-run PASS converges).
    Honest residual: a decoy agent deliberately told to emit PASS would count — but that is
    a flagrant, visible act in the transcript, not a casual self-cert."""
    # 1) ids of the Agent/Task calls I made — from the WHOLE transcript, not just
    # this turn (#253 second resolution, 2026-07-10: an async checker spawned in
    # turn N delivers its verdict in turn N+1 as a tool_result whose tool_use_id
    # points at the PRIOR turn's Agent call; a window-scoped id set made that
    # genuine verdict invisible — live-captured at transcript idx 35315). The
    # verdict itself must still arrive IN-WINDOW (the loop below scans
    # entries[start:]), so recency is preserved; only the spawn may be older.
    agent_ids = set()
    for e in entries:
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if (isinstance(b, dict) and b.get("type") == "tool_use"
                    and b.get("name") in ("Agent", "Task") and b.get("id")):
                agent_ids.add(b["id"])
    # 2) read verdicts only from harness-authored user entries (sync tool_result tied to an
    #    agent id, or async task-notification result).
    verdict = None
    for e in entries[start:]:
        if e.get("type") != "user" or e.get("isMeta"):
            continue
        c = (e.get("message") or {}).get("content")
        texts = []
        if isinstance(c, str):
            if TASK_NOTIF.search(c):
                texts = RESULT_TAG.findall(c) or [c]
        elif isinstance(c, list):
            for b in c:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "tool_result" and b.get("tool_use_id") in agent_ids:
                    rc = b.get("content")
                    if isinstance(rc, str):
                        texts.append(rc)
                    elif isinstance(rc, list):
                        texts.append(" ".join(x.get("text", "") for x in rc
                                              if isinstance(x, dict) and x.get("type") == "text"))
                elif b.get("type") == "text" and TASK_NOTIF.search(b.get("text", "")):
                    texts += RESULT_TAG.findall(b.get("text", ""))
        for t in texts:
            if _V_FAIL.search(t):
                verdict = "fail"
            elif _V_PASS.search(t):
                verdict = "pass"
    return verdict


# A harness agent id, strictly. No separators, no dots — so it can never traverse out of
# the subagents/ dir when interpolated into a path (see agent_transcript's docstring).
_ID_OK = re.compile(r"[A-Za-z0-9_-]+")


def agent_transcript(data: dict) -> str:
    """The OWN transcript of the delegated agent making this call, or "".

    THE shared fix for the 2026-07-15 defect class — *a hook reads `transcript_path`
    assuming it belongs to the caller*. It does not: the harness passes the MAIN session
    transcript even for a subagent's tool call, while the agent's own turns land at
    `<session-dir>/subagents/agent-<agent_id>.jsonl` (live-captured; see
    pre-action-check.py's docstring).

    A gate that judges the AGENT's own work — its text, its doc edits, its checker
    verdict — must read THIS file; on the main transcript all of it is invisible, which
    made the commit boundary un-clearable for a builder (it could run checkers all day
    while `agent_pass` read the coordinator's turn, escaping only by burning the
    anti-loop counter). Reading the right file PRESERVES the check rather than bypassing
    it: exactly ONE diff-checker before a commit — the user's rule — now actually
    enforced against the agent doing the committing.

    Every caller is one line:  `agent_transcript(data) or data.get("transcript_path")`.
    The path derives ONLY from the payload's own session transcript + agent_id, is
    format-checked, and must exist — a missing/rogue id falls back to prior behavior,
    never to another agent's verdict.

    The `_ID_OK` guard is why that last clause is TRUE rather than merely asserted
    (checker-caught 2026-07-15): `agent_id` is interpolated into a path, and on Windows
    `..` canonicalizes LEXICALLY without the intermediate dirs existing — so a
    separator-bearing id like `a/../agent-<other>` would resolve to ANOTHER agent's
    transcript and pass isfile(). Not reachable today (agent_id is harness-generated, not
    model-controllable; forging the payload implies code execution already), but this
    file's whole thesis is that a gate keyed on words can be satisfied by words — an
    unenforced "never" in a security docstring is that same failure in miniature. So the
    code enforces it.
    """
    agent_id = data.get("agent_id")
    tpath = data.get("transcript_path") or ""
    if not agent_id or not _ID_OK.fullmatch(str(agent_id)) or not tpath.endswith(".jsonl"):
        return ""
    p = os.path.join(tpath[: -len(".jsonl")], "subagents", f"agent-{agent_id}.jsonl")
    return p if os.path.isfile(p) else ""


def build_ctx(data: dict, entries: list, event: str) -> dict:
    """The full context every rule's detect() reads. Pure: no side effects."""
    start = last_user_idx(entries)
    f = scan_turn(entries, start)
    answer = f["answer"]
    ctx = dict(f)
    ctx["event"] = event
    ctx["hedged"] = bool(HEDGE.search(answer))
    ctx["has_cite"] = bool(CITE.search(answer))
    ctx["code_claim"] = bool(CODE_FILE.search(answer)) or ctx["has_cite"]
    ctx["reco_arch"] = bool(RECO.search(answer) and ARCH.search(answer))
    ctx["done_claim"] = bool(DONE.search(answer))
    ctx["doc_ok"] = f["doc_edit"] or bool(CITE_MD.search(answer)) or bool(DOC_MENTION.search(answer))
    ctx["plan_lock"] = bool(PLAN_LOCK.search(answer))
    # THE ATTEST CHANNEL (#253, 2026-07-10): visible text + thinking + the gated
    # call's ALLOWLISTED tool_input keys (subject/description/activeForm — see
    # _payload_text; NEVER content-bearing keys, so an Edit's own new_string can
    # never satisfy the pre-edit second-look). Feeds ONLY the AFFIRMATIVE
    # escapes — the rules-pass signals and the pre-edit plan-ref/RISK/trivial
    # attestations — never the violation detectors. WHY three sources
    # (live-probed in the remote harness this day): mid-turn assistant TEXT
    # flushes unreliably (2 of ~6 messages present), thinking blocks flush but
    # their content is STRIPPED (empty string, signature only), while the hook
    # payload is deterministically present at hook time. A description-carried
    # citation is me-authored self-attestation — acceptable ONLY at these light
    # gates (the hard boundaries read agent_pass, never this). So: cite the
    # tests / 'trivial' in the gated call's own description field and the gate
    # can always see it; text/thinking still count where they flush. The
    # VIOLATION detectors (code_claim / reco / done / plan_lock / proposal /
    # second_pass / user_decided) stay on the VISIBLE answer only: exploratory
    # thinking or tool args must never false-fire a block the user can't see.
    attest = f"{answer}\n{f['thinking']}\n{_payload_text(data)}"
    ctx["rules_passed"] = (f["subagent_ran"] or bool(VERDICT.search(attest))
                           or bool(TRIVIAL.search(attest)) or tests_cited(attest))
    # #237 think-twice facts. `proposal` = authored-proposal language, OR lock
    # language NOT attributed to the user (a "the user decided X" record turn is
    # not my proposal; "I propose X" always is, even when quoting the user).
    ctx["user_decided"] = bool(USER_DECIDED.search(answer))
    ctx["proposal"] = bool(PROPOSAL.search(answer)) or (
        ctx["plan_lock"] and not ctx["user_decided"])
    ctx["second_pass"] = bool(SECOND_PASS.search(answer))
    ctx["plan_ref"] = bool(PLAN_REF.search(attest))
    ctx["risk_line"] = bool(RISK_LINE.search(attest))
    ctx["trivial_explicit"] = bool(TRIVIAL_EXPLICIT.search(attest))
    # Block 0 (Stop, evidence-recheck) — filled by verify-gate via block0_missing when a
    # sentinel exists; default empty so the rule passes when no reset is pending.
    ctx["missing"] = []
    # Commit facts — defaults; commit-gate overrides after inspecting the staged tree.
    # Default to "has code, no docs" so an UNKNOWN commit is gated, never waved through.
    ctx["commit_has_code"] = True
    ctx["commit_docs_ok"] = False
    ctx["commit_low_risk"] = False   # commit-gate overrides after inspecting the staged tree
    # The GENUINE independent-agent verdict this turn (None until a real rules-checker
    # finishes). Read from the agent's own result, NOT my text — this is what the commit
    # boundary requires so a self-typed verdict can't clear it.
    ctx["agent_pass"] = agent_pass(entries, start)
    return ctx


# --------------------------------------------------------------------------
# The rule registry — defined ONCE.
# --------------------------------------------------------------------------

def _detect_docs(ctx: dict) -> bool:
    """Docs ship with the code. COMMIT-only since the 2026-07-15 strip (its Stop leg was
    a prose-scan; the commit leg reads the STAGED TREE — an act)."""
    return ctx["commit_has_code"] and not ctx["commit_docs_ok"]


def _detect_task_completeness(ctx: dict) -> bool:
    """A code commit requires an INDEPENDENT agent's PASS verdict — `ctx["agent_pass"]
    == "pass"`, read from a harness-authored task-notification (an act; a self-typed
    "VERDICT: PASS" does not clear it). COMMIT-only since the 2026-07-15 strip, and the
    commit gate itself fires only for a DELEGATED agent's commit."""
    return ctx["commit_has_code"] and ctx.get("agent_pass") != "pass"


# The five deleted rules' message constants (_CODE, _RECO, _PLAN, _POST, _TBEGIN) went
# with them — 2026-07-15 strip, the user's named go. See CLAUDE.md "Enforcement".
_DOCS = ("COMMIT GATE (docs) — this delegated commit stages code but no doc was updated or "
         "cited. Docs ship WITH the feature: update the recap + the relevant docs/plans/*.md "
         "(what changed · why · file:line · how to verify · what reverses it), or cite the "
         "doc:line that already covers it. Then retry the commit.")
_SECOND = ("VERIFY-GATE (second pass) — this turn puts a PROPOSAL to the user without an "
           "explicit second pass. Think-twice law (#237): re-derive the proposal from scratch "
           "before shipping it, then END it with a 'SECOND PASS —' section stating (a) what the "
           "second look CHANGED or confirmed, (b) what it re-verified at file:line, and (c) the "
           "sharpest remaining doubt. Evidence this pays: the 2026-07-09 rethink changed five "
           "locked-looking decisions. Write the section honestly — a pasted marker with no "
           "re-derivation defeats its own purpose. Then finish.")
_TDONE = ("COMMIT GATE — INDEPENDENT CHECK REQUIRED. This delegated code commit has no "
          "genuine all-pass verdict from an independent rules-checker in YOUR transcript. "
          "SPAWN the rules-checker subagent (Agent tool, subagent_type 'rules-checker') on "
          "your diff and address any FAIL. The gate reads the verdict from the AGENT'S OWN "
          "result, NOT from text you type — a self-written 'VERDICT: PASS' will NOT clear "
          "it. (A doc-only commit, or `-m 'trivial: …'` in the commit message, is exempt.)")

# THE 2026-07-15 STRIP (the user's named go). Was 9 rules across 4 events; now 5 across 2.
# Scored by LIFETIME logs, not theory: `rules-gate` fired 4x and fixed all 4 (keeps);
# `second-pass` fired 3x and changed the answer all 3 times (keeps — the user's call);
# the commit rules keep ONLY their commit leg, and commit-gate itself now fires only for
# a DELEGATED agent's commit (main-session lifetime record: 15 of 25 decisions were the
# word-escape bug). DELETED: code-claim, reco, plan, post-task, task-begin-check — 15
# lifetime fires between them, every one a regex over my own prose (the act-not-word
# law), plus repeated false positives. What replaces them is R1-R5 + tests + one
# voluntary checker per task; see CLAUDE.md "Enforcement".
_CODE = ("VERIFY-GATE (code) — this turn claims code (a filename or file:line) but used NO "
         "evidence tool this turn (Read/Grep/Glob/WebFetch/Write/Edit/read-Bash) and did not "
         "hedge. The exact failure the user is sick of: answering from memory. STOP. Open the "
         "file, read it per line, re-answer with file:line for every code claim — or say what "
         "you have NOT checked.")

RULES = [
    {"id": "rules-gate", "label": "re-read rules/recap after a reset",
     "events": ["Stop"], "kind": "structural", "recheck": "evidence", "hedge_exempt": False,
     "detect": lambda ctx: bool(ctx.get("missing")),
     "inject": "<Block 0 — handled by verify-gate sentinel mechanics>"},
    # Block 1 KEPT at the strip — the user's save ("very useful: you often check docs or
    # memory which we find don't align with actual code"). Trigger is words, but
    # SATISFACTION is an ACT: evidence tools ran this turn (or an honest hedge) — my
    # prose alone cannot clear it. Its fire on 2026-07-15 exposed a false claim.
    {"id": "code-claim", "label": "code claim with zero reads (memory answer)",
     "events": ["Stop"], "kind": "structural", "recheck": "text", "hedge_exempt": True,
     "detect": lambda ctx: ctx["code_claim"] and ctx["evidence"] == 0,
     "inject": _CODE},
    {"id": "docs-with-features", "label": "delegated commit stages code with no doc",
     "events": ["commit"], "kind": "structural", "recheck": "text", "hedge_exempt": True,
     "detect": _detect_docs,
     "inject": _DOCS},
    # Block 6: every proposal ends with an explicit "SECOND PASS —" section. Structural
    # (the section's PRESENCE is checkable); its honesty stays semantic. Kept by the
    # user's explicit call: 3 lifetime fires, 3 materially changed answers — including
    # the discovery that the commit gate had been open all day. Not hedge-exempt.
    {"id": "second-pass", "label": "proposal without an explicit second pass",
     "events": ["Stop"], "kind": "structural", "recheck": "text", "hedge_exempt": False,
     "detect": lambda ctx: bool(ctx.get("proposal")) and not ctx.get("second_pass"),
     "inject": _SECOND},
    {"id": "task-completeness", "label": "delegated commit without a genuine verdict",
     "events": ["commit"], "kind": "semantic", "recheck": "text", "hedge_exempt": False,
     "detect": _detect_task_completeness,
     "inject": _TDONE},
]

RULE_IDS = [r["id"] for r in RULES]


def labels() -> list:
    """[(id, label)] in registry order — gate-stats imports this (single source)."""
    return [(r["id"], r["label"]) for r in RULES]


def run_rules(event: str, ctx: dict) -> list:
    """The failing TEXT rules for `event`, as [(id, inject)] in registry order.

    Evidence-recheck rules (Block 0) have bespoke per-hook mechanics and are NOT
    dispatched here. A hedge exempts a rule ONLY at the Stop event (the original
    behavior); at commit / Task events nothing is hedge-exempt. A single buggy
    detect() is swallowed so it can't take the rest of the gates down."""
    out = []
    hedged = bool(ctx.get("hedged")) and event == "Stop"
    for r in RULES:
        if event not in r["events"]:
            continue
        if r["recheck"] == "evidence":
            continue
        if hedged and r.get("hedge_exempt"):
            continue
        try:
            if r["detect"](ctx):
                out.append((r["id"], r["inject"]))
        except Exception:
            continue
    return out


def armed_events() -> set:
    """Every event that at least one rule runs at — the smoke asserts this is the
    full expected set (proves the registry is ARMED, not merely importable)."""
    evs = set()
    for r in RULES:
        evs.update(r["events"])
    return evs
