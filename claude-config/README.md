# claude-config — the global rules-as-checks system, provisioned per container

This folder is the **restore source** for the global `~/.claude` configuration: the
rules, the enforcement hooks, the rules-checker subagent, and the effectiveness
ledger. It exists because **`~/.claude` does not survive a fresh
Claude-Code-on-the-web container** — only the cloned repo and the org's
server-managed settings carry over (see
`code.claude.com/docs/en/claude-code-on-the-web`, the *"what config carries over"*
table: `~/.claude/CLAUDE.md → No`). Committing the config here and restoring it with
a setup script makes the whole system persist across containers.

## Why this system exists (the problem it solves)

The rules used to be ~50k of prose in `CLAUDE.md`. The failure was never that the
rules were unknown — they were in context the whole time — it was that they didn't
**fire at the moment of the decision**. Deep in a task, the live task drives the next
action and the rules sit there as background. That is a **salience problem, not a
knowledge problem**, which is why every past fix ("make the rule stronger / add more
detail") made it worse: more background to not-fire.

The fix (designed with the user, 2026-06-26): **turn the rules into short CHECKS and
run them at mechanical BOUNDARIES the harness fires automatically** — a hook runs
every time, whether or not the model "remembers." Three ideas:

1. **Slim the always-loaded rules** to 12 checkable tests (T1–T12) so they're short
   enough to inject at a boundary; move the full WHY/incidents to a referenced
   `rules-detail.md` read on demand.
2. **Fire the checks at events** — before a code change, before/at a plan, and at
   turn end — via hooks that can *inject* a reminder or *block* the action.
3. **Use a subagent to do the judgment** a script can't — score a plan/diff against
   the tests in its own throwaway context (the literal "load rules → check → unload"),
   and for load-bearing design decisions run a **panel** of 2–3 and compare.

Measure whether it actually helps in `EFFECTIVENESS.md` (catches, false positives,
and misses), so it can be tuned — and shared with other developers who hit the same
"agent has the rules but doesn't apply them" problem.

## The vocabulary (so the design is unambiguous)

- **Action = one tool call.** Every Read / Write / Edit / Bash / subagent spawn /
  ExitPlanMode is one action the harness sees and can fire an event around.
- **Turn = everything from the user's last message until the model stops.** A turn
  holds many actions.
- **Task** = a human label ("phase", "task 1a") the harness does NOT see — *unless*
  it's tracked as a real `TaskCreate` entry, which DOES fire `TaskCreated` /
  `TaskCompleted` events (see "Open decision" below).

## What it provisions

| File | Installed to | Purpose |
|---|---|---|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | The **slim** rules — the 12 rule-tests (T1–T12) + the enforcement summary. Always loaded. |
| `rules-detail.md` | `~/.claude/rules-detail.md` | The **full** WHY + every incident + worked examples (the old 50k). Read on demand when a test is ambiguous. |
| `agents/rules-checker.md` | `~/.claude/agents/` | The rules-checker **subagent** (Opus, read-only): scores a plan/diff against T1–T12, adversarial, returns failures. Panel-aware. |
| `hooks/_rules.py` | `~/.claude/hooks/` | **The rule REGISTRY (single source).** All shared regexes + the turn-scan + genuine-user detection + the rule list (`id`/`events`/`kind`/`recheck`/`detect`/`inject`) + `run_rules`. Every hook imports it; the `id` is also the gate-stats log-key. Imported, not executed. |
| `hooks/pre-action-check.py` | `~/.claude/hooks/` | **PreToolUse** hook: pre-task DENY on the first **code** change without a rules-pass AND (#237) a cited plan/spec line + a `RISK:` doubt (`.md`/explicit-"trivial" exempt); NUDGE on every edit; PANEL reminder on `ExitPlanMode`. |
| `hooks/verify-gate.py` | `~/.claude/hooks/` | **Stop** hook. Block 0 (sentinel) + Blocks 1–6 via `run_rules("Stop")` (see below). |
| `hooks/task-gate.py` | `~/.claude/hooks/` | **TaskCreated/TaskCompleted** gate: `task-begin-check` / `task-completeness` via `run_rules` (exit 2). |
| `hooks/commit-gate.py` | `~/.claude/hooks/` | **PreToolUse(Bash)** commit boundary: HARD-DENY a **HIGH-risk** CODE `git commit` until docs **and** a checker-verdict are present; escapes for `--amend` / doc-only / trivial / low-risk (tests·copy); anti-loop sentinel. |
| `hooks/arm-rules-gate.sh` | `~/.claude/hooks/` | **SessionStart** hook: arms the Block-0 sentinel on compact/clear/startup (not resume). |
| `hooks/gate-stats.py` | `~/.claude/hooks/` | Rolls up the gate logs into a tally for `EFFECTIVENESS.md` (imports the rule ids from `_rules.py`). |
| `hooks/test_gates.py` | (bundle only) | The committed harness — `python3 claude-config/hooks/test_gates.py`. Not installed to `~/.claude`. |
| `EFFECTIVENESS.md` | `~/.claude/EFFECTIVENESS.md` | The durable ledger: catches / false positives / misses. |
| `settings.json` | `~/.claude/settings.json` | Wires the hooks: `SessionStart`, `Stop`, and `PreToolUse` (Edit/Write/MultiEdit/ExitPlanMode). |

`install.sh` also deletes superseded **soft** reminders if a base image restores them
(`rules-reminder.txt`, `hooks/verify-first.sh`, `hooks/inject-recap.sh`) — the user's
law is "never soft, all hard gates."

## The events we hook, and the check at each

There are 31 hook events; these are the ones wired (✋ = can block, 💬 = can inject).
Every event runs the SAME registry (`_rules.py`) against its action via `run_rules`
(except Block 0, which keeps bespoke sentinel mechanics) — the rules are defined once;
the hooks are just the per-event mechanism.

| Event | When | What fires |
|---|---|---|
| `SessionStart` | startup / compact / clear | 💬 arm the "context reset → re-read rules" sentinel |
| `PreToolUse` (Edit/Write/MultiEdit) | before a code change | ✋ **pre-task DENY** (first **code** edit: needs a rules-pass AND — #237 — a cited plan/spec line + a `RISK:` doubt in the turn text; `.md`/explicit-"trivial" exempt) · 💬 **per-edit NUDGE** |
| `PreToolUse` (ExitPlanMode) | before "here is the plan" | 💬 reminder to run the rules-checker **panel** |
| `PreToolUse` (Bash `git commit`) | before a commit | ✋ **commit boundary** — HARD-DENY a **HIGH-risk** CODE commit until docs **+** a *genuine agent* all-pass verdict (parsed from the agent's result, not self-typed; risk tier: low-risk tests/copy full-escape, default-HIGH; escapes: `--amend`, doc-only, trivial, low-risk; anti-loop) |
| `TaskCreated` / `TaskCompleted` | a tracked task begins/ends | ✋ `task-begin-check` / `task-completeness` (anti-skim: the checker reads the FULL criteria) |
| `Stop` | the turn tries to end | ✋ Block 0 (sentinel) + Blocks 1–6 (registry) |

### The Stop gate — Blocks 0–6 (`verify-gate.py`)

- **Block 0** — after a memory reset, the turn is blocked until `~/.claude/CLAUDE.md`
  + the project `CLAUDE.md` + `MORNING_RECAP.md` have each been **Read in full** (a
  real Read tool call, never a truncated injection). Disarms on compliance; fail-safe
  after `MAX_REBLOCKS`.
- **Block 1** — a code claim (a filename or file:line) with **zero** evidence tools
  this turn and no honest hedge (answered from memory).
- **Block 2** — a storage/architecture **recommendation** with no cited precedent.
- **Block 3** — a **"done/shipped"** claim that edited code but updated/cited no doc.
- **Block 4** — a **plan/design LOCK** ("here's the plan" / "locked" / "we've decided")
  without a **GENUINE agent verdict** this turn (#237 hardened: the typed-tests /
  'trivial' self-citation escape is closed at lock grain — the same `agent_pass`
  mechanism the commit gate uses). A turn that merely RECORDS the user's own decision
  and says so ("the user's decision/word") is not my design and passes.
- **Block 5** — **post-task**: the turn **edited code** but ran no rules-pass.
- **Block 6** — **second pass** (#237): a **PROPOSAL** turn ("I propose/recommend",
  "here's the design", or un-attributed lock language) that does not end with an
  explicit **"SECOND PASS —"** section (what the second look changed/confirmed · what
  it re-verified · the sharpest remaining doubt). Numbered AFTER post-task so the
  historical Block 0–5 references in the incident records stay truthful.

All blocks **fail OPEN** on any error (a broken gate must never brick a session), and
short-circuit on `stop_hook_active` so each fires at most once per stop-sequence.

### The three check granularities (the user's model)

- **Per-edit → nudge.** Every `Edit`/`Write` gets a one-line reminder (non-blocking).
- **Pre-task → deny.** The FIRST **code** change of a turn is **denied** unless the plan
  was rules-checked (run the checker, cite the tests) AND (#237, the think-twice check)
  the turn's own text already states **what plan/spec line is being executed**
  (doc.md:line / §-section / the queue-plan doc item / the user's words) **plus one
  `RISK:` line** on what could be wrong — the second look at the keyboard, before the
  write. Catches a bad plan *before* it becomes 10 bad files. A first edit to a `.md`
  doc is exempt (the cry-wolf narrowing); a genuinely trivial change needs the EXPLICIT
  word "trivial" (the loose family — "rename", "one-line" — no longer skips the check,
  since those words appear in ordinary task names).
- **Post-task → deny (cheap, turn-grain).** A code-editing turn that ends with no
  rules-pass is **blocked** (Block 5) — the backstop, kept even when nothing is committed.
- **Commit → HARD-DENY (heavy, the main post-task check).** A CODE `git commit` is the
  truest "task end" the harness sees; it is blocked until BOTH a doc is updated/cited AND a
  **genuine independent rules-checker AGENT verdict reads all-pass** — parsed from the
  agent's OWN result (a harness-authored `<task-notification>`), NOT from a "VERDICT" I type
  (the anti-self-certification core: a gate that checks my words can be satisfied by my
  words; only one keyed on a real agent output binds). **RISK-TIERED (2026-07-14): the
  docs+verdict requirement is HIGH-risk only; a low-risk commit (all code files test infra /
  copy DATA, nothing under the gate's tree) full-escapes — generic `LOW_RISK` allowlist,
  default-HIGH on mixed/unknown.** Escapes: `--amend`, a doc-only commit, an attested
  "trivial", a low-risk (tests/copy) commit. LAYERS on Stop; never replaces it. Ceiling: the agent can
  miss — non-skippable, not infallible.

## The rules-checker subagent + the panel

`agents/rules-checker.md` is an Opus, read-only subagent. Hand it a PLAN or a DIFF;
it scores each of T1–T12 PASS/FAIL/NA with a one-line why (defaults to FAIL when
uncertain) and returns only the failures. It runs in its own discarded context — the
literal "load the rules, check this, throw the context away."

**Panel (for load-bearing design):** "design" means BOTH the whole-plan architecture
(where wrong = days of rewrite) AND component choices (T3 reuse-vs-copy). For those,
spawn **2–3 independent checkers with diverse lenses** (architecture-fit ·
reuse/convergence · grounding) and **compare** — any FAIL, or disagreement between
them, = stop and resolve before locking. The extra checkers are cheap next to a
rewrite. A routine code-diff post-task check needs only one.

## Effectiveness measurement

The gates log every BLOCK/PASS (`verify-gate.log`) and every nudge/deny
(`pre-action.log`). `gate-stats.py` rolls those up; `EFFECTIVENESS.md` is the durable
ledger (the logs are per-container and get wiped). The ledger records **catches**
(a fire that changed behavior), **false positives** (a fire that was noise), and
**misses** (a wrong thing NO gate caught — usually the user caught it). Counting the
misses is the honest part: it's how we tell if the system is actually getting better,
and each miss becomes the spec for the next gate.

## How to wire it (one-time, in the environment settings)

Set the **Setup script** field to:

```bash
bash "$CLAUDE_PROJECT_DIR/claude-config/install.sh"
```

It runs once before Claude Code launches; the filesystem is snapshot-cached so later
sessions start with `~/.claude` already in place. Idempotent and **cloud-only by
default** (skips unless `CLAUDE_CODE_REMOTE=true`; override with `FORCE=1` — never
clobbers a real local `~/.claude`).

## Maintenance — the bundle vs live can drift

This is the **restore source**, not the live config. When you change live `~/.claude`,
re-sync into the bundle and commit:

```bash
for f in CLAUDE.md rules-detail.md EFFECTIVENESS.md settings.json \
         agents/rules-checker.md hooks/_rules.py hooks/arm-rules-gate.sh \
         hooks/verify-gate.py hooks/pre-action-check.py hooks/task-gate.py \
         hooks/commit-gate.py hooks/gate-stats.py; do
  cp -f "$HOME/.claude/$f" "claude-config/$f"
done
```

And the reverse — to apply a bundle change to the live session immediately (so it
takes effect without waiting for a new container): `FORCE=1 bash claude-config/install.sh`.

## Both grains are wired — task-grain + the standing rule

**Task-grain** (`hooks/task-gate.py`, on the blockable `TaskCreated` / `TaskCompleted`
events) is the truest "check at every task begin and end": it blocks creating or
completing a task without a rules-pass this turn (run the checker / cite the tests /
attest trivial; blocks via exit 2, fail-open). It only fires when plan tasks are
tracked as real Task entries — hence the **standing rule: every plan task = one Task
entry**, and a "real plan" = Plan mode + detailed Task entries (see the plan-protocol
in `CLAUDE.md`). **Turn-grain** (the PreToolUse first-edit deny + verify-gate Block 5)
stays as the backstop for work that isn't tracked as Tasks.

## Honest limits

A script checks **structure** (did a read happen? did a doc land? did a check run?),
never **meaning** (was it the *right* file? is the design *actually* sound?). The
subagent + panel add judgment but aren't infallible. The "trivial" escape on the
pre-task deny is the model's own attestation and could be abused — which is exactly
why `EFFECTIVENESS.md` tracks misses. The system lowers the failure rate by moving
checks to boundaries; it does not make the model perfect.
