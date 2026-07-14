# Risk-tiered commit-gate — plan + build record (2026-07-14)

> Deferred follow-up from the 2026-07-13 Rust-minimization build. Global hook change
> (`claude-config/hooks/`, provisioned to every session by `install.sh`). Planned in plan
> mode, 3-lens rules-checker panel run before locking, user-approved.

## Context

The commit-gate HARD-DENIES **every** code `git commit` until BOTH a doc is handled AND a
genuine independent rules-checker AGENT verdict exists this turn. Correct for risky code,
but uniform — so a pure **test-only** or **copy-only** commit still pays the full checker
tax (the user's pain: "verify takes forever"). Make it **risk-tiered**: high-risk needs the
checker; low-risk (docs/copy/tests) commits on the deterministic gates; **default-HIGH on
mixed/unknown**.

## Design (generic — names no task or project)

The design INVERTS the spec: rather than enumerate high-risk paths (per-project, forever
incomplete), it enumerates only the universal LOW-risk conventions and defaults everything
else to HIGH.

- `_rules.py` (single source, beside `CODE_FILE`/`TRIVIAL`):
  - `LOW_RISK` — path-segment / basename-anchored, never a bare substring:
    `tests?/`·`__tests__/`·`e2e/` dirs · `test_*.py`/`*_test.py`/`conftest.py` ·
    `*.test.*`/`*.spec.*` · `*-probe.mjs`/`*-smoke.mjs` · copy **DATA** files
    (`json|po|pot|ftl|csv|ya?ml|txt`) under `locales?/`·`i18n/`·`lang/`.
  - `GATE_TREE` — `(^|/)(claude-config/hooks|\.claude/hooks)/`: the gate's own tree is
    NEVER low-risk (so the gate + its own harness can't be weakened via a "low-risk" escape).
  - `commit_low_risk(files)` → True iff there is code, nothing is under `GATE_TREE`, and
    EVERY code file matches `LOW_RISK` (reuses `CODE_FILE` — one code-filter source).
    Default-HIGH: uninspectable / empty / mixed / gate-tree / product → False.
- `commit-gate.py`: sets `ctx["commit_low_risk"]` (both branches; can't-inspect → False),
  and adds a **full escape** beside doc-only/trivial (before `run_rules`). The rule
  `detect()`s are UNCHANGED → the HIGH path (docs + genuine-agent verdict) is untouched.

Names "autosave/storage/reset/migrations/Rust/DB" appear ONLY in prose (examples of what
stays HIGH); the classifier contains none of them.

## Decisions (user-approved)

1. Low-risk = **full escape** (skip docs + verdict) — mirrors the doc-only escape.
2. Copy = **data files** under i18n/locales/lang (not `.js`/`.ts`) — logic-safe.
3. Scope = **commit-gate only** (pre-action first-edit DENY + Stop Block-5 left as-is;
   risk-tiering them is a possible follow-up). Consequence: only pure test/copy/docs commits
   go light; all product-code commits still need the checker.

## Panel review (before locking)

3 independent rules-checkers (architecture-fit · reuse/regex-safety · grounding). All PASSED
the core architecture; FAILed **allowlist precision** — three real holes, all closed by
*tightening* (strictly safer): (1) the i18n dir-pattern matched real-logic `i18n/index.js` →
restricted to data extensions; (2) `test_gates.py` matched `test_*.py` → the `GATE_TREE`
guard; (3) the "hook .py are HIGH" invariant reworded to the true (AND-semantics + gate-tree)
reason + a denial-test added.

## Files

`claude-config/hooks/_rules.py` (LOW_RISK + GATE_TREE + `commit_low_risk` + ctx default) ·
`claude-config/hooks/commit-gate.py` (flag + escape) ·
`claude-config/hooks/test_gates.py` (unit + integration asserts) ·
docs: `claude-config/CLAUDE.md` "Commit boundary" bullet + global via install ·
`claude-config/README.md` · `claude-config/EFFECTIVENESS.md` · `MORNING_RECAP.md` pointer.

## BUILD RECORD

Shipped. **`python3 claude-config/hooks/test_gates.py` → ALL 7 SUITES PASS**, including the
new risk-tier asserts: low-risk allowed (`foo.test.js` · `server/tests/test_x.py` ·
`i18n/en.json`); HIGH denied (`latest.py` substring-trap · `i18n/index.js` logic ·
`claude-config/hooks/test_gates.py` gate-tree · mixed `.test.js`+`stores.py`). The existing
`RULE_IDS` + `{docs-with-features, task-completeness}` assertions unchanged (no `detect()`
edits). Applied live via `FORCE=1 install.sh`; `diff` installed vs source clean.

### Affordance Table (spec item → tier → pinning test)

| Spec item | Tier | Pinned by |
|---|---|---|
| tests (`tests/`, `*.test.*`, `test_*.py`, probes) | LOW | `commit_low_risk` unit + `foo.test.js`/`server/tests` cg-asserts |
| copy (data under i18n/locales/lang) | LOW | `i18n/en.json` unit + cg-assert |
| storage / reset / autosave / migrations / Rust / DB / product | HIGH (default) | `settings.py`/`stores.py` unit + mixed cg-assert |
| logic under an i18n dir (`i18n/index.js`) | HIGH | unit + cg-assert (panel hole) |
| the substring trap (`latest.py`) | HIGH | unit + cg-assert |
| the gate's own tree (`commit-gate.py`, `test_gates.py`) | HIGH | `GATE_TREE` unit + cg-assert |
| mixed low+high | HIGH | mixed cg-assert |
| uninspectable / empty stage | HIGH | `commit_low_risk([])` unit + the `else` branch |
