# TASKS — the live open-work tracker (whole system)

> **THIS is the live tracker.** One place for everything open across the system we work as a
> whole — **JustWrite**, the shared **AI stack** (`just-llm-runner` + `@delebash/llm-ui`), and
> **JustVoice**. Unscheduled ideas live in `docs/IDEAS.md`. (`MORNING_RECAP.md` was retired
> 2026-07-29 and is archived at `docs/plans/2026-07-29-morning-recap-archive.md`; current state
> is read from git, and the rules it carried now live in `CLAUDE.md` or the global preferences.)
>
> **How to use.** One line per item + a pointer to its detail doc — the depth lives in the
> linked doc, not here. Close an item when it ships; don't let history accumulate (that's what
> the plan docs and git are for). Add an item the moment it's real.
>
> **Last swept: 2026-07-24** — the sweep the file's own charter had been asking for since
> 2026-07-19: ~14 SHIPPED entries collapsed or dropped (they live in git + their plan docs),
> and **two items closed as ALREADY BUILT** — the tracker had been carrying them as open for
> days. Both are recorded under "Closed in the 2026-07-24 sweep" at the bottom so the
> correction isn't lost.

---

> **FULL per-item verification against code, 2026-07-26** (the user: "you keep getting things
> that are stale… verify against code and check again"). Every open claim was checked against
> its named symbol, not spot-checked. **Five were stale and are corrected in place:** four of
> the six "remaining" Batch 5+6 items were already BUILT (B2-9 · B5-6 · B5-7 · B6-2, each now
> cited file:line); the refusal-probe leg list still named the removed `hh` leg; the `--fit`
> item's `lifecycle.py` citation had drifted onto a different method after this week's edits;
> its class-tune census was overtaken by the band work; and warm-start was closed as
> confirmed-by-daily-use. **Verified STILL TRUE (do not re-check):** the `uma` gap (zero refs
> in `hardware.py`), I2 cloud caching (no `cache_control` in the anthropic/gemini adapters),
> the 19 Linux-only `findChrome()` probe scripts (count exact), JV F1 (`JustVioce/server/
> justvoice/models.py:26` still imports `LLMRolesSettings`, gone from `llm_runner`), and the
> server-respawn citation (`lib.rs:377-391`, the port-eviction block). **Not verifiable from
> code, still open by nature:** B5-2 (a sweep), B5-4 (a visual call), the headless-smoke splash
> failure (needs a run — the box was busy benching), #256 spell-check (a bare issue reference
> with no scope anywhere — since scoped, 2026-07-26: `docs/plans/2026-07-26-writers-editor-gap-research.md`). Earlier record: `docs/plans/2026-07-25-session-handoff-and-verification-debt.md`.
> The standing rule stands: a tracker line is a claim, not evidence.

## Now / near-term (JustWrite)

### A. Shipped + pushed 2026-07-24/25 — your QC is the only thing outstanding

*(This header used to read "uncommitted, needs your QC then a commit"; everything below is now
committed and pushed — JW `b78337e`, runner `825b9af` + `40737fe`.)*

- **Boot splash → your illustration.** The artwork carries the whole design; only the loader is
  HTML, parked in the blank left parchment. Ships `splash-plate.jpg` (275 KB) + the lossless
  `splash-plate.source.png` + `assets/README.md`. Fit settled as `fill` (stretch): `contain`
  bands, `cover` cuts the baked lettering, `fill` never loses content — 2.6% distortion at your
  1920, ~14% at the 1440 default. Detail: plan doc §30-33.
- **Fonts self-hosted.** 16 `@fontsource` families + `src/renderer/src/fonts.css`; the
  render-blocking Google `<link>` and both preconnects are gone. Verified on the production
  build: 0 external requests, 16/16 families render. **`vite.config.js` changed — a fresh
  `npm run dev` is required.** §21, §24.
- **Boot 4.1 s → 2.3 s.** Cloud SDK imports deferred behind one shared `lazy_module()` proxy
  (openai +586 ms · anthropic +584 ms · gemini +918 ms were loading at every launch). Plus the
  earlier lazy-httpx fix. Suite on YOUR venv: 701 passed, 1 known lspci failure. §23, §26, §28.
- **Downloader rate-limit fix** — the StyleTune 429, root-caused: request-count discipline, a
  shared 429/503 gate honouring HF's `RateLimit`/`Retry-After`, the Range probe no longer
  silently loses resume, and `HF_TOKEN` support. 61/61 + ruff. §20.
- **Model Catalog layout** — top-aligned cells, proportional column shares, no magic px. Verified
  0 overflow at 1000/1440/1920. §22, §25, §27, §29.
- ✅ **ChatPanel buttons** — Update/Rebuild back to outline, ✕ de-coloured. QC'd good
  2026-07-25 (your word — the ghost ✕ stands). The Pricing + engine-binaries formgrid
  tables got the same "good", closing the audit's last render check.

### B. Open — needs your go

