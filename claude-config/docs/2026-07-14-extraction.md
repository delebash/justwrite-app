# claude-config — extraction from justwrite-app (2026-07-14)

## What this is

The rules-as-checks bundle (the global `~/.claude` config: the T1–T12 rule-tests, the
enforcement hooks, the rules-checker agent, `install.sh`) was extracted from
`justwrite-app/claude-config/`, where it had been vendored, into this standalone repo
`github.com/delebash/claude-config`. Motivation: the config is machine-wide (it governs
every repo in a session, from `~/.claude/`), so its source did not belong buried inside one
app's repo. See `README.md` for how to use it locally and on the web.

## Why standalone — options considered (T4)

The config's source has to live in *some* checked-out repo (or be added standalone) so
`install.sh` can run once per container and rebuild `~/.claude`. Options weighed:

1. **Stay vendored in justwrite-app** (status quo) — zero setup, but the machine-wide config
   lives in one app's repo and only rides along where justwrite-app is checked out.
2. **Vendor in just-llm-runner** (the shared repo both apps consume) — a more neutral home,
   zero per-session setup *if* that repo is always in the environment; still couples the
   config to a product repo.
3. **Standalone repo (CHOSEN — user's decision)** — cleanest separation; the config is what
   it actually is (machine-wide), reusable across every project. Cost: a one-time env setup
   for the web (add the repo + point the Setup Script at it) / a one-time clone locally.
4. **Submodule of a routed repo** — separation *and* rides along, but depends on the web env
   initializing submodules on checkout, which is unverified — rejected as unproven.

## Transport reality (verified this session)

This container's git proxy only routes the repos configured in the environment (a
`git ls-remote` of the new repo hit a credential prompt), and the `add_repo` session tool
is unavailable — so the new repo was **populated via the GitHub MCP `push_files` API**, not
a local `git push`. For consumption: local = `git clone`; web = add the repo to the
environment (see README). "Make it public" does not change this — the proxy gates *routing*
to the configured repos, which is separate from repo auth.

## What changed vs the vendored bundle (T6, per file)

| File | Change |
|---|---|
| `hooks/self-update.sh` | NEW — SessionStart local-clone auto-pull, hang-proofed (`timeout` + `GIT_TERMINAL_PROMPT=0` + `source=startup`-only + `exit 0`). |
| `hooks/_rules.py` | `GATE_TREE` gains a precise `(^|/)hooks/(named-gate-files)` alternative so the gate's own tree stays HIGH-risk in the standalone layout (`hooks/` at repo root), where `test_gates.py` would otherwise match `LOW_RISK` and self-weaken. |
| `hooks/test_gates.py` | + standalone-layout gate-tree asserts (`hooks/test_gates.py` → HIGH; `hooks/self-update.sh` → gate-tree; `src/hooks/useX.js` → NOT gate-tree). |
| `install.sh` | HOW-TO-WIRE comment rewritten for the standalone model; copies + chmods `self-update.sh`. |
| `settings.json` | SessionStart adds `self-update.sh` (beside `arm-rules-gate.sh`). |
| `CLAUDE.md` | "provisioned from justwrite-app/claude-config/" → the standalone repo; SessionStart bullet documents `self-update.sh`. |
| `README.md` | setup rewritten into explicit local + web sections; provisions/events tables gain a `self-update.sh` row; maintenance loop → repo-root paths + the test-run path drops the `claude-config/` prefix. |
| `RULES-AS-CHECKS-V2-PLAN.md` | historical banner (its `justwrite-app/claude-config/` paths are pre-extraction). |
| `.gitignore` | NEW — `__pycache__`, `*.pyc`, runtime logs/sentinels. |
| (every other bundle file) | moved verbatim. |

## Verification (T7)

- `python3 hooks/test_gates.py` → all 7 suites PASS (incl. the new GATE_TREE asserts).
- `HOME=<tmp> FORCE=1 bash install.sh` → provisions a clean `~/.claude`: all 8 hooks copied,
  `self-update.sh` `+x`, `settings.json` wires it on SessionStart, and the installed
  `_rules.GATE_TREE` matches `hooks/commit-gate.py` but NOT `src/hooks/useX.js`.

## Sequencing (safe rollout — do NOT skip)

The `justwrite-app/claude-config/` copy is **retained** as the working provisioner — removing
it before the standalone path is proven would leave a fresh container **ungated** with no
restore. Cut-over order: (1) add this repo to the environment + update the Setup Script;
(2) prove a fresh container provisions `~/.claude` from it; (3) only then remove the JW copy.
