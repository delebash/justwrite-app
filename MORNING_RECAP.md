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
2. **This file gets a SHORT pointer paragraph per go** — what shipped, the commit shas, where
   the full record lives, what's open. A few sentences, never the full narrative twice.
3. **History never accumulates here.** When a stretch of work closes, its pointer paragraphs
   collapse into the CURRENT STATE section and the detail stays in the plan docs. If this file
   ever exceeds ~25 KB, that's the signal it has drifted back into a log — re-split.
4. The complete pre-split text (every SESSION STATE back to 2026-06-27, all twelve GO
   paragraphs of the 2026-07-07 marathon, all standing-rule history) is preserved **verbatim**
   in `docs/plans/2026-07-08-recap-archive.md` — open it only when a question touches that
   history and the pointers below don't answer it.

## CURRENT STATE (2026-07-15)

**⛔⛔ COMPACT POINT (2026-07-15, evening) — READ FIRST POST-COMPACT.** The **one-downloader
consolidation** is **BUILT + VERIFIED + COMMITTED** (behind its own rules-checker verdict;
PUSH held for the user's word). User's order: "regardless of what we download engine model
whatever … reuse the control … stop repeating code". Shipped: ONE `createDownloadTask`
composable + ONE `DownloadBar.vue` (its caption reuses the existing `progressCaption`, no
fork); **Quick Setup adopts them fully** — three tasks (engineTask when the engine isn't
installed, chatTask waiting on the engine, embedTask in parallel) — and the two domain
singletons (`useEngine` · `useRunnerModels`) KEEP their pollers (merit-flagged: their poll
subjects — a mutating models list, a 4-shape install — aren't finite self-started tasks) but
reuse the ONE `progressCaption`, gain **cancel** (`useEngine.cancel()` → the engine panel's
install bar; the catalog LOAD row → `/stop`), and `useRunnerModels` SPLITS its merged
progress into `loadProgress` + `downloadProgress` (the lying shared label is dead). TWO server
additions: NEW `POST /engine/install/cancel` (+ `_engine_cancel` worker event, `DownloadCancelled`
→ not-installed idle) and a **true load-abort** (`cancel_check = model_id not in _resident` at the
load's weights+MTP-draft download; `_run_load` catches cancel with no error state). Built ON TOP of
runner `cf0fc59` / JW `af2a363`, SUBSUMING builder-1's uncommitted two-parallel-bars QuickSetup
(fully replaced by the three-task version). Gates: runner pytest 509 (+3) · ruff · build:vite ·
vitest **157** (+12 useDownloadTask) · headless smoke zero JS errors (pre-existing jscpd red only)
· the extended Playwright driver **16/16 with screenshots read** (A three-bars, B engine cancel→
retry→done, C catalog dual-channel different bytes). Shipped-as-flagged lean: embed-failure still
advances to done with an honest note. Standing protocol (memory: [[fable-decides-opus-executes]]):
Fable decides/plans, Opus executes code+tests+commits; **hard go-gate ON — nothing runs without the
user's literal "go".** Full record: the plan doc's **ONE-DOWNLOADER CONSOLIDATION** section.

> **Re-split 2026-07-15 (doc-sweep).** This section had grown to ~40 GO paragraphs
> (2026-07-08 → 2026-07-14, all shipped + pushed) — ~4.5× the protocol's 25 KB ceiling.
> Per the RECAP PROTOCOL above, they were collapsed into the summary below; their
> verbatim text is appended to `docs/plans/2026-07-08-recap-archive.md` (and lives in git
> history). Per-go detail stays in the plan docs named in the ACTIVE DOC INDEX.

**⛔ CORRECTION (2026-07-15, after the user SAW the built UI) — THE PRESETS PAGE IS DELETED;
`Routing by feature` is the ONE routing surface.** The user's verdict: *"task kind should
not even exist anymore … it looks to me like you just renamed tasks to presets"* · *"we
should only have routing by feature and it works the same way originally"*. They were right:
I'd concluded "the preset IS the group" and then wrongly built it a group-management page —
structurally TaskKinds.vue renamed. Shipped: Presets.vue + its tab deleted; the duplicate
top preset dropdown deleted (the Lab bar is THE control); the ORIGINAL **"Use in
production"** + `● in production` restored (my rename and the task era's both reverted —
verified in git at `1302f88`, not memory); per-feature **Reset to default** back as a real
red button (right-aligned, resets ref AND reloads the form); `↺ Reset presets to defaults`
moved to the list footer; **Writing AI** tab moved beside Routing by feature; b4-probe
deleted, presets-probe rewritten (**31/31**). **A REAL PRE-EXISTING BUG found + fixed:**
`csrf.py` never allowlisted the server's OWN origin, so every write from the server-hosted
(headless `serve` + browser) UI 403'd — same-origin is not a CSRF vector; now derived
per-request (`test_csrf.py` 4/4 + a new regression). Gates: JW server **108** + ruff ·
vitest **145** · build · FULL smoke zero JS errors · probe 31/31 · **screenshots reviewed
by me this time.** TWO PROCESS LESSONS → memory: nobody ever LOOKED at the built UI (the
whole pipeline was green and wrong — [[verify-ui-layout-visually]] rewritten), and I wrote
the "maybe fold this into Routing by feature" doubt into my own approval note and never
asked it. Full record: the plan doc's **⛔ CORRECTION** section. **QuickSetup follow-on (same
day):** Quick Setup's apply step now shows **parallel download bars** (chat + embed at
once, each with its own Cancel/Retry — cancelling keeps the downloaded part), the **embed
actually downloads during Apply**, and a successful Retry now advances the wizard; full record
in the plan doc's **QUICKSETUP FOLLOW-ON** section. **One-downloader (same day, next):** those
bars are now the ONE shared `DownloadBar` driven by the ONE `createDownloadTask` composable, so
engine, model, and embed downloads reuse the same control everywhere — **Quick Setup installs
the engine too** (its own third bar on a fresh-install first run) and **every bar (engine,
model-load, model-download, embed) cancels and retries**; full record in the plan doc's
**ONE-DOWNLOADER CONSOLIDATION** section.

