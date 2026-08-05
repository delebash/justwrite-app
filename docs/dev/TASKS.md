# TASKS — the live open-work tracker (JustWrite)

> **THIS is JustWrite's live tracker.** Since 2026-08-04 every repo carries its own
> (the docs campaign; the rule: **an item lives where the code that closes it
> lives**): kit + shared-server work → `../just-llm-runner/docs/dev/TASKS.md` ·
> JustVoice → `../JustVioce/docs/dev/TASKS.md` · this file = JustWrite + the
> cross-app coordination items only. Unscheduled ideas live in `docs/dev/IDEAS.md`.
>
> **How to use.** One line per item + a pointer to its detail doc — the depth lives in the
> linked doc, not here. **Close = delete** (the user's ruling, 2026-08-04): when an item ships
> and its QC is done, its line leaves the file — git and the plan docs keep the history. Add an
> item the moment it's real. A tracker line is a claim, not evidence.
>
> **Last swept: 2026-08-04** — close-means-delete applied to the whole file. Every
> SHIPPED/CLOSED narrative was removed; whatever a closed item still owed (a QC glance, a
> veto, a watch) survives below as its own line. The prior sweep notes, the 2026-07-26
> full-verification banner, and all the shipped detail are in `git log -- docs/dev/TASKS.md`.

## Found by the 2026-08-05 family audit — tonight's tray/Server port, verified

- **i18n gaps, surfaced not regressed:** the tray menu is hardcoded English in
  Rust inside an es-localized app (donor-shaped; the family full-menu ruling
  should localize it), and the labels feed maps no `quickSetup`/`aiOffer`
  groups — those kit surfaces render English canon in Spanish (same as before
  the labels store; now mappable and unmapped).
- **Release-build note:** `server/pyproject.toml`'s `bundle` extra pins
  llm-runner to a git BRANCH — whether it carries tonight's shared-stack changes
  is unverified (dev runs an editable install and is current).
- *(Non-issue, recorded: `family.lab.changeData` is fed but JW passes no
  dataLinks — JW has no promptless features, so the line never renders; the key
  is future-proofing.)*

## Now / near-term (JustWrite)

- **`family.*` es values are HAND-TRANSLATED (2026-08-04)** — the new catalog block
  behind the kit's labels feed (`src/i18n/familyLabelsFeed.js`: AI tabs, download-bar
  actions, connection-error copy, the `family.lab` group) got hand-es'd values; run them through the docgen
  translator + review workspace when that pipeline goes live, like the rest of es.json.
- **"Serve `/health` before `seed_workspace`" — recommend DROPPING; your ruling owed.**
  Measured 2026-07-25: it buys 36 ms of a ~975 ms pre-listen window dominated by framework
  imports that cannot be deferred. (Correction, docs campaign: there is no "re-measure
  snippet" — the record holds one measured breakdown, now in
  `docs/dev/measured-performance.md` §Boot.)
- **Fit-estimate label wording — your veto still open.** Shipped with the PC-class work;
  `docs/plans/archive/2026-07-22-igpu-research-and-cpu-band-recovery.md` §25 addendum 9.
- **Writer's-editor expansion — decision-closed plan written, NOT launched; launch = your
  word.** Order 3→2→1-spike→4 (prose highlights · thesaurus · bible-aware spell/grammar
  spike · session word target). Plan: `docs/plans/2026-07-26-editor-expansion-executor-plan.md`;
  findings: `docs/plans/2026-07-26-writers-editor-gap-research.md` + the IDEAS.md gap table.
  Wait-gates: i18n Phase 1a is merged (done); confirm no bench is running at launch.
- **The 2026-07-19..26 unauthorized-changes review — 77 user-visible commits await YOUR
  verdict; only you can say which you approved.** Next candidate: `ea543ae` (panels dismiss on
  Esc/outside-click + nav toggle). Method (both proven the hard way): enumerate with the FULL
  log + a date filter, never `git log --since` (it hid 40 commits including the guilty one);
  "the commit message mentions the user" is NOT evidence of authorization. Regenerate the
  per-commit list with the script — don't trust a stale `visible-changes.txt`.
- **Whole-repo "extraction vs copies" audit — OWED, on your call** (your 2026-07-26 ruling).
  Detector that works: normalise the domain noun between sibling files and diff — jscpd can't
  see this class. Candidates: the seven entity views' detail-mode blocks · per-view empty
  states · the seven `useStatusDisplay` copies · the ~20 probe scripts' private `findChrome()`.
