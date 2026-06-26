> **PLAN 1 of 2 — the rules-as-checks / dev-process track.** (Plan 2 = the app work,
> `docs/plans/2026-06-25-jobs-architecture-design.md`.) **Status: BUILT + SHIPPED
> (2026-06-26, commit `b43411e`).** Approved → built → verified (committed harness 7/7 +
> a 2-Opus diff panel) → applied live (`FORCE=1 install.sh`) → pushed; v2 is now the LIVE
> system. **See the "Build outcome" section at the END of this doc** for what actually
> landed, the deviations from the plan below, and the panel catches. Workflow agreed with
> the user (2026-06-26): present → approve → build → user reviews → then Plan 2. The "why
> the rules keep failing" rationale (former jobs-design §17.4) lives in
> `claude-config/CLAUDE.md` ("Why this shape") + `claude-config/EFFECTIVENESS.md`.

# Plan — Rules-as-checks v2: one rule-registry, run at every event

## Context
The rules-as-checks system is LIVE (built + dogfooded this session: slim
`~/.claude/CLAUDE.md` = 12 tests T1–T12; hooks on PreToolUse/Stop/Task events; an
Opus `rules-checker` subagent + 2–3 panel; an effectiveness ledger; all provisioned
from `justwrite-app/claude-config/`). But it grew as **6 hardcoded Stop-blocks +
bespoke per-event logic**, and running it live exposed real friction — the pre-task
DENY fired on a 2-line recap edit (cry-wolf), and each "check" is hand-written per
block rather than one rule definition.

Across this session the user converged on a cleaner model: **every event does ONE
thing — run THE RULES (pass/fail); each rule self-heals (inject its fix → re-check →
pass); structural rules run everywhere (cheap), the rules-checker subagent only at
heavy boundaries (plan-finalize, commit).** This refactors the bespoke blocks into
that uniform shape, adds the **commit boundary** as the main post-task check, and
removes the cry-wolf gate. Outcome: fewer, better-placed checks; ONE place that
defines the rules; the docs-rule becomes an *injected instruction that re-checks*
(not a structural "a doc was touched"); begin-check at the plan, end-check at commit.

## Current state (grounded — all built this session, LIVE in ~/.claude)
- `verify-gate.py` (Stop): 6 hardcoded blocks — 0 reset · 1 code-claim-no-read ·
  2 arch-reco-no-precedent · 3 done+code-no-doc · 4 plan-no-rules-pass ·
  5 post-task-code-no-rules-pass. Each = `if cond: print({"decision":"block",...}); exit`. Fail-open.
- `pre-action-check.py` (PreToolUse Edit/Write/MultiEdit/ExitPlanMode): pre-task DENY
  on the first edit w/o a strict rules-pass; per-edit one-line nudge; ExitPlanMode → panel reminder.
- `task-gate.py` (TaskCreated/TaskCompleted): block (exit 2) w/o a strict rules-pass.
- `gate-stats.py` + `EFFECTIVENESS.md` (metrics); `settings.json` (5 events);
  `install.sh` (provisions all); `agents/rules-checker.md` (Opus, panel).
- Source-of-truth bundle: `justwrite-app/claude-config/` → `install.sh` copies to
  `~/.claude` (`FORCE=1 install.sh` applies live).

## Target design
1. **One rule registry** — `claude-config/hooks/_rules.py`: each rule =
   `{id, events:[...], kind:"structural"|"semantic", recheck:"evidence"|"text",
   detect(ctx)->bool, inject:"<instruction>"}`. Defined ONCE; `id` is ALSO the log-key
   (single source for gate-stats). `run_rules(event, ctx)` → the failing rules'
   inject-messages.
