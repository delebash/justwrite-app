# Does the rules-as-checks system actually help? — the running ledger

This file measures whether the hard-gate + rule-tests system (see `CLAUDE.md` and
this folder's `README.md`) actually changes behavior, so we can tell if it's worth
keeping — and worth sharing with other developers who hit the same problem (an
agent that has the rules in context but doesn't apply them mid-task).

## What we measure, and the honest caveats

Three signals, two of them mechanical:

1. **Gate fires (mechanical)** — every time the Stop `verify-gate.py` BLOCKs a turn,
   it logs `BLOCK <type>` to `~/.claude/hooks/verify-gate.log`. `gate-stats.py` rolls
   these up by block (0–4). This is the floor: it counts when a gate *fired*.
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
| Block 4 — plan/decision, no rules-pass | 0 | (new this build) |
| Pre-action salience nudges | 0 | |
| **Real saves** (gate fire that changed behavior) | — | counted in the ledger |
| **False positives** (gate fired, was noise) | — | counted in the ledger |
| **Misses** (wrong thing NO gate caught) | — | counted in the ledger |

> The roll-up script reports per-container numbers; add them here at each handoff.
> The first real per-container roll-up lands the next time `gate-stats.py` is run
> against a populated log.

## Catch / miss ledger (detailed — newest first)

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
