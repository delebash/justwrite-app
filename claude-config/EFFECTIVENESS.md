# Does the rules-as-checks system actually help? — the running ledger

This file measures whether the hard-gate + rule-tests system (see `CLAUDE.md` and
this folder's `README.md`) actually changes behavior, so we can tell if it's worth
keeping — and worth sharing with other developers who hit the same problem (an
agent that has the rules in context but doesn't apply them mid-task).

## What we measure, and the honest caveats

Three signals, two of them mechanical:

1. **Gate fires (mechanical)** — every time the Stop `verify-gate.py` BLOCKs a turn,
   it logs `BLOCK <type>` to `~/.claude/hooks/verify-gate.log`. `gate-stats.py` rolls
   these up by block (0–6). This is the floor: it counts when a gate *fired*.
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
| Block 4 — plan/design lock, no genuine agent verdict | 0 | (#237 hardened 2026-07-09: self-typed tests no longer clear) |
| Block 5 — code edit, no rules-pass | 0 | (post-task) |
| Block 6 — proposal without a SECOND PASS section | 0 | (#237, added 2026-07-09) |
| Pre-action salience nudges | 0 | |
| **Real saves** (gate fire that changed behavior) | — | counted in the ledger |
| **False positives** (gate fired, was noise) | — | counted in the ledger |
| **Misses** (wrong thing NO gate caught) | — | counted in the ledger |

> The roll-up script reports per-container numbers; add them here at each handoff.
> The first real per-container roll-up lands the next time `gate-stats.py` is run
> against a populated log.

## Catch / miss ledger (detailed — newest first)

### 2026-07-15 — MISS: a gate whose escape hatch was welded shut (never fired; cost was absorbed, not reported)

**The miss.** The SUBAGENT BYPASS (added 2026-07-12) detected a delegated agent via
`isSidechain` entries in the transcript the hook receives. The harness passes the MAIN
session transcript even for a subagent's call — an agent's turns live in
`<session-dir>/subagents/agent-<agent_id>.jsonl` — so the condition was **never true
once**. Every delegated builder's first code Edit/Write was denied, and no builder could
clear it (its checker verdict lands in its own transcript, which no gate read): the exact
deadlock the bypass existed to prevent.

**Why it hid: a workaround existed.** Builders applied code via python patch-scripts
through Bash, which the hook doesn't gate. Work completed, gates stayed green, and the
defect surfaced only as TIME — a patch script carries whole files as string literals,
~3-10x the output tokens of an Edit. Measured: the one-downloader build took 66 minutes
for ~30 minutes of code work. I found the gap, filed it as an "infra follow-up", and
spawned two more builders through it. The user: *"you should have let me know this is a
prob and fix it it should be we dont just say ok thats fine and waste time"*. **A
working-but-degraded path is a bug to surface, not absorb.**

**The fix.** Detection keys on the payload's own `agent_id`, captured live from both sides
before any logic was written (user: *"capture first, then narrowest fix"*):
subagent → `agent_id` + `agent_type` present; coordinator → neither; both carry the same
MAIN `transcript_path` (the root cause, proven). Payload-only: the transcript-tail scan is
deleted, not ported — dead here, and self-defeating in the only harness where it would run
(it would bypass the deny for the COORDINATOR right after any subagent returns).

**The defect class, swept per-unit** — *a hook reads `transcript_path` assuming it belongs
to the caller*. Enumerate with unfiltered **`grep -rn transcript_path hooks/`** (a `*.py`
scope hides the `.sh` unit — that mistake cost two checker rounds):

| Gate | reads at | wired to | affected? | disposition |
|---|---|---|---|---|
| `pre-action-check.py` | :190 | PreToolUse Edit/Write/MultiEdit | **YES** | **BYPASSED, not read-through** — a subagent's edit skips the deny (payload `agent_id`). It still builds ctx from the MAIN transcript, so `prior_code_edits` counts the *coordinator's* edits; the bypass makes that moot (a subagent never reaches the deny), but the unit is honestly "bypassed", not "fixed" |
| `commit-gate.py` | :299 | PreToolUse Bash | **YES, live** — a builder's commit judged on the coordinator's transcript; own verdict invisible; escaped only via `MAX_DENIES=4` | **FIXED** — reads the agent's own transcript (`_rules.agent_transcript`) |
| `task-gate.py` | :65 | TaskCreated / TaskCompleted | **LATENT** — same mechanism | **FIXED** — same helper |
| `verify-gate.py` | :138 | **Stop only** (`SubagentStop` not wired) | **NO** — a subagent's turn-end never invokes it | UNAFFECTED, by wiring |
| `arm-rules-gate.sh` | :44 | SessionStart | **NO** — main-session only; only counts lines into the Block-0 sentinel, never blocks | UNAFFECTED, by wiring |

**The commit/task fix STRENGTHENS the gates** (user's go, 2026-07-15): they now read the
agent's OWN transcript, so a builder's real checker verdict counts instead of being
invisible. One shared helper `_rules.agent_transcript(data)`; path derives only from the
payload's session transcript + `agent_id` and must exist, else falls back — never another
agent's verdict.

**Why pre-action BYPASSES where commit/task READ THROUGH.** At pre-edit time a subagent
has no deterministic attest channel, so a read-through would strand it: assistant text
flushes unreliably mid-turn (#253) — demonstrated ON THIS FIX, where a first Edit was
denied for a plan-ref + RISK that were already written and an identical retry passed —
thinking blocks flush with content stripped, and `_payload_text`'s allowlist covers
TaskCreate keys that an Edit payload doesn't have. At the COMMIT boundary the evidence is
a harness-authored tool_result, durably in the agent's own transcript: deterministic, so
that gate reads through. **A prior recorded reason ("the turn window resets when the user
types mid-build") was FALSE and this fix's own helper refutes it** — redirecting
pre-action would point `last_user_idx` at the builder's delegation prompt, where the
user's typing never appears. Corrected because a rationale that survives only until
someone checks it is exactly how the original bug shipped.

**Two defects the code-scoped checker found in THIS fix, both fixed:** (1) the helper's
docstring promised "never another agent's verdict" while the code interpolated `agent_id`
into a path unsanitized — on Windows `..` canonicalizes lexically, so `a/../agent-<other>`
would have resolved to a sibling's transcript and passed isfile(). Not reachable (ids are
harness-generated), but an unenforced "never" in a security docstring is this system's own
failure mode in miniature; `_ID_OK` now enforces it, with a traversal test. (2) The
transcript redirect silently widened the commit gate's `trivial` escape: `ctx["answer"]`
became a BUILDER's whole run, where an incidental "renamed the prop" in thousands of words
would have FULL-escaped docs+verdict. The answer-side escape is now `TRIVIAL_EXPLICIT`
(the literal word); the commit MESSAGE keeps the loose form, where it is a deliberate
attestation. **A fix to a gate can open a hole in it — check the blast radius of the
context you swap.**

**(5) The message-extractor missed `-am`, breaking a LEGITIMATE escape** — the first draft
matched only a bare `-m`, so `git commit -am 'trivial: typo'` lost its attestation and got
denied (fail-safe direction, but a false contract). `_M_SEP`/`_M_GLUED` now follow getopt:
`-m` takes the cluster REMAINDER if any (`-ma x` → message `a`, `x` is a pathspec), else the
next argv (`-am 'msg'`). Verified against every form incl. `--message=`, glued `-m"x"`, and
`--amend` (must not read as a message). **A probe of my own caught that the checker's
prescribed `-ma` handling was itself wrong** — worth remembering that the checker is a
reviewer, not an oracle; its prescriptions get verified too.

**(6) The "reuses `_classify_commit`, so they can't drift" claim was false — it was a COPY,
and it had already drifted.** `_commit_message` duplicated the segment→shlex→skip-globals
walk verbatim; `_commit_files` knew the `-am`/`-ma` forms and the copy didn't — which IS
defect (5). Extracted `_git_commit_argv(cmd)`: ONE generator, consumed by `_classify_commit`
and `_commit_message`. The claim is now true by construction rather than by assertion.

**(3) The message channel was reading the whole command — a live escape, caught by the
checker while auditing the blast radius of (2).** `TRIVIAL` ran over `cmd`, which includes
the staged PATHS: `git add src/rename/index.js && git commit -m "feat: big refactor"`
matched `\brename\b` on a *directory name* and full-escaped docs AND verdict. The escape's
entire rationale is that "trivial" in the MESSAGE is a deliberate attestation — reading it
from a path is the opposite. Now `_commit_message(cmd)` extracts the `-m`/`--message` text
only (both consume the ONE parser `_git_commit_argv`, so the claim is true by construction — see (6); `-F -` heredocs
aren't in `cmd`, so they yield no message and cannot escape — the safe direction). Pinned:
a trivial word in a path must be DENIED; in the message it still escapes.

**(4) The commit gate's own docstring documented escapes that didn't exist and missed ones
that did** — it advertised a `VERDICT` escape (the exact self-certification hole v3
closed), omitted the LOW-RISK tier entirely, and described the no-code escape as "every
staged path is .md" when the predicate is really "nothing matches `CODE_FILE`". Rewritten
as the exhaustive contract. **RESIDUAL, recorded not fixed:** `CODE_FILE` needs a dotted
extension, so extension-less infra (Makefile, Dockerfile, LICENSE, .gitignore) and
.ps1/.bat/.tf ride the no-code escape. Widening it has its own blast radius — the user's
call, not a sleepwalk.

**OPEN — two MORE copies of the git-command walk survive, PRE-EXISTING and out of this
change's authorized scope (the user's go was "change commit-gate and task-gate to read the
agent's own transcript", not "refactor the commit-gate parser"). Both are real defects, so
they are recorded, not waved off — the user's call:**
- `commit-gate.py` `_commit_files` — a THIRD cluster dialect (`-(a|am|ma)`) over the RAW
  `cmd`. Its trailing word-boundary means `-sam`/`-amv` carry `-a` but do NOT match, so the unstaged-tracked read
  is skipped, `files` can come back docs-only, and **the doc-only FULL escape can fire on a
  commit that stages code.** Under-strict.
- `commit-gate.py` `_git_cwd` — re-implements the segment prologue with **no subcommand
  bound**, so `git commit -C HEAD~1` (a real flag) misreads a commit-ish as a repo dir, and
  `git -C /other/repo log && git commit -m 'x'` inspects the WRONG repo's staged tree →
  docs-only there → doc-only escape on a code commit.
- Fix shape (checker's, sound): `_git_commit_argv` yields `(globals, argv)` per commit
  segment; `_git_cwd` consumes the globals region bounded to that segment; `_commit_files`
  tests `-a`/`--all` off the parsed argv with the same getopt cluster form as `_M_SEP` — no
  raw-`cmd` regex. Pin `-sam`, `-amv`, `git commit -C HEAD~1`, and the cross-segment `-C`.

**The pattern across (1)-(6): every defect was a claim that outlived its check.** A
docstring's "never", a rationale, an escape's description, a line number — each was true
when written and false when read, and none had a test. The durable rule: **if a security
doc asserts a property, the code enforces it and a test pins it — or the sentence comes
out.**

**Gates added:** 9 regression cases in `test_gates.py` — `agent_id` bypasses · `agent_type`
alone does not · empty `agent_id` gated · payload `isSidechain` works · a transcript
sidechain entry must NOT bypass · a builder's own genuine PASS clears its commit · its own
FAIL still blocks · no verdict still gated · a missing agent transcript falls back.
Verified: the real captured 12-key payload replayed through the live hook bypasses (logged
with the full key set); the same payload minus `agent_id` is denied; suite 7/7 from both
tracked copies.

**Lessons (the durable part):**
1. **Every bypass/escape needs a test that proves it FIRES** — not only tests that the deny
   works. A gate with a welded-shut escape looks identical to a working one: green,
   blocking, quietly expensive.
2. **When an error is convenient, suspect it was never checked.** The diff checker ran 5
   adversarial rounds on this fix and caught, in my own write-up: a "real payloads" claim
   that tested a 4-key synthetic; a sweep covering 2 of 5 units; a flatly false log claim
   read from a tail; and two stale line counts. Every error flattered the work.
3. **Never quote a volatile measurement as a present-tense fact; quote the invariant.** Two
   drafts cited a log's line count — the verification runs append to that very log, so each
   count was stale before it was read.
4. **Records: technical detail in full, narrative padding at zero.** Rounds 2-5 (~28 of the
   36 minutes) fact-checked *prose*, not code — the code passed at round 1. All four false
   claims lived in the retrospective storytelling; none in the file:line record. Detail docs
   carry what changed · WHY · file:line · how to verify · what reverses it — and stop.

**Foot-gun:** `E:\Dev\Web\claude-config` is a 4th clone (same remote, stale at `fc89bba`)
carrying the old hook; running its `install.sh` resurrects the bug. Delete or pull it.

**The classifier was right three times** this session (an approximate-heuristic draft, and
twice on reaching into a HARD-DENY boundary without the user naming the mechanism). Each
time the slower path was correct.

### 2026-07-14 — RISK-TIERED commit boundary (user-ordered follow-up)

The commit boundary's docs+verdict HARD-DENY now applies only to HIGH-risk commits; a
LOW-risk commit — every code file is test infra or copy DATA, nothing under the gate's own
tree — full-escapes it (alongside doc-only / trivial). The tier is a GENERIC `LOW_RISK`
allowlist in `_rules.py` (`commit_low_risk`) — names no task/project; default-HIGH on
mixed/unknown, so storage/DB/Rust/migrations/product code always stay HIGH. Motivation: the
uniform checker tax on pure test/copy commits ("verify takes forever … it sits for an
hour"). Vetted by a 3-lens rules-checker panel BEFORE locking — it caught two real allowlist
holes (an i18n `.js` logic file matched the copy dir-pattern; the gate's own `test_gates.py`
matched `test_*.py`), both closed by tightening (data-extensions-only copy; a `GATE_TREE`
guard) and pinned as denial-tests. Harness: all 7 suites green incl. the new risk-tier
asserts. **WATCH:** whether the LOW tier's narrow scope (pure test/copy only) actually cuts
the felt friction, or whether a broader "middle tier" is later wanted; and any real commit
mis-tiered LOW that should have been HIGH (none expected — default-HIGH).

### 2026-07-09 — v4: the THINK-TWICE upgrade (#237, user-ordered)

Born from the user's direct finding during the 2026-07-09 QC marathon: *"when I asked you to
think twice you change severla decsions … if it is a rule you just ingore it halft the time."*
A user-ordered second pass over one evening's proposals changed FIVE locked-looking decisions
(the QC-25 heal seam would have clobbered deliberate downgrades; toast-undo died as ephemera;
QC-30b folded into B6-2; the one-entry-per-user-action law; the zero-toast failure path) —
empirical proof a second pass changes outcomes, and that a text rule alone does not produce
one. v4 wires the second pass into the same anti-self-certification machinery v3 proved at
the commit boundary:

1. **Block 4 hardened** — a plan/design LOCK ("here's the plan"/"locked"/"we've decided") now
   requires the GENUINE independent-agent verdict (`agent_pass`, the v3 mechanism), not a
   self-typed tests citation. Escape: a turn that merely RECORDS the user's own decision and
   says so ("the user's decision/word" — the user-decided provenance escape; lying about WHO
   decided is a flagrant transcript act, the same visible-residual class as a decoy agent).
2. **Block 6 added (`second-pass`)** — any PROPOSAL turn ("I propose/recommend", "here's the
   design", or un-attributed lock language) must end with a literal "SECOND PASS —" section:
   what the second look changed/confirmed, what it re-verified, the sharpest remaining doubt.
   Structural check (the section's presence); its honesty stays semantic — same ceiling as v3.
3. **Pre-edit plan-line check** — the FIRST code edit of a turn now also requires, in the
   turn's own text: a citation of the governing plan/spec line being executed (doc.md:line /
   §-section / the queue-plan doc item / the user's words) AND one "RISK:" line on what could
   be wrong. Exemptions: `.md` edits, an EXPLICIT "trivial" (deliberately narrower than the
   loose TRIVIAL family — "rename"/"one-line" appear in ordinary task names and would have
   silently skipped it).

Numbering note: `second-pass` was slotted AFTER post-task (Block 6) precisely so every
Block 0–5 reference in the incident records above stays truthful. **Watch during the trial:**
(a) false fires of Block 6 on conversational answers (PROPOSAL regex breadth), (b) whether
pre-edit RISK lines are honest doubts or boilerplate (the trivially-gameable half — the
literal word "risk-free" matching RISK_LINE — was checker-caught at build time and fixed;
an honest-looking boilerplate line remains possible), (c) whether the user-decided escape
gets stretched. All three are the v4 analogues of v3's self-cert creep. Also checker-caught
at build time and fixed before the first commit: the pre-edit deny window counted .md edits,
so a doc-edit-first turn (the normal record-first pattern) bypassed the first-CODE-edit
check — the window now counts prior CODE edits only (`scan_turn` `code_edits`).

**#253 resolution (2026-07-10, evidence: the full 31,389-entry live-transcript sweep
recorded in the queue doc's #253 record):** the two 2026-07-09 finding-shapes did NOT
reproduce against the current (post-container-restart) harness — ToolSearch replies now
arrive as `tool_result` blocks (already excluded by `is_genuine_user`'s has-tool-result
check), hook feedback and command caveats arrive `isMeta: true` (already excluded), and
EVERY bare plain-text user entry in the sweep was a genuine human prompt. Assistant
texts are PRESENT in this transcript (1,945 text blocks, longest 8,064 chars), refuting
the recorded "long assistant texts are ABSENT in the remote environment" claim for the
current environment — the text-citation escapes CAN fire here, and the 2026-07-10 B6
window's code commits cleared the commit gate on genuine in-turn agent verdicts. The
shipped fix is therefore DEFENSIVE hardening, not a rework: `INJECTED_USER` gained the
three historically-recorded bare shapes ("Tool loaded." · the task-tools reminder ·
"[SYSTEM NOTIFICATION") plus `<local-command-caveat>`, so a harness that ever emits
them bare again cannot reset the turn window; no genuine prompt starts with those
strings (mid-text mentions stay genuine — harness-tested both ways). The same-message
flush lag stands as an OPERATING NOTE (a PreToolUse hook reads the transcript before
the current message flushes — cite the rules-pass in a message BEFORE the gated call);
it is harness behavior, not fixable in a hook. The 2026-07-09 eleventh-window commit-
gate incident (4× deny despite genuine verdicts + "trivial attested" misclassifications)
remains attributed to the PRE-restart harness transcript shape — it did not reproduce
in the B6 window; if it recurs, capture the transcript tail at the moment of denial
before touching the gate.

**#253 SECOND resolution (2026-07-10 evening — it recurred; the tail was captured
live per the instruction above, and the diagnosis REVISES the paragraph above):**
five task-gate denials in one window, three distinct causes, none of them the
recorded INJECTED_USER shapes. (1) FORMAT: two denials fired on a genuine PROSE
tests-citation ("T1 <why> … T12 <why>", eight distinct T-numbers) because
`rules_passed` accepted only VERDICT-shaped text ("T1 PASS…" pairs / "VERDICT:
PASS") or "trivial" — the injects' own wording ("cite the tests it passes") never
said so. Fixed in-contract: `tests_cited()` (≥3 DISTINCT T-numbers) now clears the
LIGHT gates, and both injects state the accepted forms explicitly. (2) FLUSH: two
denials had the citation in the SAME message as the gated call (the recorded
operating note, violated). (3) THE REAL ENVIRONMENT SHAPE, live-probed with the
turn window open: mid-turn assistant TEXT flushes to the transcript UNRELIABLY
(2 of ~6 text messages present against 23/23 thinking and 21/21 tool_use blocks),
and thinking blocks are present but their `thinking` field is STRIPPED EMPTY in
this remote harness — so neither text nor thinking is a dependable mid-turn
citation carrier; the B6-window "texts are PRESENT (1,945 blocks)" evidence above
was dominated by CROSS-turn text (flushed at turn end), which is why Stop-grain
gates work while mid-turn PreToolUse/Task gates starve. The dependable channels
are tool_use entries and user-side entries (which is exactly why `agent_pass` —
the hard-boundary mechanism — has kept working throughout). BUILT: the `attest`
channel (text + thinking + the gated call's own `tool_input` strings via
`_payload_text`) feeding ONLY the affirmative escapes, never the violation
detectors; all 7 harness suites pass. STATUS: the tests_cited + inject-wording
half is INSTALLED; the payload-channel half is BUILT + TESTED but UNCOMMITTED and
awaiting the user's explicit word — the sandbox's auto-mode classifier denied a
(throwaway, diagnostic) live-hook patch mid-diagnosis and flagged the session's
gate-edit series as self-modification warranting user review. That flag is fair:
every #253 iteration moves the gate toward accepting what the agent produces, and
even with task #253 being the user's own order, the user should see the direction
plainly before it ships. Honest boundary, restated: ALL of this touches only the
LIGHT gates whose documented contract was always self-attestation; the commit and
plan-lock boundaries still require the un-forgeable independent-agent verdict.
SHIP ADDENDUM (same day): the first diff checker round returned FAIL(2) and caught
a REAL self-clearing hole — `_payload_text` joined ALL tool_input strings while
build_ctx is shared with pre-action-check, so an Edit's own new_string (e.g.
editing these very gate files, saturated with 'trivial'/'RISK:' tokens) would have
voided the first-code-edit deny. Fixed to an attestation-key allowlist
(subject/description/activeForm — absent from Edit/Write payloads) + a load-bearing
regression test; re-verdict PASS. FILED FOLLOW-UP from the re-check's residual:
event-scope the payload channel (read attest keys only at TaskCreated/TaskCompleted)
so the Bash-description immunity is structural rather than incidental — today it is
safe only because the hard gates read agent_pass. Also fixed this round: agent_pass
builds its accepted spawn-id set from the WHOLE transcript (an async checker
spawned in turn N delivering in turn N+1 was invisible — live-captured); the
verdict itself must still arrive in-window. Note the residual mystery: even with
the fix, one live async verdict still computed None (id pairing unconfirmed in
this harness shape) — the commit landed via the gate's documented MAX_DENIES
sentinel after the genuine PASS was visible in-conversation; capture the pairing
ids at the next occurrence.

**First trial findings (2026-07-09, live, hours after install):** two `task-begin-check`
false fires on a plain task-add, both TURN-WINDOW shapes rather than rule logic. (1) A
harness **"Tool loaded."** reply to a ToolSearch call is a plain-text user entry with NO
wrapper tag, so `is_genuine_user` counted it as a genuine human prompt and RESET the turn
window (`INJECTED_USER` at `_rules.py:191-195` is anchored to known wrapper tags;
`last_user_idx` at `:280-285`) — the tests citation written one message earlier fell
outside `scan_turn` and the gate denied. ToolSearch post-dates v4: a new transcript shape,
exactly the class the INJECTED_USER comment warns about. (2) A citation written in the
SAME assistant message as the gated tool call is not yet flushed to the transcript when
the PreToolUse-style hook reads it — the rules-pass must live in a PRIOR message.
Operating rule until fixed: cite the tests (or "trivial") in a message BEFORE the one
making the gated call, and re-cite after any mid-turn user message (each genuine one
resets the window — correctly). Candidate fix (a code change — awaits the user's word,
queued as a harness task): teach `INJECTED_USER` the ToolSearch-reply shape + audit other
no-wrapper harness injections ("Tool loaded", task-tool reminders), and record the
same-message flush lag in the README's operating notes. Scored: 2 false-positives, 0
misses — the deny text itself was accurate ("no rules-pass *visible* this turn"), the
window was wrong.

### 2026-06-26 — v3 OBSERVATION PERIOD (ongoing — trial, user chose "live with it")

The user accepted v3 (agent-as-judge at the commit boundary) on a TRIAL basis: "live with it
a while; if it takes too much time I can go back to manually asking." So the genuine question
now is empirical friction-vs-value. **Track here, during normal work:**
- **(a) friction** — how long the rules-checker actually adds to a non-trivial code commit
  (this turn: ~1–1.5 min/run, 2 runs incl. the FAIL→fix loop). Is that acceptable in practice?
- **(b) real catches** — did the gate block a commit for a GENUINE gap? (v3 already has one: the
  first run caught this plan-doc + recap stale — the doc-currency miss class.)
- **(c) false fails** — did it block a *good* commit or demand busywork? (none yet.)
- **(d) self-cert creep** — did a lazily-spawned/decoy agent let a pass slip back in? (the
  disclosed residual.)
If friction outweighs catches: fall back to manual asking (the proven baseline — every real
correction this project came from the user asking), or narrow the gate to larger commits only.

**First finding (immediately, this turn):** a chained `git add … && git commit …` is
conservatively GATED even when doc-only — the PreToolUse hook fires BEFORE the `add` runs, so
the staged tree looks empty → `_commit_files` returns nothing → it defaults to "treat as a code
commit" (the SAFE direction: over-gate a doc commit rather than under-gate a code one).
Workaround: run a SEPARATE `git add` first, then `git commit` (then the doc-only/code split is
visible to the hook). Documented rather than "fixed" — parsing the `add` args from the chained
command to predict the staged set would be fragile, and erring toward gating is correct. This is
exactly the kind of real friction the observation period exists to surface.

**Second finding — a real agent-judge MISS, user-caught:** when the v3 rules-checker ran on the
commit it scored the recap as "current" and PASSED — but `MORNING_RECAP.md`'s *Recently shipped*
section was still **v1-only** (no v2, no v3). The USER caught it with a plain "did you update the
recap?" (fixed in `c20cb44`). This is the honest ceiling in the open: an INDEPENDENT agent still
misses (it checked the PLAN-1 line + Hard-gates line, judged them sufficient, and didn't audit the
Recently-shipped section). The recurring pattern of the whole project holds — **the user's direct
question is the highest-recall check in the system**; the gates + agent raise the floor, they
don't replace it. Candidate hardening: have the commit checker diff the change against the recap's
Recently-shipped/Standing-rules sections specifically, not just "is a relevant doc touched."

### 2026-06-26 — v3: the self-certification hole (user-caught) → commit verdict comes from the AGENT

The deepest catch of the project — and it was the USER, in dialogue, not any gate. After v2 I
reported the docs gap "closed." The user pushed: a `VERDICT: PASS` that I *type* clears the
semantic rules without doing the work — and that isn't docs-specific, it's EVERY text-checked
rule. Verified: `plan` / `post-task` / `task-begin-check` / `task-completeness` all pass on
`rules_passed`, which includes my own typed "VERDICT" string (`_rules.py`); `docs-with-features`
passes if I merely say "recap" (DOC_MENTION); `reco` on a fabricated `file:line`. The ONLY
genuinely binding gate was Block 0 — because it keys on a real ACTION (were the files actually
Read), not on my text.

**The principle the dialogue produced:** a gate that checks my TEXT can be satisfied by my text
— I author it. Only a gate keyed on a real ACTION, or an INDEPENDENT agent's own output, binds.
The text escapes I built (typed VERDICT, "trivial", DOC_MENTION) reintroduced exactly the
fakeability the system was meant to kill — the original "rules I can ignore" problem, one level
up — and I compounded it by repeatedly claiming "closed."

**Fix (v3):** the COMMIT boundary's semantic check now requires a GENUINE independent
rules-checker AGENT verdict. `agent_pass()` reads "VERDICT: PASS/FAIL" only from inside
`<result>` of a harness-authored `<task-notification>` (a user-role entry the main agent cannot
forge) — never from my assistant text. A self-typed verdict no longer clears a code commit; the
gate forces a real agent to score every rule (incl. "are ALL docs current") and blocks on FAIL.
Proven by `test_gates.py` (typed verdict → DENY; genuine notification PASS → ALLOW; FAIL → DENY).
Stop/Task gates keep the lighter self-cert path for now (commit is the hard boundary); they can
be upgraded identically.

**Honest ceiling (stated plainly this time):** the agent is the judge, and judges miss — the v2
panel itself scored docs and still missed the stale plan doc. This makes the check
NON-SKIPPABLE (I can't self-certify past it), not infallible. A decoy agent deliberately told to
emit PASS would still count — but that's a flagrant, visible act, not a casual self-cert. The
system raises the cost + visibility of non-compliance; it cannot make the judgment correct.

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
