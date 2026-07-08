# Morning Recap — JustWrite

> # ⛔⛔ THE #1 OPERATING RULE — read this FIRST, every time ⛔⛔
> **NEVER act until the user literally types the word "go".** A question is ONLY a question —
> answer it in words, then STOP and WAIT. Do NOT read/grep, edit, spawn an agent, run a
> workflow, build, or commit until "go". **"It was only read-only" is NOT an excuse — do not
> start.** Approval for one step is NOT approval for the next; each new action needs its own go.
> Companion hard rules: ② show the user any agent/research prompt BEFORE sending it; ③ never
> stop a running job/agent unless the user says "stop"; ④ always confirm the plan + get the
> explicit go first; ⑤ never guess — read code line-by-line, cite file:line. *(The user has had
> to repeat #1 many times across 2026-06-27 — it is the top cause of lost trust. GET IT.)*

> The in-repo session-pickup **MAP** — current state + open-work pointers + an index into the
> deep docs. Read it after the global `~/.claude/CLAUDE.md` and this repo's `CLAUDE.md`.
> **This is a map, not a log:** stable architecture + rules live in `CLAUDE.md`; deep per-task
> detail lives in `docs/plans/*`; the full pre-2026-07-08 history of this file lives verbatim in
> `docs/plans/2026-07-08-recap-archive.md`. This file POINTS at them, it does not duplicate them
> (a copy drifts, and a log here costs half a context window every session start).

**Branch (all repos):** `claude/admiring-galileo-il3q0o`.

---

## ⛔ THE RECAP PROTOCOL (user-approved 2026-07-08 — keeps this file readable in one gulp)

Born from the context-cleanup decision: this file had grown to 348 KB / 1,873 lines (≈90k
tokens), and the read-in-full-at-session-start rule made every boot and every post-compact
recovery cost roughly half a context window before any work happened — it had drifted from map
into log, against its own charter. The user approved the split ("i agree … do it"). The rules
now:

1. **Full detail is still written, ONCE, as it happens** — each go's complete record (decisions
   verbatim, file:line touch-lists, verification results, full prose, no bullets-as-truncation)
   lands in the RELEVANT `docs/plans/*` doc (e.g. the providers-surface design doc's ROUND
   sections). The user's rule 1 (no shortening, no summarizing) is unchanged — only the
   *location* of the detail is fixed to the plan doc instead of being duplicated here.
2. **This file gets a SHORT pointer paragraph per go** — what shipped, the commit shas, where
   the full record lives, what's open. A few sentences, never the full narrative twice.
3. **History never accumulates here.** When a stretch of work closes, its pointer paragraphs
   collapse into the CURRENT STATE section and the detail stays in the plan docs. If this file
   ever exceeds ~25 KB, that's the signal it has drifted back into a log — re-split.
4. The complete pre-split text (every SESSION STATE back to 2026-06-27, all twelve GO
   paragraphs of the 2026-07-07 marathon, all standing-rule history) is preserved **verbatim**
   in `docs/plans/2026-07-08-recap-archive.md` — open it only when a question touches that
   history and the pointers below don't answer it.

## CURRENT STATE (2026-07-08)

