#!/usr/bin/env python3
"""Committed gate harness for the rules-as-checks system.

Run:  python3 claude-config/hooks/test_gates.py     (exits non-zero on any failure)

Tests, against whatever hooks dir this file lives in (bundle OR live ~/.claude):
  1. the `_rules` registry  — armed events, ids, regexes, genuine-user, per-event subset
  2. verify-gate (Stop)     — Block 0 sentinel loop + Blocks 1-5 behavior
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


def tx(*msgs) -> str:
    """Build a throwaway transcript .jsonl. msg = (kind, value)."""
    f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    for kind, val in msgs:
        if kind == "user":
            f.write(json.dumps({"type": "user", "message": {"content": val}}) + "\n")
        elif kind == "text":
            f.write(json.dumps({"type": "assistant", "message": {"content": [
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
def test_registry():
    r = load_rules()
    assert set(r.armed_events()) == {"Stop", "commit", "TaskCreated", "TaskCompleted"}, r.armed_events()
    assert r.RULE_IDS == ["rules-gate", "code-claim", "reco", "docs-with-features",
                          "plan", "post-task", "task-begin-check", "task-completeness"], r.RULE_IDS
    # VERDICT: accepts real verdicts, rejects narration (the dogfood-caught hole)
    assert r.VERDICT.search("VERDICT: PASS") and r.VERDICT.search("T1 PASS, T2 FAIL")
    for s in ("I'll run the rules-checker next", "let me run the rules-checker", "the plan looks good"):
        assert not r.VERDICT.search(s), s
    # genuine-user: a real prompt yes; injected wrappers no
    U = lambda s: {"type": "user", "message": {"content": s}}
    assert r.is_genuine_user(U("yes do it"))
    assert r.is_genuine_user(U("<command-name>/model</command-name>"))  # slash command stays genuine
    for s in ("<task-notification>\n<task-id>x</task-id>", "<local-command-stdout>set</local-command-stdout>",
              "<system-reminder>x</system-reminder>"):
        assert not r.is_genuine_user(U(s)), s
    assert not r.is_genuine_user({"type": "user", "isMeta": True, "message": {"content": "x"}})
    assert not r.is_genuine_user({"type": "user", "message": {"content": [{"type": "tool_result", "content": "x"}]}})
    # per-event subset via run_rules
    base = r.build_ctx({"cwd": "/tmp"}, [{"type": "user", "message": {"content": "hi"}}], "Stop")
    assert r.run_rules("Stop", base) == []                 # clean
    c = dict(base); c["code_edit"] = True; c["rules_passed"] = False
    assert "post-task" in [i for i, _ in r.run_rules("Stop", c)]
    c["hedged"] = True
    assert "post-task" not in [i for i, _ in r.run_rules("Stop", c)]   # hedge exempts at Stop
    tc = r.build_ctx({}, [{"type": "user", "message": {"content": "hi"}}], "TaskCreated")
    tc["rules_passed"] = False
    assert [i for i, _ in r.run_rules("TaskCreated", tc)] == ["task-begin-check"]
    cm = r.build_ctx({}, [{"type": "user", "message": {"content": "hi"}}], "commit")
    cm["commit_has_code"] = True; cm["commit_docs_ok"] = False; cm["rules_passed"] = False
    assert set(i for i, _ in r.run_rules("commit", cm)) == {"docs-with-features", "task-completeness"}
    cm["commit_has_code"] = False
    assert r.run_rules("commit", cm) == []                 # doc-only → inert
    print("1) registry ........... PASS")


# ==========================================================================
# 2) verify-gate (Stop) — Blocks 1-5 + Block 0 sentinel
# ==========================================================================
def test_verify_gate():
    home = tempfile.mkdtemp(); os.makedirs(f"{home}/.claude/hooks", exist_ok=True)
    env = dict(os.environ, HOME=home)   # no sentinel → Block 0 inert

    def vg(*msgs):
        return hook("verify-gate.py", {"transcript_path": tx(*msgs), "cwd": home,
                                       "stop_hook_active": False}, env=env).stdout
    assert blocked(vg(("user", "go"), ("edit", "x.py"), ("text", "made it")))       # post-task
    assert not blocked(vg(("user", "go"), ("edit", "x.py"), ("text", "VERDICT: PASS")))
    assert blocked(vg(("user", "go"), ("edit", "x.py")))                            # silent edit still gated
    assert blocked(vg(("user", "go"), ("text", "Here's the plan: do x")))           # plan
    assert not blocked(vg(("user", "go"), ("text", "Here's the plan. VERDICT: PASS")))
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
    def pa(file_path, *msgs, tool="Edit"):
        return hook("pre-action-check.py", {"tool_name": tool,
                    "tool_input": {"file_path": file_path}, "transcript_path": tx(*msgs)}).stdout
    assert denied(pa("a.py", ("user", "build")))                        # first code edit → deny
    assert not denied(pa("NOTES.md", ("user", "build")))               # .md exempt → nudge
    assert not denied(pa("a.py", ("user", "build"), ("text", "VERDICT: PASS")))
    assert not denied(pa("a.py", ("user", "build"), ("agent", "")))
    assert not denied(pa("a.py", ("user", "build"), ("text", "trivial typo")))
    assert not denied(pa("b.py", ("user", "build"), ("edit", "a.py")))  # second edit, no deny
    # the live bug: a <task-notification> after an edit must NOT reset the window
    assert not denied(pa("b.py", ("user", "build"), ("edit", "a.py"),
                         ("user", "<task-notification>\n<task-id>z</task-id>")))
    assert "PLAN BOUNDARY" in hook("pre-action-check.py", {"tool_name": "ExitPlanMode"}).stdout
    print("3) pre-action ......... PASS")


# ==========================================================================
# 4) task-gate
# ==========================================================================
def test_task_gate():
    def tg(event, *msgs):
        return hook("task-gate.py", {"hook_event_name": event, "transcript_path": tx(*msgs)}).returncode
    assert tg("TaskCreated", ("user", "t")) == 2
    assert tg("TaskCreated", ("user", "t"), ("text", "VERDICT: PASS")) == 0
    assert tg("TaskCompleted", ("user", "t")) == 2
    assert tg("TaskCompleted", ("user", "t"), ("agent", "")) == 0
    assert tg("TaskCompleted", ("user", "t"), ("text", "trivial")) == 0
    print("4) task-gate .......... PASS")


# ==========================================================================
# 5) commit-gate
# ==========================================================================
def test_commit_gate():
    repo = tempfile.mkdtemp(); home = tempfile.mkdtemp()
    os.makedirs(f"{home}/.claude/hooks", exist_ok=True)
    env = dict(os.environ, HOME=home)

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
        return hook("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": cmd},
                    "cwd": repo, "transcript_path": tx(*msgs)}, env=env).stdout

    def reset_stage():
        git("reset", "--hard"); git("clean", "-fd")
        for f in os.listdir(repo):
            if f != ".git" and os.path.isfile(f"{repo}/{f}"):
                os.remove(f"{repo}/{f}")

    open(f"{repo}/foo.py", "w").write("x=1\n"); git("add", "foo.py")
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
               "cwd": "/tmp", "transcript_path": tx(("user", "go"))}, env=env).stdout
    assert denied(out), "git -C <dir> commit must be gated (panel-caught false-negative)"
    reset_stage(); open(f"{repo}/q.py", "w").write("q=4\n")
    assert denied(cg("git add -A && git commit -m q", ("user", "go")))              # chained add&&commit
    # anti-loop: counter at max → fail-safe ALLOW. Direct hook() call (NOT cg, which clears).
    git("add", "q.py")
    with open(SENT, "w") as f:
        json.dump({"denies": 9}, f)
    out_al = hook("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": "git commit -m q"},
                  "cwd": repo, "transcript_path": tx(("user", "go"))}, env=env).stdout
    assert not denied(out_al)                                                        # anti-loop fail-safe
    print("5) commit-gate ........ PASS")


# ==========================================================================
# 6) gate-stats — every rule id rolls up (no parallel list)
# ==========================================================================
def test_gate_stats():
    r = load_rules()
    home = tempfile.mkdtemp(); os.makedirs(f"{home}/.claude/hooks", exist_ok=True)
    env = dict(os.environ, HOME=home)
    # write one BLOCK line per rule id, spread across two log files
    with open(f"{home}/.claude/hooks/verify-gate.log", "w") as f:
        for rid in ["rules-gate", "code-claim", "reco", "docs-with-features", "plan", "post-task"]:
            f.write(f"2026-06-26 BLOCK {rid} x\n")
    with open(f"{home}/.claude/hooks/task-gate.log", "w") as f:
        for rid in ["task-begin-check", "task-completeness"]:
            f.write(f"2026-06-26 BLOCK {rid} x\n")
    out = subprocess.run([PY, f"{HOOKS}/gate-stats.py"], capture_output=True, text=True, env=env).stdout
    for rid in r.RULE_IDS:                       # EVERY id must roll up
        assert rid in out, f"gate-stats missing {rid}\n{out}"
    assert "blocks): 8" in out, out             # 8 ids, one each
    print("6) gate-stats ......... PASS")


# ==========================================================================
# 7) fail-open — a broken _rules.py must disable NO gate silently
# ==========================================================================
def test_fail_open():
    d = tempfile.mkdtemp()
    # a _rules.py that explodes on import
    with open(f"{d}/_rules.py", "w") as f:
        f.write("raise RuntimeError('boom')\n")
    for name in ("verify-gate.py", "pre-action-check.py", "task-gate.py", "commit-gate.py"):
        import shutil
        shutil.copy(f"{HOOKS}/{name}", f"{d}/{name}")
    home = tempfile.mkdtemp(); os.makedirs(f"{home}/.claude/hooks", exist_ok=True)
    env = dict(os.environ, HOME=home)

    def run_broken(name, payload):
        return subprocess.run([PY, f"{d}/{name}"], input=json.dumps(payload),
                              capture_output=True, text=True, env=env)
    t = tx(("user", "go"), ("edit", "x.py"))
    # verify-gate: must NOT block (fail-open) and must WARN
    r1 = run_broken("verify-gate.py", {"transcript_path": t, "cwd": home, "stop_hook_active": False})
    assert not blocked(r1.stdout) and "registry" in r1.stderr.lower(), (r1.stdout, r1.stderr)
    # pre-action: must NOT deny (fail-open to nudge) and warn
    r2 = run_broken("pre-action-check.py", {"tool_name": "Edit", "tool_input": {"file_path": "a.py"},
                                            "transcript_path": t})
    assert not denied(r2.stdout) and "registry" in r2.stderr.lower()
    # task-gate: must allow (exit 0)
    r3 = run_broken("task-gate.py", {"hook_event_name": "TaskCreated", "transcript_path": t})
    assert r3.returncode == 0 and "registry" in r3.stderr.lower()
    # commit-gate: must allow a commit (exit 0, no deny) and warn
    r4 = run_broken("commit-gate.py", {"tool_name": "Bash", "tool_input": {"command": "git commit -m x"},
                                       "cwd": home, "transcript_path": t})
    assert not denied(r4.stdout) and "registry" in r4.stderr.lower()
    print("7) fail-open .......... PASS")


if __name__ == "__main__":
    test_registry()
    test_verify_gate()
    test_pre_action()
    test_task_gate()
    test_commit_gate()
    test_gate_stats()
    test_fail_open()
    print("\nALL GATE TESTS PASS")
