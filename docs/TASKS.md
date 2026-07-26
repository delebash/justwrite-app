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
> with no scope anywhere). Earlier record: `docs/plans/2026-07-25-session-handoff-and-verification-debt.md`.
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
- **Feed the engine's `uma: 0/1` flag into `mem_arch`** — the ONE real detection gap. The old
  "iGPU detection fixes ①–③" item is CLOSED (audit 2026-07-25: detection is not broken —
  `runner/hardware.py:123-133` classifies by platform + vendor + a physical signal,
  deliberately no name matching; adding iGPU name patterns would regress that design). What
  remains: a unified-memory NVIDIA box (DGX Spark) falls through to "discrete"; the engine
  already reports `uma: 0/1` (confirmed laptop 1 / 2070S 0) and nothing reads it
  (`hardware.py`: zero refs).
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
- **#256 spell-check** — not yet scoped.

### C. Waiting on you to run

- **The full-catalog test campaign — READY, and now cheaper (updated 2026-07-25).** Steps:
  1. **The in-app Reset workspace button** (your catch — it IS the full drill and better
     than a hand-delete: `POST /v1/data/reset` stops the runner first, true DROP+CREATE so
     schema drift heals too, reseeds, and preserves your folder-path settings —
     `data_admin.py:_reset`). ⚠ Books reset with the workspace as always — autosave JSONs
     + exports are the nets. The fresh seed brings everything from this week in one shot:
     E4B/E2B rows, the 27B row, band recommendations, the healed StyleTune drafter, the
     spec_type dropdown, the ez rename.
  2. Relaunch → `runner pytest` + `npm run test:server` green.
  3. The bible leg: `npm run bench:gpu -- --legs gpu-gemma-26b-bible` (minutes — the qwen
     bible leg left with the 35B's catalog row in the 2026-07-25 trim). Running any leg
     with the app CLOSED via `--autostart` also closes the audit's last drive.js check
     for free.
  4. The battery — the hh legs are GONE (A/B settled) and StyleTune/EZ/31B are already on
     disk, so this is now hours of compute, ~zero new download:
     `npm run bench:gpu -- --legs gpu-styletune,gpu-styletune-hq1,gpu-styletune-hq2,gpu-uncensored-ez,gpu-uncensored-ez-hq1,gpu-uncensored-ez-hq2,gpu-gemma-31b,gpu-gemma-31b-hq1,gpu-gemma-31b-hq2`
  5. Hand back the run dir → I judge → the final catalog curation (31B as a 24-tier
     alternative or not · 70B/GLM keep-or-remove · the survey's two open decisions). §19.
- **Headless smoke needs a splash-aware wait** — one known-false failure every run.
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

- **Single-source text system + i18n / translation** — one authored source (the docs) feeding the
  `?` help drawer, inline hints, **and** translations so they can't drift; plus a language
  switcher, a `$t()`-vs-hardcoded coverage audit, and tooling. Whole-system (JW + JV + kit).
  Grounding + the open questions: `docs/IDEAS.md` → "Single-source text system + i18n".
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
  - **B5-2 JW stale-surface audit** — genuinely open (a sweep task, no code to check).
  - **B5-4 nav prominence for Ask the Book** — genuinely open (a visual treatment; nothing
    special found in the nav, but this one is a design call, not a code check).
  Original list: `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` §8.
- **QC queue (§9)** — the live findings you drop while QC-ing on your box; discussion-first, each
  needs its own go. Same doc, §9.
- **I2 — cloud prompt caching** — the Anthropic/Gemini adapters send no caching hints; never
  built, never decided. Worth a decision only when cloud usage matters. Ledger §I2.

## JustVoice

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
- **Provider SDK pivot** — Gemini/Claude/Ollama were box-checked good 2026-07-20; **OpenAI, xAI
  and Mistral stay live-unverified until you have funded keys.** Connect them then.
  `just-llm-runner/docs/plans/2026-07-17-provider-native-dialects-plan.md`.
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
