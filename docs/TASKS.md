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

> **Audited against code 2026-07-25** — the ordered two-day diff audit (all 38 commits, both
> repos; record: `docs/plans/2026-07-25-session-handoff-and-verification-debt.md`, AUDIT
> OUTCOME section). The stale items it caught (the shipped-but-open CANCEL entry, the iGPU
> ①–③ mischaracterisation) are corrected in place below. The standing rule stands: before
> building off any item, re-verify it against the named symbol — a tracker line is a claim,
> not evidence.

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
- **ChatPanel buttons** — Update/Rebuild back to outline, ✕ de-coloured. *Flagged: I read "normal
  x" as text-only (`ghost`) — say if you meant outlined.*

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
  - **(E4B, igpu-mem16) class tune** — waits on the speed-kit bench on the Iris Xe laptop
    (recovery doc §17's own rule: "a future row once benched"). Your run.
  - **Drafter verification** — one load each with the recorded head on a real box; flip
    `mtp: True` only on a clean load (the row comment is the stop sign).
  - **dGPU 8/12/16/24+ band seeds** — NO written blessed shape exists (searched both repos'
    plan docs 2026-07-25; the June hits are catalog-tier language, not class rows). REC:
    don't seed empty band classes at all — detection computes a box's key without a library
    row (`format_class_key`), and a class row with no measured tune does nothing. Say the
    word and this clause closes; or bless a shape and they get seeded.
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
- **#256 spell-check** — not yet scoped.

### C. Waiting on you to run

- **The full-catalog test campaign.** Reseed the runner DB (owed anyway — the box is still flipped
  to the CPU engine with routing bench-dirty on 5 keys) → runner pytest + `npm run test:server` →
  the two bible legs → the overnight battery (~65 GB). Then I judge and we do the final catalog
  curation + the higher-tier model survey. §19.
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
- **The refusal probe itself** (`services/benchHook.js`, legs `gpu-refusal-{stock,hh,ez}`) drives
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
  models load). Not our bug, but **our placement strategy walks into it**: `process.py:111` and
  `lifecycle.py:2034` deliberately OMIT ngl/n_cpu_moe on untuned models so the engine's own
  `--fit` places tensors ("fit-by-omission").
  **AUDITED 2026-07-25 — and my first reading of this was WRONG, corrected here.** I wrote that
  any untuned Gemma-4 row "may be silently running without" its MTP. The catalog says otherwise:
  `model_tunes` is EMPTY (0 rows) and all 14 `class_tunes` rows belong to `gemma-4-26b-a4b-qat`,
  so every other row is untuned — yet the untuned `…uncensored-ez` and `…uncensored` measured
  **60.5%** and **58.9%** draft acceptance. Untuned rows are NOT losing MTP. The real
  discriminator is WHICH drafter file: every row using its OWN repo's drafter works, `…ez` borrows
  unsloth's `mtp-…-Q4_0.gguf` and works, and only StyleTune's borrowed
  `Radamanthys11/…-it-assistant-Q8_0.gguf` was fatal. `--fit` is a real upstream bug and the
  `--fit off` cure is verified, but it is NOT what was breaking our catalog. **Not fixed here:**
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
- **Higher-tier model survey** — for the 24 GB+ band, don't limit to what we already carry;
  named candidates with URLs against explicit criteria (fits the tier at ctx 32K · QAT or a
  proven quant · prose quality, not coding benchmarks · clean license for bundling · MTP a
  bonus). Feeds the catalog curation above.

## Open — awaiting a go (shared AI stack)

- **Batches 5 + 6 — the freeze is STALE; needs a re-scope, not an unfreeze.** Frozen 2026-07-08
  by your hard stop ("do nothing until i say go"), but the list has been partly built anyway
  through other work since (B5-1 pickers→chip, B5-3 New chat + delete, B5-5 editor context menu,
  B6-1 streaming are all live). What genuinely remains needs one verification pass before
  anything builds. Original list: `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md` §8
  (B5-2 stale-surface audit · B5-4 nav prominence · B5-6 strikethrough management · B5-7
  bottom-bar AI notice · B6-2 return_progress) + **B2-9** (the set-as-default build, never built).
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

- **Warm the default local model into VRAM on startup** — with the engine installed + the default
  model downloaded + built-in as default, launch and confirm residency on first chat (the task
  shows during load); toggle `warmDefaultOnStartup` off → confirm a cold start. Can't be
  exercised in-container (no engine/GPU). Detail:
  `just-llm-runner/docs/plans/2026-07-21-builtin-row-engine-update-and-warm-load.md` Part 2.
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
