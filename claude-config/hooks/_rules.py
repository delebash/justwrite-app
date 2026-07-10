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
    """Raw facts about the assistant's actions since `start`:
    evidence count, code/doc edits, edit count, whether a subagent ran, joined text."""
    f = {"evidence": 0, "edits": 0, "code_edits": 0, "code_edit": False,
         "doc_edit": False, "subagent_ran": False, "answer": ""}
    texts = []
    for e in entries[start:]:
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if not isinstance(b, dict):
                continue
            bt = b.get("type")
            if bt == "tool_use":
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
    # 1) ids of the Agent/Task calls I made this turn (the rules-checker spawns).
    agent_ids = set()
    for e in entries[start:]:
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
    ctx["rules_passed"] = f["subagent_ran"] or bool(VERDICT.search(answer)) or bool(TRIVIAL.search(answer))
    # #237 think-twice facts. `proposal` = authored-proposal language, OR lock
    # language NOT attributed to the user (a "the user decided X" record turn is
    # not my proposal; "I propose X" always is, even when quoting the user).
    ctx["user_decided"] = bool(USER_DECIDED.search(answer))
    ctx["proposal"] = bool(PROPOSAL.search(answer)) or (
        ctx["plan_lock"] and not ctx["user_decided"])
    ctx["second_pass"] = bool(SECOND_PASS.search(answer))
    ctx["plan_ref"] = bool(PLAN_REF.search(answer))
    ctx["risk_line"] = bool(RISK_LINE.search(answer))
    ctx["trivial_explicit"] = bool(TRIVIAL_EXPLICIT.search(answer))
    # Block 0 (Stop, evidence-recheck) — filled by verify-gate via block0_missing when a
    # sentinel exists; default empty so the rule passes when no reset is pending.
    ctx["missing"] = []
    # Commit facts — defaults; commit-gate overrides after inspecting the staged tree.
    # Default to "has code, no docs" so an UNKNOWN commit is gated, never waved through.
    ctx["commit_has_code"] = True
    ctx["commit_docs_ok"] = False
    # The GENUINE independent-agent verdict this turn (None until a real rules-checker
    # finishes). Read from the agent's own result, NOT my text — this is what the commit
    # boundary requires so a self-typed verdict can't clear it.
    ctx["agent_pass"] = agent_pass(entries, start)
    return ctx


# --------------------------------------------------------------------------
# The rule registry — defined ONCE.
# --------------------------------------------------------------------------

def _detect_docs(ctx: dict) -> bool:
    """Docs ship with the code. At commit: code staged but no doc handled. At Stop:
    a done/shipped claim that edited code without touching/citing a doc."""
    if ctx["event"] == "commit":
        return ctx["commit_has_code"] and not ctx["commit_docs_ok"]
    return ctx["done_claim"] and ctx["code_edit"] and not ctx["doc_ok"]


def _detect_task_completeness(ctx: dict) -> bool:
    """The result was never independently checked.

    At COMMIT (the genuine boundary): a code commit requires an INDEPENDENT agent's PASS
    verdict — `ctx["agent_pass"] == "pass"`, read from a harness-authored task-notification.
    A self-typed "VERDICT: PASS" does NOT clear it (that was the self-certification hole).
    A doc-only commit / trivial commit is escaped earlier in commit-gate, so this only
    bites a non-trivial CODE commit.

    At TaskCompleted (finer grain, lighter): the existing rules_passed escape still applies
    — the commit is the hard boundary."""
    if ctx["event"] == "commit":
        return ctx["commit_has_code"] and ctx.get("agent_pass") != "pass"
    return not ctx["rules_passed"]


_CODE = ("VERIFY-GATE (code) — this turn claims code (a filename or file:line) but used NO "
         "evidence tool this turn (Read/Grep/Glob/WebFetch/Write/Edit/read-Bash) and did not "
         "hedge. The exact failure the user is sick of: answering from memory. STOP. Open the "
         "file, read it per line, re-answer with file:line for every code claim — or say what "
         "you have NOT checked.")
_RECO = ("VERIFY-GATE (decision) — this turn RECOMMENDS a storage/architecture choice (where "
         "data lives / what shape) without grounding it: no precedent cited and/or nothing read "
         "this turn. Before recommending, OPEN how the app ALREADY does this class (the seeder, "
         "the existing store/table, the manifest loader) and CITE it file:line — or state plainly "
         "there is no precedent. Do NOT decide before reading the deciding code. (Honest limit: "
         "this checks you cited A precedent, not that it's the RIGHT one — that's still on you.)")
_DOCS = ("VERIFY-GATE (docs) — code changed but NO doc was updated or cited. Docs ship WITH the "
         "feature, in DETAIL (full prose, not headers): update MORNING_RECAP.md + the relevant "
         "docs/plans/*.md now — what changed, WHY, file:line, how to verify, what would reverse "
         "it — or cite the doc:line that already covers it. Then finish.")
_PLAN = ("VERIFY-GATE (plan) — this turn LOCKS a plan/decision ('here's the plan' / 'locked' / "
         "'we've decided') without a GENUINE rules-checker AGENT verdict this turn. Think-twice "
         "law (#237): for a design lock, self-citing the tests no longer clears this — SPAWN the "
         "rules-checker (Agent tool, subagent_type 'rules-checker'; a 2-3 PANEL for load-bearing "
         "design) and address any FAIL. The gate reads the verdict from the AGENT's own result, "
         "not from text you type. Also END the proposal with its 'SECOND PASS —' section (Block "
         "6). If this turn merely RECORDS the user's own decision, attribute it explicitly "
         "('the user's decision/word'). Then finish.")
