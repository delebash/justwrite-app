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
> ⑥ THE DECREE (user verbatim, 2026-07-08, QC-11): *"i dont care wshat you have to do to
> yourelf but make sure you have something that always says never decide on your own not
> matter if it is a new session or compact, got it"* — REPEATED with maximum emphasis the
> same day after QC-17 exposed the 2026-06-29 own-decision trail: *"do not ever make a
> decision on your own ever"*. No own decisions of ANY size — not a default value, not a
> label on a placeholder, not a wording choice; anything not the user's word ships FLAGGED
> in advance or waits for them, and when the flags pile up on one build, STOP AND ASK
> BEFORE building — a long flag list is a stop signal, not a license.

> The in-repo session-pickup **MAP** — current state + open-work pointers + an index into the
> deep docs. Read it after the global `~/.claude/CLAUDE.md` and this repo's `CLAUDE.md`.
> **This is a map, not a log:** stable architecture + rules live in `CLAUDE.md`; deep per-task
> detail lives in `docs/plans/*`; the full pre-2026-07-08 history of this file lives verbatim in
> `docs/plans/2026-07-08-recap-archive.md`. This file POINTS at them, it does not duplicate them
> (a copy drifts, and a log here costs half a context window every session start).

**Branch (all repos):** `claude/admiring-galileo-il3q0o` — **PUSHED to origin 2026-07-18**
(the per-section "unpushed on the branch" tags below are historical; everything through the
SDK pivot + #16 is now on the remote).

> **Open work → `docs/TASKS.md`** (the live tracker) · **Ideas → `docs/IDEAS.md`**.
> This file is the boot-map: rules, current state, and the doc index. It POINTS at the
> tracker; it no longer holds live open-work lists (restoring its "a map, not a log" charter).

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
   sections). **Rule 1 as revised by the user 2026-07-08:** the DETAIL DOCS (plans, handoff)
   still carry full detail — no shortening, truncating, or bullets — after each phase or commit;
   **`MORNING_RECAP.md` and `CLAUDE.md` MAY summarize, as long as they point to those detailed
   docs.** So this map summarizing here is now explicitly sanctioned, not a tolerated exception.
   **1b — WHAT "full detail" MEANS (scoped 2026-07-15, the user's call):** the record
   answers five questions — **what changed · WHY · file:line · how to verify · what would
   reverse it** — plus what is OPEN, in full prose, then STOPS. No retrospective narrative,
   cost anecdotes, lessons essays, or meta-commentary. Honest grounds: brevity saves READING
   cost only — what actually prevents stale claims is mechanical (`test_ledger_refs`, size
   budgets, invariants-not-measurements); full correction in `claude-config/EFFECTIVENESS.md`
   2026-07-15 + the archive.
2. **This file gets a SHORT pointer paragraph per go** — what shipped, the commit shas, where
   the full record lives, what's open. A few sentences, never the full narrative twice.
3. **History never accumulates here.** A finished stretch of work becomes ONE LINE under
   **RECENT WORK** — what it was, the shas, the doc that holds the record — and the narrative
   stays in that doc. If this file ever exceeds ~25 KB, that's the signal it has drifted back
   into a log — re-split. *(Amended 2026-07-19: this rule used to say the paragraphs collapse
   into a CURRENT STATE section. It was written 2026-07-08, before `docs/TASKS.md` existed, and
   the collapse was never once performed — so CURRENT STATE grew into the file's biggest block
   while holding four different kinds of content: history, durable facts, open work already
   duplicated in the tracker, and stale commit heads. It is gone. Open work → `docs/TASKS.md`;
   durable architecture → `CLAUDE.md`; history → the plan docs + git; only hour-stale facts
   live in **SESSION PICKUP**.)*
4. The complete pre-split text (every SESSION STATE back to 2026-06-27, all twelve GO
   paragraphs of the 2026-07-07 marathon, all standing-rule history) is preserved **verbatim**
   in `docs/plans/2026-07-08-recap-archive.md` — open it only when a question touches that
   history and the pointers below don't answer it.


## RECENT WORK — pointers only (full records live in the docs named)

Newest first. **The narrative, the file:line touch-lists and the verification results live in
the plan doc on each line — never twice.** Commit shas resolve in git; `git show <sha>` is the
record. Collapse a line into one word once it stops mattering.

- **2026-07-19 — the MTP draft: VRAM fit, pick floor, and measured draft trials**
  (runner `c14e8d0`). A draft GGUF was never charged to `compute_fit`, so it silently ate
  budget promised to main layers; it now comes off the budget at all three fit sites and
  rides in the arbiter reservation. "Smallest draft wins" gained a 4-bit floor (one
  predicate, both pickers), and Tune & measure gained a draft phase — a saveable "no draft
  (spec off)" trial plus informational per-file trials that can never be saved. The
  rules-checker returned **FAIL (4)**, the sharpest being a Pydantic `response_model` that
  stripped the new floor flag at the wire, making the UI feature a no-op while every test
  stayed green; all four fixed, both new escapes proven to fire. Doc:
  `just-llm-runner/docs/plans/2026-07-19-draft-fit-floor-and-lab-measure.md`.
- **2026-07-19 — MTP drafter detection + quant-token boundaries** (runner `c27586f` `bd91f89`).
  Own-repo `dspark` drafters are now detected (exhibit: `prism-ml/Ternary-Bonsai-27B-gguf`, whose
  drafter our MTP-only name rule missed, so tier-C borrowed a Qwen drafter and picked a BF16 split
  SHARD); the inherited-drafter pick now excludes shards + fp16; and quant tokens are word-bounded,
  so `PQ2_0` stops merging into `Q2_0`. That last one also closed a live wrong-weights load path
  (`_main_gguf` would sort a co-cached `PQ2_0` file first for quant `Q2_0`) — found by the
  rules-checker, not by me. Doc: `just-llm-runner/docs/plans/2026-07-19-dspark-drafter-detection.md`.
  Open: Fix C (verify a suggested drafter's arch is loadable — `dspark` is unknown to mainline)
  is logged in `docs/IDEAS.md`, not built.
- **2026-07-19 — the AI-surface pass.** Local/Online provider tabs + first-run landing · modal
  scrim/blur off + header-drag · LM Studio seeded local · the built-in provider collapsed to a
  normal row (reverses QC-39(b)) · panels: no dim, off-focus closes, nav toggles, ONE
  `usePanelDismiss` · the AI page's help button. Kit `fa34291` `c1ba1dd` `db837a6` `d857146`
  `a61d299` · JW `5f7b5dc` `1dee2b0` `4f11516` `c7b944c` `39c966c` `d43cfad`. Docs: the four
  `2026-07-19-*` plan docs (2 in each repo). **NONE of it has been looked at — see TASKS.md.**
- **2026-07-19 — QuickSetup copy: friendly verdict + QAT note + the no-GPU path routed to
  online providers** (runner `54fcfff`; the effective-context follow-up is in TASKS.md).
- **2026-07-17 — provider layer → official vendor SDKs** (the SDK pivot) + #16 lazy clients.
  Doc: `just-llm-runner/docs/plans/2026-07-17-provider-native-dialects-plan.md`.
- **2026-07-17 — the one load/unload/download control** (T5 honestly not built; re-probe at the
  next engine bump). Doc: `just-llm-runner/docs/plans/2026-07-17-load-cancel-and-one-progress-control.md`.
- **2026-07-17 — three user-reported bugs** (delete the open book · cancel-cancels-everything ·
  chip popover z-index). Doc: `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` §9.
- **2026-07-16 — the thinking-budget redesign** (three-state preset control; no clamp; honest
  sentinels). Doc: `just-llm-runner/docs/plans/2026-07-16-reasoning-budget-house-layering.md`.
- **2026-07-15 — AI routing to the one-source preset model** + the gate strip + server tests
  147s→46s. Docs: `just-llm-runner/docs/plans/2026-07-15-preset-one-source-rewrite.md` ·
  claude-config `rules-detail.md` "THE STRIP".
- **Older** (the 52-item batch, RAG story-bible, page-related undo, sample novels, character
  sheet v3, batch fill-from-book, …): `docs/plans/*` in both repos, each with its own record;
  everything before 2026-07-08 is verbatim in `docs/plans/2026-07-08-recap-archive.md`.

## SESSION PICKUP — what is true RIGHT NOW

**This is the only section that goes stale by the hour. Everything else here is a pointer.**

- **Branch:** `claude/admiring-galileo-il3q0o` in all repos. **FETCH AT SESSION START and read
  ahead/behind FROM GIT, never from this line** — a stale base is how the 2026-07-19 recap edit
  got written against a structure that had already been replaced. *(The hardcoded "JW ahead 8 /
  runner ahead 5" that used to sit here was wrong within hours — and on 2026-07-19 both repos
  turned out to be BEHIND origin, with work pushed from the user's box. Counts do not belong in
  this file; the invariant is: fetch, then look.)*
- **Working trees: clean in both repos** (verified 2026-07-19 by `git status` in each). The
  line that used to claim uncommitted `logLines`/`LogsPanel` in-flight work was **stale** — that
  work is committed. It survived here long enough to be passed into two builder specs as a
  warning about files that no longer existed; a claim like this gets re-verified, not relayed.
  Only `.agentbridge/` (untracked, agentbridge's own DB) sits in both trees.
- **Known-bad on the user's Windows box:** `test_hardware.py::test_pci_gpus_linux_lspci_name_match`
  and `test_lifecycle.py::test_ensure_model_ready_loads_then_returns` fail (pre-existing, proven
  by pathspec stash-run); `test_lifecycle.py::test_ensure_model_ready_raises_on_failed_load` is
  **flaky**, not pre-existing. Don't wave a fourth failure through as "known".
- **Never touch the user's live `:1420`/`:17495`** — that rule stands absolutely (2026-07-19:
  a probe drove `:1420` seconds after the user started their app; no data changed, but they
  may have seen a stray toast. Check the ports, and use an isolated server + temp data dir).
  Their eyes remain the gate for look/feel — every unlooked-at change is listed in
  `docs/TASKS.md` → Your-box checks.
- **CORRECTED 2026-07-19: Chromium IS installed on the user's box.** This section used to say
  the renderer gate can't run there for lack of Chromium — false. Playwright 1.61 + its
  browsers are present (`%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe`,
  launched successfully). The real cause was `findChrome()` scanning **Linux paths only**;
  it now lives once in `scripts/lib/smoke-common.js` and handles Windows/macOS layouts.
  The renderer gate has still never actually been RUN on that box — but it is no longer
  known-impossible, and that is worth re-testing before repeating the old claim.

## What the app IS, in one breath
JustWrite is a novel-writing app (Tauri 2 + Vue 3 + a Python/SQLite server) that shares its
whole AI/LLM stack — `just-llm-runner` (Python) + `@delebash/llm-ui` (Vue) — with JustVoice.
Persistence is **server-owned SQLite** (no browser IndexedDB); a rotating server-written disk
autosave + per-book `.zip` export/import + whole-workspace backup are the durable nets. The
**AI** page (sidebar → AI, `/ai`) carries the tabs Providers & models · Routing by feature ·
Writing AI · Usage · Server console. AI routing is **one-source** (2026-07-15): each action
points at ONE engine preset (`feature_preset_refs`) which owns the model + every tunable;
one `default_preset_id` catches unassigned customs; the action keeps only its prompt text +
JSON contract.


## OPEN WORK → `docs/TASKS.md`

The live open-work tracker for the whole system (**JustWrite · shared AI stack · JustVoice ·
your-box checks**) is **`docs/TASKS.md`**; unscheduled ideas are in **`docs/IDEAS.md`**. Both
point to the detail docs, which stay the authoritative depth:

- the runner **ledger** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md`
  (§A–J, twice-verified — every genuinely open AI-stack item),
- the **big-batch queue** `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md`
  (§8 batches 5+6 **FROZEN** by the user's hard stop · §9 the live QC findings),
- the **providers-surface** rounds (per-round box checks).

**Maintain open work in `TASKS.md`, not here.** (Supersedes the old "do not maintain a second
backlog" line — the ledger is now the *detail* the tracker indexes, not a rival list.)

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
- **Subagent delegation (re-permitted 2026-07-08, supersedes the 2026-06-09 disable):** I MAY
  spawn **Opus** subagents for mechanical / well-scoped tasks I judge Opus does as well as me —
  the user's reason: I (Fable) am better at design + decision-making, so those stay with me;
  parallelizable grunt work can go to Opus. **The chat-window model is the USER's to set — I
  CANNOT change it; only the user does** (their window auto-flipped to Opus and they reverted it
  themselves). Opus is ONLY ever a per-*subagent* model I set on a spawned Agent (`model: "opus"`),
  orthogonal to whatever the window runs. Never Sonnet (global rule — the Enforcement
  section of `~/.claude/CLAUDE.md`).
- **DB policy:** drop + reseed, no migrations (pre-release;
  `docs/plans/2026-06-18-unified-storage-no-idb.md`). Additive-only schema changes (new
  tables) need no reset — `create_all` picks them up on boot.
- **Verification discipline (amended at the 2026-07-15 strip):** the FULL headless smoke
  runs once per TASK that touches the renderer (a green smoke alone is not proof — a probe
  must **observe the changed surface**, and the built UI gets LOOKED at); **ONE rules-checker
  per task on the final diff**; plan checks tiered (1 routine / 3-lens load-bearing). The
  test fleet (~2.6 min) runs freely — never skip it, it was never the bottleneck.
- **Don't cram (user decree 2026-07-08, queue doc §9 QC-7):** hierarchy + breathing room on
  every surface; ONE short lede sentence max on a working surface (detail behind the help
  affordance); one fact shown once; one primary thing on screen per mode. Born from the Tune
  modal's two-paragraph lede + doubled names + stacked list-and-editor ("you cram stuff
  together … everywhere").
- **No naming popups (user decree 2026-07-08, queue doc §9 QC-15 — "make this a rule"):**
  creating or renaming a thing never goes through a name-popup — every entity opens its ONE
  add/edit form directly, where the name is a plain field editable at any time, and the form
  refuses to save until its required assignments are set.
- **ASK WHEN UNSURE (user, 2026-07-10 — replacing the struck DECIDED-ONCE bullet, their
  word: "THE DECIDED-ONCE RULE remove, if you are unsure i would rather you ask"):** clearly
  recorded decisions still stand and are not re-litigated (the recap charter), but when I'm
  UNSURE whether something was decided, or what exactly was decided, ASK the user rather
  than assume either way. The 2026-07-09 unasked rule-bullet is struck per their word.
- **Design work loads the design law FIRST (user order 2026-07-09, queue doc §9 QC-41 —
  "dont you have a design plugin or something you shoold always load when designing stuff,
  why dont you automatically use it"):** before ANY UI-design work, load the design law —
  precedent-before-pattern (the JV CLAUDE.md RULE #1 method, shared) + the design-conformance
  checklist + don't-cram — and NAME, in writing, the existing precedent surface + a
  real-world reference before designing; the user's reference screenshots are the spec. No
  app-UI design skill exists in this session (SearchSkills-verified 2026-07-09), so this law
  IS the loadout. Born from the B5-5 context menu shipping selection-gated against the AI
  menu's own enable/disable precedent.
- **The cwd footgun (struck ~10 times):** never chain `cd` inside compound commands and never
  rely on the shared shell cwd across parallel Bash calls — every command gets its own
  explicit absolute-path `cd`; trust the OUTPUT, never a bare exit code.
- **Dev stack in this container:** server `python -m justwrite_server.cli serve --port 17495`
  (data dir `/root/.local/share/JustWrite`) + `npm run dev:vite` (:1420); Chromium via the
  smoke's `findChrome()` — never hardcode the browser path.
- **Hard gates (STRIPPED 2026-07-15, the user's named go):** Stop **Block 0** (re-read rules/recap after compact/clear — a real Read), **Block 1** (a code claim needs evidence tools that turn), **Block 6** (a proposal ends with "SECOND PASS —"), and a **commit gate for DELEGATED-agent commits only** (docs + a genuine checker verdict from the builder's own transcript). Pre-action is a one-line R1–R5 nudge; plan checks are tiered (1 routine / 3-lens load-bearing); ONE checker per task on the diff. Everything else deleted on lifetime logs — record: claude-config `rules-detail.md` ("THE STRIP") + `EFFECTIVENESS.md`. `test_gates.py` pins ledger refs, escape-fires, and loaded-surface size budgets.

## ACTIVE DOC INDEX (open on demand, not at boot)

- **The live tracker:** `docs/TASKS.md` — whole-system open work (JustWrite · shared AI
  stack · JustVoice · your-box checks); one line per item + a pointer. **Ideas:** `docs/IDEAS.md`.
- **AI-stack open-work detail (THE ledger):** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md`
  — sections A–J, twice-verified; the depth `TASKS.md` points to for AI-stack items.
- **Providers/models surface:** `just-llm-runner/docs/plans/2026-07-06-providers-surface-redesign.md`
  — ROUNDs 1–19 full records + the parked list + per-round box checks. Banner + needed round only.
- **Current AI-routing / preset model:** `just-llm-runner/docs/plans/2026-07-15-preset-one-source-rewrite.md`
  (ONE-SOURCE: action → preset ref → `default_preset_id`; the 2026-07-14 plan's Unit-2
  reasoning backend stands, its task-tier language superseded).
- **Model-per-hardware execution (closed):** `just-llm-runner/docs/plans/2026-07-06-model-per-hardware-plan.md`
  — the one-profile consolidation, fit-by-omission, sweep, class map, orphan-child fix; phase records.
- **On-box tuning evidence:** `docs/plans/2026-07-06-llamacpp-config-tuning-2070s.md` +
  `docs/plans/2026-07-06-onbox-profile-ab-test.md` (the measured one-profile verdict).
- **History:** `docs/plans/2026-07-08-recap-archive.md` (this file's full pre-2026-07-08 text,
  verbatim) · `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` (the 513 KB roadmap
  archive — bannered fully historical 2026-07-08; its outstanding tail lives in the ledger §I)
  · every other `docs/plans/*` in both repos is historical/evidence, most carry their own
  supersession banner.
- **Live non-plan docs:** the rules-as-checks system now lives ONLY in the standalone
  `github.com/delebash/claude-config` repo (`README.md` + `EFFECTIVENESS.md` + `rules-detail.md`
  there) — the vendored `justwrite-app/claude-config/` copy was **removed 2026-07-20** (so any
  bare `claude-config/…` path elsewhere in this recap now means the standalone repo, added as
  a per-session source repo). It provisions `~/.claude` via its `install.sh`; **env dependency:**
  the web env's Setup script must install from the standalone repo, not the deleted JW copy ·
  `docs/models.md` (the user-facing models doc — update it whenever a models-surface behavior
  changes) · the JW↔JV HTTP boundary → `CONTRACT.md` (JustVoice repo).

## Where detail lives

Architecture + conventions → this repo's `CLAUDE.md` + the global `~/.claude/CLAUDE.md`.
Open work → **`docs/TASKS.md`** (the live tracker); ideas → **`docs/IDEAS.md`**; the
twice-verified AI-stack detail the tracker points to → the outstanding ledger. Per-feature/
per-go history → the plan doc named in the index above, and the recap archive for anything
older than this split.
