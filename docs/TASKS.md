# TASKS — the live open-work tracker (whole system)

> **THIS is the live tracker.** One place for everything open across the system we work as a
> whole — **JustWrite**, the shared **AI stack** (`just-llm-runner` + `@delebash/llm-ui`), and
> **JustVoice**. `MORNING_RECAP.md` is the boot-map and points here; unscheduled ideas live in
> `docs/IDEAS.md`.
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
  **Not yet run** — the box was mid-battery and the smoke would fight it for port 1420; run
  it next time the app is free.
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
  binds ::1 only on this box, so a v4-only probe reports it free). **Consequence: the smoke
  was NOT run for the CharactersView change — your app was up on ::1:1420. Run
  `npm run smoke` with the app closed.**
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
  checkable. **Pending:** the 40-key ES prototype when the GPU frees — it picks the
  default engine.
- ✅ **The PER-BAND model survey — DONE 2026-07-25** (Parts 1+2; the record, candidate
  table with URLs, and the two open user decisions live in
  `docs/plans/2026-07-25-per-band-model-survey.md`; the seeds are the section-B band
  item). Net: no outside candidate seeds untested (the A/B law); Qwen3.6-27B is THE 24+
  test candidate; Mistral Small Creative — the one prose-purpose-built official model
  found — is API-only and deprecated, OUT.

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
    landed. Only the one comment name is worth fixing, and it is cosmetic.
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
