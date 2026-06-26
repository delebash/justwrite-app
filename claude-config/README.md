# claude-config — global Claude Code hard-gate, provisioned per container

This folder is the **restore source** for the global `~/.claude` configuration
(rules + enforcement hooks). It exists because **`~/.claude` does not survive a
fresh Claude-Code-on-the-web container** — only the cloned repo and the org's
server-managed settings carry over (see
`code.claude.com/docs/en/claude-code-on-the-web`, the *"what config carries
over"* table: `~/.claude/CLAUDE.md → No — lives on your machine, not in the
repo`). Committing the config here + restoring it with a setup script makes the
enforcement persist.

## What it provisions

| File | Installed to | Purpose |
|---|---|---|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | The global rules (PRIORITY rules + RULES #0–8 + the Vue3/Tauri app standard). |
| `settings.json` | `~/.claude/settings.json` | Wires the two hard-gate hooks: `SessionStart → arm-rules-gate.sh`, `Stop → verify-gate.py`. No soft injection. |
| `hooks/arm-rules-gate.sh` | `~/.claude/hooks/` | SessionStart hook. On every startup/resume/clear/compact, records the transcript length into a sentinel so the Stop gate knows a memory reset happened. |
| `hooks/verify-gate.py` | `~/.claude/hooks/` | Stop hook. **Block 0**: blocks the turn until `~/.claude/CLAUDE.md` + the project `CLAUDE.md` + `MORNING_RECAP.md` have each been `Read` in full since the last reset. **Block 1**: code claim with zero reads this turn. **Block 2**: storage/arch recommendation with no cited precedent. **Block 3**: a "feature done/shipped" claim that edited code but updated/cited no doc. |

The installer also deletes the superseded **soft** reminders
(`rules-reminder.txt`, `hooks/verify-first.sh`, `hooks/inject-recap.sh`) if a
base image ever restores them.

## How to wire it (one-time, in the environment settings)

In the Claude Code on the web environment settings, set the **Setup script**
field to:

```bash
bash "$CLAUDE_PROJECT_DIR/claude-config/install.sh"
```

The setup script runs once when a new session starts, **before Claude Code
launches**, and the resulting filesystem is snapshot-cached — so later sessions
start with `~/.claude` already in place and the step is skipped. The installer is
idempotent and **cloud-only by default** (it skips unless
`CLAUDE_CODE_REMOTE=true`, so it can't clobber a real local `~/.claude`; override
with `FORCE=1`).

## Honest caveat — user-level settings vs repo `.claude/`

The docs say that in the cloud, *hooks come from the repo's `.claude/settings.json`
and server-managed settings*, and that user-level `~/.claude/settings.json`
"don't carry over." This bundle writes `~/.claude/settings.json` via the setup
script, and that **works in this environment** (the Block-0 gate has fired live
after a real reset). If a platform change ever stops loading user-level
`~/.claude/settings.json` hooks, the fallback is to move the hook *wiring* into a
repo `.claude/settings.json` (the hook scripts can still live here); the rules
file would still be provisioned by the setup script.

## Maintenance

This is the **restore source**, not the live config — they can drift. Whenever
you change the live `~/.claude` (e.g. leaning the rules file), re-sync and commit:

```bash
cp -f ~/.claude/CLAUDE.md            claude-config/CLAUDE.md
cp -f ~/.claude/settings.json        claude-config/settings.json
cp -f ~/.claude/hooks/arm-rules-gate.sh claude-config/hooks/arm-rules-gate.sh
cp -f ~/.claude/hooks/verify-gate.py    claude-config/hooks/verify-gate.py
```

## Multi-repo note

This bundle lives in `justwrite-app`, so the setup-script line above provisions
when a session's repo is `justwrite-app`. To make the gate global across all
repos with a single source, either copy this `claude-config/` into each repo, or
point the environment Setup script at a clone of one canonical copy (needs a
`GH_TOKEN` env var for the clone). That cross-repo decision is open.
