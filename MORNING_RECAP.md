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
3. **History never accumulates here.** When a stretch of work closes, its pointer paragraphs
   collapse into the CURRENT STATE section and the detail stays in the plan docs. If this file
   ever exceeds ~25 KB, that's the signal it has drifted back into a log — re-split.
4. The complete pre-split text (every SESSION STATE back to 2026-06-27, all twelve GO
   paragraphs of the 2026-07-07 marathon, all standing-rule history) is preserved **verbatim**
   in `docs/plans/2026-07-08-recap-archive.md` — open it only when a question touches that
   history and the pointers below don't answer it.

## GO (2026-07-16) — THE THINKING-BUDGET REDESIGN, END TO END (unpushed on the branch)

**The user's day-long design, settled and built:** thinking is a THREE-STATE preset
control — Off · **Model default** (think on, level EMPTY = FOLLOW the selected model's
layered `reasoning_budget`: your applied config → hardware class default → global launch
defaults, resolved live, nothing copied) · **a level** = the preset's OWN ask ("feature
is the end of the line"). No clamp/min() anywhere; honest sentinels (-1 unlimited ⚠ /
0 off); `reasoning_budget` is a normal layered switch that is NEVER a launch flag (sent
per request as JSON, labeled "per-request" in every grid); the knob-catalog `label`
column is DELETED (exact switch names only); all 20 feature chips are `editable` (chip
edit ≡ Routing-by-feature edit, one preset PUT); Reasoning levels = a POPUP editor on
the provider form; p_chat seeds think-on + FOLLOW. **Three real bugs fixed:** the
boxless chip popover (scoped CSS never reached reka's PopoverContent root), the
think-on-no-level run-path gap, and the autoflush-OFF seed bug (every fresh boot/reset
since 07-14 seeded an EMPTY reasoning map — proven live both paths). Full record:
`just-llm-runner/docs/plans/2026-07-16-reasoning-budget-house-layering.md` (plan + four
build records) · commits: runner `00c476b`→`bc3f352` (5, unpushed) · JW `d738978`+
`752ef2c` (+ this pointer). **OPEN:** the user's box verification (visual — their call:
no screenshots, they look) + the two box tests
(`docs/plans/2026-07-16-think-ab-and-loop-retest.md`: think OFF/ON A/B — the day's
original question — and the b9993 loop re-test, verdict rule declared). The loop
provenance is CORRECTED in the tuning doc + recap archive (it was Claude's diagnosis
from the user's pasted token counts, jointly accepted — the loop STANDS as verified).

## GO (2026-07-17) — THREE USER-REPORTED BUGS FIXED (unpushed on the branch)

Three items off the 2026-07-17 QC queue, each on its own go. (1) **Delete the
currently-loaded book** — JW `6cf018e`: the store already did it right; the sidebar's
trash icon sat in a `v-else` to the active-project checkmark, so the OPEN book was the
one you couldn't remove. Ruled: after deleting the open book, land on the next project;
none left → welcome (QC-40). Pinned by `deleteProject.test.js`. (2) **Cancel-cancels-
everything** on multi-chapter sweeps — JW `e86af26`: both pools (entitySweep +
foreshadowingScan), 4 defects each (no signal threaded · abort detected by string-
sniffing "abort" when a cancel reads "…Request cancelled." · per-chapter rival task
entries vs the QC-31 batch-owner · cancelled-as-normal-return froze rows) + the redundant
top Cancel removed. User confirmed on box. (3) **Chip model-picker "not opening" in a
modal** — kit `8fa0f39` + JW test `db6464e`: the `editable` chip's popover portals to
`<body>` and at `z-index:60` painted BEHIND AppModal's scrim (overlay z 200) + backdrop
blur — invisible on all 15 in-modal chip mounts. Fixed 60→**999** (matches
`.ui-select-content`, the other body-portalled reka popper). DOM-probe-verified it was
pure stacking (mounts+stays, pointer-events already auto — NOT focus-trap). Pinned by
`chipPopoverStacking.test.js` (fails at 60, passes at 999). **Live queue** (memory
`open-todos-2026-07-17.md`): still OPEN, need a go each — multi-click unload · "stalling"
thresholds mislabel a 2.6 tok/s model · the cancel/progress plan
(`docs/plans/2026-07-17-load-cancel-and-one-progress-control.md`, FAILED its 3-lens; T2
would unload a DIFFERENT resident model — do not build as written).

## CURRENT STATE (2026-07-15, end of day — everything below SHIPPED AND PUSHED)

**One session took the AI routing to the one-source model and rebuilt the guardrails on
evidence.** Shipped + pushed, in order: the **one-source preset rewrite** (task tier deleted;
action → preset ref → `default_preset_id`; runner `8081539`) · the **⛔ correction** after the
user saw the UI (Presets page deleted — `Routing by feature` is the ONE surface; original
"Use in production" restored; found+fixed the pre-existing same-origin CSRF 403) · **Quick
Setup parallel download bars** (chat ∥ embed, cancel/retry each) · the **one-downloader
consolidation** (ONE `createDownloadTask` + `DownloadBar` for engine/model/embed; engine
install cancel + true load-abort server-side; runner `6602468`) · the **subagent-hook fix**
(builders' Edit/Write no longer denied — the ~2-3× patch-script tax is gone; commit/task
gates read the agent's OWN transcript; claude-config `2e79f8f`+`b35fc39`) · **server tests
147s → 46s** (`pytest -n auto`, nothing skipped; `npm run test:fast` ≈53s; full fleet
~2.6 min) · the **gate strip** below. Full records: the plan docs named in each line + the
ACTIVE DOC INDEX; today's collapsed paragraphs are verbatim in the recap archive.

**GO (2026-07-15, late) — THE GATE STRIP + RULES CUT (the user's named go).** Rules 12→5 (**R1–R5** + two habits + the act-not-word law; `~/.claude/CLAUDE.md` is now 80 lines). Gates decided by LIFETIME logs: Stop keeps **Block 0** (re-read after reset; 4 fires/4 fixes), **Block 1** (a code claim needs evidence tools that turn — the user's save: "you often check docs or memory which we find dont align with actual code"), and **Block 6** (second pass; 3 fires/3 changed answers); **commit-gate fires ONLY for delegated-agent commits** (main session ungated — 15 of its 25 lifetime decisions were its own word-escape bug); **task gates deleted** (29 of 39 log lines were its own test suite); **pre-action is nudge-only**. Checker cadence: ONE per task on the diff; plan checks tiered (1 routine / 3-lens load-bearing). **Prose regrowth now FAILS the suite** (`test_gates.py::test_loaded_surfaces` — size budgets on every context-loaded surface). Full record: claude-config `rules-detail.md` "THE STRIP" + `EFFECTIVENESS.md` 2026-07-15.

**Heads at this cleanup:** JW `6ff1bc6` · runner `0ed1ef3` · claude-config `2d20135` — all
0-ahead/0-behind their origins. **In flight:** one Opus builder fixing the catalog's
Re-download-on-loaded gap (`LuModelCatalog.vue` — show Re-download on loaded rows, unload
first); verify its record when it lands.

### What the app IS, in one breath
JustWrite is a novel-writing app (Tauri 2 + Vue 3 + a Python/SQLite server) that shares its
whole AI/LLM stack — `just-llm-runner` (Python) + `@delebash/llm-ui` (Vue) — with JustVoice.
Persistence is **server-owned SQLite** (no browser IndexedDB); a rotating server-written disk
autosave + per-book `.zip` export/import + whole-workspace backup are the durable nets. The
**AI** page (sidebar → AI, `/ai`) carries the tabs Providers & models · Routing by feature ·
Writing AI · Usage · Server console. AI routing is **one-source** (2026-07-15): each action
points at ONE engine preset (`feature_preset_refs`) which owns the model + every tunable;
one `default_preset_id` catches unassigned customs; the action keeps only its prompt text +
JSON contract.

### SHIPPED (collapsed) — the 52-item batch + every follow-up, all pushed
Highlights, newest first (full records in the plan docs / git):

- **The 2026-07-15 day** (details in CURRENT STATE above until the next re-split): one-source
  preset rewrite + correction + CSRF fix — doc:
  `just-llm-runner/docs/plans/2026-07-15-preset-one-source-rewrite.md` (plan · T0 audit ·
  BUILD RECORD · ⛔ CORRECTION · QUICKSETUP FOLLOW-ON · ONE-DOWNLOADER sections) — and the
  guardrail work (subagent-hook fix, gate strip, test speedup) — records:
  claude-config `rules-detail.md` "THE STRIP" + `EFFECTIVENESS.md` 2026-07-15. The absorbed
  **Unit 2 reasoning backend** (engine bump b9993, `reasoning_map`, `min(ask,cap)`, adapters,
  Off→Max UI) shipped inside the rewrite.
- **Unit 1 — per-feature preset OVERRIDE restored** (2026-07-14) — runner
  `fb03302`+`419f5c3`+`493f8ef` · JW `49ad7b5`. Superseded a day later by the one-source
  rewrite (its `feature_preset_refs` survives as THE pointer). Doc:
  `just-llm-runner/docs/plans/2026-07-14-feature-override-and-reasoning-plan.md`.
- **Acceleration-backend selector (CUDA / Vulkan / Auto)** — runner `b66449c`+`ae787f1`+`8215dc6`.
  Doc: `just-llm-runner/docs/plans/2026-07-14-acceleration-backend-selector.md`.
- **Risk-tiered commit-gate** — JW `63f8318` (LOW-risk tests/copy commits skip the checker;
  default-HIGH). Doc: `docs/plans/2026-07-14-risk-tiered-commit-gate.md`.
- **Rust-minimization + autosave-to-server + folder choosers + samples-to-data-dir** — JW
  `8b92c58`/`eea1bc2`/`925fe30`/`0857317` · kit `84b3d72`. Doc:
  `docs/plans/2026-07-13-rust-minimization-and-choosers.md`.
- **Data-driven sample novels** — the *Ninth Facet* tutorial + the *Salt-Iron Road* bulk
  stress book; per-book `.zip` export/import + CSRF guard + the JV live-POST removed — JW
  `c538bfc` · runner `727f162`. Doc: `docs/plans/2026-07-12-sample-novel-the-ninth-facet.md`.
- **RAG story-bible** (scene + bible-card chunks, entity pinning, scene links, E-extraction) —
  Doc: `docs/plans/2026-07-11-rag-story-bible-build.md`.
- **#235 page-related undo · #237 think-twice hooks · I1 cleanup (voiceDrift/CSS/popup audit)** —
  Docs: `docs/plans/2026-07-10-page-related-undo.md`, `docs/plans/2026-07-12-i1-css-popup-voicedrift.md`.
- **The 52-item batch (B1–B6) + every QC cluster** — full record:
  `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` §3 / §7 / §9.

### STAGED → RESOLVED
- **claude-config extraction — DONE.** `github.com/delebash/claude-config` is the source of
  truth (local clone `~/.claude/claude-config`, pulled by `self-update.sh` each new session);
  JW's `claude-config/` copy is the synced WEB provisioner (the env Setup script installs from
  it). Still open: a fresh web container proving the standalone repo can provision `~/.claude`
  directly, after which the vendored copy can go.

### NEXT / open
- **Unit 2 (thinking/reasoning) is SHIPPED** — absorbed into the one-source rewrite. What
  remains is the USER's box acceptance: one local High chat run stopping at the hardware cap,
  one new-Anthropic run (reasoning words on the wire, no 400). Ledger §G.
- **THE ledger** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md` §F/G/I/J is
  the ONE open-work source: **F1 JustVoice convergence** (still broken — JV imports
  `LLMRolesSettings` the runner defines nowhere) is the biggest build; §G your-box checks; parked
  I2/I3/I5/I6, #256 spell-check, D5/D6, J1–J3.

## OPEN WORK — the ONE list and where it lives

- **THE ACTIVE BATCH (2026-07-08):** the user's 52-item list, organized and grounded in
  `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` — §0 the list verbatim · §1 the
  code-verified answers · **§7.1–§7.6 the LOCKED decisions (ALL discussions decided; E parked;
  the §7.6 flagged interpretations user-BLESSED: "your decisions are fine")** · §3 batches
  B1–B6 — **B1 + B2 + B3 (incl. the B3-4/B3-10 remainder) + B4 BUILT + shipped**. **⛔ THE
  §8 STANDING GO ON BATCHES 5+6 IS FROZEN by the user's hard stop (2026-07-08): "do nothing until i say go"** — the queue doc §9 ROUND 2
  items (QC-10..16) are discussion-first; DL-2 stays PLAN-ONLY; B2-9 still needs its own
  word. Nothing builds until the user's go. **B1-2 CLOSED at pickup** by the user's own diagnosis (a DB-reset
  disk⇄DB disconnect; "the deleting is fine" — no code change; the disk-based sweep already
  self-heals at the next install, note + code cites in queue §8). **The queue doc §9 is the
  LIVE QC queue** — the user is QC-ing shipped batches on their box and dropping findings while
  the standing go executes ("this should not stop your tasks"); QC-1 (badge wording → the real
  editor names) is recorded there. No-tests posture on (container gates still run at ship).
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

- **Open work (THE ledger):** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md`
  — sections A–I; §I is the master-plan tail folded 2026-07-08.
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
- **Live non-plan docs:** `claude-config/README.md` + `EFFECTIVENESS.md` (the rules-as-checks
  system) · `docs/models.md` (the user-facing models doc — update it whenever a models-surface
  behavior changes) · the JW↔JV HTTP boundary → `CONTRACT.md` (JustVoice repo).

## Where detail lives

Architecture + conventions → this repo's `CLAUDE.md` + the global `~/.claude/CLAUDE.md`.
Open work → the outstanding ledger (nowhere else). Per-feature/per-go history → the plan doc
named in the index above, and the recap archive for anything older than this split.