- ✅ **"PC class config" — the rename + the every-model class visibility — SHIPPED 2026-07-26,
  LOOK PASS CLOSED 2026-07-27** (your word: *"both ui are ok"* — the PC-class-configs modal and
  the QuickSetup wizard, the two surfaces the headless smoke cannot reach). Originally committed
  as runner `8bb7d22` + JW `854e0f9`; the follow-on look pass that closed it is runner `6c5179e`
  + `4a19ee3` and JW `af1d639` + `acb42f1` — "This PC" says the machine rather than its class
  band, Dense/MoE named wherever a model is, sentence-case tags, the add-config picker's
  membership filter removed (it made every hand-added model unconfigurable, since `min_ram_mb`
  never auto-filled — **that blank floor is now filled too, 2026-07-27**: the Add form pre-fills
  Min RAM from the GGUF read via `est_ram_mb_from_bytes` (file size + 4 GB, snapped to a real RAM
  rung), so a hand-added model belongs to a PC class at all; rule, its 8/10 calibration against the
  seeded rows, the two named misses, and the GLM 64-vs-96 GB question left open for you are in §25
  addendum 9 — whose new Fit-estimate label wording awaits your veto), the fabricated VRAM range
  labels deleted, and five `/hardware` fetches
  collapsed into one `useHardware()` singleton that fixed three call sites reading the wrong GPU.
  Full record: `docs/plans/2026-07-22-igpu-research-and-cpu-band-recovery.md` §25 + addenda 1-9.
  Resolves the long-open question
  of whether the "Hardware/model class default" chip wording stays: it does not — you ruled the
  rename on 2026-07-26 ("we keep getting it wrong"), which supersedes your own QC-19 anchor from
  2026-07-08. Copy/display only, no schema/server/wire change: the library, badge, both modal
  titles, the Tune grid heading and every "class config/default" shorthand now say **PC class
  config**; each chat catalog row STATES its floors (*"5.6 GB · needs ~11 GB VRAM + 14 GB RAM"*)
  so the list answers "what runs this?" without a hover; the Fit hover says "Estimated" and, when
  untuned, "not yet tested on your PC class"; and the class panel now lists EVERY chat model,
  the untested ones bare ("no switches") behind one collapsed line with an Add switches button.
  Twelve kit files + `docs/models.md`; Biome 0, JW vitest 458/50 green, `build:vite` green,
  runner pytest 667 passed with only the documented Windows lspci known-bad. Full record:
  `docs/plans/2026-07-22-igpu-research-and-cpu-band-recovery.md` §24 — including two of the plan's
  own doc claims that proved FALSE and were deliberately not acted on (`ARCHITECTURE.md:198`
  "Model class defaults" is the model-FAMILY thinking table, not a PC-class section; there is no
  TASKS item #214), each needing a call.
- ~~**Migrate the six hand-rolled kit tables to `UiTable` (TanStack).**~~ **DONE 2026-07-24,
  CONFIRMED GOOD ON YOUR BOX 2026-07-25** ("the whole table sweep all good") — shipped as runner
  `40737fe`. The your-box look check this needed is now closed. It shipped as THREE migrations,
  not six — reading all six showed they are two different things:
  - *Real data tables → migrated.* `LuMeasureHistory`, `LuModelCatalog`, and the two usage
    breakdowns in `AiModelsArea` (which were the same five-column table written out twice, now
    one shared `usageColumns()` config). The catalog keeps its own ORDERING — it groups into
    sections and sorts within each, which a row-model sort would flatten — so it mounts with
    TanStack's `manualSorting` and owns only the order; the table owns the header, the sort
    state and the caret.
  - *Editable form grids → NOT migrated, deliberately.* `PricingEditor`, `LuRunnerBinaries`:
    every cell is an input, each row has its own Save, and a trailing row ADDS an entry. No
    sort, no filter, no pagination, a handful of rows. Routing a form through a headless
    data-table library buys indirection and costs the inline add-row. What they actually needed
    was to stop looking different from each other, so they now share the new `.ui-formgrid`
    class in `common/styles.css` — same header treatment and rhythm as `.ui-table`, none of the
    machinery. `LuClassTunes` was left alone entirely: a headerless sub-list nested per hardware
    class, using top-borders and top-aligned cells, sharing nothing but the `<table>` element.

  `UiTable` grew five additive options, every one defaulting to today's behaviour so no existing
  table moved: `full-width-row` (a predicate that may return a CLASS — the catalog's section
  bands and its doesn't-fit divider), `manual-sorting` + `@update:sort`, `disable-sort-removal`,
  a functional `data-key` (one list mixing records with sentinels), and three opt-in look classes
  `ui-table-fixed` / `ui-table-sticky` / `ui-table-top`. Those three are what fixed the catalog:
  **shares, not content demands**, so it can never outgrow its panel. Two latent bugs surfaced on
  the way — `tableColumns` silently dropped `meta`, so `meta.headerClass` never reached a header;
  and a `sortable` column with no `accessorKey` renders as a DEAD header, because TanStack's
  `getCanSort()` is `enableSorting && accessorFn`. Both fixed, the second documented in the API
  comment.

  Verified by RENDERING, not by reading CSS (this grid broke three times on 2026-07-24):
  a scratchpad harness mounts the real components against stubbed endpoints and measures —
  `table-layout: fixed`, sticky header, top-aligned cells, table 1100px inside a 1100px panel,
  **zero clipped cells**, section + divider rows spanning all 7 columns, six live sort headers
  with Actions correctly dead, clicking Bench re-sorts, no JS errors. Usage tables likewise, with
  their original calls-descending order preserved. Gates: `build:vite` ✓, 429 unit tests ✓,
  headless smoke unchanged against a stashed baseline (its 5 failures are the empty isolated data
  dir, not this change).
- **Boot — MEASURED 2026-07-25, and the two "cheap items" turned out not to be worth much.**
  Numbers first, on your venv, warm (i.e. every launch after the very first):

  | pre-listen step | warm cost |
  |---|---|
  | `import justwrite_server.app` | **895 ms** |
  | `create_app` (init_db + routers) | 43 ms |
  | `seed_workspace` | **36 ms** |

  So *"serve `/health` before `seed_workspace()`"* — the item as approved — buys **36 ms of a
  ~975 ms pre-listen window**. **Recommend DROPPING it.** The window is dominated by importing
  FastAPI (331 ms) + SQLAlchemy (257 ms) + `llm_runner` (122 ms), which must all load before any
  HTTP can be served at all, so unlike the cloud-SDK deferral (which won 2.1 s) there is no lazy
  trick here — you cannot defer the web framework in a web app. The 1,168 ms `create_all` DDL in
  the profile is FIRST-RUN ONLY; on an existing DB it collapses into that 43 ms.
  *(Reversal: re-measure with the snippet in the 2026-07-25 session — a future SQLAlchemy or
  FastAPI version could shift these.)*
- ✅ **Parallelise the two boot fetches — SHIPPED.** `main.js` now runs `bootProviders()` and
  `bootRouting()` under one `Promise.all`. Verified independent at `providerBackend.js:17-39` /
  `routingBackend.js:14-37`: each writes only its own module-local cache and neither reads the
  other's, so the "after bootProviders" in the docstring meant "before mount", not a data
  dependency. Honest value: **~4 ms** on the happy path (each GET is 3-4 ms warm). The real win is
  the FAILURE path — both retry 3× with 700 ms backoff to survive a cold boot racing the server's
  seeding, so a server up-but-not-yet-answering cost 2 × 2.8 s sequentially and now costs 2.8 s
  once, overlapped. That also closes the "latent 2.8 s retry trap" line this entry used to carry.
- **The only real remaining boot lever is server REUSE** — the app kills + respawns the server
  every launch (`lib.rs:377-391`), paying that ~975 ms import plus uvicorn startup each time.
  **You vetoed it** ("i am affraid of a server running when it shouldnt") and that veto stands;
  noting it only so the file stops implying cheaper alternatives exist. They were measured; they
  don't.
- **Hardware classes + catalog rows — E4B/E2B rows + the integrated-16 class SHIPPED
  2026-07-25** (runner; header facts generated by `refresh-seed-facts.py` — seed == file).
  Deliberate divergence, flagged: both rows carry their tier-C drafter RECORDED but
  **`mtp: False`** — the only available heads are third-party (E2B: Radamanthys11, the same
  publisher/naming as StyleTune's fatal drafter; E4B: AtomicChat) and neither has ever been
  loaded against these weights. Still open, in order:
  - ✅ **(E4B, igpu-mem16) class tune — SEEDED 2026-07-25** (runner `f6428e3`): the laptop's
    kit run had already happened — its files sat on that machine (`E:\Dev\Web\test`), now
    preserved at `bench/results/laptop-iris-xe-16gb/speed-kit-2026-07-24/`. ngl 99 from
    E4B's own 9.8 tok/s quick screen (12B's probe is EMPTY on that box — the E4B pick
    confirmed); fa off + ub 512 from the box's own matrix (fa-off wins pp8192 53.5 vs 40.2;
    ub 2048 collapses depth to 22.7). A 16 GB integrated box now resolves to E4B + this
    config with zero setup.
  - **E-row drafters stay `mtp: False`** — settled rec: revisit only on a measured need
    (E4B's 9.8 tok/s is where a draft could plausibly help, but both heads are unverified
    third-party — the StyleTune class); any future laptop session adds one `-md` load leg
    first. The row comment is the stop sign.
  - ✅ **The band-key ruling — BUILT 2026-07-25** (your "I never thought exact matches
    should be used" + "don't over-engineer"): the discrete class key now IS the band —
    VRAM down-snaps {4,6,8,12,16,24} after the jitter round (10/11 GB → the 8 band; a
    4090's 24 and a 5090's 32 are ONE 24+ band), discrete RAM down-snaps {16,32,64,128};
    exact-match lookup stays, no fallback machinery. Panel-typed classes band the same
    way and store key-consistent numbers. iGPU/unified keys + all seeded tunes unchanged;
    707 tests. Record: recovery doc §22.
  - ✅ **dGPU band seeds + the per-band survey — SHIPPED 2026-07-25** (Part 2 done same
    day; full record + candidate table: `docs/plans/2026-07-25-per-band-model-survey.md`).
    Eight band class rows + eight recommendations from carried, tested models: 12B on the
    12-band rungs and `vram16|ram16` (the flagship's ~24 GB RAM appetite excludes 16 GB-RAM
    boxes); the flagship on `vram16|ram32/64` (placement left to `--fit`) and `vram24|
    ram32/64` (ngl 99/ncmoe 0 — resident, estimator-grounded, sidesteps #24350). Suite 707.
    **CORRECTED same day (your ruling — availability ≠ recommendation):** the
    **`qwen3.6-27b` catalog row is SEEDED** (`unsloth/Qwen3.6-27B-MTP-GGUF` UD-Q4_K_XL,
    17.9 GB, mtp_builtin — the qwen35 shape; the plain repo was a generator-exposed trap
    that "borrowed" a 15 GB full model as a draft, caught before commit). 24 GB users now
    have the tier-native option to download; the band RECOMMENDATION stays with the
    flagship (the catalog's own rank-5 best writer, resident at 24) — one word flips it
    after any prose trial. **The last decision CLOSED by measurement same day
    ("jsut do it"): `vram8|ram16` → the 12B** — 39.1 tok/s at ngl 99 on the author's
    actual 8 GB card (nearly resident; E4B did 82.3 but the quality-first bar is ~13),
    evidence in `bench/results/desktop-rtx-2070s/speed-kit-2026-07-25/`. **The band arc
    is COMPLETE** — every dGPU band 8→24+, both iGPU classes, and the budget build
    resolve to a model + config; no open decisions remain from the survey.
- ✅ **Model download Cancel/Dismiss in the failed + "Getting ready" states — SHIPPED**
  (runner `825b9af`; sat here as open while the same file's section-A header named the sha as
  pushed — tracker staleness the 2026-07-25 audit caught. Verified: the server drops terminal
  rows, tests cover per-id and cancel-all, UI Dismiss is terminal-only). Your-box glance is
  all that's left.
- **Feed the engine's `uma: 0/1` flag into `mem_arch` — NEEDS A DESIGN CALL, not a build**
  (investigated 2026-07-26, deliberately NOT built blind). The gap is real and narrow: a
  unified-memory NVIDIA box (DGX Spark) has the CUDA runtime, so `mem_arch` classifies it
  "discrete" — its own docstring names this as the known fall-through. The clean signal is
  the engine's `uma` flag. **The blocker:** nothing in the runner asks the engine for device
  info — there is no `--list-devices` call anywhere (grepped), and detection's stated design
  is "platform + vendor, NO heavy deps". Reading `uma` means spawning the engine binary
  during hardware detection (or caching a probe), which is a real architecture change to a
  module built to avoid exactly that. Weighed against: it fixes hardware NOBODY here owns and
  cannot be verified by us. **Rec: leave it until a unified-NVIDIA box actually appears**, at
  which point the probe-and-cache design gets decided properly. The 'Use for this PC'
  hardware-class override already lets such a user correct it by hand today.
- ✅ **The catalog trim + embed re-survey — SHIPPED 2026-07-25** (your rulings, full record
  in the survey doc's closing sections): 35B MoE and E2B dropped; embeds reshaped 5 → 3
  (**4B default everywhere · 8B proven big-card · KaLM-Gemma3-12B as the 2026 contender**,
  header-verified `gemma-embedding` arch — you found its GGUF after my first survey missed
  it); all twelve seeded `notes` rewritten box-independent (they rendered as "Your notes"
  over MY bench numbers — your catch); the class-default chip now NAMES its class via
  `classKeyLabel`; and the wizard embed floor you asked me to fix was **already built**
  (#274, `modelPick.js:134-145`) — my "still open" claim was stale. Catalog: 8 chat + 3
  embeds. WATCHLIST: Harrier-27B (MIT, real, no GGUF yet); the KaLM trial fits your 32 GB
  card when it arrives.
- **THE WRITER'S-EDITOR FEATURE AUDIT — RESEARCH DONE + SAME-DAY CORRECTED 2026-07-26;
  EXECUTOR PLAN WRITTEN, NOT LAUNCHED — awaiting your go.** (Expanded from "#256
  spell-check" on your ruling.) Full findings in
  `docs/plans/2026-07-26-writers-editor-gap-research.md` — including its correction
  banner: **you caught that "name generator" was never a gap** (Brainstorm's default
  category IS character names — 7 categories with like-steering, BrainstormView.vue:18-65);
  the audit had skipped `server/justwrite_server/feature_catalog.py`, the canonical
  feature list, which also carries sensory/unstuck/characterProfile/characterVoice —
  future feature audits START there. The headline stands and got stronger: find/replace,
  comments, version history, focus/typewriter, goals ring, Brainstorm, and the 19-service
  analysis suite all exist; **no AI-side gap vs the Sudowrite/NovelCrafter class**. The
  surviving gaps, ranked: **1) spelling+grammar that knows the story bible** (Harper 2.4.0
  pinned, spike-gated), **2) thesaurus** (vendored public-domain Moby data + a Brainstorm
  deep-link — no new AI action), **3) prose highlights** (surface the
  styleMetrics/aiTellScanner catalogs as editor decorations), **4) session word target**
  (per-chapter deliberately not in v1), **5) dictation** (parked). **The decision-closed
  Opus plan for 3→2→1-spike→4 is `docs/plans/2026-07-26-editor-expansion-executor-plan.md`**
  — wait-gated on (a) no running bench and (b) i18n Phase 1a merged (it edits
  SettingsView). Launch = your word.
- **BRAINSTORM → POINT-OF-USE GENERATION (think-about, your idea 2026-07-26 — nothing
  scheduled).** Your words: "take brainstorm and move some features to where they relate
  to, such as characters creating a new character from description or creating a name, we
  do this across app, a brainstorm/character/location creation by description, fill in
  character background." Current-state evidence: Brainstorm results are clipboard-only
  (`useItem`, BrainstormView.vue:165) — nothing flows into entities; `characterProfile`
  already drafts background/motivation/arc **from scenes** (feature_catalog.py) but there
  is no create-from-DESCRIPTION path on any entity page. The think-through (a design pass,
  before any build): which generation affordances live ON the Characters/Locations/Objects
  pages (generate name · create from description · fill background), what Brainstorm keeps
  as the freeform hub, and whether the existing brainstorm/characterProfile prompts are
  reused as-is (they should be — one source). Related: the thesaurus popover's "More
  alternatives in Brainstorm →" deep-link (executor plan STEP 2) is the first instance of
  the pattern pointing the OTHER way.

### B9. Unauthorized changes — the 2026-07-26 finding

- ✅ **Sidebar chapter-click REVERTED to the overview 2026-07-26, on your ruling.** You
  reported that clicking a chapter heading opened the last-viewed scene instead of the scene
  list. It was deliberate — `2cda8c0` (2026-07-19) special-cased chapters in
  `Sidebar.vue clickChild` to call `nav.openChapter()` — but **it was not authorized**. That
  commit was approved for the HOME page only (consolidating its duplicate "Today"/"Resume"
  doors); the sidebar was changed alongside it without being asked. Your words: *"all i
  authorized for change was home page… that defeats the point of the scene list when you
  click chapter"*. The handler is now byte-identical to `2cda8c0^` (verified by diff, not
  retyped). Home keeps the scene-first behaviour — `HomeView`/`HomeShelfView` call
  `useWritingNav` directly, so the authorized half is intact. Build clean, 439 tests.
- ⚠ **THE WIDER AUDIT — 77 user-visible changes in the week, authorship unresolved.** You
  asked how much else was unauthorized. Two things were learned, both worth keeping:
  1. **"The commit message mentions the user" is NOT evidence of authorization.** A
     classifier scoring commits on that signal was calibrated against `2cda8c0` — the one
     confirmed-unauthorized commit — and PASSED it, because the message discusses the user
     while doing something never asked for. Any count built that way is meaningless; none is
     quoted here for that reason.
  2. **`git log --since` silently undercounts.** It walks by committer date and prunes a
     parent chain once it goes older, so commits from a later-merged branch vanish. Measured:
     125 JW commits with `--since` vs 165 filtering the full log by date — and the 40 it hid
     included `2cda8c0` itself. Enumerate with the full log + a date filter.
  Corrected totals since 2026-07-19: **202 commits, 77 of them user-visible** — AI
  providers/models 29 · other 26 · chat 7 · startup 4 · chapters 3 · shared primitives 3 ·
  settings 2 · **sidebar/navigation 2** · other controls 1. The per-commit list is a
  scratchpad artifact (`visible-changes.txt`); regenerate with the script rather than trusting
  a stale copy. **Only you can say which you approved — this is a list to review, not a
  verdict.** The other navigation commit of that same day, `ea543ae` ("panels dismiss on
  Esc/outside-click + nav toggle; no backdrop dim"), is the obvious next one to look at.
  **A commit-gate hook was proposed and REJECTED by you** — "gate hooks have huge problems
  too, we keep running into that" (this session alone: the subagent-bypass regression and the
  classifier blocking edits). The remedy is asking before UI-behaviour changes, not machinery.

### B10. EntityIndex — the extraction, and the Chapters index it unblocks

Your ruling 2026-07-26: *"why not standardize it like all the others… they all have a grid
along with the nav, why shouldn't chapters be the same"* → then *"extract first"*.

**The finding.** Seven views (Characters · Locations · Objects · Groups · Notes · Strands ·
Worldbuilding) each carried a PRIVATE copy of the same index block — search/clear/count
toolbar + facet chips + `UiTable`. Not merely similar: normalise the entity noun away and
LocationsView's block vs ObjectsView's is **157 vs 155 lines, 30 diff lines, all of it prose
and two comments**. `jscpd` passes, so the duplication gate never saw it. Chapters had **no
index at all** — not by design: `selectedId` falls back twice
(`ChaptersView.vue:115`, `props.id || ui.selections.chapters || allChapters[0]?.id`), so the
no-selection state can never render. That also makes `Sidebar.vue:236`'s "this is a no-op"
comment false for every section except chapters.

**Shipped (phase 1).** `components/EntityIndex.vue` — one shell; facets are DECLARATIVE data
(`{key, label, options, multi, match}`) rather than a slot, because the facet rows were the
largest duplicated block and a slot would have saved almost nothing. Columns and per-cell
rendering pass straight through to `UiTable`. LocationsView is the first consumer:
**359 → 283 lines**, zero behaviour change. Styles needed no move — the `.entity-*` family is
already global (`styles.css:1051+`), verified before extracting.

Three defects were caught in the design re-look, before any consumer used it: a crash when a
facet has no `options` yet; a duplicate `#empty` slot (the wrapper rendered it AND forwarded
it); and — the one that mattered — the dynamic slot forwarding, which cannot be verified by
reading. **`EntityIndex.test.js` mounts it** (8 tests): if forwarding breaks, every consumer's
custom cells render BLANK while build, biome and the smoke all stay green, because an empty
cell is not an error. Verified to bite: deleting the forwarding fails exactly that test.
It also pins a bug the copies would have had — a falsy selection check treats a legitimate
`false` facet value (Characters' "Main") as "All".

**Phase 2 — ALL SEVEN VIEWS NOW RUN ON IT.** Locations 359→283 · Objects 357→281 · Groups
362→316 · Notes 459→406 · Strands 647→600 · Worldbuilding 372→290 · Characters 982→903.
**~700 lines of duplicated markup and filter logic deleted.** Each view now declares its
facets as data and keeps only its columns and cell rendering. Two views needed real thought
rather than a copy: **Strands** bound `tableRows` (a decorated projection of `filteredRows`) —
now it decorates the RAW rows, since filtering moved inside the component; identical output,
and the per-row beat/scene counts are computed once per data change instead of per filter.
**Notes** stores ONE `tag` per row, not an array, so its multi-select facet tests equality
rather than array membership. Characters exercises the whole surface — five facet rows
including the boolean `main`.
**Phase 3 — CHAPTERS HAS AN INDEX. SHIPPED 2026-07-26.** `/chapters` with no id now renders
the grid (**# · Title · Part · Status · Scenes · Words**, facets Status + Part) instead of
silently falling into a chapter. The one-line cause is gone: `ch` is now
`props.id ? chapterById(props.id) : null`, like the other seven. **Sidebar and Home were not
touched** (your words) — `go("chapters")` already pushed `/chapters`, so the nav lands on the
list from the view's gate alone, and every chapter/scene row still routes as before. The
"No chapters" header title now only appears when the book genuinely has none.
The surface description moved to the index (`chapters.index.intro`), reworded so it names
controls that exist: **Edit** (with **List view** / **Card view**), **Outline**, **Read** —
the old sentence advertised a "Cards" VIEW MODE that never existed and never mentioned Edit.
Outline got its own short line, and its dead `introTerms.cards` key is deleted.
`useStatusDisplay()` was extracted rather than copied for the eighth time — the seven
existing copies are a drop-in swap whenever the audit sweep runs.

**VERIFIED BY CLICKING, all green:** `HEADLESS SMOKE PASSED` (and `#/chapters` went
chars=945 → 1356, the index rendering instead of a chapter), plus an 18-check probe —
Chapters stays on the index, 4 rows, the six columns exactly, the description present and
naming the real controls, the phantom "Cards" mode gone, Status+Part facets, a Part chip
filtering 4→2, a row click opening `#/chapters/ch1`, Outline showing its own line and NOT
duplicating the long one, and all seven other indexes still rendering rows
(characters 8 · locations 7 · objects 6 · groups 5 · notes 4 · strands 5 · worldbuilding 8).
0 JS errors. 458 unit tests, 0 missing keys, build clean.

**The rule to hold from here:** Outline and the index are distinct jobs — the grid FINDS and
SCANS, Outline RESTRUCTURES (rename in place, move parts, add/delete, scenes nested). So the
index must never nest scenes, and Outline must never grow filters. If either drifts we will
have built two of the same page, which is the failure this whole item existed to undo.

⚠ **A whole-repo "extraction vs copies" audit is OWED** — your call, 2026-07-26: *"remember
this extraction vs copies example, this is the kind of refactoring audit we need to do at some
point."* jscpd catches literal copy-paste, not "should be one component, written slightly
differently seven times", so the detector that worked here was: normalise the domain noun out
of two sibling files and diff. Other candidates: the detail-mode blocks in those same seven
views, the ~20 probe scripts with private `findChrome()` copies, per-view empty states.

### B11. The model catalog's hardware story — SETTLED + SHIPPED 2026-07-26 (the day-long design)

**The user's model, which ended the churn:** *"you have a model, it has a recommended
hardware class you would want to run it on, it is either tuned or not"* + *"all models have
class, all of them — that is the point"* + *"for the models we ship we put them in hardware
class so the user at least has an idea of what hardware they need."* Membership (which
classes a model RUNS on) and tuning (has switches) are two separate axes; the old surfaces
tangled them, which is what produced both the badge the user misread as the model's
hardware AND the library listing a 70B under "Integrated GPU · 32 GB" as merely "not tested".

**Shipped (runner):**
1. **`modelBelongsToClass` / `memberClassesOf`** (`ui/src/classTunes.js`; `shortClassLabel`
   shipped with these and was DELETED 2026-07-27 — addendum 6 orphaned it when the row swapped
   its class list for plain-words floors, and the membership test now asserts `classKey`)
   — THE membership rule, one source for both surfaces. Thresholds are the FIT ENGINE's,
   not new ones: RAM hard gate (`fit.py:101`), VRAM ≤1.5× "tight" slack (`fit.py:109`),
   top VRAM band open-ended ("24 GB and above" — so a 48 GB card lands in vram24 and the
   70B belongs exactly to `24|64`), integrated = one shared pool.
2. **Catalog row** (`LuModelCatalog.vue`): two labelled lines under the id —
   `Size on disk · 13.3 GB` and `Runs on: 8|32 · 12|32 · … · iGPU 32` (the user's own class
   bold; hover = full class names + the raw floors, which left the row). Unknown floors →
   an honest "Runs on: unknown — edit the model to set its requirements". Embeds keep their
   placement story, no classes, no tune tag. The five-state tune-tag family is UNCHANGED.
3. **PC-class-configs library** (`LuClassTunes.vue`): each class lists MEMBERS only —
   `unconfiguredMembersByClass` (renamed from `untestedByClass`, wording now "N more models
   in this class — no switches yet"); the add-config picker offers members only.

**Verified:** the membership truth table is PINNED by `classMembership.test.js` (14 tests —
the 9-model × 12-class table the user approved, computed from their own DB + floors; the
70B-only-in-24|64 exhibit has its own named test). A 39-check render probe: every row's
Runs-on list exact, tags unchanged, This-PC line once, embeds bare, the library's 12
member-counts exactly (1·3·1·4·5·1·6·7·6·8·1·6), 70B in ONE section, old wording gone,
0 JS errors. `HEADLESS SMOKE PASSED`. 472 unit tests (+14). Runner suite untouched (no
server change — membership is client-side over existing data).

**Left alone on purpose:** tune-tag wording (user: "dont change tuned"), Fit chip,
Recommended tag, This PC header, the class-panel editors. **User-added models:** classes
compute from whatever floors/estimates exist; blank → "unknown", never a guess.

### C. Waiting on you to run

- ✅ **The full-catalog test campaign — RULED + EXECUTED 2026-07-26** (your "your rec on bench
  judging" = §34 recommendations 1-3 adopted as written; execution record: bench doc **§35**).
  ① **31B REMOVED** — row + its stale-draft heal out of `llm_runner/llm/seed.py`, three legs out
  of `bench/harness/configs/gpu.json` (18→15), three refs updated in `tests/test_identity.py`.
  Runner suite 708 passed (the one failure is the known-on-Windows lspci test); harness units 51
  passed. **⚠ Your box still has the row:** the model-catalog seeder is insert/fill-only and does
  NOT prune, so this affects FRESH installs only — delete it in the catalog UI if you want it gone
  locally. ② **70B/GLM KEPT** — no edit; they stay the named availability-vs-recommendation
  precedent. ③ the stale pointer is corrected below. Still open: the venv re-exec oddity; the
  LICENCE flag (Gemma-ToU propagation — only if we ever bundle weights). Historical detail of the
  run itself:
- **The full-catalog test campaign — RUN + JUDGED 2026-07-26.** The
  battery ran on your box as four resume runs (bible · StyleTune · EZ · 31B; final run
  `2026-07-26_10-13-07-gpu`: `BENCH DONE — 3 leg(s), 0 failed feature run(s)`, 18/18 ok,
  engine b10107). Full judging record: the bench doc §34
  (`docs/plans/2026-07-20-mtp-verify-think-ab-bench.md`). The `--autostart` drive.js check
  is CLOSED — the "nothing answering" branch verifiably fired (process tree: the harness
  owns the server cmd, same-second spawn; `findPython` picked the venv). **The three
  recommendations, all now RULED (see the ✅ above):** ① **31B** — REMOVE (quality
  TIES the flagship on both §7 keys across all six hq captures, prose edge small and
  `continue`-only; the 24 GB band already holds flagship + the 27B); ② **70B/GLM** —
  KEEP (your availability-vs-recommendation ruling names these rows as its precedent; no
  owned box can test them); ③ the old "survey's two open decisions" pointer here was STALE
  — both closed 2026-07-25 (27B seeded · 8|16 band → 12B by measurement); what is genuinely
  open is two WATCHES, not decisions: the LICENCE flag (Gemma-ToU propagation — matters only
  if we bundle) + the watchlist (Harrier-27B GGUF · the KaLM trial on your 32 GB card). Also flagged (§34): the
  autostarted venv python re-exec'd into a `F:\Python312` child that owned the
  llama-servers — ran green, cause unverified, sits on the "which Python runs" trap.
- ✅ **QuickSetup: the EMBEDDING dropdown is never set — FIXED 2026-07-26 on your go**
  (runner: `estVramById` added to `useCatalogMeta.js`'s return list; JW: the contract test
  below). The fix is the one line the diagnosis named. What landed WITH it, because the
  defect class is the real hazard: **`useCatalogMeta.contract.test.js`** scans every kit
  consumer of `useCatalogMeta()` — both `const { … } =` destructures and `const meta = …` +
  `meta.x` member access — and asserts each name it takes is actually on the returned
  object. Nothing else could catch this: destructuring an absent key is legal JS
  (`undefined`, not an error), Biome checks no cross-module shapes, `build:vite` compiles
  the SFC without resolving the identifier, and the smoke never opens the wizard — and even
  if it did, the throw is CAUGHT and rendered as a banner, so "zero JS errors" still passes.
  Verified to BITE: reverting the one-liner failed 2 of 3 assertions and named the culprit
  (`estVramById (wanted by views/QuickSetup.vue)`), then restored byte-identically. Gates:
  439 unit tests (+3), build clean. **Not run: the wizard itself** — that needs the GUI, so
  reopen the Quick Setup modal on your box and confirm EMBEDDING is populated and the banner
  is gone. Original diagnosis, kept for the record:
  Your screenshot after the workspace reset shows the banner *"Couldn't
  finish reading your setup — Cannot read properties of undefined (reading 'value')"* with
  EMBEDDING blank. Exact cause, verified at file:line, not inferred:
  `useCatalogMeta()`'s **returned object omits `estVramById`**
  (`ui/src/composables/useCatalogMeta.js:105` returns `…, minVramById, tierById, refresh` —
  while `estVramById` IS defined and module-exported at `:80`). So
  `QuickSetup.vue:77`'s destructure binds it to `undefined`, and `wizardLeftoverMb()`
  (`QuickSetup.vue:130`) evaluates `estVramById.value[…]` → the exact TypeError above. It is
  thrown from `bestEmbedId()` inside `openWizard`'s reconcile, i.e. AFTER the chat default
  is chosen and exactly WHERE the embed default would be filled — which is why the chat
  model is picked, the embed is not, and one banner explains both.
  **Fix:** add `estVramById` to the return list at `useCatalogMeta.js:105`. QuickSetup is its
  only consumer, so nothing else changes.
  **Note this was INVISIBLE until 2026-07-26** — the `finally { step.value = "confirm" }`
  guard shipped that day (runner `e24f4c7`) is what turned a permanently-spinning "Probing
  your hardware…" into a readable error. The stall fix did not cause this bug; it exposed it.
  (Regression cover — a unit assertion that every identifier a consumer destructures from
  `useCatalogMeta()` is actually returned — SHIPPED with the fix; see the ✅ above.)
- ✅ **Headless smoke splash-aware wait — FIXED 2026-07-26.** The blind `sleep(1500)` raced
  boot, and since the splash landed it could measure the overlay instead of the app. Now
  `waitForBoot()` resolves on a real settled state — the shell (`.app`) or onboarding
  (`.ob-stage`, what the smoke's empty isolated data dir actually produces) — takes the
  splash's own "Continue without waiting" escape if it is up, and reports which state it
  reached (or TIMED OUT) instead of hiding a stall. The shell-structure guard now SKIPS when
  there is no project open, which is what produced the known-false failure every run.
  **RUN + GREEN 2026-07-26** (see the `npm run smoke` item above): boot resolves on `shell`,
  and with a project seeded the structure guard runs for real rather than skipping.
- ✅ **UNCENSORED A/B — CLOSED 2026-07-25: EZForever kept, HauhauCS removed.** Your "test
  both, keep the winner" ruling, settled on the deflection evidence (run
  `2026-07-25_12-12-36-gpu`, committed: on the violence probe HauhauCS cut the ROPE exactly
  like stock while EZForever wrote the act; none of the three ever refused — the failure mode
  is deflection, invisible to any text metric) and closed out the same day on your "keep ez
  remove hauhaucs": the row + its dead heal entry left the seed, the ez row shed "— A/B" and
  took rank 13 (runner `70124bf`), and the four hh legs left `gpu.json`. The verdict + full
  grounds live in the ez row's seed comment; the probe quotes live in the committed run dir +
  the DO-NOT-ADD note above `looksRefused`.
- **The refusal probe itself** (`services/benchHook.js`, legs `gpu-refusal-{stock,ez}` — the `hh`
  leg left with its catalog row in the 2026-07-25 trim; verified 2026-07-26, zero hits in
  `gpu.json`) drives
  `continueFrom` — the same action the Continue button calls — over four manuscript stubs.
  Always run `gpu-refusal-stock` as the CONTROL; without it a no-refusal score means nothing.
  **`refused` is the only automatic call and it is not the interesting one** — every result says
  READ IT, because the failure that matters (substituting a safer scene) is invisible to any text
  metric. A keyword score was built and deleted the same day after being wrong three times out of
  three; the full reasoning is in the DO-NOT-ADD comment above `looksRefused`, worth reading
  before anyone tries again. The v1 violence stub was also rewritten — it left the victim able to
  talk, which stock used as an exit.
- ✅ **The `repo` leg field stays** (born unblocking the hh arm's llama-bench, which its cache
  ambiguity had silenced; the hh legs are gone now but the lever is general): it narrows
  candidate cache dirs BEFORE scoring, and a hint matching nothing FAILS rather than falling
  back to the unfiltered scan (that would bench wrong weights under the right name). Two
  tests pin it.
- ✅ **StyleTune V2 — SETTLED 2026-07-25: keep as a SECOND-TIER prose row, never the default.**
  Unblocked by turning MTP off in the catalog (your change), then benched clean: `load.ok: true`,
  12 runs, run `2026-07-25_13-46-12-gpu`.
  - **Prose: better than the flagship.** Richer concrete imagery on `writerAI.continue` (the
    workshop tools as "skeletal fingers", the bench "less like a place of honest labor and more
    like an altar" vs the baseline's more conventional close). This is what the row is FOR.
  - **Comprehension: no style-tax.** On hard Q1 it gets the central chain (token's note matches
    the lamp's) and cites excerpts properly; it caught ONE signal fewer than the baseline (the
    eleven-weeks/pays-double thread) and neither found the answer key's corroborating signs.
  - **Speed: materially slower, and structurally so.** chat 27.0s vs 12.7s · entitySweep 70.5s
    vs 39.4s · rewrite 15.8s vs 9.5s. Two independent causes, both measured:
    1. **Layer fit.** `runner/fit.py`'s own estimator, run against the two cached GGUFs at ctx
       32K on a 7,373 MB budget: baseline (UD-Q4_K_XL, 13.27 GB) fits **10/30 layers** on the
       GPU; StyleTune (Q4_K_M, 16.03 GB) fits **8/30**. Unsloth's UD dynamic quant is SMALLER
       than a standard Q4_K_M despite the "XL" name — that is the whole 20% file-size gap. No
       download was needed to learn this; the estimator reads cached headers.
    2. **No usable speculative decode.** Measured directly, same prompt/seed/`-ngl 8`/`--fit
       off`, differing only in `-md`: **10.77 tok/s with the MTP draft vs 10.56 without** — 2%,
       i.e. noise, where the baseline gets 66.9% acceptance from that same drafter file. An MTP
       head is trained against specific base weights; the finetune moved them, so the head loads
       fine and simply predicts wrong.
  - **Reversal:** a ~13 GB quant of StyleTune would buy back the layer-fit half (not the
    drafter half). Not downloaded — the estimator answered the question for free.
- **⚠ Upstream: `--fit` silently kills Gemma-4 MTP drafts** — [llama.cpp
  #24350](https://github.com/ggml-org/llama.cpp/issues/24350). Loading a `gemma4_mtp` draft under
  memory fitting fails with `Gemma4Assistant requires ctx_other to be set (this is normal during
  memory fitting)` → `[spec] failed to measure draft model memory: failed to create llama_context
  from model`. Reproduced on b10107 and **confirmed fixed by `--fit off`** (warning gone, both
  models load). Not our bug, but **our placement strategy walks into it**: `process.py:108-112` and
  `lifecycle.py:1863-1869` deliberately OMIT ngl/n_cpu_moe on untuned models so the engine's own
  `--fit` places tensors ("fit-by-omission"). *(Both citations re-verified 2026-07-26 — the
  lifecycle one had drifted onto the embed-placement method after this week's edits.)*
  **AUDITED 2026-07-25 — and my first reading of this was WRONG, corrected here.** I wrote that
  any untuned Gemma-4 row "may be silently running without" its MTP. The catalog said otherwise:
  at the time of that audit `model_tunes` was EMPTY (0 rows) and all 14 `class_tunes` rows
  belonged to `gemma-4-26b-a4b-qat`, so every other row was untuned — yet the untuned
  `…uncensored-ez` and `…uncensored` measured
  **60.5%** and **58.9%** draft acceptance. Untuned rows are NOT losing MTP. The real
  discriminator is WHICH drafter file: every row using its OWN repo's drafter works, `…ez` borrows
  unsloth's `mtp-…-Q4_0.gguf` and works, and only StyleTune's borrowed
  `Radamanthys11/…-it-assistant-Q8_0.gguf` was fatal. `--fit` is a real upstream bug and the
  `--fit off` cure is verified, but it is NOT what was breaking our catalog. *(That census is
  now DATED — re-counted 2026-07-26: the band work seeded 13 (model, class) pairs / 66 flag
  rows across FOUR models (flagship 6 · 12B 5 · StyleTune 1 · E4B 1). The conclusion stands;
  the "everything else is untuned" arithmetic behind it does not.)* **Not fixed here:**
  trading `--fit` away is a real VRAM/placement decision, and on StyleTune it would buy 2%;
  also worth re-testing on a build newer than b10107 ([#24795](https://github.com/ggml-org/llama.cpp/issues/24795)
  shows this family regressing and being fixed across builds).
- **Prose/style model survey 2026-07-25 — screened on numbers, only ONE candidate survives.**
  Constraint recorded: **GGUF/cross-platform only** (your ruling — no MLX/runtime-specific rows).
  The binding limit on 8 GB is FILE SIZE, since it sets the layer-fit above; the flagship wins by
  being an unusually small 13.27 GB.
  | candidate | verdict |
  |---|---|
  | **Goetia v1.3 (Naphula)** — `i1-IQ4_XS` 12.96 GB | **TESTED 2026-07-25 → REJECTED: broken chat template.** Fastest of all three on this box (fits **11/30** layers, more than the flagship's 10/30, at 16.3-16.4 tok/s vs StyleTune's 10.9-11.7) and the prose is good — but raw `/completion` leaks `<\|channel>thought` control tokens into the manuscript, and `/v1/chat/completions` returns an EMPTY message (the parser strips the channel markers and nothing survives). Both paths broken ⇒ unusable. A common `mergekit moe_della` artifact. The drafter does not transfer either (16.35 mean without vs 16.04 with). Not seeded — shipping a model that emits control tokens into a novelist's prose is not acceptable, and stripping them client-side would hide a broken template rather than fix it. |
  | SuperGemma4-26B-Uncensored v2 (Jiunsong) | **OUT** — Q4_K_M 16.8 GB, its own card wants 18–22 GB VRAM; "0/100 refusals / 90% faster" claims are X hype, not a card benchmark; claims MIT |
  | Animus V14.1-FFT (Darkhn) | **OUT for now** — safetensors only, no GGUF exists to test |
  | **NET RESULT** | **no new catalog row.** Flagship stays default; `…uncensored-ez` is the uncensored row; StyleTune is the prose specialist (second-tier). Every named candidate is now tested or excluded on stated grounds. |
  | `mlx-community/…-OptiQ-4bit` | **OUT** — MLX/Apple-only (breaks the cross-platform rule), 21.9 GB, and it is **our own `gemma-4-26B-A4B-it-qat` weights requantised**, not a new finetune |

  **Licence flag, not resolved:** Goetia claims apache-2.0 and SuperGemma claims MIT, but both are
  Gemma-4 derivatives and Google's Gemma Terms of Use propagate. Matters only if we BUNDLE rather
  than have users download. Your call, not mine.

## Research (each needs a research pass → plan → build, on its own go)

- **i18n SWEEP — 15 FILES TO ZERO, and the meter itself was miscounting 2026-07-30.**
  Lint **1430 → 1358 warnings, 69 → 54 files with warnings**. Every number here is measured,
  not projected.
  **First, the shape of what remains, which nobody had measured.** Of 1430 warnings, 1329 parse
  as single-line raw-text nodes, and they are not 1329 keys: **1154 are real copy collapsing to
  852 distinct strings**, so ~300 sites want an existing key rather than a new one. The heaviest
  repeats are `Done` ×14, `Cancel` ×14, `Retry` ×13, `Ask the book` ×10, `Regenerate` ×8 — all of
  which already have or deserve a `common.*` home. That is the real size of the job: **~850 keys,
  not 1430**, which confirms the "expect it to land below 1,430" caveat with a figure.
  **Two rule fixes, because the gate was counting things no language translates.**
  `ignorePattern` gained `\p{S}`: 23 warnings were glyph-only nodes — `× − ✕ ✓ ✦ ↑ ↓ ↵ ⏎ ⌘` —
  that the original `[\d\s\p{P}]` was plainly meant to cover but missed, Unicode filing them as
  Symbol rather than Punctuation. `ignoreNodes` gained `kbd`, joining the `code` precedent: a
  `<kbd>`'s content is a key name. The Settings shortcut table is the proof — every description
  beside a `<kbd>` was already a `$t()` call while the `<kbd>` was flagged, and only SOME rows
  were, because `⌘\` fell inside `ignorePattern` while `⌘F` escaped it on the strength of one
  Latin letter. Same element, same content class, opposite verdicts. 27 of the 72 warnings closed
  were these; they were never work.
  **15 files converted to zero:** MentionList, MentionRefList, ShortcutCheatsheet, TagEditor,
  StatusSelect, OnboardingShell, ChaptersView, AiView, App.vue, ImagesModal, TitleBar,
  WhatsNewModal, SettingsView, DateTimePicker, HelpView.
  **Reuse over minting, per the standing rule.** `Clear`/`Done` went to the existing
  `common.clear`/`common.done`; `Open in help drawer` appears in TWO modals so it became
  `common.openInHelpDrawer` rather than living twice; `Got it` and `Remove tag` joined `common`
  as generic. AiView's PaneHeader went to `panes.ai.*`, the home the other 13 panes already use,
  instead of a new namespace. New namespaces only where a surface had none and more is coming:
  `editor.mentions.*` (RichEditor's 55 warnings land here next), `shortcuts.*`, `whatsNew.*`,
  `boot.*`, `images.*`, `titleBar.*`, `dateTime.*`, `help.*`, `status.*`.
  **Three judgement calls worth knowing.** `welcome.brandMark` = `"J"` — a locale key for a logo
  initial looks odd until you notice `welcome.wordmark` = `"JustWrite"` right beside it, so the
  brand was already in the catalog. `settings.appearance.fontSpecimen` = `"Ag"` — a typography
  preview genuinely IS localizable, since a Cyrillic or CJK reader wants glyphs from their own
  script. Interpolations became keys with named placeholders rather than template literals:
  `images.saving` = `"Saving {n}…"`, `whatsNew.eyebrow` = `"Version {version}"`,
  `titleBar.modeTooltip` = `"Mode · {mode}"` — the last two were not even flagged (the rule does
  not read template literals), and leaving them would have shipped English inside a translated UI.
  **Verified:** `i18n:lint` per file after every conversion, `i18n:report` shows **0 of the new
  keys missing and 0 unused**, 466 unit tests, clean `build:vite`, and `en.json` parses.
  **⚠ A FLAKY TEST observed, NOT fixed, and NOT mine — yours to call.**
  `projectHistory.test.js > caps each domain's history independently at the limit` failed **once
  in four full-suite runs of identical code**, and passed on clean HEAD, in isolation, and on two
  further runs with these changes. The failing run coincided with the heaviest phase of an Ollama
  15 GB-model inference saturating the machine. I could not explain the mechanism: the test is a
  synchronous 1005-iteration loop asserting `HISTORY_LIMIT` 1000, and `addStatusDef` is **not** in
  `COALESCED_ACTIONS`, so the 600 ms `COALESCE_WINDOW_MS` should not reach it. Recording it rather
  than guessing — my changes touch templates, `en.json` and the eslint config only, none of which
  `project.js` imports.
  **Next, by leverage:** the ~300 duplicate sites are the cheapest real progress (existing keys,
  no minting). The prose-around-interpolation cases — TimelineView is the clearest — need
  `<i18n-t>` with named slots per the `chapters.index.intro` pattern, NOT fragments. Worst files
  remain AnalysisView 81, ImportView 57, HomeView 56, RichEditor 55.

- **i18n PHASE 1a — ALL 3 VIEWS SHIPPED 2026-07-26** (tooling `7dba767` · SettingsView
  `078ed88` · ChaptersView `f198229` · CharactersView + the smoke-seeding fix, this commit).
  Tooling: `i18n:lint` (@intlify no-raw-text), `i18n:report` (vue-i18n-extract),
  `i18n:pseudo` (the maintained `pseudo-localization` package wrapped so `{…}`/`<…>`
  survive — pinned by `scripts/i18n-pseudo.test.js`). Baselines: lint 1879 warnings / 70
  files; report 0 missing. SettingsView 190→8 leftover warnings, ChaptersView 112→1,
  **CharactersView 83→0**. The catalog is now 825 leaves (+200 for `characters.*`).
  CharactersView's shape is worth reusing for the other entity views: the eight v3
  descriptor arrays stay PURE DATA (`{group, k, type}`) and the template resolves copy with
  a computed key — ``$t(`characters.fields.${f.group}.${f.k}.label`)`` — keyed by the data
  model, so nothing freezes at import and there is no per-array `computed()` to maintain.
  `LIFE_STATUS_OPTIONS` + `columns` DID become `computed()` (their labels are consumed as
  props, not rendered). Two shared keys minted for every entity list: `common.all`,
  `common.countOf`. Dead code removed: `LIFE_STATUS_LABEL` (declared, never read).
  **New gate — `src/renderer/src/i18n/characterFieldKeys.test.js`:** the dynamic key form is
  invisible to every other check (vue-i18n-extract sees no literal; `missingWarn:false`
  means a typo renders an EMPTY STRING with no console error, so even the smoke passes), so
  this test parses the view's descriptor arrays and asserts a non-blank label+hint for each,
  plus the reverse (no orphan catalog entry). Verified to BITE: typo'ing one key failed 2 of
  3 assertions, then restored byte-identically. Plan + all seven rulings:
  `docs/plans/2026-07-26-i18n-phase1-coverage-plan.md`. **Your veto is still open on the
  key-naming style and on the first `|` plural pipes now in `en.json`.**
- ✅ **THE HEADLESS SMOKE'S COVERAGE HOLE — FIXED 2026-07-26** (your ruling: "why arent you
  using the app directory with its models and setup with its data db? just call the api to
  load the tutorial project sam as me clicking it"). It ran against an EMPTY isolated data
  dir, and with no project the app renders the WELCOME screen for every plain hash route —
  which is why nearly every route reported the same `chars=1024`. Its per-route `errors=0`
  therefore proved "no JS error on the welcome screen", NOT that the route's view mounted.
  Two halves, both shipped:
  1. **The seed.** `headless-smoke.js` now calls `POST /v1/projects/demo` +
     `PATCH /v1/settings {activeProjectId}` before the sweep — precisely what clicking "Try
     the tutorial project" does (`projectApi.js:106` → `project.js:2260` → `settings.js:42`);
     the registry needs no write, being derived from the projects table. A seed failure is a
     FAILURE, not a warning, and reaching onboarding WITH a seeded project now fails the boot
     line — otherwise the blind spot silently returns. `JW_SEED=0` sweeps onboarding on purpose.
  2. **Real data.** New `npm run smoke` (`scripts/smoke.js`) boots server + vite + the sweep
     and tears them down. Its data dir is a `sqlite3.backup()` SNAPSHOT of the live root
     (found via the running server's `/v1/health.dataDir`, else the `dataroot.txt` pointer /
     `<exe_dir>/data` per `lib.rs:298`), so the gate sees the real providers, catalog,
     presets and settings — while the smoke's own writes (`activeProjectId`, kv, autosave)
     can never land in the live workspace, and a mid-write source can't tear.
  **CONSTRAINT — vite must be 1420:** `services/serverApi.js:17` declares `devPorts:["1420"]`
  and the shared resolver returns the PAGE ORIGIN for any other port, so on :1421 the
  renderer would send its API calls to the vite server. `npm run smoke` therefore refuses to
  start when 1420 is held (probed on `localhost`, `127.0.0.1` AND `[::1]` — `npm run dev`
  binds ::1 only on this box, so a v4-only probe reports it free).
  **RUN 2026-07-26 the moment your app freed the port — `HEADLESS SMOKE PASSED`, the first
  fully green run.** The proof the hole is closed is in the numbers: boot now reports
  `shell` (not onboarding), the shell-structure guard actually RUNS instead of skipping, and
  every route reports a DISTINCT char count — 945 · 1118 · 2016 · 1323 · 1172 · 1072 · 1968 ·
  813 · 1124 · 3044 … where the empty-dir run reported the same ~1024 over and over. That
  also served as the runtime gate CharactersView was owed: `#/characters chars=2016 errors=0`
  against the real catalog.
- ✅ **The smoke's `provider-form` red was a STALE ASSERTION, not a defect — FIXED 2026-07-26.**
  It had been failing on `search=false`, which is ONE boolean over TWO selectors, so it never
  said which half. Probed: `.lu-mcat-bar input` is present and correct; `.lu-th-btn` matches
  **zero** elements — and greps to zero hits in the whole kit. The class belonged to the
  hand-rolled click-to-sort buttons of 2026-07-22 and died on 2026-07-24 when the grid moved
  to the shared `UiTable` (`LuModelCatalog.vue:1005-1012`), which owns the header markup and
  renders `<th class="is-sortable">`. So the gate had been red for two days for a reason that
  was not a bug — the real damage being that a gate which cries wolf gets ignored. Selector
  updated to `.lu-mgrid th.is-sortable`; the line is green and still asserts the same thing.
- ✅ **NO HTML IN MESSAGES — your ruling 2026-07-26 ("i18n-t with slots, no html in
  messages"), executed in full.** The smoke warned about two messages; the catalog actually
  had **eleven** (the other nine sit behind Appearance/Backups tabs the sweep never clicked,
  so they never warned). All eleven converted to `<i18n-t keypath tag scope="global">` with
  named slots; **zero catalog values contain a tag now**, and there is no `v-html="$t(…)"`
  left in the renderer.
  **Reuse over minting** — each emphasised term points at the key that already names that
  thing: `settings.sections.*` (so the Settings intro can never drift from its own tab
  strip), `chapters.modes.*`, `nav.*`, `sidebar.sections.*`, `settings.appearance.intent*` /
  `*Label`, `chapters.sceneStrip.links`, `chapters.ai.badge`. Only 9 term leaves were minted,
  for words with no existing key of the same MEANING (an aria-label is not a noun in prose).
  **Code identifiers stay out of the catalog** — `accent2`, `.zip`, `.prev.json`, `@` are
  data values, which the i18n rules never translate; they live in the template inside
  `<code>`, and `eslint.i18n.config.mjs` gained `code` in `ignoreNodes` (the rule's own
  option for this, not a workaround).
  **Bonus, same pattern:** `settings.backups.dataFolderHint` — the last documented
  "deliberate leftover", a sentence wrapped around a `<UiButton>` — is now one keypath with a
  `{link}` slot. SettingsView+ChaptersView+CharactersView lint warnings 9 → 7.
  **Verified by rendering, not by building.** A wrong slot name renders literal `{braces}`
  and a wrong keypath renders EMPTY (missingWarn/fallbackWarn are off), so a probe derived
  the expected text from the PRE-conversion catalog (tags stripped, `&amp;` decoded) and
  compared it to the live page: **11/11 sentences byte-identical, 0 stray placeholders, 0
  intlify warnings, 0 JS errors**, then `HEADLESS SMOKE PASSED` again. `dataFolderHint` is
  behind `v-if="storageRoot"` (needs the Tauri bridge) so it was verified separately with a
  stubbed bridge. 439 unit tests, clean build, 0 missing keys.
  **⚠ A COPY BUG found while converting, NOT fixed — yours to call.**
  `chapters.outline.intro` says "with **Outline** / **Cards** / **Read** view modes", but
  `MODES` is Edit / Outline / Read (`ChaptersView.vue:105-109`) — "Cards" is an `editStyle`
  toggle INSIDE Edit mode (`chapters.edit.cardView`), not a view mode, and Edit itself goes
  unmentioned. The sentence was preserved word-for-word rather than silently rewritten.
- 🎯 **Single-source text system + i18n / translation — THE NEXT BIG TASK** (the user's
  roadmap ruling 2026-07-26: "the main goal is to completely finish JW and all AI stuff,
  then we will work on JV… 12 we need to do and do the full translation research on how we
  do it automatically… this should be next big task after you finish the test and your
  items"). One authored source (the docs) feeding the `?` help drawer, inline hints, **and**
  translations so they can't drift; plus a language switcher and a `$t()`-vs-hardcoded
  coverage audit. Whole-system (JW + JV + kit).
  **RESEARCH DONE 2026-07-26** (one prototype pending) — the full record is
  **`docs/plans/2026-07-26-i18n-single-source-research.md`**: the measured census
  (~3,900 hardcoded strings system-wide vs ~190 translated keys in use; the kit and JV at
  literally 0% — JV's Language select is cosmetic; plus the two hidden populations: ~67
  DB-seeded strings and ~93 Python-born error strings), the architecture REC (two sources,
  one keyed-hints bridge, a CI contract; kit adopts vue-i18n as a peer — both hosts already
  ship ^11.4.6), the 2026 tooling survey with URLs (headline: **json-autotranslate's OpenAI
  backend pointed at OUR llama-server** = the on-brand local pipeline through a maintained
  tool, with placeholder protection + glossaries; DeepL-free as the quality baseline;
  `@intlify/eslint-plugin-vue-i18n no-raw-text` as the permanent guard), the build order
  (coverage → hints bridge → translate → switcher), and the six-decision sheet for the
  user. **SHAPE RULED (your word, 2026-07-26): a GENERIC autotranslate system** — "works
  with any app with this stack or Vue… we should be able to use this on JV", clarified:
  "not just JV/JW — if we build another app with Vue we should be able to use the system
  too." So: a standalone package (in the shared repo, importable on its own) with ZERO
  coupling to our stack — engine = any OpenAI-compatible URL or DeepL key (our runner is
  just JW's default config value), works on any keyed-JSON locales (vue-i18n's shape),
  per-app config as the only app-specific artifact, the Vue lint guard shipped as a recipe
  beside it. JW consumer #1, JV consumer #2, any future app free.
  **ALL SEVEN DECISIONS BLESSED 2026-07-26 ("your rec"):** kit = vue-i18n peer dep ·
  Spanish first, alone · ship machine-translated + labeled + feedback path · DB-seeded
  text stays English in v1 · server errors map at the friendlyAiError layer · engine by
  the prototype's verdict · central catalogs. **BUILD STARTED same day** — Phase 1a
  (tooling + the three worst views) delegated to an Opus executor on a decision-free
  plan: `docs/plans/2026-07-26-i18n-phase1-coverage-plan.md` (wait-gated behind the
  running bench so HMR can't kill it a third time). **Scope confirmed (your ask,
  2026-07-26): the plan now includes the HINTS CONTENT PASS** — after the docs bridge
  lands, every surface gets its one-sentence lede and every non-obvious field/control a
  short hint, authored in the docs so they translate like everything else; existing hints
  are the style precedent; a surface→lede/hints coverage table makes "everywhere"
  checkable. **The 40-key ES prototype — RUN 2026-07-27, STOPPED ON A FINDING, needs two
  rulings.** The GPU freed and both arms turned out blocked. **json-autotranslate cannot
  reach our llama-server**: `src/services/openai.ts:317` hardcodes
  `https://api.openai.com/v1/chat/completions` as a literal and `:320` hardcodes `gpt-4o`,
  posting via raw `node-fetch` — no base-URL flag AND no SDK env var to lean on. That
  falsifies R3's headline. **DeepL-free needs a key** — absent from your env at every scope,
  and only you can sign up. **The replacement is verified:** `i18n-ai-translate` (npm 5.1.0,
  2026-06-28) builds `new OpenAI({ apiKey })` with no explicit baseURL, and openai-node
  defaults that to `readEnv('OPENAI_BASE_URL')` (`client.ts:433`) — one env var points a
  maintained tool at our runner, no patch. **The 40-key corpus is BUILT** and survives any
  engine choice (scratchpad `i18n-proto/en/proto.json` — deterministic, 3,097 chars: all 8
  plural pipes, 20 interpolations, 10 long `<i18n-t>` slot paragraphs, 7 glossary terms, 15
  short labels). Rulings needed: the tool substitution, and DeepL-baseline vs
  judge-on-absolute-quality. Record: the research doc's "R3 CORRECTION" section.
  **THE TOOL IS BUILT AND PROVEN — v2 executed 2026-07-27 on your "go"**
  (`E:\Dev\Web\just-ai-help`, unpushed, no remote yet — creating one is your call). Three
  layers, **zero npm dependencies**: `loop.mjs` (our own batch loop — we own the request
  body, which was the single cause of every failure the day before), `checks.mjs` (13 checks
  on pofilter's test list, each with a test proving it BITES), `review.mjs` (a local triage
  page — flagged rows first, edit, save, re-check). Plus `--escalate <profile>` to re-run
  only the flagged keys elsewhere. The adopt-first spike ran and FAILED mechanically:
  lingo.dev does no placeholder shielding and rewrote `{n} notes` as `{3} notas`. Local
  default is **gemma3:12b**, chosen by a two-model bake-off, and the bake-off's finding is
  the one to remember — qwen3's missing Spanish `¿` is NOT prompt-fixable, and on *structure*
  the two models are indistinguishable, so everything separating them lives in the half only
  these checks look at. **Awaiting you:** shipping `es.json` into JW (the file exists and is
  measured, in the scratchpad — wiring Spanish into the app is your separate call), the
  upstream `--think` PR, a git remote, and whether to rotate the Gemini key that appeared in
  chat. Full record: the research doc's "V2 EXECUTION LOG".
- ✅ **The PER-BAND model survey — DONE 2026-07-25** (Parts 1+2; the record, candidate
  table with URLs, and the two open user decisions live in
  `docs/plans/2026-07-25-per-band-model-survey.md`; the seeds are the section-B band
  item). Net: no outside candidate seeds untested (the A/B law); Qwen3.6-27B is THE 24+
  test candidate; Mistral Small Creative — the one prose-purpose-built official model
  found — is API-only and deprecated, OUT.

- ✅ **Unsloth Studio seeded as a local provider — SHIPPED 2026-07-28** (your ruling: "1 we keep
  our engine, 2 add unsloth provider"). One seed row (`llm_runner/llm/seed.py`, generic
  `openai-compat` type, `http://localhost:8888/v1`) plus a preset chip
  (`ui/src/composables/useProviderConnect.js:18`) — the same treatment LM Studio got on
  2026-07-19, for the same reason: it speaks OpenAI-compatible, so a dedicated provider type
  would buy a label and cost ~8 parallel type lists. **Deliberately NOT added to
  `detect-local`**: that probe GETs `/v1/models` unauthenticated, and Unsloth requires
  `Authorization: Bearer sk-unsloth-…` on every request with no documented way to disable it,
  so the probe could only ever 401 — dead code implying a capability we do not have. Base URL
  is from Unsloth's own documented curl example; their docs also say "typically 8000 or 8888"
  and name no authoritative default, so a user serving on 8000 must edit the row — flagged,
  not guessed. **The engine layer is unchanged and stays ours**: we run raw `llama-server`
  because `--n-cpu-moe` is the deciding switch and the GUI runners do not reliably expose it
  (`just-llm-runner/docs/plans/2026-06-24-llamacpp-switches.md:488-495`), and Studio also has
  no embeddings endpoint, no API to load a model on demand, and a Python+venv+winget+Git
  install — see `docs/plans/2026-07-26-i18n-single-source-research.md` for the full weighing.
  Gates: runner 710 passed (1 documented Windows lspci known-bad), JW vitest 466, `build:vite`,
  ruff, biome, and `HEADLESS SMOKE PASSED` with the provider-form check green.

## Open — awaiting a go (shared AI stack)

- **Batches 5 + 6 — VERIFIED AGAINST CODE 2026-07-26: only TWO items actually remain.** The
  freeze (2026-07-08, your "do nothing until i say go") outlived the work — four of the six
  "remaining" items had already been built through other work, and the tracker never caught it:
  - ✅ **B2-9 set-as-default provider — BUILT** (`ui/src/views/AiModelsArea.vue:285,328`:
    `setAsDefault(pid, …)` + `currentDefaultProviderId`). The line called it "never built".
  - ✅ **B5-6 clear-all-strikethroughs — BUILT** (`RichEditor.vue:569-570,867,1510`, its own
    comment cites the same issue #42).
  - ✅ **B5-7 AI-complete notice in the editor bottom bar — BUILT** (`ChaptersView.vue:418,1289`
    — the literal "View task queue" button + ✕ dismiss the item asked for).
  - ✅ **B6-2 `return_progress` — BUILT** (`llm_runner/llm/openai_compat.py:219-222` sets
    `body["return_progress"] = True`; `base.py:47` documents the `prompt_progress` frames).
  - ✅ **B5-2 JW stale-surface audit — SWEPT 2026-07-26, essentially CLEAN.** What was
    looked for and what came back: pre-shared-stack `Jw*` components or local `components/ui/`
    imports → **one hit, and it is a stale COMMENT** (`PaneHeader.vue:7` says "JwHelpDrawer";
    the component is the kit's `HelpDrawer` now); the retired local services
    (`openai-compat`, the gateway, `embedApi`, `aiFeature`, `aiErrors`, `ModelPicker`,
    `useModelList`, `useFeaturePin`) → **all gone**, the only survivors being comments that
    explain their removal; `components/ui/` → **empty**, as designed; orphaned components
    (a `.vue` imported nowhere) → **none**. The convergence work of the last month actually
    landed. Only the one comment name was worth fixing, and it is cosmetic — **FIXED
    2026-07-27** (`PaneHeader.vue:7` now says "the kit's HelpDrawer"). B5-2 is CLOSED.
  - **B5-4 nav prominence for Ask the Book** — genuinely open (a visual treatment; nothing
    special found in the nav, but this one is a design call, not a code check).
  Original list: `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` §8.
- **QC queue (§9)** — the live findings you drop while QC-ing on your box; discussion-first, each
  needs its own go. Same doc, §9.
- **I2 — cloud prompt caching — RESEARCH IT, then decide** (the user's ruling 2026-07-26: "i
  think we should do this as i have no idea what users would do, as far as i can tell it is
  recommended but research if we should build it"). Verified 2026-07-26: the Anthropic and
  Gemini adapters still send NO caching hints (no `cache_control` anywhere in either). The
  research pass owes: what each vendor's caching actually is today (Anthropic explicit
  `cache_control` breakpoints vs Gemini implicit/explicit context caching — read the live
  docs, they change), what it costs and saves, whether OUR request shapes even benefit (a
  novel's story bible + long manuscript context is the strongest case; short writer actions
  are the weakest), the minimum-TTL and minimum-token thresholds, and whether it can be
  wrong-in-a-costly-way (paying to cache what is never reused). Output = a recommendation
  with numbers, then the user's build/skip call. Ledger §I2.

## JustVoice — AFTER JustWrite (the user's roadmap ruling, 2026-07-26)

*"The main goal is to completely finish JW and all AI stuff, then we will work on JV."* So
everything below is deliberately parked behind the JW/AI-stack work and the i18n task above —
listed for shape, not queued.

- **F1 — convergence onto the current shared stack (THE big one)** — JV can't even import today's
  `llm_runner` (`models.py` imports `LLMRolesSettings`, gone from the shared schema; 30 tests die
  at collection). Blocks F2/F5-adjacent work/F6/I6; delivers the whole month's shared work
  (catalog/tune, auto-MTP, Logs, provider connect) for free. Ledger §F1.
- **F5 — JV Appearance knob-set gap** — JV exposes Theme/size/accent/language only, while the
  shared engine it already adopted supports the full JW set. Independent of F1. Ledger §F5.
- **F6 — online TTS providers, official-SDK way** — after the JW SDK pivot proved the glue.
  Survey-first; after F1. Ledger §F6.
- **F2 — speaker-attribution task scaffolding** — meaningful only after F1. Ledger §F2.

## Your-box checks (only the Windows / 2070S machine can finish these)

- **LOOK at the four new "PC class config" surfaces** (2026-07-26, built but never seen running —
  your eyes are the look gate): the catalog row's needs line beside the download size · the Fit
  hover's "Estimated —" / "not yet tested on your PC class" · the renamed badge with your class
  after it · the class panel's collapsed *"N more models — not tested on this class"* line, its
  "no switches" rows, and whether **Add switches** really opens the editor already on that model.
  Detail: `docs/plans/2026-07-22-igpu-research-and-cpu-band-recovery.md` §24.

- ✅ **Warm the default local model into VRAM on startup — CONFIRMED BY DAILY USE 2026-07-26**
  (the user: "whenever i restart my app it says loading model as long as i have already set a
  model default, i can cancel load if i want" — that IS warm-start, working). The path:
  `services/warmStartup.js` `startWarmOnBoot` (from `main.js`) reads the toggle → resolves the
  default LOCAL chat model (empty ⇒ cloud default ⇒ no-op) → calls the SAME `retryLoad` a load
  button runs, with `warmModelId` driving the boot splash's shared DownloadBar (hence the
  visible, cancellable "loading"). The toggle-off half is a one-line guard
  (`warmStartup.js:29`) and needs no tracked check. Also proven the negative way 2026-07-26:
  after a workspace reset with routing empty there was no default to warm, so nothing loaded —
  which is exactly why the bench's first embed hit a dead router.
- **Bench harness — the restore fire-test** — one deliberate mid-leg kill →
  `npm run bench -- --restore bench/results/<run-id>` → confirm the Routing tab shows the original
  assignments (the escape proven to FIRE). The harness has now run end-to-end many times, but
  `--restore` is still only proven against a fake client. `docs/plans/2026-07-19-llm-bench-harness.md`.
- **`book-smoke.js` unverified since the shared-helper extraction** — needs port 1420 free for one
  run.
- **19 probe scripts still carry a Linux-only `findChrome()`** — they cannot find a browser on
  Windows at all. Convert them to the shared `tests/lib/smoke-common.js` import, or delete the
  dead ones. `docs/plans/2026-07-19-llm-bench-harness.md`.
- ✅ **Provider SDK pivot — CLOSED 2026-07-26** (the user: "close 3 i dont have keys").
  Gemini/Claude/Ollama were box-checked good 2026-07-20; OpenAI, xAI and Mistral ship wired
  but live-unverified, and stay that way — no keys, no check, not a tracked task. Re-open only
  if funded keys ever appear. `just-llm-runner/docs/plans/2026-07-17-provider-native-dialects-plan.md`.
- **Unit 2 reasoning acceptance** — one local High chat run stopping at the hardware cap · one
  new-Anthropic run with reasoning words on the wire, no 400. Ledger §G.
- **Ledger §G1–G6** — Plan B on-device gates · portable data folder · the RTX 2070S spawn failure
  (now self-reporting) · marketing screenshots · full RAG end-to-end + router-flag confirm ·
  Windows AMD/Intel detection spot-check. Ledger §G.
- **Providers-surface rounds** — the per-round box checks (ROUNDs 9–19).
  `just-llm-runner/docs/plans/2026-07-06-providers-surface-redesign.md`.

## Parked (wakes on a trigger or a fresh ask — not active work)

- **D5 — remote curated model catalog** (shape recorded, ready) · **D6 — in-app HF "Discover"
  surface** · **I3 — Apple-Silicon fit/tune refinements** (needs a Mac) · **I5 — the deferred
  parking lot** (per-scene snapshots · per-entity write REST · RAG sqlite-vec ANN · extract kit
  `common/` → `@delebash/ui` · llama-swap layer · the Tauri/package rename PR) · **F3 — audiobook
  converters + speaker-attribution deep research** (JV) · **I6 — the JV tail beyond F1–F5**.
  Each: the ledger section of the same name.
- **claude-config standalone provisioning** — prove a fresh web container can provision `~/.claude`
  straight from `github.com/delebash/claude-config`, after which JW's vendored copy can go. The
  extraction itself is done; only the fresh-container proof is outstanding.

---

## Closed in the 2026-07-24 sweep (kept briefly so the corrections aren't lost)

- **Pass 2 — backend applicability columns: ALREADY SHIPPED** (runner `e36a901`, 2026-07-22),
  carried as open ever since. What it is: a launch knob tuned for one engine family no longer
  follows a model onto another — `knob_catalog.backends` (comma-list; "" = all), the four GPU-only
  knobs seeded `cuda,rocm,vulkan,metal` (`n_gpu_layers`, `n_cpu_moe`, `no_mmap`, `no_kv_offload`),
  and the runner drops inapplicable flags at both section-construction seams. Born from the
  2026-07-22 incident where `no_mmap` followed a model onto the CPU band and cost 22.8 GB resident
  for zero offload benefit. Live: `db.py:545`, `seed.py:548-563`, `install.py:406`, `stores.py:1446`.
- **"Stalling" thresholds mislabel a slow model: ALREADY FIXED** (#5, 2026-07-17) — the tracker
  said "not built (no stall-detector in the runner)", which searched the wrong repo: the classifier
  lives in the **kit UI**, `ui/src/common/services/streamFreshness.js`, and its header cites your
  exact case (an entity sweep on Qwen3.6 35B at ~2.6 tok/s). It calibrates to the stream's own
  measured inter-token pace (K× the running mean, with 8 s/25 s floors) instead of the old absolute
  3 s/10 s, and is consumed by both `AiTaskStrip.vue` and `AiStatusPanel.vue` (verified live).
  **Recommendation: leave it** — the fix exists and is well-grounded; there is nothing to build.
- **Confirmed good on your box 2026-07-24, closed:** the Tune modal's measurement-history
  disclosure · the whole AI-surface pass (2026-07-19) · the hardware-class two-editor form shape ·
  the ChatPanel history-view row colours · the AI page's see-through ⋯ menu (runner `5da79bc`).
- **Collapsed to git + their plan docs** (were sitting here as finished narrative): the boot-splash
  restyle + book-plate v2 · the model-catalog bench/sort/width pass · the MTP-verify + think-A/B
  bench work · the CPU-only band (complete, 4/4 — verdict: pure CPU not viable for interactive
  book-chat) · runner lifecycle defects A–G + the real-router smoke · the hardware-class named
  entity + Pass 4 class-system rebuild · panel-dismiss decisions · I1/I4 tails · A5-1 · 1b-F4 ·
  the QuickSetup effective-context line (won't-do).
