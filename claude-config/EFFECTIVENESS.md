# Does the rules-as-checks system actually help? — the running ledger

This file measures whether the hard-gate + rule-tests system (see `CLAUDE.md` and
this folder's `README.md`) actually changes behavior, so we can tell if it's worth
keeping — and worth sharing with other developers who hit the same problem (an
agent that has the rules in context but doesn't apply them mid-task).

## What we measure, and the honest caveats

Three signals, two of them mechanical:

1. **Gate fires (mechanical)** — every time the Stop `verify-gate.py` BLOCKs a turn,
   it logs `BLOCK <type>` to `~/.claude/hooks/verify-gate.log`. `gate-stats.py` rolls
   these up by block (0–5). This is the floor: it counts when a gate *fired*.
2. **Salience nudges (mechanical)** — `pre-action-check.py` logs each time it injected
   the rule-tests before a code change / plan (`~/.claude/hooks/pre-action.log`).
3. **Real save vs false positive vs MISS (judgment — recorded by hand below)** — a
   gate firing is only a *real catch* if it changed the next action (a re-read
   happened, a doc landed, a duplicate got fixed). A script can't tell a real save
   from a false positive, and it certainly can't count a **miss** (something wrong
   that NO gate caught — usually a human caught it). The ledger records all three,
   because "it helps" is only honest if we count what it *missed* too.

**Why the doc, not just the logs:** the logs live in `~/.claude/hooks/`, which a
fresh cloud container wipes (the same reason the whole config lives in this bundle).
So this committed file is the durable, cumulative record. Before a session handoff,
run `python3 ~/.claude/hooks/gate-stats.py` and fold the roll-up into the cumulative
tally + add any notable catches/misses to the ledger.

## Cumulative tally

| Signal | Count | Notes |
|---|---:|---|
| Block 0 — re-read rules after a reset | 0 | (seed; update from roll-ups) |
| Block 1 — code claim, zero reads | 0 | |
| Block 2 — arch reco, no precedent | 0 | |
| Block 3 — "done" + code edit, no doc | 0 | |
| Block 4 — plan/decision, no rules-pass | 0 | |
| Block 5 — code edit, no rules-pass | 0 | (post-task) |
| Pre-action salience nudges | 0 | |
| **Real saves** (gate fire that changed behavior) | — | counted in the ledger |
| **False positives** (gate fired, was noise) | — | counted in the ledger |
| **Misses** (wrong thing NO gate caught) | — | counted in the ledger |

> The roll-up script reports per-container numbers; add them here at each handoff.
> The first real per-container roll-up lands the next time `gate-stats.py` is run
> against a populated log.

## Catch / miss ledger (detailed — newest first)

### 2026-06-26 — v2 build: one registry + commit boundary + anti-skim (+ a LIVE catch)

Built the v2 refactor (plan: `RULES-AS-CHECKS-V2-PLAN.md`): the rules moved into ONE
registry (`hooks/_rules.py` — regexes + turn-scan + the rule list); `verify-gate`,
`pre-action-check`, `task-gate` were refactored onto it; a NEW `commit-gate.py` adds the
commit boundary (HARD-DENY a code commit until docs+verdict; escapes amend/doc-only/
trivial; anti-loop); the pre-task deny was narrowed (exempt `.md`/trivial); `gate-stats`
now imports the ids from the registry; and `test_gates.py` became a committed harness
(7 sections, all green, incl. fail-open-when-`_rules`-unimportable for all four hooks).

**LIVE catch (real save) — the turn-window bug bit me mid-build.** Creating the 8 plan
tasks as Task entries, the live (v1) `task-gate` BLOCKED `TaskCreated` three times in a
row even though a `VERDICT: PASS` was in the same message — because an injected user-role
message (a `<task-notification>` / the transcript-flush race) was being treated as a
genuine prompt and resetting the "this turn" window, so the rules-pass fell outside it.
This is exactly the bug v2 fixes (`_rules.is_genuine_user` skips injection wrappers;
transcript-verified the real shape: `<task-notification>` is a non-meta **string** user
message). Recorded as the system catching its OWN latent defect during its own rebuild —
the same shape as the v1 narration catch below. Fixed + covered by a regression test
(`test_pre_action`: a `<task-notification>` after an edit must NOT re-trigger the deny).

**Panel catch (2 real bugs, pre-ship).** The final 2-Opus diff panel (architecture/parity
+ reuse/grounding lenses) FAILED the build and found two real defects in `commit-gate.py`
that the committed harness had MISSED: (1) `_classify_commit` skipped `-C` as a single
token, so `git -C <dir> commit` — the most common scripted form, and the very form the
harness uses for its own git setup — was classified as not-a-commit → the gate SILENTLY
never fired (a false-negative hole in the main post-task check); (2) the classifier used
`"git" in toks` instead of `toks[0]=="git"`, so `man git commit` / `echo git commit` were
false-positives. Both fixed (skip separated-value global options; require `git` as the
segment command; resolve `-C` for the staged-tree read) + regression tests added (`git -C
… commit` must gate; `man`/`echo git commit` must not). The harness was GREEN before the
panel ran — concrete proof the panel catches the class a unit test structurally can't: a
*missing* case. Total panel value to date: 8 fixes (v1 dogfood) + 2 (v2) = 10 pre-ship.

**MISS (user-caught) — a STALE PLAN DOC shipped right past the docs gate.** Commit
`b43411e` shipped with `RULES-AS-CHECKS-V2-PLAN.md` still marked "NOT yet built" and with
no build-outcome record. The docs gate did NOT catch it, and the logs show why: its 3
`docs-with-features` fires this container were ALL synthetic (2 from the harness =
`'feature done'`, 1 from the commit dry-run); ZERO fired on the real build — my doc
updates were proactive (task P1.7), not gate-forced. And the commit-gate's docs rule
*passed* the real commit because README/CLAUDE/EFFECTIVENESS were staged: it enforces "a
doc was touched WITH the code," NOT "every necessary doc is current," so a code+docs commit
sails through while the PLAN doc is stale. The USER caught it ("did your gate trigger
this?"). This is the structural-vs-semantic ceiling in the open — the gate forces A doc to
land; it cannot verify completeness. There is no clean mechanical fix ("is the right doc
current?" is semantic); the procedural fix is the `task-completeness` checker verifying the
plan doc's status at task-completion — note a DOC-ONLY follow-up commit *escapes* the
commit-gate, so that check must live at TaskCompleted, not only at commit. Fixed the doc
(plan banner + a "Build outcome" section) in the follow-up; logged here so it's watched.

Honest note: the per-edit NUDGE fired on every `.md` and `.py` write this build (~25×,
non-blocking) — working as intended (salience, one line), not cry-wolf. The pre-task
DENY did NOT fire spuriously on the plan-file `.md` edits (the narrowing held).

### 2026-06-26 — dogfood: the panel reviewed the system itself (first measured catch)

The first real exercise of the system was running its own **2-checker panel** (Opus,
architecture + correctness lenses) against this bundle before it shipped to the user.
**It caught 8 distinct issues in the rules system itself — all fixed the same session,
before the user ever hit them.** That is the loop working: independent checkers found
what the author (me), mid-build, had rationalized or missed.

Catches (all fixed; re-verified by the test harness):
1. **Blocking gates were bypassable by NARRATION.** The rules-pass regex matched "I'll
   run the rules-checker" (intent), so Block 4/5, the pre-task deny, and the task-gate
   could be cleared by *saying* you'd check, not checking. Fixed: blocking now requires
   a real subagent run, a cited `VERDICT:` / `T# PASS-FAIL`, or a trivial attestation
   (loose prose stays only on the non-blocking nudge). The biggest hole — a gate you can
   talk your way past is not a gate.
2. **A silent edit-then-stop turn skipped Blocks 1–5** (empty trailing text → early
   exit). Fixed: Block 5 fires on code-edit evidence even with no trailing text.
3. **`gate-stats.py` never counted Block 5** — proven empirically by the checker: two
   real Block-5 fires rolled up as "0 blocks". The measurement was lying about the very
   gate it tracks. Fixed: added the post-task key.
4. **Block 5 missing from the verify-gate docstring, EFFECTIVENESS.md, and the "(0–4)"
   range** — a docs-with-features (T11) + under-counted-ledger (T6) miss *inside the
   rules system itself*. Fixed across all three.
5. **The per-edit nudge repeated the full ~400-char block on every edit** — it fired 4×
   for one batched message, LIVE (the cry-wolf the rules warn against). Fixed: a short
   one-liner per edit; the full T1–T12 lives in CLAUDE.md.
6. Dead `✅/❌` regex alternatives (couldn't match after `\b`). Removed.

What the panel CONFIRMED sound (it wasn't all wrong): every hook fail-open, Block 4/5
wiring + `rules_passed` ordering, all five event names + output schemas (re-verified
against the docs), `install.sh` completeness, no regex backtracking, the `resume`-skip.

Honest read: the panel is a strong catch mechanism for *structural* and *correctness*
faults — it found a real bypass-class hole (narration) the author missed. It did NOT,
and cannot, prove the design is the *right* one semantically; that stays human judgment.
But "8 real fixes before the user saw them" is the first concrete evidence the system
earns its keep.

### 2026-06-26 — session that built this system

**Real saves (the gate or a check changed what I did):**

1. **Block 0 fired after a compaction** (twice this session). The Stop gate refused
   to let the turn finish until `~/.claude/CLAUDE.md` had been re-Read in full with
   the Read tool — not from the injected summary. Without it I would have continued
   on a lossy summary of the rules. *Real save: re-read happened, then work resumed.*
2. **Block (citation-from-memory), earlier this session.** I cited a doc section
   ("§5") from memory; the gate's evidence check + the user's catch forced me to open
   the file — the section didn't exist; the right reference was §6.1. *Real save: a
   fabricated citation was corrected to the read source.*
3. **Block 3 (docs-with-features) discipline** drove the §16/§17 build-log entries to
   land *with* each code change instead of at "polish". *Real save: detail persisted
   as it happened — the recurring "we lose work on compaction" failure, prevented.*

**Misses (wrong thing that NO gate caught — a human caught it):**

1. **The copy-paste job dropdown.** `RecommendationsEditor.vue` hardcoded the job
   list (`SUGGESTED_JOBS`) instead of reading live `/v1/ai/jobs`, and
   `FeatureWorkbench.vue` had its own native `<select>` over jobs — the same list
   hand-coded twice. **No existing gate caught it; the USER did** ("I bet you copied
   and pasted instead of making it a component"). This miss is exactly why the
   reuse layer was added: `jscpd` (copy-paste detector, threshold-gated in the smoke)
   + `check-shared-pickers.mjs` (a job picker may live only in `LuJobSelect`). So the
   miss became a new gate. *Recorded so we can see whether the new reuse gate stops
   the recurrence.*
2. **Gate framing wrong twice (semantic).** My first gate for that bug tested the
   *symptom* (dropdown shows live data), not the *disease* (don't copy-paste). The
   user corrected it twice. No mechanical gate catches "you're gating the wrong
   thing" — that stays a human judgment (the honest ceiling of this whole system).

**Reading of the early data:** the mechanical gates (Block 0/3) reliably catch
*structural* failures — a re-read that didn't happen, a doc that didn't land. The
*semantic* failures (copy-paste, wrong design, gating the wrong thing) slipped past
the gates and were caught by the user; the response was to add a *new mechanical
gate* for each newly-understood class (jscpd, the picker check, Block 4). That loop
— miss → understand the class → add a checkable gate — is the system working as
intended. The test over the coming sessions: do the *new* gates turn these former
misses into catches, and does the miss rate fall?