**GO (2026-07-15, same day: "go" + "keep going until its done" + "push") — THE ONE-SOURCE
PRESET REWRITE IS BUILT, VERIFIED, COMMITTED + PUSHED.** Runner `8081539`; JW = this commit +
its claude-config sibling (rebased onto the doc-sweep). Executed by Opus subagents per the
user's protocol, each stage spot-verified. The task tier, prompt-row params, `_effective_spec`,
the dormant sampler + FeaturePreset systems, JW's pin plumbing, and PromptLab are GONE (no
legacy fallbacks — the user's word); action → preset is the one source; the shared
`FeaturePinConfig`/`resolve_pin` contract is KEPT (JustVoice-live). Gates all green: runner
pytest 506 · JW server 107 · vitest 145 · build ✓ · FULL smoke zero JS errors (isolated temp
DB, live data untouched) · NEW presets-probe 22/22 incl. the flattening pin · the repointed
fleet green (3 pre-existing/environmental reds, root-caused). **Full record: the plan doc's
BUILD RECORD — `just-llm-runner/docs/plans/2026-07-15-preset-one-source-rewrite.md`; the
approval + panel history live there too.** Docs shipped with it: `docs/presets.md` (replaces
tasks.md), models.md swept, CLAUDE.md pointer, the 2026-07-14 plan bannered. OPEN after this
go: the USER's box checks (local High chat stops at the hardware cap; new-Anthropic run
clean) · the claude-config subagent-hook bypass follow-up. (`docs/ai-providers.md`'s
3-tier/read-only-chip sections — stale for the hours between the doc-sweep and this rewrite —
were re-swept to the one-source model in the same push.)

**Heads at this re-split:** JW `49ad7b5` · runner `493f8ef` — both clean, 0-ahead / 0-behind origin.

### What the app IS, in one breath
JustWrite is a novel-writing app (Tauri 2 + Vue 3 + a Python/SQLite server) that shares its
whole AI/LLM stack — `just-llm-runner` (Python) + `@delebash/llm-ui` (Vue) — with JustVoice.
Persistence is **server-owned SQLite** (no browser IndexedDB); a rotating server-written disk
autosave + per-book `.zip` export/import + whole-workspace backup are the durable nets. The
**AI** page (sidebar → AI, `/ai`) carries the tabs Providers & models · Routing by task ·
Routing by feature · Usage · Server console. AI routing is a **3-tier preset cascade** —
feature override → task preset → global default.

### SHIPPED (collapsed) — the 52-item batch + every follow-up, all pushed
Highlights, newest first (full records in the plan docs / git):

- **Unit 1 — per-feature preset OVERRIDE restored (3-tier cascade)** (2026-07-14) — runner
  `fb03302`+`419f5c3`+`493f8ef` · JW `49ad7b5`. Reverses Plan A's 2-tier collapse. Doc:
  `just-llm-runner/docs/plans/2026-07-14-feature-override-and-reasoning-plan.md` (its Unit 2 =
  the thinking system, being built elsewhere — see NEXT).
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

### STAGED — awaiting the user's own move
- **claude-config extraction** — the global rules-as-checks bundle is staged for its own repo
  `delebash/claude-config` (bundle in `just-llm-runner/claude-config-export/`, commit `fcaceb1`).
  The USER completes the move from their machine (this session's git proxy is scoped to the 4
  configured repos). **SAFE-ROLLOUT:** JW's `claude-config/` copy is RETAINED as the working
  provisioner until a fresh container proves the standalone repo provisions `~/.claude`.

### NEXT / open
- **Unit 2 — the thinking/reasoning system** is being built in ANOTHER session on the user's
  local GPU box (the plan's Unit 2: engine bump + a generation-aware `reasoning_map` +
  one `min(ask,cap)` resolver + a model-aware Anthropic adapter + the Off/Low/Med/High/XHigh/Max
  UI). **Do not touch its files here** — `docs/models.md` reasoning section + the plan doc's Unit 2 block.
