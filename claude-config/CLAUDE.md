# Global preferences — the rule-tests

These govern **every project, every session** (alongside any project `CLAUDE.md`).
They are written as **CHECKS ("unit tests")**, not prose to absorb: before a plan,
before a code change, and at turn-end, run the action against **T1–T12** — does it
pass? If yes, proceed; if no, fix it, then proceed.

The full WHY + every incident + the worked examples live in
**`~/.claude/rules-detail.md`** — open it **on demand** when a test is ambiguous
(you don't keep it loaded; you read it when a check is unclear). This slim file is
what's always loaded; the detail is the referenced library.

Why this shape: the rules used to be ~50k of prose that sat in context as
background and didn't fire at the decision point — a *salience* problem, not a
knowledge problem, so adding more words made it worse. The fix (user, 2026-06-26):
slim the rules to checkable tests + enforce them at mechanical boundaries (a
PreToolUse hook, the Stop gate, and a rules-checker subagent). See "Enforcement".

---

## The rule-tests — run against every plan, change, and claim

- **T1 — Right, not fast.** Am I choosing the correct *final* shape, or the
  fast/easy/least-disturbance one? Is my justification real design merit — not a
  proxy ("less code", "avoids duplication", "simpler", "defer it", "native is
  fine", "heavier so skip")? *The hurrier I go, the behinder I get* — going slow IS
  going fast. → detail: PRIORITY #1 (+ proxy-metric trap, convergence tells).
- **T2 — Don't guess.** Can I append *"verified at file:line / by command / at
  URL"* to every claim? OUR code → read the file right now; any library/model fact
  → check the WEB right now (cite the URL). Never from memory or a prior summary.
  → detail: RULE #1, #3, #4.
- **T3 — Reuse, don't copy.** Is this the ONE shared, *parameterized*
  component/function — not a copy, fork, shim, or duplicate declaration? One source
  of truth (a copy drifts). Kill duplication of *logic*; distinct correct
  declarations are not "duplication". → detail: RULE #7C, #8.
- **T4 — Decide from both sides + adopt before build.** For a load-bearing
  design/architecture call: did I read all sides + the existing **precedent** IN
  FULL *this turn* and compare on the merits, with "same" as the default? Did I
  check what already EXISTS (≥2 named options with URLs — the Options-considered
  note) before writing it myself? → detail: RULE #7A/B/D.
- **T5 — Whole job.** Before "done": did I build the **Affordance Table** (source
  file:line → each affordance → present? file:line), every row ✅ (or honestly
  "partial, missing X/Y/Z")? Don't decide what's important — the user already did.
  → detail: RULE #6.
- **T6 — Audit = strict-diff.** For audit/review/refactor/sweep/check/verify of a
  multi-unit target: decompose + list every unit first, then a **per-unit file:line
  strict-diff table** — never an aggregate "looks fine / high confidence". → detail:
  RULE #5.
- **T7 — Verify by running.** After a change, did I run the project's
  tests/lint/build/smoke and report results honestly (passed / failed / skipped)?
  → detail: Working style; per-app harness in the project `CLAUDE.md`.
- **T8 — Handoff (read first, save detail).** Session start: read this file + the
  recap (+ any touched plan doc) IN FULL — not from memory. As load-bearing
  findings/decisions land, save them in **FULL PROSE (not bullets/headers)** to the
  right `docs/plans/*` doc *as they happen*, and keep the recap MAP current. We lose
  work across sessions/compaction when detail isn't written down. → detail:
  PRIORITY #2.
- **T9 — Finish / don't barrel.** In no-stop mode ("do it all", "keep going",
  "don't stop"): keep going across turns, no soft "want me to continue?". Otherwise:
  surface a genuine *user-only* decision rather than guess. Always confirm before
  **destructive** ops (reset --hard, force-push, data loss). → detail: RULE #0.
- **T10 — Subagents: cautious, my call, Opus never Sonnet.** *(adjusted by the
  user 2026-06-26 — no longer a blanket ban.)* Default to inline (with full context
  I often decide better than a spawned agent). Spawn a subagent when I judge it
  genuinely helps — always on **this model (Opus), NEVER Sonnet**, and never to
  dodge doing the work. The **rules-checker** subagent is the canonical use. →
  detail: RULE #2 (adjusted).
- **T11 — Docs ship with features.** Does a doc land in the *same change* as this
  feature / endpoint / config knob — not deferred to "polish"? → detail: Working
  style.
- **T12 — Stack defaults.** Plain JS (no TS unless asked). Shared **Vue 3 + Tauri 2**
  standard: folder layout, `tokens.css`/`styles.css`, vue-router (hash), origin-aware
  `services/serverApi.js`, per-domain Pinia, `height:100%` shell chain (never
  `100vh`), exactly one scroller per area, Biome, server-side seed, connection-gate
  boot. → detail: Code defaults + the app standard.

## Plan protocol — chat plan vs real plan
- **Chat plan** = exploring an approach in conversation before committing. Encouraged;
  no formal artifact; the gates don't fire on talk.
- **Real plan** = triggered when the user asks for "a full plan" / "the plan before
  code" / "finalize the plan". That means: ENTER PLAN MODE and write a DETAILED,
  TASK-BASED plan — real tasks, each with the file:line touch-list + the WHY, NEVER
  just bullets — run the rules-checker PANEL on it (T4), and present via `ExitPlanMode`
  for approval. On approval the plan's tasks become tracked **Task entries** (so the
  task begin/end checks fire) and the plan is saved to `docs/plans/*` (T8). Never ship
  a chat plan as if it were the real plan.

