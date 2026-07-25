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

## Now / near-term (JustWrite)

### A. Done today — uncommitted, needs your QC then a commit

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

- ~~**Migrate the six hand-rolled kit tables to `UiTable` (TanStack).**~~ **DONE 2026-07-24** —
  but as THREE migrations, not six. Reading all six showed they are two different things:
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
- **Boot, biggest remaining lever:** the app kills + respawns the server on EVERY launch
  (`lib.rs:377-391`), so every start pays ~2.3 s. Have `/v1/health` report a build stamp and reuse
  a healthy matching server. Cheaper wins: listen before seeding; parallelise the two independent
  boot fetches; guard the latent 2.8 s retry trap in `providerBackend.js:29` / `routingBackend.js:27`.
- **Hardware classes + missing catalog rows.** All three machines decided (16 GB Iris Xe = **E4B**).
  Owed: E4B/E2B have no catalog rows at all, plus the integrated-16 class seed and the dGPU
  8/12/16/24+ band seeds in the shape you blessed.
- **Model download has no CANCEL** in the failed / "Getting ready" states — the transport is
  cancellable, the surface isn't.
- **iGPU detection fixes ①–③** — parked on laptop facts that now exist; re-read and decide.
- **#256 spell-check** — not yet scoped.

### C. Waiting on you to run

- **The full-catalog test campaign.** Reseed the runner DB (owed anyway — the box is still flipped
  to the CPU engine with routing bench-dirty on 5 keys) → runner pytest + `npm run test:server` →
  the two bible legs → the overnight battery (~65 GB). Then I judge and we do the final catalog
  curation + the higher-tier model survey. §19.
- **Headless smoke needs a splash-aware wait** — one known-false failure every run.

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
