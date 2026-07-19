#!/usr/bin/env python3
"""Committed gate harness for the rules-as-checks system.

Run:  python3 hooks/test_gates.py     (exits non-zero on any failure)

Tests, against whatever hooks dir this file lives in (bundle OR live ~/.claude):
  1. the `_rules` registry  — armed events, ids, regexes, genuine-user, per-event subset
  2. verify-gate (Stop)     — Block 0 sentinel loop + Blocks 1-6 behavior (#237 incl.)
  3. pre-action (PreToolUse)— narrowed first-edit deny + .md/trivial exempt + window fix
  4. task-gate              — TaskCreated/TaskCompleted block/allow
  5. commit-gate            — docs+verdict for code · trivial/doc-only/amend escape · anti-loop
  6. gate-stats             — every rule id rolls up (no parallel list)
  7. fail-open              — a broken/missing _rules.py disables NO gate silently (allows + warns)

These are the same checks that caught the v1 narration-bypass; keep them green.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

HOOKS = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable


def load_rules():
    spec = importlib.util.spec_from_file_location("_rules", f"{HOOKS}/_rules.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def tx(*msgs, path=None) -> str:
    """Build a throwaway transcript .jsonl. msg = (kind, value).

    `path=` writes at an exact location instead of a temp name — needed to place a
    delegated agent's OWN transcript at <main-without-.jsonl>/subagents/agent-<id>.jsonl,
    the layout the real harness uses and that the gates now read (_rules.agent_transcript).
    """
    if path:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        f = open(path, "w")
    else:
        f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    for kind, val in msgs:
        if kind == "user":
            f.write(json.dumps({"type": "user", "message": {"content": val}}) + "\n")
        elif kind == "text":
            f.write(json.dumps({"type": "assistant", "message": {"content": [
                {"type": "text", "text": val}]}}) + "\n")
        elif kind == "sidechain_text":  # an assistant entry FLAGGED as a subagent's
            f.write(json.dumps({"type": "assistant", "isSidechain": True,
                                "message": {"content": [
                                    {"type": "text", "text": val}]}}) + "\n")
        elif kind == "edit":
            f.write(json.dumps({"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Edit", "input": {"file_path": val}}]}}) + "\n")
        elif kind == "read":
            f.write(json.dumps({"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Read", "input": {"file_path": val}}]}}) + "\n")
        elif kind == "agent":
            f.write(json.dumps({"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Agent", "input": {}}]}}) + "\n")
        elif kind == "agent_call":   # assistant Agent tool_use with a specific id (val=id)
            f.write(json.dumps({"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Agent", "id": val, "input": {}}]}}) + "\n")
        elif kind == "tool_result":  # HARNESS-authored tool_result (user role); val=(tool_use_id, text)
            tuid, text = val
            f.write(json.dumps({"type": "user", "message": {"content": [
                {"type": "tool_result", "tool_use_id": tuid,
                 "content": [{"type": "text", "text": text}]}]}}) + "\n")
    f.close()
    return f.name


def hook(name, payload, env=None):
    return subprocess.run([PY, f"{HOOKS}/{name}"], input=json.dumps(payload),
                          capture_output=True, text=True, env=env)


def denied(out: str) -> bool:
    return '"permissionDecision": "deny"' in out


def blocked(out: str) -> bool:
    return '"decision": "block"' in out


# ==========================================================================
# 1) the registry
# ==========================================================================
def test_ledger_refs():
    """EFFECTIVENESS.md's sweep table cites file:line — assert every ref is still TRUE.

    Born 2026-07-15 from the same defect recurring THREE times in one fix: each edit to a
    hook's docstring shifted the code below it and silently invalidated the table's
    citation — the fix invalidating its own evidence. The ledger's own lesson is "if a doc
    asserts a property, the code enforces it and a test pins it, or the sentence comes
    out." This is that test. A stale ref now fails the suite instead of surviving until a
    reader checks by hand.
    """
    led = os.path.join(os.path.dirname(HOOKS), "EFFECTIVENESS.md")
    if not os.path.isfile(led):
        print("0) ledger refs ........ SKIP (no EFFECTIVENESS.md beside hooks/)")
        return
    with open(led, encoding="utf-8") as f:
        rows = re.findall(r"\| `([\w.-]+)` \| :(\d+) \|", f.read())
    assert rows, "the sweep table should carry file:line rows"
    for fname, ln in rows:
        path = f"{HOOKS}/{fname}"
        assert os.path.isfile(path), f"ledger cites a missing file: {fname}"
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
        n = int(ln)
        assert n <= len(lines), f"{fname}:{n} is past EOF ({len(lines)} lines)"
        assert "tpath = " in lines[n - 1], (
            f"STALE LEDGER REF {fname}:{n} — that line is {lines[n-1].strip()[:60]!r}, "
            f"not the transcript read the sweep table claims")
    print(f"0) ledger refs ........ PASS ({len(rows)} rows verified)")




# ==========================================================================
# 0b) loaded surfaces stay SLIM — the mechanical fix for prose regrowth
# ==========================================================================
def test_loaded_surfaces():
    """The founding law of this config: rules that live as PROSE don't fire (a salience
    problem — more words make it worse). This was re-learned the hard way three times on
    2026-07-15 alone, so the budgets are pinned here: if a context-loaded surface grows
    past its budget, the suite fails and the growth gets justified or cut. Budgets carry
    ~20%% headroom over the slimmed sizes — hitting one is a design smell, not a quota."""
    root = os.path.dirname(HOOKS)
    budgets = [(f"{root}/CLAUDE.md", 115), (f"{root}/agents/rules-checker.md", 130)]
    for path, cap in budgets:
        n = sum(1 for _ in open(path, encoding="utf-8"))
        assert n <= cap, f"LOADED SURFACE OVER BUDGET: {os.path.basename(path)} = {n} lines (cap {cap})"
    import importlib.util
    spec = importlib.util.spec_from_file_location("pa_mod", f"{HOOKS}/pre-action-check.py")
    pa_mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(pa_mod)
    assert len(pa_mod.NUDGE) <= 250, f"NUDGE grew to {len(pa_mod.NUDGE)} chars (cap 250)"
    assert len(pa_mod.PLAN_NUDGE) <= 560, f"PLAN_NUDGE grew to {len(pa_mod.PLAN_NUDGE)} chars (cap 560)"
    print(f"0b) loaded surfaces ... PASS (all within budget)")


def test_registry():
    r = load_rules()
    assert set(r.armed_events()) == {"Stop", "commit"}, r.armed_events()   # task gates deleted 2026-07-15
    assert r.RULE_IDS == ["rules-gate", "code-claim", "docs-with-features",
                          "second-pass", "task-completeness"], r.RULE_IDS   # the 2026-07-15 strip
    # VERDICT: accepts real verdicts, rejects narration (the dogfood-caught hole)
    assert r.VERDICT.search("VERDICT: PASS") and r.VERDICT.search("T1 PASS, T2 FAIL")
    for s in ("I'll run the rules-checker next", "let me run the rules-checker", "the plan looks good"):
        assert not r.VERDICT.search(s), s
    # tests_cited (#253 recurrence, 2026-07-10): a PROSE citation of >=3 distinct
    # T-numbers is a rules-pass at the light gates (the injects always asked for
    # "cite the tests"; VERDICT alone rejected the prose form and blocked live).
    assert r.tests_cited("T1 the final shape is right. T2 verified at x.py:10. T5 whole job enumerated.")
    assert r.tests_cited("T1 ok, T2 ok, T3 ok, T12 ok")
    assert not r.tests_cited("the T1-T12 rule-tests govern this")      # a range mention: 2 distinct
    assert not r.tests_cited("T5 covers this; also T5 again and T5")   # one test repeated
    assert not r.tests_cited("see T4 and T7")                          # two distinct — below the bar
    # ...and it feeds rules_passed end-to-end through build_ctx.
    pc = r.build_ctx({}, [{"type": "user", "message": {"content": "go"}},
                          {"type": "assistant", "message": {"content": [
                              {"type": "text", "text": "T1 right shape. T3 one source. T7 gates run."}]}}], "TaskCreated")
    assert pc["rules_passed"], "a 3-distinct prose tests-citation must clear the light gates"
    assert [] == r.run_rules("TaskCreated", pc)
    # THE ATTEST CHANNEL (#253, 2026-07-10): mid-turn assistant TEXT flushes
    # unreliably in the remote harness (live evidence: 2 of ~6 text messages
    # present vs 23/23 thinking blocks), so the AFFIRMATIVE escapes also read
    # thinking — a citation/attestation carried in a thinking block clears the
    # light gates + the pre-edit plan-ref/RISK check...
    th = r.build_ctx({}, [{"type": "user", "message": {"content": "go"}},
                          {"type": "assistant", "message": {"content": [
                              {"type": "thinking", "thinking":
                               "T1 right shape. T2 verified at x.py:9. T7 suites pass. "
                               "Executing the queue doc item. RISK: the regex could over-match. trivial"}]}}],
                     "TaskCreated")
    assert th["rules_passed"] and th["plan_ref"] and th["risk_line"] and th["trivial_explicit"]
    assert [] == r.run_rules("TaskCreated", th)
    # ...while the VIOLATION detectors never read thinking — exploratory
    # "here's the plan" / "I recommend" in thinking must not fire a block.
    tv = r.build_ctx({}, [{"type": "user", "message": {"content": "go"}},
                          {"type": "assistant", "message": {"content": [
                              {"type": "thinking", "thinking":
                               "here's the plan: split the store. I recommend option B. we've decided."}]}}],
                     "Stop")
    assert not tv["plan_lock"] and not tv["proposal"] and not tv["reco_arch"]
    assert [] == r.run_rules("Stop", tv)
    # THE PAYLOAD CHANNEL (#253): a citation carried in the gated call's OWN
    # description (TaskCreate subject/description) clears the light gates —
    # the one channel deterministically present at hook time...
    pd = r.build_ctx({"tool_input": {"description": "T1 right shape. T2 at x.py:9. T5 whole job."}},
                     [{"type": "user", "message": {"content": "go"}}], "TaskCreated")
    assert pd["rules_passed"]
    assert [] == r.run_rules("TaskCreated", pd)
    # ...but CONTENT-bearing keys never feed attest (checker-caught leak: an
    # Edit whose new_string contains the tokens must NOT satisfy the pre-edit
    # escapes — editing the gate files would otherwise self-void the deny).
    pe = r.build_ctx({"tool_name": "Edit", "tool_input": {
                          "file_path": "x.py",
                          "new_string": "trivial RISK: doc.md:1 T1 T2 T5 per the plan"}},
                     [{"type": "user", "message": {"content": "go"}}], "PreToolUse")
    assert not pe["rules_passed"] and not pe["trivial_explicit"]
    assert not pe["risk_line"] and not pe["plan_ref"]
    # _payload_text defensive branches: non-dict tool_input / missing data.
    assert r._payload_text({"tool_input": "notadict"}) == ""
    assert r._payload_text({}) == "" and r._payload_text(None) == ""
    # #237 regexes — proposals, the SECOND PASS marker, user-decided provenance,
    # the pre-edit plan-ref + RISK line, the explicit-trivial attestation.
    for s in ("I propose we split the store", "my recommendation is B", "I recommend option A",
              "here's the design: one table", "proposed approach: heal at boot"):
        assert r.PROPOSAL.search(s), s
    for s in ("the user proposed this earlier", "a counter-proposal from upstream docs"):
        assert not r.PROPOSAL.search(s), s
    assert r.SECOND_PASS.search("SECOND PASS — re-derived; changed the heal seam")
    assert not r.SECOND_PASS.search("a second look at the file")
    for s in ("the user's decision", "user-decided", "per the user", "your call", "the user said so"):
        assert r.USER_DECIDED.search(s), s
    assert not r.USER_DECIDED.search("we decided to use SQLite")
    for s in ("per docs/plans/2026-07-08-big-batch-queue.md:3361", "executing queue doc §9 QC-25",
              "per the revised spec", "§7.2 locks this", "the user's words: heal at boot"):
        assert r.PLAN_REF.search(s), s
    assert not r.PLAN_REF.search("editing lifecycle.py:487 now")
    for s in ("RISK: the heal could clobber a deliberate downgrade",
              "what could be wrong: the poll races the install", "failure mode: stale pin"):
        assert r.RISK_LINE.search(s), s
    assert not r.RISK_LINE.search("this lowers risk overall")
    assert not r.RISK_LINE.search("a risk-free change")   # boilerplate loophole (checker-caught)
    assert r.TRIVIAL_EXPLICIT.search("trivial: typo") and not r.TRIVIAL_EXPLICIT.search("rename the tab")
    # genuine-user: a real prompt yes; injected wrappers no
    U = lambda s: {"type": "user", "message": {"content": s}}
    assert r.is_genuine_user(U("yes do it"))
    assert r.is_genuine_user(U("<command-name>/model</command-name>"))  # slash command stays genuine
    for s in ("<task-notification>\n<task-id>x</task-id>", "<local-command-stdout>set</local-command-stdout>",
              "<system-reminder>x</system-reminder>"):
        assert not r.is_genuine_user(U(s)), s
    # #253 defensive shapes (2026-07-10): the EFFECTIVENESS-recorded bare
    # injections must never reset the turn window, even though the CURRENT
    # harness records them as tool_results/isMeta (the live-sweep finding —
    # see the queue doc's #253 record).
    for s in ("Tool loaded.",
              "The task tools haven't been used recently. If you're working on tasks...",
              "[SYSTEM NOTIFICATION - NOT USER INPUT]\n<task-notification>x",
              "<local-command-caveat>Caveat: local commands</local-command-caveat>"):
        assert not r.is_genuine_user(U(s)), s
    # ...while a prompt that merely MENTIONS those strings mid-text stays genuine.
    assert r.is_genuine_user(U("why does it say Tool loaded. in the log?"))
    assert not r.is_genuine_user({"type": "user", "isMeta": True, "message": {"content": "x"}})
    assert not r.is_genuine_user({"type": "user", "message": {"content": [{"type": "tool_result", "content": "x"}]}})
    # per-event subset via run_rules
    base = r.build_ctx({"cwd": "/tmp"}, [{"type": "user", "message": {"content": "hi"}}], "Stop")
    assert r.run_rules("Stop", base) == []                 # clean
    # post-task and plan are DELETED (2026-07-15 strip): a code edit with no
    # rules-pass, or a plan lock with no verdict, fires NOTHING at Stop anymore.
    c = dict(base); c["code_edit"] = True; c["rules_passed"] = False
    assert "post-task" not in [i for i, _ in r.run_rules("Stop", c)]
    p = dict(base); p["plan_lock"] = True; p["rules_passed"] = True; p["agent_pass"] = None
    assert "plan" not in [i for i, _ in r.run_rules("Stop", p)]
    # code-claim is KEPT (user save): a memory code-claim fires; evidence or a hedge clears.
    k = dict(base); k["code_claim"] = True; k["evidence"] = 0
    assert "code-claim" in [i for i, _ in r.run_rules("Stop", k)]
    k["evidence"] = 3
    assert "code-claim" not in [i for i, _ in r.run_rules("Stop", k)]
    k["evidence"] = 0; k["hedged"] = True
    assert "code-claim" not in [i for i, _ in r.run_rules("Stop", k)]   # hedge exempts at Stop
    # #237 second-pass: a proposal without the section fires; the section clears it;
    # NOT hedge-exempt (a hedged proposal still needs its second pass).
    s = dict(base); s["proposal"] = True; s["second_pass"] = False
    assert "second-pass" in [i for i, _ in r.run_rules("Stop", s)]
    s["hedged"] = True
    assert "second-pass" in [i for i, _ in r.run_rules("Stop", s)]
    s["second_pass"] = True
    assert "second-pass" not in [i for i, _ in r.run_rules("Stop", s)]
    # proposal derivation: lock language alone counts UNLESS attributed to the user;
    # authored "I propose" counts even WITH user attribution elsewhere in the turn.
    d = r.build_ctx({}, [{"type": "user", "message": {"content": "q"}},
                         {"type": "assistant", "message": {"content": [
                             {"type": "text", "text": "We've decided: the toast law. The user's decision."}]}}], "Stop")
    assert d["plan_lock"] and d["user_decided"] and not d["proposal"]
    d2 = r.build_ctx({}, [{"type": "user", "message": {"content": "q"}},
                          {"type": "assistant", "message": {"content": [
                              {"type": "text", "text": "Per the user's word on scope, I propose the heal runs at boot."}]}}], "Stop")
    assert d2["proposal"], "authored proposal language must count despite user attribution"
    # agent_pass cross-turn spawn (#253, 2026-07-10): an async checker spawned
    # LAST turn delivering its verdict THIS turn (tool_result tied to the old
    # Agent tool_use id) must count — the spawn id set spans the whole
    # transcript; the verdict must still be in-window (a verdict BEFORE the
    # turn boundary does not count).
    xt = [
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Agent", "id": "spawn_old"}]}},
        {"type": "user", "message": {"content": "new turn starts here"}},
        {"type": "user", "message": {"content": [
            {"type": "tool_result", "tool_use_id": "spawn_old",
             "content": "VERDICT: PASS — all rules pass"}]}},
    ]
    assert r.agent_pass(xt, r.last_user_idx(xt)) == "pass"
    xt_stale = [
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Agent", "id": "spawn_old"}]}},
        {"type": "user", "message": {"content": [
            {"type": "tool_result", "tool_use_id": "spawn_old",
             "content": "VERDICT: PASS — all rules pass"}]}},
        {"type": "user", "message": {"content": "new turn starts here"}},
    ]
    assert r.agent_pass(xt_stale, r.last_user_idx(xt_stale)) is None
    tc = r.build_ctx({}, [{"type": "user", "message": {"content": "hi"}}], "TaskCreated")
    tc["rules_passed"] = False
    assert r.run_rules("TaskCreated", tc) == []   # task gates deleted: no rule at this event
    cm = r.build_ctx({}, [{"type": "user", "message": {"content": "hi"}}], "commit")
    cm["commit_has_code"] = True; cm["commit_docs_ok"] = False; cm["rules_passed"] = False
    cm["agent_pass"] = None
    assert set(i for i, _ in r.run_rules("commit", cm)) == {"docs-with-features", "task-completeness"}
    cm["commit_has_code"] = False
    assert r.run_rules("commit", cm) == []                 # doc-only → inert
    # risk tier — commit_low_risk (generic, default-HIGH). LOW only when EVERY code
    # file is test infra / copy DATA and nothing is under the gate's own tree.
    assert r.commit_low_risk(["server/tests/test_x.py", "docs/a.md"])       # tests (+doc) → low
    assert r.commit_low_risk(["src/renderer/src/__tests__/a.test.js"])      # __tests__ → low
    # Harness scripts, BOTH extensions. JustWrite converted scripts/ from .mjs to
    # .js on 2026-07-19 (the repo is type:module, so the extension carried no
    # meaning); a regex pinned to .mjs would have silently reclassified every
    # probe + smoke as HIGH the moment they were renamed.
    assert r.commit_low_risk(["scripts/rag-probe.js"])                      # harness script → low
    assert r.commit_low_risk(["scripts/rag-probe.mjs"])                     # legacy extension → low
    assert r.commit_low_risk(["scripts/headless-smoke.js"])                 # smoke → low
    assert not r.commit_low_risk(["scripts/bench/run.js"])                  # NOT a -probe/-smoke → high
    assert r.commit_low_risk(["src/renderer/src/i18n/en.json"])            # copy DATA → low
    assert not r.commit_low_risk(["latest.py"])            # substring trap: not a test → high
    assert not r.commit_low_risk(["src/renderer/src/i18n/index.js"])       # logic under i18n → high
    assert not r.commit_low_risk(["a.test.js", "server/stores.py"])       # mixed → high
    assert not r.commit_low_risk(["server/justwrite_server/api/settings.py"])   # product → high
    assert not r.commit_low_risk(["claude-config/hooks/test_gates.py"])   # gate's own tree → high
    assert not r.commit_low_risk(["claude-config/hooks/commit-gate.py"])  # gate logic → high
    # standalone-repo layout (the bundle root IS the config): hooks/ at repo root must
    # also count as gate-tree, else `hooks/test_gates.py` matches LOW_RISK and the gate
    # self-weakens. Named-file alternation stays precise — a product `src/hooks/` misses.
    assert not r.commit_low_risk(["hooks/test_gates.py"])                 # standalone gate harness → high
    assert not r.commit_low_risk(["hooks/commit-gate.py"])                # standalone gate logic → high
    assert r.GATE_TREE.search("hooks/commit-gate.py")                     # standalone layout matches
    assert r.GATE_TREE.search("hooks/self-update.sh")                     # ...incl. the self-update hook
    assert not r.GATE_TREE.search("src/hooks/useModels.js")              # a product hooks/ dir does NOT
    assert not r.commit_low_risk([])                       # no code → not low (doc-only handled elsewhere)
    print("1) registry ........... PASS")


# ==========================================================================
# 2) verify-gate (Stop) — Blocks 1-6 + Block 0 sentinel
# ==========================================================================
def test_verify_gate():
    home = tempfile.mkdtemp(); os.makedirs(f"{home}/.claude/hooks", exist_ok=True)
    env = dict(os.environ, HOME=home, USERPROFILE=home)   # no sentinel → Block 0 inert

    def vg(*msgs):
        return hook("verify-gate.py", {"transcript_path": tx(*msgs), "cwd": home,
                                       "stop_hook_active": False}, env=env).stdout
    # Blocks 1-5 are DELETED (2026-07-15 strip): a bare code edit / code claim / plan
    # lock no longer blocks on those rules. What still fires at Stop is Block 6 only.
    assert not blocked(vg(("user", "go"), ("edit", "x.py"), ("text", "made it")))   # post-task: deleted
    assert not blocked(vg(("user", "go"), ("edit", "x.py"))), "silent edit: block 5 deleted"
    # "Here's the plan..." still blocks — but via Block 6 now (a proposal without its
    # SECOND PASS section), not the deleted plan/verdict rule.
    assert blocked(vg(("user", "go"), ("text", "Here's the plan: do x")))
    assert blocked(vg(("user", "go"), ("text", "Here's the plan. VERDICT: PASS")))
    NOTIF = ("<task-notification>\n<task-id>x</task-id>\n<result>\nVERDICT: PASS — all "
             "rules pass\n</result>\n</task-notification>")
    assert not blocked(vg(("user", "go"),
                          ("text", "Here's the plan: do x. SECOND PASS — re-derived it; "
                                   "confirmed the shape; sharpest doubt: none."),
                          ("user", NOTIF))), \
        "a genuine agent PASS + the SECOND PASS section must clear a locked plan"
    # #237 Block 6: a proposal without an explicit second pass is blocked; the
    # section clears it; a user-decided RECORD turn is not a proposal at all.
    assert blocked(vg(("user", "go"), ("text", "I recommend option B — it heals at boot.")))
    assert not blocked(vg(("user", "go"),
                          ("text", "I recommend option B — it heals at boot. SECOND PASS — "
                                   "re-checked both sides; changed nothing; doubt: none.")))
    assert not blocked(vg(("user", "go"),
                          ("text", "We've decided the toast law — the user's decision, recorded.")))
    assert blocked(vg(("user", "go"), ("text", "the bug is in server/foo.py")))     # code-claim
    assert not blocked(vg(("user", "go"), ("text", "server/foo.py but I haven't verified")))  # hedge
    assert not blocked(vg(("user", "go"), ("text", "")))                            # nothing → pass

    # Block 0 — arm a sentinel; block until the required files are Read; then disarm.
    glob_rules = f"{home}/.claude/CLAUDE.md"
    open(glob_rules, "w").write("rules")
    open(f"{home}/CLAUDE.md", "w").write("proj")           # cwd project files
    open(f"{home}/MORNING_RECAP.md", "w").write("recap")
    sent = f"{home}/.claude/hooks/.rules_gate"
    with open(sent, "w") as f:
        json.dump({"line": 0, "blocks": 0, "source": "compact"}, f)
    out = hook("verify-gate.py", {"transcript_path": tx(("user", "go"), ("text", "hi")),
                                  "cwd": home, "stop_hook_active": False}, env=env).stdout
    assert blocked(out) and "RE-READ" in out, "Block 0 should block until re-read"
    assert os.path.exists(sent), "sentinel should persist while unsatisfied"
    # now Read all three required files in the transcript → pass + disarm
    t = tx(("user", "go"), ("read", glob_rules), ("read", f"{home}/CLAUDE.md"),
           ("read", f"{home}/MORNING_RECAP.md"), ("text", "re-read done"))
    out = hook("verify-gate.py", {"transcript_path": t, "cwd": home, "stop_hook_active": False}, env=env).stdout
    assert not blocked(out), "Block 0 should pass once files are re-read"
    assert not os.path.exists(sent), "sentinel should be disarmed on compliance"
    print("2) verify-gate ........ PASS")


# ==========================================================================
# 3) pre-action (PreToolUse)
# ==========================================================================
def test_pre_action():
    """NUDGE-ONLY since the 2026-07-15 strip: the pre-task DENY (and with it the
    subagent bypass) is DELETED. Nothing this hook emits can block; regressions here
    are 'it denied something' or 'it stopped nudging'."""
    def pa(payload):
        return hook("pre-action-check.py", payload).stdout
    out = pa({"tool_name": "Edit", "tool_input": {"file_path": "a.py"},
              "transcript_path": tx(("user", "build"))})
    assert not denied(out) and "R1-R5" in out, "a code edit gets the nudge, never a deny"
    assert not denied(pa({"tool_name": "Write", "tool_input": {"file_path": "a.py"},
                          "agent_id": "some-agent"})), "subagent edits: same nudge, no deny"
    out = pa({"tool_name": "ExitPlanMode"})
    assert "PLAN BOUNDARY" in out and "THREE" in out, "tiered plan nudge on ExitPlanMode"
    assert pa({"tool_name": "Bash", "tool_input": {"command": "ls"}}).strip() == ""
    # THE GO-GATE (2026-07-15, the user's "fix that" — the #1 rule made mechanical):
    # a PURE QUESTION as the user's latest message denies product-file edits. Keyed on
    # the USER's own text (an act the agent cannot forge). The regression case is the
    # verbatim message that slipped past three times that day.
    Q = "how can the load as default button be styled different for embed vs main, are they using the same control the same logic?"
    out = pa({"tool_name": "Edit", "tool_input": {"file_path": "E:/repo/src/App.vue"},
              "transcript_path": tx(("user", Q))})
    assert denied(out) and "GO-GATE" in out, "a pure question must deny a product edit"
    assert not denied(pa({"tool_name": "Edit", "tool_input": {"file_path": "E:/repo/src/App.vue"},
                          "transcript_path": tx(("user", Q)), "agent_id": "b1"})), \
        "delegated agents execute under a spawned go — exempt"
    assert not denied(pa({"tool_name": "Write",
                          "tool_input": {"file_path": "C:/Users/x/Temp/claude/s/scratchpad/probe.py"},
                          "transcript_path": tx(("user", Q))})), \
        "scratchpad diagnostics while ANSWERING are exempt"
    assert not denied(pa({"tool_name": "Edit", "tool_input": {"file_path": "E:/repo/src/App.vue"},
                          "transcript_path": tx(("user", "why is it broken? fix it"))})), \
        "a mixed message with an action word passes"
    assert not denied(pa({"tool_name": "Edit", "tool_input": {"file_path": "E:/repo/src/App.vue"},
                          "transcript_path": tx(("user", "cleanup morning recap"))})), \
        "an imperative without 'go' passes"
    assert not denied(pa({"tool_name": "Edit", "tool_input": {"file_path": "E:/repo/src/App.vue"},
                          "transcript_path": tx(("user", "go"))})), "go passes"
    assert not denied(pa({"tool_name": "Edit", "tool_input": {"file_path": "E:/repo/src/App.vue"},
                          "transcript_path": tx(("user", Q),
                                                ("user", "i take your rec, go"))})), \
        "only the LATEST genuine message governs — an answered question does not linger"
    print("3) pre-action ......... PASS")


# ==========================================================================
# 5) commit-gate
# ==========================================================================
def test_commit_gate():
    repo = tempfile.mkdtemp(); home = tempfile.mkdtemp()
    os.makedirs(f"{home}/.claude/hooks", exist_ok=True)
    env = dict(os.environ, HOME=home, USERPROFILE=home)

    def git(*a):
        subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True)
    git("init"); git("config", "user.email", "x@y.z"); git("config", "user.name", "x")

    SENT = f"{home}/.claude/hooks/.commit_gate"

    def _clear_counter():
        try:
            os.remove(SENT)   # each cg() scenario is independent — not a real retry loop
        except Exception:
            pass

    def cg(cmd, *msgs):
        _clear_counter()
        # agent_id present: the gate fires (2026-07-15: it exits for main-session
        # payloads). No subagents/ dir exists beside the tx() temp file, so
        # agent_transcript falls back to the main transcript and every boundary
        # assertion below exercises the same logic as before the strip.
        return hook("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": cmd},
                    "cwd": repo, "transcript_path": tx(*msgs), "agent_id": "tg-builder"},
                    env=env).stdout

    def reset_stage():
        git("reset", "--hard"); git("clean", "-fd")
        for f in os.listdir(repo):
            if f != ".git" and os.path.isfile(f"{repo}/{f}"):
                os.remove(f"{repo}/{f}")

    open(f"{repo}/foo.py", "w").write("x=1\n"); git("add", "foo.py")
    # MAIN SESSION IS UNGATED (2026-07-15 strip): no agent_id -> exit 0, silent.
    _clear_counter()
    no_agent = hook("commit-gate.py", {"tool_name": "Bash",
                    "tool_input": {"command": "git commit -m add"},
                    "cwd": repo, "transcript_path": tx(("user", "go"))}, env=env).stdout
    assert no_agent.strip() == "", "a main-session commit (no agent_id) must pass untouched"
    assert denied(cg("git commit -m add", ("user", "go")))                           # code/no docs/no verdict
    assert denied(cg("git commit -m add", ("user", "go"), ("text", "VERDICT: PASS")))  # docs still required
    open(f"{repo}/README.md", "w").write("# d\n"); git("add", "README.md")
    assert denied(cg("git commit -m add", ("user", "go")))                           # docs ok, but no genuine agent pass
    # THE ANTI-SELF-CERT CORE: a TYPED "VERDICT: PASS" must NOT clear a code commit.
    assert denied(cg("git commit -m add", ("user", "go"), ("text", "VERDICT: PASS all good"))), \
        "a self-typed verdict must NOT clear the commit"
    # merely CALLING an agent (an assistant tool_use, no PASS result) also must not clear.
    assert denied(cg("git commit -m add", ("user", "go"), ("agent", ""))), \
        "calling an agent without a genuine PASS result must not clear"
    # GENUINE verdict = inside <result> of a harness-authored <task-notification> (a user-role
    # entry the main agent cannot forge). PASS → allow; FAIL → block.
    NOTIF_PASS = ("<task-notification>\n<task-id>x</task-id>\n<result>\nVERDICT: PASS — "
                  "all rules pass; all docs current\n</result>\n</task-notification>")
    NOTIF_FAIL = ("<task-notification>\n<task-id>x</task-id>\n<result>\nVERDICT: FAIL (1 failed) "
                  "— plan doc stale\n</result>\n</task-notification>")
    assert not denied(cg("git commit -m add", ("user", "go"), ("user", NOTIF_PASS))), \
        "a GENUINE agent PASS (harness task-notification) must clear"
    assert denied(cg("git commit -m add", ("user", "go"), ("user", NOTIF_FAIL))), \
        "a GENUINE agent FAIL must block"
    # SYNC form: a tool_result tied to an Agent call I made (the shape real agents use here).
    AID = "toolu_TESTAGENT1"
    assert not denied(cg("git commit -m add", ("user", "go"), ("agent_call", AID),
                         ("tool_result", (AID, "scored all rules\nVERDICT: PASS")))), \
        "a genuine SYNC agent PASS (tool_result tied to an Agent call) must clear"
    assert denied(cg("git commit -m add", ("user", "go"), ("agent_call", AID),
                     ("tool_result", (AID, "VERDICT: FAIL (1 failed) — stale doc")))), \
        "a genuine SYNC agent FAIL must block"
    # ANTI-FAKE: a tool_result NOT tied to an Agent call (e.g. Reading a doc that literally
    # contains "VERDICT: PASS" — EFFECTIVENESS.md does!) must NOT count.
    assert denied(cg("git commit -m add", ("user", "go"),
                     ("tool_result", ("toolu_READ_doc", "file contents...\nVERDICT: PASS\n...")))), \
        "a non-agent tool_result (e.g. a Read of a doc) must NOT clear the commit"
    # SUBAGENT COMMIT (2026-07-15 defect class): a delegated agent's commit must be judged
    # on the AGENT's OWN transcript. Its checker verdict lands in
    # <session>/subagents/agent-<id>.jsonl; reading the MAIN transcript made this boundary
    # UN-CLEARABLE for a builder (it escaped only by burning MAX_DENIES). This
    # STRENGTHENS the gate — the agent's real verdict now counts.
    def cg_agent(cmd, agent_id, main_msgs, agent_msgs=None):
        _clear_counter()
        main = tx(*main_msgs)
        if agent_msgs is not None:
            tx(*agent_msgs, path=os.path.join(main[: -len(".jsonl")], "subagents",
                                              f"agent-{agent_id}.jsonl"))
        return hook("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": cmd},
                    "cwd": repo, "transcript_path": main, "agent_id": agent_id}, env=env).stdout
    AID2 = "toolu_BUILDERAGENT"
    # the agent's OWN transcript carries its genuine verdict; the coordinator's has none
    assert not denied(cg_agent("git commit -m add", "abc123", (("user", "go"),),
                               (("user", "build it"), ("agent_call", AID2),
                                ("tool_result", (AID2, "scored the diff\nVERDICT: PASS"))))), \
        "a builder's OWN genuine verdict must clear its commit (was invisible → deadlock)"
    assert denied(cg_agent("git commit -m add", "abc123", (("user", "go"),),
                           (("user", "build it"), ("agent_call", AID2),
                            ("tool_result", (AID2, "VERDICT: FAIL (1 failed) — stale doc"))))), \
        "a builder's OWN genuine FAIL must still block its commit"
    assert denied(cg_agent("git commit -m add", "abc123", (("user", "go"),),
                           (("user", "build it"),))), \
        "a builder with NO verdict in its own transcript is still gated"
    # a rogue/missing agent id must fall back to the main transcript, never to another
    # agent's verdict — the coordinator's transcript here has no verdict → still denied
    assert denied(cg_agent("git commit -m add", "no-such-agent", (("user", "go"),))), \
        "a missing agent transcript falls back to the main transcript (still gated)"
    # TRAVERSAL: a separator-bearing agent_id must NOT reach another agent's transcript.
    # Windows canonicalizes '..' lexically, so 'a/../agent-<other>' would otherwise resolve
    # to a sibling's file and pass isfile(). Not reachable (ids are harness-generated) —
    # but the docstring promises "never another agent's verdict", so the CODE enforces it.
    tx(("user", "b"), ("agent_call", AID2), ("tool_result", (AID2, "VERDICT: PASS")),
       path=os.path.join(tx(("user", "seed"))[: -len(".jsonl")], "subagents", "agent-victim.jsonl"))
    main_t = tx(("user", "go"))
    os.makedirs(os.path.join(main_t[: -len(".jsonl")], "subagents"), exist_ok=True)
    tx(("user", "b"), ("agent_call", AID2), ("tool_result", (AID2, "VERDICT: PASS")),
       path=os.path.join(main_t[: -len(".jsonl")], "subagents", "agent-other.jsonl"))
    _clear_counter()
    out = hook("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": "git commit -m add"},
               "cwd": repo, "transcript_path": main_t, "agent_id": "x/../agent-other"}, env=env).stdout
    assert denied(out), "a traversing agent_id must NOT borrow another agent's verdict"
    # the ANSWER-side trivial escape is the LITERAL word only: a builder's prose saying
    # "rename"/"typo" must NOT full-escape the commit boundary (the loose TRIVIAL still
    # applies to the commit MESSAGE, which is a deliberate attestation).
    reset_stage(); open(f"{repo}/qux.py", "w").write("q=1\n"); git("add", "qux.py")
    assert denied(cg("git commit -m add", ("user", "go"),
                     ("text", "I renamed the prop and fixed a typo in the one-line helper"))), \
        "loose trivial words in prose must NOT escape the commit gate"
    # THE TURN-TEXT TRIVIAL ESCAPE IS GONE (2026-07-15). It matched a MENTION, not an
    # attestation: `\btrivial\b` fires on any turn that DISCUSSES the escape — including
    # "this is NOT a trivial change". Measured that day: 12 consecutive
    # `ALLOW commit (trivial attested)` while the session's topic was this very escape,
    # so the checker verdicts being run were not what cleared those commits.
    assert denied(cg("git commit -m add", ("user", "go"), ("text", "this one is trivial"))), \
        "turn TEXT must NOT attest trivial — only the commit message can"
    assert denied(cg("git commit -m add", ("user", "go"),
                     ("text", "this is NOT a trivial change, it is load-bearing"))), \
        "the sentence that silently cleared the gate all session must now be DENIED"
    assert denied(cg("git commit -m add", ("user", "go"),
                     ("text", "an attested 'trivial' commit is exempt from the gate"))), \
        "merely documenting the escape must not invoke it"
    # the MESSAGE-side loose escape reads the -m TEXT ONLY, never the whole command:
    # a trivial-family word in a staged PATH is an accident of naming, not an attestation.
    reset_stage(); os.makedirs(f"{repo}/src/rename", exist_ok=True)
    open(f"{repo}/src/rename/index.js", "w").write("a=1\n"); git("add", "src/rename/index.js")
    assert denied(cg("git add src/rename/index.js && git commit -m 'feat: big refactor'",
                     ("user", "go"))), \
        "a trivial-family word in a PATH must NOT escape (only the -m message counts)"
    assert not denied(cg("git commit -m 'trivial: drop a stale comment'", ("user", "go"))), \
        "the word 'trivial' in the -m MESSAGE is the one deliberate attestation"
    # the message must ATTEST, not DESCRIBE (checker-caught): the loose family let
    # `-m "refactor(store): rename the undo domains"` full-escape on a DESCRIPTION.
    assert denied(cg('git commit -m "rename the prop"', ("user", "go"))), \
        "a describing word ('rename') in the message must NOT attest trivial"
    assert denied(cg('git commit -m "fix: typo in the header"', ("user", "go"))), \
        "'typo' describes; only 'trivial' attests"
    # LAUNDERING (both checker-caught): one segment must not clear another.
    assert denied(cg("git commit --amend --no-edit && git commit -m 'feat: rewrite storage'",
                     ("user", "go"))), \
        "an --amend segment must NOT launder a real commit segment through as an escape"
    assert denied(cg("git commit -m 'trivial: x' && git commit -m 'feat: rewrite storage'",
                     ("user", "go"))), \
        "EVERY commit segment must attest — one attestation cannot clear the chain"
    assert not denied(cg("git commit -m 'trivial: a' && git commit -m 'trivial: b'",
                         ("user", "go"))), \
        "a chain where every segment attests still escapes"
    # SHORT-FLAG CLUSTERS carry the message: the first draft matched only a bare -m, so
    # `-am 'trivial: typo'` silently lost its LEGITIMATE escape (fail-safe, but a false
    # contract). getopt semantics: -m takes the cluster REMAINDER if any, else the next argv.
    assert not denied(cg("git commit -am 'trivial: typo'", ("user", "go"))), \
        "-am carries the message — a legitimate trivial attestation must still escape"
    assert not denied(cg('git commit -m"trivial: glued"', ("user", "go"))), \
        "-m\"msg\" (glued) carries the message"
    assert not denied(cg("git commit --message=trivial-eq-form", ("user", "go"))), \
        "--message=msg carries the message"
    reset_stage(); os.makedirs(f"{repo}/src/rename", exist_ok=True)
    open(f"{repo}/src/rename/b.js", "w").write("b=1\n"); git("add", "src/rename/b.js")
    assert denied(cg("git add src/rename/b.js && git commit -am 'feat: big refactor'",
                     ("user", "go"))), \
        "the path-escape stays closed on the combined -am form too"
    reset_stage(); open(f"{repo}/bar.py", "w").write("y=2\n"); git("add", "bar.py")
    assert not denied(cg("git commit -m 'trivial: rename'", ("user", "go")))         # trivial full-escape
    reset_stage(); open(f"{repo}/n.md", "w").write("# n\n"); git("add", "n.md")
    assert not denied(cg("git commit -m docs", ("user", "go")))                      # doc-only full-escape
    reset_stage(); open(f"{repo}/baz.py", "w").write("z=3\n"); git("add", "baz.py")
    assert not denied(cg("git commit --amend -m x", ("user", "go")))                 # amend escape
    assert cg("ls -la", ("user", "go")).strip() == ""                               # non-commit silent
    assert cg("git log --grep commit", ("user", "go")).strip() == ""                # git log not a commit
    # wrappers that merely CONTAIN 'git commit' are NOT commits (panel-caught false-positive)
    assert cg("man git commit", ("user", "go")).strip() == "", "man git commit not a commit"
    assert cg("echo git commit -m x", ("user", "go")).strip() == "", "echo git commit not a commit"
    # git -C <dir> commit (the most common scripted form) MUST be gated — panel-caught
    # false-negative (-C used to land on the path → returned None → gate never fired). Pass
    # a WRONG cwd to also prove _git_cwd resolves -C to the right repo.
    reset_stage(); open(f"{repo}/c.py", "w").write("c=1\n")
    subprocess.run(["git", "-C", repo, "add", "c.py"], capture_output=True, text=True)
    _clear_counter()
    out = hook("commit-gate.py", {"tool_name": "Bash",
               "tool_input": {"command": f"git -C {repo} commit -m c"},
               "cwd": "/tmp", "transcript_path": tx(("user", "go")),
               "agent_id": "tg-builder"}, env=env).stdout
    assert denied(out), "git -C <dir> commit must be gated (panel-caught false-negative)"
    reset_stage(); open(f"{repo}/q.py", "w").write("q=4\n")
    assert denied(cg("git add -A && git commit -m q", ("user", "go")))              # chained add&&commit
    # anti-loop: counter at max → fail-safe ALLOW. Direct hook() call (NOT cg, which clears).
    git("add", "q.py")
    with open(SENT, "w") as f:
        json.dump({"denies": 9}, f)
    out_al = hook("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": "git commit -m q"},
                  "cwd": repo, "transcript_path": tx(("user", "go")),
                  "agent_id": "tg-builder"}, env=env).stdout
    assert not denied(out_al)                                                        # anti-loop fail-safe
    # RISK TIER — a low-risk commit (tests/copy only) full-escapes: no docs, no verdict.
    reset_stage(); open(f"{repo}/foo.test.js", "w").write("t\n"); git("add", "foo.test.js")
    assert not denied(cg("git commit -m t", ("user", "go"))), "low-risk test-file commit escapes"
    reset_stage(); os.makedirs(f"{repo}/server/tests", exist_ok=True)
    open(f"{repo}/server/tests/test_x.py", "w").write("x\n"); git("add", "server/tests/test_x.py")
    assert not denied(cg("git commit -m t", ("user", "go"))), "low-risk tests/ dir commit escapes"
    reset_stage(); os.makedirs(f"{repo}/src/i18n", exist_ok=True)
    open(f"{repo}/src/i18n/en.json", "w").write("{}\n"); git("add", "src/i18n/en.json")
    assert not denied(cg("git commit -m copy", ("user", "go"))), "copy DATA file commit escapes"
    # DEFAULT-HIGH — the panel's holes, locked as denial tests:
    reset_stage(); open(f"{repo}/latest.py", "w").write("l=1\n"); git("add", "latest.py")
    assert denied(cg("git commit -m l", ("user", "go"))), "latest.py is NOT a test → HIGH"
    reset_stage(); os.makedirs(f"{repo}/src/i18n", exist_ok=True)
    open(f"{repo}/src/i18n/index.js", "w").write("export const x=1\n"); git("add", "src/i18n/index.js")
    assert denied(cg("git commit -m i", ("user", "go"))), "logic under i18n/ → HIGH"
    reset_stage(); os.makedirs(f"{repo}/claude-config/hooks", exist_ok=True)
    open(f"{repo}/claude-config/hooks/test_gates.py", "w").write("t\n")
    git("add", "claude-config/hooks/test_gates.py")
    assert denied(cg("git commit -m g", ("user", "go"))), "the gate's own harness → HIGH (no self-weakening)"
    reset_stage(); open(f"{repo}/a.test.js", "w").write("t\n"); open(f"{repo}/stores.py", "w").write("s=1\n")
    git("add", "a.test.js", "stores.py")
    assert denied(cg("git commit -m m", ("user", "go"))), "mixed low+high → HIGH"
    print("5) commit-gate ........ PASS")


# ==========================================================================
# 6) gate-stats — every rule id rolls up (no parallel list)
# ==========================================================================
def test_gate_stats():
    r = load_rules()
    home = tempfile.mkdtemp(); os.makedirs(f"{home}/.claude/hooks", exist_ok=True)
    env = dict(os.environ, HOME=home, USERPROFILE=home)
    # write one BLOCK line per rule id, spread across two log files
    with open(f"{home}/.claude/hooks/verify-gate.log", "w") as f:
        for rid in ["rules-gate", "code-claim", "reco", "docs-with-features", "plan",
                    "post-task", "second-pass"]:
            f.write(f"2026-06-26 BLOCK {rid} x\n")
    with open(f"{home}/.claude/hooks/task-gate.log", "w") as f:
        for rid in ["task-begin-check", "task-completeness"]:
            f.write(f"2026-06-26 BLOCK {rid} x\n")
    out = subprocess.run([PY, f"{HOOKS}/gate-stats.py"], capture_output=True, text=True, env=env).stdout
    for rid in r.RULE_IDS:                       # EVERY id must roll up
        assert rid in out, f"gate-stats missing {rid}\n{out}"
    assert "blocks): 5" in out, out             # 5 ids (the 2026-07-15 strip), one each
    print("6) gate-stats ......... PASS")


# ==========================================================================
# 7) fail-open — a broken _rules.py must disable NO gate silently
# ==========================================================================
def test_fail_open():
    d = tempfile.mkdtemp()
    # a _rules.py that explodes on import
    with open(f"{d}/_rules.py", "w") as f:
        f.write("raise RuntimeError('boom')\n")
    for name in ("verify-gate.py", "pre-action-check.py", "commit-gate.py"):
        import shutil
        shutil.copy(f"{HOOKS}/{name}", f"{d}/{name}")
    home = tempfile.mkdtemp(); os.makedirs(f"{home}/.claude/hooks", exist_ok=True)
    env = dict(os.environ, HOME=home, USERPROFILE=home)

    def run_broken(name, payload):
        return subprocess.run([PY, f"{d}/{name}"], input=json.dumps(payload),
                              capture_output=True, text=True, env=env)
    t = tx(("user", "go"), ("edit", "x.py"))
    # verify-gate: must NOT block (fail-open) and must WARN
    r1 = run_broken("verify-gate.py", {"transcript_path": t, "cwd": home, "stop_hook_active": False})
    assert not blocked(r1.stdout) and "registry" in r1.stderr.lower(), (r1.stdout, r1.stderr)
    # pre-action: nudge-only since the strip — it does not import the registry at all,
    # so a broken _rules.py cannot touch it. It must still nudge, never deny.
    r2 = run_broken("pre-action-check.py", {"tool_name": "Edit", "tool_input": {"file_path": "a.py"},
                                            "transcript_path": t})
    assert not denied(r2.stdout) and "R1-R5" in r2.stdout
    # commit-gate (agent_id, so it reaches its registry check): allow + warn
    r4 = run_broken("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": "git commit -m x"},
                                       "cwd": home, "transcript_path": t, "agent_id": "tg-x"})
    assert not denied(r4.stdout) and "registry" in r4.stderr.lower()
    # commit-gate without agent_id: exits silently BEFORE any registry concern
    r5 = run_broken("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": "git commit -m x"},
                                       "cwd": home, "transcript_path": t})
    assert r5.stdout.strip() == "" and r5.returncode == 0
    print("7) fail-open .......... PASS")


if __name__ == "__main__":
    test_ledger_refs()
    test_loaded_surfaces()
    test_registry()
    test_verify_gate()
    test_pre_action()
    test_commit_gate()
    test_gate_stats()
    test_fail_open()
    print("\nALL GATE TESTS PASS")