_SECOND = ("VERIFY-GATE (second pass) — this turn puts a PROPOSAL to the user without an "
           "explicit second pass. Think-twice law (#237): re-derive the proposal from scratch "
           "before shipping it, then END it with a 'SECOND PASS —' section stating (a) what the "
           "second look CHANGED or confirmed, (b) what it re-verified at file:line, and (c) the "
           "sharpest remaining doubt. Evidence this pays: the 2026-07-09 rethink changed five "
           "locked-looking decisions. Write the section honestly — a pasted marker with no "
           "re-derivation defeats its own purpose. Then finish.")
_POST = ("VERIFY-GATE (post-task) — this turn edited code but ran no rules-pass. Before finishing, "
         "run the rules-checker subagent on the diff against T1-T12 (Agent tool, subagent_type "
         "'rules-checker') and address any FAIL — or cite the tests the change passes (for a "
         "trivial change, say so). Then finish.")
_TBEGIN = ("TASK GATE — BEGIN (TaskCreated). No rules-pass this turn. Run the rules-checker "
           "subagent on this task's plan (Agent tool, subagent_type 'rules-checker') and address "
           "any FAIL — or cite the tests it passes / say 'trivial' — before starting this task.")
_TDONE = ("RULES GATE — INDEPENDENT CHECK REQUIRED. This is a commit/task-completion with no "
          "genuine all-pass verdict from an independent rules-checker this turn. SPAWN the "
          "rules-checker subagent (Agent tool, subagent_type 'rules-checker') and have it score "
          "EVERY rule against the diff AND the FULL acceptance criteria — including 'are ALL "
          "relevant docs current (the recap + the plan doc's own status), not merely touched'. "
          "The gate reads the verdict from the AGENT'S OWN result, NOT from text you type — a "
          "self-written 'VERDICT: PASS' will NOT clear it. If the agent returns FAIL, fix it and "
          "re-run until its result reads VERDICT: PASS. (Trivial / doc-only commits are exempt.)")

RULES = [
    {"id": "rules-gate", "label": "re-read rules/recap after a reset",
     "events": ["Stop"], "kind": "structural", "recheck": "evidence", "hedge_exempt": False,
     "detect": lambda ctx: bool(ctx.get("missing")),
     "inject": "<Block 0 — handled by verify-gate sentinel mechanics>"},
    {"id": "code-claim", "label": "code claim with zero reads (memory answer)",
     "events": ["Stop"], "kind": "structural", "recheck": "text", "hedge_exempt": True,
     "detect": lambda ctx: ctx["code_claim"] and ctx["evidence"] == 0,
     "inject": _CODE},
    {"id": "reco", "label": "storage/arch reco with no cited precedent",
     "events": ["Stop"], "kind": "structural", "recheck": "text", "hedge_exempt": True,
     "detect": lambda ctx: ctx["reco_arch"] and (not ctx["has_cite"] or ctx["evidence"] == 0),
     "inject": _RECO},
    {"id": "docs-with-features", "label": "code changed with no doc",
     "events": ["Stop", "commit"], "kind": "structural", "recheck": "text", "hedge_exempt": True,
     "detect": _detect_docs,
     "inject": _DOCS},
    # #237 hardening: a plan/design LOCK requires the GENUINE independent-agent
    # verdict (same agent_pass mechanism as the commit gate) — the typed-tests /
    # 'trivial' self-citation escape is CLOSED at lock grain. A turn recording
    # the USER's own decision (user_decided provenance) is not my design → pass.
    {"id": "plan", "label": "plan/design locked with no genuine agent verdict",
     "events": ["Stop"], "kind": "semantic", "recheck": "text", "hedge_exempt": True,
     "detect": lambda ctx: (ctx["plan_lock"] and not ctx.get("user_decided")
                            and ctx.get("agent_pass") != "pass"),
     "inject": _PLAN},
    {"id": "post-task", "label": "code edit with no rules-pass",
     "events": ["Stop"], "kind": "semantic", "recheck": "text", "hedge_exempt": True,
     "detect": lambda ctx: ctx["code_edit"] and not ctx["rules_passed"],
     "inject": _POST},
    # #237 Block 6: every proposal ends with an explicit "SECOND PASS —" section.
    # Structural (the section's PRESENCE is checkable); its honesty stays semantic.
    # Not hedge-exempt: a proposal the user will read needs its second pass even
    # when the turn hedges elsewhere. Sits AFTER post-task so the historical
    # Block 0-5 numbering in incident records stays truthful.
    {"id": "second-pass", "label": "proposal without an explicit second pass",
     "events": ["Stop"], "kind": "structural", "recheck": "text", "hedge_exempt": False,
     "detect": lambda ctx: bool(ctx.get("proposal")) and not ctx.get("second_pass"),
     "inject": _SECOND},
    {"id": "task-begin-check", "label": "task begin with no rules-pass",
     "events": ["TaskCreated"], "kind": "semantic", "recheck": "text", "hedge_exempt": False,
     "detect": lambda ctx: not ctx["rules_passed"],
     "inject": _TBEGIN},
    {"id": "task-completeness", "label": "task/commit done without full-criteria check",
     "events": ["TaskCompleted", "commit"], "kind": "semantic", "recheck": "text", "hedge_exempt": False,
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
