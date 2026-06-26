#!/usr/bin/env bash
# SessionStart HARD-GATE ARM — NO soft injection (user law: "never do soft").
#
# SessionStart fires with a `source`: startup | resume | clear | compact
# (verified at code.claude.com/docs/en/hooks). We arm the rules-gate ONLY on a
# genuine context loss or fresh process — compact, clear, startup — and SKIP
# `resume` (--continue / --resume / /resume): a resume RELOADS the full
# transcript, so the earlier in-context Read of the rules is still present and
# re-reading would be cry-wolf (the bug this fixes — the cloud harness emits
# `resume` when it re-establishes a session, which was firing the gate spuriously).
#
# The chosen source is stored in the sentinel so the Stop gate's message names
# what actually happened, and is logged for visibility. Records the CURRENT
# (non-blank) transcript line count so the Stop verify-gate (Block 0) can BLOCK
# until the FULL rules + project CLAUDE.md + MORNING_RECAP.md are RE-READ since
# this reset. Always exits 0 with valid JSON; never breaks startup.

input="$(cat 2>/dev/null)"
HOOK_INPUT="$input" python3 <<'PY'
import json, os, time

SENT = os.path.expanduser("~/.claude/hooks/.rules_gate")
LOG = os.path.expanduser("~/.claude/hooks/verify-gate.log")


def log(m):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} ARM {m}\n")
    except Exception:
        pass


try:
    data = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except Exception:
    data = {}
source = str(data.get("source") or "")

if source == "resume":
    # Context reloaded intact — do NOT arm (the cry-wolf fix).
    log(f"skip source={source!r} (resume — context intact)")
else:
    tpath = data.get("transcript_path") or ""
    n = 0
    try:
        if tpath and os.path.isfile(tpath):
            with open(tpath, encoding="utf-8") as f:
                n = sum(1 for line in f if line.strip())
    except Exception:
        n = 0
    try:
        with open(SENT, "w", encoding="utf-8") as f:
            json.dump({"line": n, "blocks": 0, "source": source}, f)
        log(f"armed source={source!r} line={n}")
    except Exception:
        pass
print("{}")
PY
exit 0
