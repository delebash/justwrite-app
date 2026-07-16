#!/usr/bin/env bash
# Provision the global Claude Code HARD-GATE config into ~/.claude on a fresh
# Claude-Code-on-the-web container.
#
# WHY THIS EXISTS: ~/.claude does NOT carry over between cloud containers — only
# the cloned repo (and org server-managed settings) does. See
# code.claude.com/docs/en/claude-code-on-the-web, the "what config carries over"
# table: "Your user ~/.claude/CLAUDE.md -> No (lives on your machine, not in the
# repo)". So without this, the hard gate + rules vanish on every fresh container.
#
# HOW TO WIRE IT — this is its OWN repo (github.com/delebash/claude-config), no
# longer vendored inside a product repo. See README.md for the full walkthrough.
#
#   LOCAL machine (persistent ~/.claude):
#       git clone https://github.com/delebash/claude-config "$HOME/.claude/claude-config"
#       FORCE=1 bash "$HOME/.claude/claude-config/install.sh"
#     install.sh wires a SessionStart hook (hooks/self-update.sh) that pulls this
#     clone + re-provisions on each NEW session, so rule changes land on their own.
#
#   REMOTE (Claude Code on the web): add `delebash/claude-config` as a repo in the
#   environment (alongside your project repo), then set the **Setup script** to run
#   the checked-out copy's installer (path depends on the env's multi-repo layout;
#   see README). Each fresh container checks the repo out and provisions ~/.claude;
#   snapshot-cached so later sessions start ready. No auto-pull needed there.
#
# Idempotent; safe to re-run.
#
# CLOUD-ONLY BY DEFAULT: skips unless CLAUDE_CODE_REMOTE=true, so running it on
# your own machine cannot clobber your real ~/.claude. Override with FORCE=1.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ "${FORCE:-}" != "1" ]; then
  echo "claude-config: not a remote session (CLAUDE_CODE_REMOTE != true); skipping. Use FORCE=1 to override."
  exit 0
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.claude"
mkdir -p "$DEST/hooks"

cp -f "$HERE/CLAUDE.md"                  "$DEST/CLAUDE.md"
cp -f "$HERE/rules-detail.md"           "$DEST/rules-detail.md"
cp -f "$HERE/EFFECTIVENESS.md"          "$DEST/EFFECTIVENESS.md"
cp -f "$HERE/settings.json"             "$DEST/settings.json"
mkdir -p "$DEST/agents"
cp -f "$HERE/agents/rules-checker.md"   "$DEST/agents/rules-checker.md"
cp -f "$HERE/hooks/_rules.py"           "$DEST/hooks/_rules.py"
cp -f "$HERE/hooks/arm-rules-gate.sh"   "$DEST/hooks/arm-rules-gate.sh"
cp -f "$HERE/hooks/verify-gate.py"      "$DEST/hooks/verify-gate.py"
cp -f "$HERE/hooks/pre-action-check.py" "$DEST/hooks/pre-action-check.py"
cp -f "$HERE/hooks/commit-gate.py"      "$DEST/hooks/commit-gate.py"
cp -f "$HERE/hooks/gate-stats.py"       "$DEST/hooks/gate-stats.py"
cp -f "$HERE/hooks/self-update.sh"      "$DEST/hooks/self-update.sh"
# _rules.py is IMPORTED (not run) so it needs no +x; the rest are executables.
chmod +x "$DEST/hooks/arm-rules-gate.sh" "$DEST/hooks/self-update.sh" \
         "$DEST/hooks/verify-gate.py" "$DEST/hooks/pre-action-check.py" \
         "$DEST/hooks/commit-gate.py" \
         "$DEST/hooks/gate-stats.py"

# WINDOWS INTERPRETER FIX: on Windows `python3` resolves ONLY to the
# Microsoft-Store App-Execution-Alias stub (WindowsApps\python3.exe), which
# prints "Python was not found..." and exits non-zero — so every hook that
# shells out to `python3` silently fails. The real interpreter there is
# `python`. On Linux/macOS (incl. the Claude-Code-on-the-web container)
# `python3` is correct and `python` may be missing or Python 2, so the bundle
# stays `python3` and we rewrite the two provisioned files ONLY on Windows.
# self-update.sh re-runs this installer each new session, so the rewrite
# self-heals on a persistent Windows machine.
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    sed -i 's/\bpython3\b/python/g' "$DEST/settings.json" "$DEST/hooks/arm-rules-gate.sh"
    echo "claude-config: Windows detected — hook interpreter set to 'python'"
    ;;
esac

# Remove the superseded SOFT reminders if a base image ever restores them
# (replaced by the hard gates; user law: "never do soft").
rm -f "$DEST/rules-reminder.txt" "$DEST/hooks/verify-first.sh" "$DEST/hooks/inject-recap.sh"
# 2026-07-15 strip: the task gate is DELETED (its wiring is gone from settings.json, but
# a stale hook file on a machine provisioned earlier is a foot-gun — remove it actively).
rm -f "$DEST/hooks/task-gate.py"

# Superpowers plugin (user-authorized 2026-07-10: "make superpowers permenant").
# Best-effort: the claude CLI may be absent or offline in some environments —
# the gates must still provision, so plugin failures never fail the script.
if command -v claude >/dev/null 2>&1; then
  claude plugin marketplace add obra/superpowers-marketplace >/dev/null 2>&1 || true
  claude plugin install superpowers@superpowers-marketplace >/dev/null 2>&1 || true
  echo "claude-config: superpowers plugin ensured (best-effort)"
fi

echo "claude-config: provisioned $DEST (hard-gate hooks + rules)"
