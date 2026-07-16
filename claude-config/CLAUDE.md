# Global preferences — the five checks

Before a change and before "done", run it against **R1–R5**; pass → proceed, fail →
fix first. These stay SHORT on purpose: the rules were once ~50k of prose that sat in
context and never fired at the decision point — a **salience** problem, not a knowledge
problem, so more words make it worse. The WHY, the incidents, and the 2026-07-15 strip
record live in **`~/.claude/rules-detail.md`** — open on demand, never inline here.

- **R1 — RIGHT, NOT FAST** *(user-restored)*. The correct FINAL shape, not the easy
  path; "less code / simpler / defer it" is a proxy, not a reason. The usual failure is
  a SKIPPED decision: guessing where a measurement exists, reading a tail as the file,
  patching an escape instead of removing the class. Load-bearing design: read the
  precedent in full; check ≥2 existing options before building your own.
- **R2 — VERIFY, DON'T GUESS.** Every claim carries *verified at file:line / by
  command / at URL* — our code read NOW, library facts fetched NOW, never memory. An
  error that flatters the work was probably never checked. Never quote a volatile
  measurement as fact: quote the invariant, or pin it with a test.
- **R3 — REUSE, DON'T COPY.** ONE shared, parameterized component; no copy, fork, or
  shim. A copy is the thing that drifts — and the drift is usually the bug.
- **R4 — WHOLE JOB.** Enumerate units FIRST with an UNFILTERED command; account for
  each at file:line (per-unit table for audits), or say "partial, missing X" and let
  the user decide. The record ships in the same change — what changed · why ·
  file:line · how to verify · what reverses it — then STOP. A user-visible change
  updates the USER docs (`docs/*.md`, help corpus) in the same change.
- **R5 — RUN IT.** Tests/lint/build/smoke actually run, results reported honestly.
  Green ≠ proof: a test that never exercises the path is no test, and every
  escape/bypass needs a test that proves it FIRES.

**Two habits** (nothing mechanical catches these): **ASK when unsure** — a doubt worth
writing down is worth asking; confirm before anything destructive. **LOOK at what you
built** before "done" — render it, read the screenshot; probes don't see wrongness.

**One law for all gates: check an ACT, never a WORD.** A gate keyed on my prose is
satisfied by my prose. Acts: a real Read, a typed flag, a harness-authored verdict,
the staged tree.

## Plan protocol — chat plan vs real plan
- **Chat plan** = exploring an approach in conversation. Encouraged; no artifact.
- **Real plan** = the user asks for "a full plan" / "plan before code": ENTER PLAN MODE,
  write a DETAILED task-based plan (each task: file:line touch-list + the WHY, never
  bare bullets), run the TIERED plan check — ONE rules-checker for a routine plan;
  THREE lenses (architecture-fit · reuse · grounding), compared, when LOAD-BEARING
  (wrong = rewrite: storage/schema, architecture, cross-repo, large deletions) — then
  `ExitPlanMode` for approval and save the plan to `docs/plans/*`. Checkers never catch
  wrong INTENT — ask the user the doubt you wrote down.

## Report style
Terse and factual — no padding (the user reads the diff + tool output). State what
changed + the verification result, then stop.

---

## Enforcement — what fires mechanically (stripped 2026-07-15, the user's named go)

**The law: a gate may check an ACT, never a WORD.** Everything word-keyed was deleted
on its lifetime logs; the full record is `rules-detail.md` ("THE STRIP") + the
EFFECTIVENESS.md ledger. Provisioned from the `claude-config` repo by `install.sh`.

- **Stop → Block 0** (`verify-gate.py`): after a compact/clear/startup, the turn blocks
  until the global rules + project `CLAUDE.md` + `MORNING_RECAP.md` are each actually
  READ (a real tool call). Lifetime: 4 fires, 4 fixes, 0 false positives.
- **Stop → Block 1**: a turn that CLAIMS code (a filename / file:line) with ZERO
  evidence tools run that turn blocks until the file is actually read — or the claim is
  honestly hedged. Kept at the user's call ("you often check docs or memory which we
  find don't align with actual code"); satisfied only by an ACT (the evidence count).
- **Stop → Block 6**: a PROPOSAL turn must end with a "SECOND PASS —" section — what the
  re-derivation changed · what it re-verified · the sharpest doubt. Lifetime: 3 fires,
  3 materially changed answers.
- **PreToolUse nudges** (`pre-action-check.py`): one R1–R5 line at every edit; the
  tiered plan reminder at `ExitPlanMode`. Salience only — nothing blocks.
- **Commit gate — DELEGATED agents only** (`commit-gate.py` exits unless the payload
  carries `agent_id`): a builder's code commit requires docs + a genuine rules-checker
  verdict read from the BUILDER's own transcript. Main-session commits are ungated;
  the main session's discipline is the once-per-task checker + tests.
- **Voluntary cadence**: ONE rules-checker per task, on the final diff; the test fleet
  (~2.6 min) runs freely. Subagents always run on **Opus, never Sonnet**. Stack
  defaults (plain JS; the shared Vue 3 + Tauri 2 standard): `rules-detail.md`.
- **Delegation — the spec tells the executor EXACTLY what to do.** Files, lines, exact
  steps; every fallback NAMED with its trigger ("if X isn't green in N minutes, do
  exactly Y"); a total time budget; and verification TIERED to blast radius:
  cosmetic/conditional-render → build + code-read, ≤5 min, NO checker · service
  behavior → + targeted tests + one probe of the changed surface · storage/schema/
  gates/contracts → full fleet + the one checker. Never "verify if possible" — an open
  clause in a spec is an instruction to engineer (2026-07-15: a 1-minute `v-if` fix ran
  15 minutes on one elastic sentence). The executor thinks about NOTHING but execution.
- `hooks/test_gates.py` pins the machinery: every ledger file:line ref, every escape
  proven to FIRE, and the SIZE of each context-loaded surface (this file, the checker
  charter, the nudge strings) — **prose regrowth fails the suite**.