- **i18n remnants** (the sweep itself is DONE — 0 warnings, `no-raw-text` is `error`; record:
  the i18n plan docs + git):
  - Flaky `projectHistory.test.js` cap test — failed once in four identical runs under GPU
    load, mechanism unexplained, not i18n's — yours to call.
  - The frozen `v0.1 · local` brand line MOVED, it didn't die (docs campaign
    2026-08-04, verified): it now lives as the catalog value `sidebar.brand.sub`
    (`en.json` + `es.json`); binding it to `APP_VERSION` (an interpolated message)
    is still the fix — yours to call.
  - Key-naming style + the `|` plural pipes in `en.json` — your veto still open.
  - ~200 duplicate call sites could point at existing `common.*`/`count.*` keys — optional
    reuse polish.
  - Trap to remember: `@` is vue-i18n's linked-message syntax — write `{'@'}` in messages;
    nothing in the toolchain catches it, so render-check any message containing `@ | {`.
- **Single-source text system + translation — THE NEXT BIG TASK** (your roadmap ruling
  2026-07-26; detail: IDEAS.md's single-source entry + 
  `docs/plans/2026-07-26-i18n-single-source-research.md`). All seven decisions blessed; shape
  ruled GENERIC (any Vue app). **The translation tool is now `just_ai_i18n_docgen`** — the
  Python successor of the proven v2 prototype; the Node original was retired 2026-08-04
  (archived: https://github.com/delebash/just-ai-help). Open asks on you: ship the measured
  `es.json` into JW · the upstream `--think` PR · whether to rotate the Gemini key that
  appeared in chat.

## Open — awaiting a go

- **QC queue posture (standing)** — the live findings you drop while QC-ing on your
  box; discussion-first, each needs its own go. (B5-4 CLOSED by the docs campaign —
  the big-batch build record shows the accent nav row SHIPPED, probe-measured; the
  old "design call remains" line was stale. Batches 4-6 have nothing left open.)
- **Big-batch residuals — your words owed** [extracted from the archived
  `just-llm-runner/docs/plans/archive/2026-07-08-big-batch-queue.md`]: the §7.1
  sub-questions (a) blast-radius confirm named-vs-generic (shipped as NAMED per the
  rec — one line changes it) · (b) the Apply verb/label · (c) the help-popover copy
  (built as a lede; the popover awaits the copy) · (d) provenance-badge wording ·
  plus the QC-38 AI-queue main-menu doorway's label ("AI tasks" flagged default).
- **I1 + queued follow-ups (each needs a word)** [same source]: shared
  `runJsonAnalysis` · `useEntityCrudView` (the 7 byte-identical focus-watches ride
  it) · gate ratchets · per-model GGUF delete · ensure-resident timeout test ·
  "loading the model" progress label · hooks payload channel · DOM-env `htmlToText`
  suite · SceneNotesPanel i18n · CommandPalette direct-creates lack `?new=1` ·
  the `.wb-search*`/`.set-desc strong` CSS fold · promote the scratchpad
  popup-probe to `scripts/` if the flows need a standing guard.
- **Class-library copy/UX calls — yours** [extracted from the archived igpu doc
  §25]: the Add-model picker filters to class members (you hit this and hated it) ·
  MoE-vs-dense visibility wherever hardware numbers show · `LuMeasureHistory`'s
  bare "measured" word · the class-library lede says "a memory RANGE" (factually
  wrong; rewrite drafted, you own copy) · whether the library is a single-machine
  view · whether "Recommended" becomes user-settable · rename ARCHITECTURE's
  "Model class defaults" heading ("Model family thinking defaults") to end the
  vocabulary collision.
- **RAG corpus follow-ups**: imported chapters land as ONE scene → one diluted
  embedding per chapter (fix E5: scene-break splitting on import) · editing an
  embed template needs a manual Rebuild with no surfaced affordance. Design:
  `docs/dev/rag-design.md`.
- **Catalog-row download: Retry without Cancel** on the failed/"Getting ready"
  state (your screenshot) — distinct from the shipped Cancel/Dismiss surface.
- **Boot hardening pair**: providerBackend/routingBackend retry 3×700 ms = a
  silent 2.8 s on any shape-check failure (worth a guard) · verify the stale
  "loads on first use" chip after a confirmed load next app boot · the 2026-07-11
  0.6B-weights deletion was never root-caused (suspects: row Delete / re-download
  cache-clear / verify purge on an AV race).
- **Adopt the kit boot contract (recorded deviation, app-structure.md §4/§1):** swap the
  hand-wired `configureLlmUi`/`configureServerApi`/`configureExternal` calls
  (`main.js`) for `installLlmUi`, mount `<LlmUiHosts />` instead of individual
  `<Toast />`+`<AppDialog />` (`App.vue:198-199`), take the AI-tasks nav row from
  `useAiTasksNav()` (`Sidebar.vue:148` hand-builds it). Also grandfathered: no
  `lint` script; console script named `justwrite_server.cli` not `<snake>.serve`.
- **Rust D2 — delete legacy `images_read`/`images_delete` — YOUR CALL, never made**
  (explained 2026-07-13, rec: delete; two dead fns reading pre-server disk-file
  image records). Extracted from `docs/plans/archive/2026-07-13-rust-minimization-and-choosers.md`
  by the docs campaign — the decision had fallen out of the tracker.
- **Per-band survey residue — CORRECTED (docs campaign): the "two open decisions"
  cite was CIRCULAR** (the banner pointed at this tracker, the doc body says "no
  open decisions remain"). Best reconstruction of the two user-word items actually
  in the doc: (a) one word flips the vram16|ram32 band to the 27B if a prose trial
  favors it; (b) the 70B/GLM availability rows — keep or remove. Both yours.
  Verdicts distilled: `docs/dev/measured-performance.md` §Per-band.
- **Think-A/B + b9993 loop re-test — RESULTS never filled: dead or owed?** The
  user-ordered on-box batch in `docs/plans/archive/2026-07-16-think-ab-and-loop-retest.md`
  has an empty results template. Rule it: run the two tests, or kill the doc.
- **2026-06-20 deep-audit backlog — merge call before it archives:** its untriaged
  findings overlap the open "extraction vs copies" audit above; decide fold-or-drop
  (`docs/plans/archive/2026-06-20-deep-audit.md`).

*(Moved 2026-08-04 by the placement rule: I2 cloud prompt caching → the runner's
`docs/dev/TASKS.md`; the whole JustVoice section (F1/F5/F6/F2, still parked behind
JW by your roadmap ruling) → `../JustVioce/docs/dev/TASKS.md` — with F1's stale
"JV can't even import llm_runner" claim corrected there: check-consumers passes for
JV as of 2026-08-04; the convergence scope itself stands.)*

## Your-box checks (only the Windows / 2070S machine can finish these)

- **Boot splash after the kit adoption (2026-08-04):** the load group is the
  kit's `<BootModelLoad />` now and the model bar shows the MODEL NAME (your shared-behavior
  ruling) instead of "Loading your writing model". One boot with warm-start on is the look
  pass. Gates already green: 567/567 vitest, build, i18n report (its `literal`/`nav.settings`
  rows pre-exist, proven on a stashed clean tree). `warmStartup.js` deleted; the bench
  suppression rides the kit's `skip` option (`main.js`).

- **QC the shipped 2026-07-24/25 batch — pushed; your eyes are the only outstanding half:**
  the boot-splash plate (fit = fill) · self-hosted fonts (**needs one fresh `npm run dev`** —
  `vite.config.js` changed) · boot 4.1 s → 2.3 s · the downloader rate-limit fix · the Model
  Catalog layout. (Cite CORRECTED by the docs campaign: these were §20-33 of the
  mtp-verify doc, not the igpu doc; the numbers are distilled in
  `docs/dev/measured-performance.md` §Boot + downloads.)
- **Bench legs still owed on your box** [extracted from the archived igpu doc §7]:
  the CPU raw llama-bench pp/tg matrices (unmeasured since the `-c` flag fix) · the
  GPU RAG bible-vs-index comparison (`forceBibleOnly` + permanent `-bible` legs —
  your "i cant believe we did not do that in the first place") · the characterChat
  bible-leg variant · Bonsai's CPU leg under the corrected id
  `ternary-bonsai-27b-q2-g64` (loads in 13 s; 0/10 chats completed last try).
- **drive.js `findPython`/autostart has still never fired** — the 13:46 bench
  attached to your live server; closes on any `--autostart` bench with the app
  closed. Plus two glances: PricingEditor + LuRunnerBinaries have never been
  RENDERED by eyes (code-verified only) · StyleTune's drafter re-scope — the 8 GB
  class tune sets `spec_type: none` BY DESIGN, so a drafter load needs a deliberate
  override or a bigger box (and its drafter measured no gain anyway:
  `docs/dev/measured-performance.md` §MTP).
- **LOOK at the PC-class surfaces the 2026-07-27 look pass did not cover:** the catalog row's
  needs line beside the download size · the Fit hover's "Estimated / not yet tested on your PC
  class" wording · the renamed badge with your class after it. (The class-configs modal and the
  QuickSetup wizard were QC'd good 2026-07-27.) Same plan doc, §24.
- **Quick Setup wizard EMBEDDING check** — the fix shipped + contract-tested 2026-07-26, but
  only the GUI can prove the wizard: open it, confirm EMBEDDING populates and the banner is gone.
- **Model-download Cancel/Dismiss glance** — server + tests verified 2026-07-26; one look at the
  failed / "Getting ready" states is all that's left.
- **Delete the 31B row in your local catalog UI if you want it gone** — the seeder is
  insert-only, so the 2026-07-26 removal reaches fresh installs only.
- **Batch Fill-from-book: the review phase + auto-apply write have never had a live
  run** [attributed: `docs/plans/archive/2026-07-19-batch-fill-from-book.md` — shipped from
  unit-tested pieces; "get their first live run on the user's box"]. One real batch
  on your box is the acceptance.
- **Pass-1 execution tail** [attributed: `docs/plans/archive/2026-07-22-pass1-execution-plan.md`
  tail — "paused pending the planner's decision"]: the smoke's splash-aware wait ·
  your box-look at the new panel line / editor Copy / override flow / the rename ·
  the iGPU laptop kit queue.
- **Bench harness `--restore` fire-test** — one deliberate mid-leg kill → `npm run bench --
  --restore bench/results/<run-id>` → the Routing tab shows the original assignments. Still only
  proven against a fake client. `docs/plans/archive/2026-07-19-llm-bench-harness.md`.
- **`book-smoke.js`** — unverified since the shared-helper extraction; needs port 1420 free once.
- **19 probe scripts still carry a Linux-only `findChrome()`** — they cannot find a browser on
  Windows at all; convert to the shared `tests/lib/smoke-common.js` import or delete the dead
  ones. Same plan doc.
- **Unit 2 reasoning acceptance** — one local High chat run stopping at the hardware cap · one
  new-Anthropic run with reasoning words on the wire, no 400. Ledger §G.
- **Ledger §G1–G6** — Plan B on-device gates · portable data folder · the RTX 2070S spawn
  failure (now self-reporting) · marketing screenshots · full RAG end-to-end + router-flag
  confirm · Windows AMD/Intel detection spot-check. Ledger §G.
- **Providers-surface rounds 9–19** — the per-round box checks.
  `just-llm-runner/docs/plans/archive/2026-07-06-providers-surface-redesign.md`.

## Standing rulings (constraints, not tasks — they gate future work)

- **Server reuse is VETOED** ("i am affraid of a server running when it shouldnt"); the
  kill+respawn cost (`lib.rs:377-391`) was measured and no cheaper boot lever exists.
- **Commit-gate hooks are REJECTED** — the remedy for unauthorized change is asking before
  UI-behaviour changes, not machinery.
- **Availability ≠ recommendation** (the 70B/GLM precedent): a catalog row may exist untested;
  a band recommendation may not.
- **The index FINDS, Outline RESTRUCTURES** — the index never nests scenes, Outline never grows
  filters; drifting either way builds the same page twice.
- **No outside model seeds untested** (the A/B law) · catalog rows are GGUF/cross-platform only.
- **E-row third-party drafters stay `mtp: False`** — revisit only on a measured need; any
  laptop session adds one `-md` load leg first.
- **Refusal probes: always run the stock CONTROL leg, and READ every result** — the failure
  that matters (deflection) is invisible to any text metric; the keyword-scorer post-mortem
  lives in the DO-NOT-ADD comment above `looksRefused` (`services/benchHook.js`).

## Parked (wakes on a trigger or a fresh ask — not active work)

- **I5 — the deferred parking lot** (per-scene snapshots · per-entity write REST · RAG
  sqlite-vec ANN · extract kit `common/` → `@delebash/ui` · llama-swap layer · the
  Tauri/package rename PR). Ledger §I5.
- **claude-config standalone provisioning** — only the fresh-container proof is outstanding
  (prove `~/.claude` provisions from `github.com/delebash/claude-config`, then JW's vendored
  copy can go).
- **`uma` → `mem_arch`** — a design call parked until a unified-memory NVIDIA box actually
  exists; the "Use for this PC" override covers such a user today.
- **The bench-autostart venv re-exec oddity** — a `F:\Python312` child owned the llama-servers
  on 2026-07-26; ran green, cause unverified; sits on the "which Python runs" trap.

*(Moved 2026-08-04 by the placement rule — runner-owned parked items (D5 · D6 · I3 ·
the `--fit`/MTP upstream WATCH · the Harrier/KaLM model watchlist · the LICENCE flag ·
the SDK-pivot re-open trigger) → `../just-llm-runner/docs/dev/TASKS.md`; JV-owned
(F3 · I6) → `../JustVioce/docs/dev/TASKS.md`.)*
