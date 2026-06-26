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
# HOW TO WIRE IT (one-time): in the Claude Code on the web environment settings,
# set the **Setup script** field to:
#
#     bash "$CLAUDE_PROJECT_DIR/claude-config/install.sh"
#
# The setup script runs once when a new session starts, BEFORE Claude Code
# launches, and the resulting filesystem is snapshot-cached, so later sessions
# start with ~/.claude already in place (no re-run). Idempotent; safe to re-run.
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
cp -f "$HERE/hooks/arm-rules-gate.sh"   "$DEST/hooks/arm-rules-gate.sh"
cp -f "$HERE/hooks/verify-gate.py"      "$DEST/hooks/verify-gate.py"
cp -f "$HERE/hooks/pre-action-check.py" "$DEST/hooks/pre-action-check.py"
cp -f "$HERE/hooks/task-gate.py"        "$DEST/hooks/task-gate.py"
cp -f "$HERE/hooks/gate-stats.py"       "$DEST/hooks/gate-stats.py"
chmod +x "$DEST/hooks/arm-rules-gate.sh" "$DEST/hooks/verify-gate.py" \
         "$DEST/hooks/pre-action-check.py" "$DEST/hooks/task-gate.py" \
         "$DEST/hooks/gate-stats.py"

# Remove the superseded SOFT reminders if a base image ever restores them
# (replaced by the hard gates; user law: "never do soft").
rm -f "$DEST/rules-reminder.txt" "$DEST/hooks/verify-first.sh" "$DEST/hooks/inject-recap.sh"

echo "claude-config: provisioned $DEST (hard-gate hooks + rules)"