2. **Every event runs the registry** against its action. A failing rule → inject its
   instruction + hold (block) → re-check. The `recheck` axis matters (panel-caught,
   don't conflate): an **evidence** rule (B0-shape) self-heals when a TOOL ACTION
   appears next (e.g. the Read happened); a **text** rule (B1–B5-shape) only "heals"
   when the ANSWER is rewritten, re-checked on the next Stop. Two mechanisms, not one.
3. **Depth-by-cost:** structural rules run at every event (ms); the **semantic** rules
   = "run the rules-checker subagent", injected/required only at heavy boundaries
   (plan-finalize, commit), never per-edit.
4. **Commit boundary (NEW):** a SEPARATE PreToolUse block with a `Bash` matcher →
   `run_rules("commit", ctx)` on `git commit`. It LAYERS the heavy check on top of Stop:
   the docs-rule injects "update all relevant docs" + it requires a real checker VERDICT
   for the semantic set, as a HARD DENY (not a nudge) until docs+verdict are present
   (panel residual: keep it a hard gate). Escapes — reuse the EXISTING `rules_passed`
   set, not a stricter one: trivial attestation, doc-only commit, `git commit --amend`.
   Anti-loop: a sentinel (like Block 0's) so a blocked retry can't permanently wedge.
5. **KEEP all the Stop blocks (B0–B5) as the turn-grain backstop** — do NOT move them to
   commit-only (panel-caught regression: a turn that edits code then STOPS TO ASK YOU
   commits nothing → the commit hook never fires → without Stop's B3/B5 there'd be ZERO
   post-task check, undoing the silent-edit fix shipped this session). The commit boundary
   ADDS the semantic checker ON TOP; it never replaces the cheap structural Stop gates.
6. **NARROW (don't drop) the pre-task first-edit DENY** — exempt `.md`-only / TRIVIAL
   first edits (the cry-wolf case that fired on a 2-line recap edit AND on these very
   plan-file edits); keep it for non-trivial code. ALSO fix the turn-window bug found
   live: task-notifications must NOT reset the pre-task "first edit of the turn" window.
   The begin-check survives for real work; plan-finalize adds the panel.
7. **Keep:** reset (B0), the per-edit one-line nudge, the ExitPlanMode panel reminder,
   the Task gates. Preserve the THREE block mechanisms — exit-2 for Task events,
   `{"decision":"block"}` for Stop, deny-JSON for PreToolUse — even sharing the one registry.

## The one real fork (decide before building)
**Shared `_rules.py` (DRY — one rule definition) vs per-hook self-contained (max
isolation).** Recommendation: **shared `_rules.py`** — the whole point ("rules defined
once"); the import works from any cwd because Python puts the script's own dir on
`sys.path` (feasibility-panel verified). BUT the panel corrected my false claim that
fail-open is "the same guarantee as today": today a bug fails open ONE block; a shared-
registry bug would silently disable EVERY gate at once. Required mitigations so DRY is
safe: (a) each hook keeps its OWN `try/except import _rules` so a registry bug can't
crash the hook; (b) on import/run failure, emit a LOUD non-blocking warning ("⚠ rule
registry failed — gates OFF this turn") so disablement is VISIBLE, never silent; (c) a
smoke assertion that `import _rules` succeeds AND `run_rules` returns ARMED for every
event (not merely "doesn't brick"). Per-hook duplication (today's state) is the fallback.

## Files / touch-list (produce a per-file BEFORE→AFTER strict-diff table at build — T6)
- NEW `claude-config/hooks/_rules.py` — registry + `run_rules` + structural detect fns
  (lifted from the current blocks) + inject messages + the log-key list (single source).
- `verify-gate.py` — replace the 6 hand-written blocks with `run_rules("Stop", ctx)` over
  ALL of B0–B5 (KEPT as backstop), preserving the `{"decision":"block"}` mechanism.
- `pre-action-check.py` — NARROW the first-edit DENY (exempt `.md`/trivial; fix the
  notification turn-window bug); keep the one-line nudge + the ExitPlanMode panel.
- NEW `commit-gate.py` (PreToolUse) → `run_rules("commit", ctx)` on `git commit` (hard
  DENY until docs+verdict; escapes trivial/doc-only/--amend; anti-loop sentinel).
- `settings.json` — a SEPARATE PreToolUse block with a `Bash` matcher (can't widen the
  existing `Edit|Write|MultiEdit|ExitPlanMode` block).
- `install.sh` — `cp` `_rules.py` + `commit-gate.py` (+ chmod the executables) AND add
  both to the README re-sync `for f in …` list so a half-system can't ship.
- `gate-stats.py` — IMPORT the log-key list from `_rules.py` (don't hand-maintain a
  parallel `BLOCKS` list — that caused the Block-5-uncounted miss); test every id rolls up.
- `EFFECTIVENESS.md` / `README.md` (event table + the Blocks 0–5 list) / `CLAUDE.md`
  (Enforcement) — re-key to the registry + the commit boundary.
- `.gitignore` — confirm `__pycache__/` is covered (an importable `_rules.py` makes stale
  bytecode a footgun; root `.gitignore` got it this session — verify it reaches the bundle).

## Tasks
1. `_rules.py` registry (rule defs + `run_rules` + the log-key list + the evidence/text
   recheck axis); each hook imports via `try/except` → LOUD-warn + fail-open on failure.
   Per-rule unit tests.
2. Refactor `verify-gate.py` (Stop) onto the registry — KEEP all of B0–B5 (backstop);
   preserve the `{"decision":"block"}` mechanism.
3. NARROW `pre-action-check.py`'s first-edit DENY (exempt `.md`/trivial; fix the
   notification turn-window bug); keep nudge + ExitPlanMode panel.
4. Add `commit-gate.py` (`git commit` → `run_rules("commit")`): docs-inject + HARD-DENY
   require-checker-verdict for the semantic set; escapes (trivial/doc-only/--amend) +
   anti-loop sentinel.
5. Wire `settings.json` (separate `Bash` block) + `install.sh` (cp `_rules.py` +
   `commit-gate.py` + the README re-sync list); confirm `.gitignore` covers `__pycache__`.
6. Promote `scratchpad/test_gates.py` → committed `claude-config/hooks/test_gates.py`:
   per-rule detect/inject/re-check; registry-per-event; commit-hook DENY+escape+anti-loop;
   gate-stats counts every rule id; **healthy-path stays ARMED AND fail-open-when-unimportable**.
7. `gate-stats.py` imports the keys from `_rules.py`; update EFFECTIVENESS/README/CLAUDE.
8. Re-dogfood: panel on the rebuilt system; `FORCE=1 install.sh` (live); commit + push.

## Verification
- Promote the throwaway `scratchpad/test_gates.py` into a committed
  `claude-config/hooks/test_gates.py`: every rule fails→injects→re-check-passes; each
  event runs the right subset; commit hook blocks w/o docs+verdict, passes with;
  fail-open when `_rules.py` won't import.
- Re-dogfood with the rules-checker panel (Opus ×2: architecture + correctness lenses).
- Live: `FORCE=1 install.sh`; confirm the commit hook fires on a real `git commit`.

## Anti-skim — follow the FULL task detail, not the summary (user-requested 2026-06-26)
Recurring failure: executing a detailed plan, I read a task's SUMMARY and do a small
part, skipping its detail. This is RULE #6 / T5 (do the whole job); the Affordance Table
is the existing manual artifact. v2 automates it as a registry rule:
- **Rule `task-completeness`** (kind: semantic; events: TaskCompleted + commit). At
  task-end it invokes the rules-checker subagent with TWO inputs: (1) the FULL text of the
  plan task — its explicit acceptance criteria, read from the plan doc, **NOT the summary**;
  (2) the diff. The checker scores EACH criterion PASS/FAIL (default FAIL if uncertain) and
  returns every UNMET one. Any unmet → hold (block completion/commit) + inject the gaps →
  I finish → re-check → pass. **The checker is the safeguard against MY skimming — it reads
  the detail I skipped.**
- **Prereq A — plan tasks = explicit acceptance criteria, not summaries.** Each task
  enumerates its sub-requirements (e.g. Task 4 = (a) docs-inject (b) hard-DENY (c) escapes
  trivial/doc-only/--amend (d) anti-loop). The plan-finalize panel verifies every task HAS
  enumerable criteria; a vague task is a plan defect.
- **Prereq B — task→plan-section link.** Each `TaskCreate` records which plan section it
  implements, so `task-completeness` knows which criteria to check against.
- **Cheap structural pre-filter:** first check the diff touched every file in the task's
  touch-list (catches "never touched file X"); the checker then judges whether each
  requirement is actually IMPLEMENTED (touching ≠ implementing).
- **Honest limit:** semantic — the checker's judgment isn't perfect + needs explicit
  criteria in the plan. But it reads the FULL detail, catching the "did a small part" class
  a header-only check never would.
- **Generalizes to "read docs / check code line by line", not just tasks (user,
  2026-06-26).** Same lever prevents skimming ANY source: (1) a **citation requirement** —
  every claim/criterion cites the exact `file:line` you opened (you can't cite accurately
  without reading it; RULE #1/#5/#6 already mandate this clause), and (2) the **checker
  independently re-reads** the full source line by line in its own context and verifies each
  citation/criterion — catching what a skim missed. For audits/refactors, RULE #5's per-unit
  strict-diff (a cited row per unit, every cell `file:line`) structurally forbids "skim the
  whole, declare done." This is NOT a new rule — it's the existing citation rules + the
  checker doing the careful read. The system forces the read + the citation + the checker's
  re-read; it can't force attention to every line — but two careful reads (citation-forced +
  the checker's) beat one skim.

## Panel review (dogfood — ran on THIS plan, 2026-06-26)
Two independent Opus rules-checkers reviewed this plan:
- **Architecture lens → FAIL (7), all folded in above:** (1) DON'T move Stop's
  docs/post-task to commit-only — a no-commit turn (stop-to-ask) would lose ALL post-task
  checking, regressing this session's silent-edit fix → KEEP B0–B5 at Stop, LAYER commit
  on top. (2) My "fail-open = same guarantee" was a false proxy (T1) — a shared-registry
  failure disables every gate at once → loud-warn + per-hook try/except + armed-path smoke
  assert. (3) NARROW the pre-task deny, don't drop it. (4) Don't overstate "self-heal
  generalizes Block 0" — split evidence-recheck vs text-recheck. (5) Commit hook needs
  escapes + anti-loop. (6) Touch-list omissions (README re-sync, `__pycache__`, README
  tables). (7) gate-stats must import the keys, not duplicate.
- **Feasibility lens → PASS:** current-state accurate; the commit hook IS feasible
  (PreToolUse Bash receives the command + supports `additionalContext`/deny); the
  `_rules.py` import works from any cwd. Residual folded in: keep the commit check a HARD
  DENY (not a nudge).
- **Live during planning:** the pre-task deny fired on plan-FILE (`.md`) edits, and
  task-notifications reset its turn-window → both fixes are in design #6 / task 3.
The thesis (one registry + depth-by-cost + commit boundary) survived both panels; the
revisions are coverage + safety, not a rethink.

## Build outcome (2026-06-26 — what actually landed; commit `b43411e`)

All 8 tasks built, verified, applied live, committed + pushed on
`claude/admiring-galileo-il3q0o`. Net diff −207 lines (the registry removed the regex
triplication; `verify-gate.py` alone shed ~355 lines of bespoke blocks).

**Deviations from the plan above (recorded per the "update the plan in the same commit
series" rule):**
- **`task-gate.py` was ALSO refactored onto `_rules.py`** — it was NOT in the original
  Files/touch-list, but leaving its own copies of `VERDICT`/`TRIVIAL`/turn-scan would
  violate the single-source thesis (T3). Folded in: `task-begin-check` (TaskCreated) +
  `task-completeness` (TaskCompleted + commit) now run via `run_rules`.
- **`.gitignore`** needed no change — the repo root already covers `__pycache__/` + `*.pyc`
  and that reaches the bundle (verified `git ls-files` shows the `.pyc` untracked).
- **README re-sync list** also gained `task-gate.py` (it was already missing — pre-existing
  gap fixed, T5).
- The turn-window bug (design #6) was grounded to its real shape before fixing: a
  `<task-notification>` is a non-meta **string** user message; `is_genuine_user` skips it
  (+ `<local-command-stdout>` etc.), `<command-name>` slash commands stay genuine.

**Panel outcome (the dogfood working): the final 2-Opus diff panel FAILED the build and
found 2 real bugs the committed harness had missed** — both in `commit-gate.py`'s
`_classify_commit`: (1) `git -C <dir> commit` was a false-NEGATIVE (the `-C` value was
read as the subcommand → the gate silently never fired on the most common scripted form —
the very form the harness used for setup, so it passed green); (2) `man git commit` /
`echo git commit` were false-POSITIVES (`"git" in toks` vs `toks[0]=="git"`). Both fixed
(skip separated-value global opts; require `git` as the segment command; resolve `-C` for
the staged-tree read) + regression tests added. Detail in `EFFECTIVENESS.md`.

**Verification:** `claude-config/hooks/test_gates.py` 7/7 green; the 2-Opus panel (above);
`FORCE=1 install.sh` applied live (8 rule ids armed across Stop/commit/TaskCreated/
TaskCompleted; commit-gate wired); the live commit-gate confirmed firing on a real
`git -C … commit` (deny on code-without-docs/verdict; allow on this doc+verdict commit).

**Self-caught MISS (logged in `EFFECTIVENESS.md`):** this plan doc itself shipped stale
("NOT yet built") in `b43411e` — the docs gate fired only on synthetic inputs (harness +
the commit dry-run), my real doc updates were proactive (task P1.7), and the gate checks
"a doc was touched with the code," NOT "every necessary doc is current," so it cannot
catch a stale plan doc. The USER caught it; this section is the fix.
