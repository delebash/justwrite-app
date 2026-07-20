#!/usr/bin/env bash
# SessionStart SELF-UPDATE for the standalone claude-config repo.
#
# Keeps a LOCAL clone at ~/.claude/claude-config fresh and re-provisions ~/.claude
# from it, so a persistent machine picks up rule changes on the next new session
# without a manual pull. In the cloud remote env this is INERT (there is no local
# clone — the environment checks the repo out itself and provisions via the Setup
# script), which is correct: fresh containers re-provision, they do not pull.
#
# HANG-PROOF — a SessionStart hook runs synchronously BEFORE the session, so it
# must NEVER block. GIT_TERMINAL_PROMPT=0 turns a missing-credential prompt into an
# instant failure instead of a wait; `timeout` bounds a network/proxy stall; and
# the whole body is best-effort with a final `exit 0`. It acts ONLY on a genuinely
# new session (source=startup), never on compact/clear/resume (those fire
# SessionStart too — re-pulling mid-session is pointless and would slow every
# compaction).
set -u
CLONE="$HOME/.claude/claude-config"

# The SessionStart source arrives as JSON on stdin; read it WITHOUT blocking (a
# bare `cat` with no stdin would hang) and without a hard jq dependency.
payload="$(timeout 2 cat 2>/dev/null || true)"
case "$payload" in
  *'"source"'*'"startup"'*) : ;;   # a new session / container -> proceed
  *) exit 0 ;;                      # compact / clear / resume / no source -> skip
esac

[ -d "$CLONE/.git" ] || exit 0      # no local clone (e.g. cloud env) -> nothing to pull

{
  GIT_TERMINAL_PROMPT=0 timeout 20 git -C "$CLONE" pull --ff-only -q
  FORCE=1 timeout 40 bash "$CLONE/install.sh"
} >/dev/null 2>&1 || true
exit 0