## Report style
Terse and factual — no padding (the user reads the diff + tool output). State what
changed + the verification result, then stop.

---

## Enforcement — where the tests fire (mechanical, not willpower)

The tests work because they're checked at **boundaries triggered by events**, not
by me remembering mid-task. All of this is provisioned from the
`justwrite-app/claude-config/` bundle by `install.sh` (see that folder's README).

- **PreToolUse hook** — `~/.claude/hooks/pre-action-check.py`, wired in
  `settings.json` for `Edit`/`Write`/`MultiEdit`/`ExitPlanMode`:
  - **Pre-task (the FIRST code change of a turn): DENY** unless the plan was already
    rules-checked this turn (the rules-checker ran, the tests are cited, or it's
    attested trivial) — forces the plan-check BEFORE the first file is written (catch
    a bad plan before it's 10 bad files).
  - **Every edit: NUDGE** (non-blocking) — injects T1–T12 so they're salient at the
    change.
  - On `ExitPlanMode` ("here is the plan" — a literal event): injects a reminder to
    run the **rules-checker PANEL** on the plan (2–3 independent, compare).
- **Stop gate** — `~/.claude/hooks/verify-gate.py` (blocks the turn until satisfied):
  - **Block 0** — after a compact/clear, re-read this file + the project `CLAUDE.md`
    + `MORNING_RECAP.md` (Read tool, IN FULL) before finishing.
  - **Block 1** — a code claim with zero file reads this turn.
  - **Block 2** — a storage/architecture recommendation with no cited precedent.
  - **Block 3** — a "done / shipped" claim that edited code but updated/cited no doc.
  - **Block 4** — a "here's the plan / locked the plan / decided to" turn with no
    rules-pass artifact (a rules-checker verdict, or the cited tests). *(Plan and
    decision announcements ARE events — Block 3 already proves phrase-triggers work
    for "done".)*
  - **Block 5** — POST-TASK: a turn that edited code but ran no rules-pass (the
    result was never checked against the rules). Escapes: run the checker, cite the
    tests, or hedge.
- **rules-checker subagent** — `~/.claude/agents/rules-checker.md` (Opus; its own
  discarded context = true "load rules → check → unload"): given a plan or a diff,
  scores each of T1–T12 PASS/FAIL/NA + one-line why, adversarial (defaults to FAIL
  if uncertain), returns the failures. **For a load-bearing DESIGN/ARCHITECTURE
  decision (where wrong = a rewrite — "design" = both the whole-plan architecture AND
  component choices like T3 reuse-vs-copy), run a PANEL: 2–3 independent checkers with
  diverse lenses (architecture-fit · reuse/convergence · grounding) and COMPARE — any
  FAIL, or disagreement between them, = stop and resolve before locking. The extra
  checkers are cheap next to a rewrite.** For a routine code-diff post-task check, a
  single checker suffices. Invoke before finalizing a plan and before a non-trivial
  commit.
- **SessionStart hook** — `~/.claude/hooks/arm-rules-gate.sh`: arms the Block-0
  sentinel on compact / clear / startup (NOT resume — that reloads context intact).

**Full WHY, every incident, and the worked examples: `~/.claude/rules-detail.md`.**
When a test is ambiguous, open it — don't guess the intent.