**Last code heads (both clean, pushed): runner `8c9ae91` · JW `a6ec7e3`** (commits after these
are doc-only). **The providers-surface marathon is CLOSED: ROUNDs 1–19 all shipped and
verified, the queue is EMPTY** — full records in
`just-llm-runner/docs/plans/2026-07-06-providers-surface-redesign.md` (read its STATUS banner +
the round you need, never the whole 137 KB file). The #142 save-everything dispositions are all
closed: the `model_measurements` history + Clear-history drawer shipped (ROUND 19); the
repo-listing cache and update-check persistence are recorded NOT DOING (the user's words).

What the app IS right now, in one breath: the shared AI stack (runner + `@delebash/llm-ui`)
serves JW with the **one-profile, Gemma-first catalog** (catalog ships FULL, selections ship
EMPTY — Quick Setup or manual assignment fills them; QuickSetup is local-only), the
**class→model map + Recommended badge**, the full **tune stack** (per-(model, machine) tunes ·
hardware-class defaults library · global launch defaults · switch provenance tags ·
fit-computed values · the strict-beat auto-tune sweep · the persistent measurement history),
and the **engine lifecycle row** (install/update/uninstall/reinstall, pin b9899, update-check
notify). Gates at the last code ship, all green: runner ruff + **409 pytest** · JW build:vite +
vitest 29/29 + the FULL headless smoke zero JS errors + the tune-save probe 17/17 + live curls.

**Nothing is in flight.** In-container harness tasks #1–#151: all completed.

## OPEN WORK — the ONE list and where it lives

- **THE ACTIVE BATCH (2026-07-08):** the user's 52-item list, organized and grounded in
  `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` — §0 the list verbatim · §1 the
  code-verified answers (incl. the dead per-preset launch-switch plane, the apiKey root cause,
  the Tauri-link cause) · §2 discussions A–F awaiting the user (A = tuning-flow consolidation,
  first) · §3 batches B1–B6 · §5 clarifications needed (#9, #34). NOTHING BUILT YET — each batch
  needs its own go; no-tests posture is on (user tests on box; container build/smoke still gate
  ships).
- **THE ledger:** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md` — every
  genuinely open item across all three repos, twice-verified, sections A–I. **Do not maintain a
  second backlog anywhere, including here.** §I (added 2026-07-08) folds in the 2026-06-28
  master plan's tail, so the old 513 KB master never needs to be opened as a tracker again.
- **Your-box checks (user's Windows/2070S machine):** ledger §G, plus the per-round box-check
  lists in the providers-surface doc (ROUNDs 9–19; ROUND 19's four are the newest: the
  measurement drawer renders under the class library · a measure survives a restart · sweep
  trials appear labeled · Clear empties only that model's history).
- **Parked — each stays parked until the user wakes it:** C9's research half (Gryphe +
  HauhauCS ablated-build Lab A/Bs), D5 remote curated catalog (parked), D6 HF Discover +
  the TurboLLM feature study, the models-folder import idea, and the ledger §I tail items.
- **JustVoice:** ledger F1–F5 — F1 (convergence onto the current shared stack) is the single
  biggest outstanding item; JV can't import today's `llm_runner` until it runs.

## STANDING RULES (load-bearing — do not re-litigate)

- **NOTHING hardcoded:** every value/threshold/name/mapping/flag/preset lives in the
  **DB**, seeded + user-editable. No `manifest.json` config, no files on disk. Code is
  only the engine (hardware detect · the VRAM fit formula · the flag merge · process spawn).
- **NO JSON blobs in SQL:** relational/fixed-schema data = real columns/rows. JSON only
  for genuinely freeform data with a cited reason (vectors→packed binary; snapshots/
  tombstones like `chapter_versions.scenes`/`trash.payload`; variable AI artifacts; the
  heterogeneous settings `ui` doc) — and flagged.
- **The seed principle (user-driven, 2026-07-06):** the seed ships **FACTS and RULES**; the
  **machine** supplies MEASUREMENTS; the pair (model × machine) owns the numbers; the **user
  (or the wizard)** supplies CHOICES. No measurement rows in the product seed; no
  auto-anything behind the user's back.
- **Operating mode (zero-trust):** grounded recommendations (receipt + counter-case),
  the USER decides; don't barrel (stop after units, surface decisions); audit the full
  cascade file-by-file before a big refactor; think 4×; verify line-by-line; build the
  clean shared component (don't optimize "JV-safe").
- **DB policy:** drop + reseed, no migrations (pre-release;
  `docs/plans/2026-06-18-unified-storage-no-idb.md`). Additive-only schema changes (new
  tables) need no reset — `create_all` picks them up on boot.
- **Verification discipline (2026-07-06/07 amendments, binding):** the FULL headless smoke
  runs on **every UI change, waivers notwithstanding** (the usePoll runtime break the user
  caught taught this); a green smoke alone is not proof — a Playwright probe must **observe
  the changed surface**; checker discipline per the user's "do b": NO pre-build agent check
  (grounding + inline T1–T12 citation before building), **ONE genuine diff rules-checker
  verdict before each CODE commit** (doc-only commits exempt).
- **The cwd footgun (struck ~10 times):** never chain `cd` inside compound commands and never
  rely on the shared shell cwd across parallel Bash calls — every command gets its own
  explicit absolute-path `cd`; trust the OUTPUT, never a bare exit code.
- **Dev stack in this container:** server `python -m justwrite_server.cli serve --port 17495`
  (data dir `/root/.local/share/JustWrite`) + `npm run dev:vite` (:1420); Chromium via the
  smoke's `findChrome()` — never hardcode the browser path.
- **Hard gates** — the **rules-as-checks system** (built 2026-06-26, provisioned from
  `claude-config/`; full detail in `claude-config/README.md`). The rules are the slim
  **rule-tests T1–T12** (`~/.claude/CLAUDE.md`) + full WHY/incidents in `rules-detail.md`,
  read on demand. Enforcement at mechanical events: **Stop gate** `verify-gate.py` Blocks
  0–5 (0 = re-read rules/recap/project-CLAUDE after a compact/clear, NOT resume; 1 = code
  claim w/ zero reads; 2 = arch reco w/o precedent; 3 = "done"+code w/o a doc; 4 =
  plan/decision w/o a rules-pass; 5 = code-edit w/o a rules-pass) + a **PreToolUse hook**
  `pre-action-check.py` (pre-task DENY on the first edit w/o a rules-pass · per-edit nudge ·
  ExitPlanMode → run the checker panel) + a **commit gate** `commit-gate.py` (PreToolUse Bash:
  a code `git commit` is HARD-DENIED until docs **+** a GENUINE rules-checker AGENT all-pass
  verdict — read from the agent's OWN result, not self-typed; v3, closes the self-cert hole) +
  the **rules-checker subagent** (Opus; a 2–3 panel
  for load-bearing design). Effectiveness tracked in `claude-config/EFFECTIVENESS.md`
  (catches/false-positives/misses). All fail-open. **Real plan = Plan mode + detailed Task
  entries** (not a chat plan) — that's what fires the plan/task events.

## ACTIVE DOC INDEX (open on demand, not at boot)

- **Open work (THE ledger):** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md`
  — sections A–I; §I is the master-plan tail folded 2026-07-08.
- **Providers/models surface:** `just-llm-runner/docs/plans/2026-07-06-providers-surface-redesign.md`
  — ROUNDs 1–19 full records + the parked list + per-round box checks. Banner + needed round only.
- **Current AI-routing / preset model:** `just-llm-runner/docs/plans/2026-07-02-preset-model-a-resets.md`
  (Plan A — the task owns the preset; 2-tier cascade task → global default).
- **Model-per-hardware execution (closed):** `just-llm-runner/docs/plans/2026-07-06-model-per-hardware-plan.md`
  — the one-profile consolidation, fit-by-omission, sweep, class map, orphan-child fix; phase records.
- **On-box tuning evidence:** `docs/plans/2026-07-06-llamacpp-config-tuning-2070s.md` +
  `docs/plans/2026-07-06-onbox-profile-ab-test.md` (the measured one-profile verdict).
- **History:** `docs/plans/2026-07-08-recap-archive.md` (this file's full pre-2026-07-08 text,
  verbatim) · `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` (the 513 KB roadmap
  archive — bannered fully historical 2026-07-08; its outstanding tail lives in the ledger §I)
  · every other `docs/plans/*` in both repos is historical/evidence, most carry their own
  supersession banner.
- **Live non-plan docs:** `claude-config/README.md` + `EFFECTIVENESS.md` (the rules-as-checks
  system) · `docs/models.md` (the user-facing models doc — update it whenever a models-surface
  behavior changes) · the JW↔JV HTTP boundary → `CONTRACT.md` (JustVoice repo).

## Where detail lives

Architecture + conventions → this repo's `CLAUDE.md` + the global `~/.claude/CLAUDE.md`.
Open work → the outstanding ledger (nowhere else). Per-feature/per-go history → the plan doc
named in the index above, and the recap archive for anything older than this split.