- **THE ledger** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md` §F/G/I/J is
  the ONE open-work source: **F1 JustVoice convergence** (still broken — JV imports
  `LLMRolesSettings` the runner defines nowhere) is the biggest build; §G your-box checks; parked
  I2/I3/I5/I6, #256 spell-check, D5/D6, J1–J3.

### THIS SESSION (2026-07-15) — doc-sweep
Help-corpus currency sweep + this recap re-split (JW + shared stack; JustVoice excluded).
Removed the obsolete **Writer Lab** doc + its refs; fixed **IndexedDB → server-SQLite** and the
removed **"Send to JustVoice"** export card; rewrote `ai-providers.md`'s routing/nav/chip sections
to the current **3-tier + read-only-chip + AI-page** model; added the missing **Reader knowledge**
TOC entry. `whats-new.md` + `backups-and-data.md` (export/autosave) verified current.

## OPEN WORK — the ONE list and where it lives

- **THE ACTIVE BATCH (2026-07-08):** the user's 52-item list, organized and grounded in
  `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` — §0 the list verbatim · §1 the
  code-verified answers · **§7.1–§7.6 the LOCKED decisions (ALL discussions decided; E parked;
  the §7.6 flagged interpretations user-BLESSED: "your decisions are fine")** · §3 batches
  B1–B6 — **B1 + B2 + B3 (incl. the B3-4/B3-10 remainder) + B4 BUILT + shipped**. **⛔ THE
  §8 STANDING GO ON BATCHES 5+6 IS FROZEN by the user's hard stop (2026-07-08, verbatim in
  the CURRENT STATE block above): "do nothing until i say go"** — the queue doc §9 ROUND 2
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
  orthogonal to whatever the window runs. Never Sonnet (global T10).
- **DB policy:** drop + reseed, no migrations (pre-release;
  `docs/plans/2026-06-18-unified-storage-no-idb.md`). Additive-only schema changes (new
  tables) need no reset — `create_all` picks them up on boot.
- **Verification discipline (2026-07-06/07 amendments, binding):** the FULL headless smoke
  runs on **every UI change, waivers notwithstanding** (the usePoll runtime break the user
  caught taught this); a green smoke alone is not proof — a Playwright probe must **observe
  the changed surface**; checker discipline per the user's "do b": NO pre-build agent check
  (grounding + inline T1–T12 citation before building), **ONE genuine diff rules-checker
  verdict before each CODE commit** (doc-only commits exempt).
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
- **Hard gates** — the **rules-as-checks system** (built 2026-06-26, provisioned from
  `claude-config/`; full detail in `claude-config/README.md`; **v4 "think-twice" 2026-07-09,
  #237**). The rules are the slim **rule-tests T1–T12** (`~/.claude/CLAUDE.md`) + full
  WHY/incidents in `rules-detail.md`, read on demand. Enforcement at mechanical events:
  **Stop gate** `verify-gate.py` Blocks 0–6 (0 = re-read rules/recap/project-CLAUDE after a
  compact/clear, NOT resume; 1 = code claim w/ zero reads; 2 = arch reco w/o precedent; 3 =
  "done"+code w/o a doc; 4 = plan/design LOCK w/o a GENUINE agent verdict — v4: self-typed
  tests no longer clear; user-decided provenance passes; 5 = code-edit w/o a rules-pass;
  6 = a PROPOSAL w/o an explicit "SECOND PASS —" section — v4) + a **PreToolUse hook**
  `pre-action-check.py` (pre-task DENY on the first code edit w/o a rules-pass AND — v4 —
  a cited plan/spec line + a "RISK:" doubt in the turn text; explicit-"trivial"/.md exempt ·
  per-edit nudge · ExitPlanMode → run the checker panel) + a **commit gate** `commit-gate.py`
  (PreToolUse Bash: a code `git commit` is HARD-DENIED until docs **+** a GENUINE
  rules-checker AGENT all-pass verdict — read from the agent's OWN result, not self-typed;
  v3, closes the self-cert hole) + the **rules-checker subagent** (Opus; a 2–3 panel
  for load-bearing design). Effectiveness tracked in `claude-config/EFFECTIVENESS.md`
  (catches/false-positives/misses; the v4 entry lists the trial watch-items). All fail-open.
  **Real plan = Plan mode + detailed Task entries** (not a chat plan) — that's what fires
  the plan/task events.

## ACTIVE DOC INDEX (open on demand, not at boot)

- **Open work (THE ledger):** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md`
  — sections A–I; §I is the master-plan tail folded 2026-07-08.
- **Providers/models surface:** `just-llm-runner/docs/plans/2026-07-06-providers-surface-redesign.md`
  — ROUNDs 1–19 full records + the parked list + per-round box checks. Banner + needed round only.
- **Current AI-routing / preset model:** `just-llm-runner/docs/plans/2026-07-14-feature-override-and-reasoning-plan.md`
  (3-tier cascade restored 2026-07-14: feature override → task preset → global default; the
  2026-07-02 Plan-A doc's reset/edit-in-place story stands, its 2-tier cascade reverted).
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
