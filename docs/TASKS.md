# TASKS — the live open-work tracker (whole system)

> **THIS is the live tracker.** One place for everything open across the system we
> work as a whole — **JustWrite**, the shared **AI stack** (`just-llm-runner` +
> `@delebash/llm-ui`), and **JustVoice**. `MORNING_RECAP.md` is the boot-map and
> points here; ideas that aren't scheduled work live in `docs/IDEAS.md`.
>
> **How to use.** One line per item + a pointer to its detail doc — the depth lives
> in the linked doc (the runner **ledger** `just-llm-runner/docs/plans/2026-07-06-outstanding-master-plan.md`
> §A–J, the plan docs, the providers-surface rounds), not here. Close an item when it
> ships (strike it or drop it); don't let history accumulate — that's what the detail
> docs and git are for. Add an item the moment it's real; a task is never "started"
> by being listed.
>
> Last swept: 2026-07-19.

---

## Now / near-term (JustWrite)

- **Tune modal: Measurement history needs a visible affordance + a Clear button** (user,
  2026-07-24, screenshot): the history section doesn't look clickable — you can't tell you
  have to click it to open — so it needs a real button/disclosure look; and once open it
  needs a **Clear** button (the DELETE /v1/ai/model-measurements endpoint already exists —
  it's the wired-up UI that's missing). Surface: the kit's `TuneMeasureModal.vue`
  measurement-history block.

- **UPDATE 2026-07-23: the KIT IS ONE-CLICK — detect → PLAN → confirm → run** (full record:
  recovery doc §10). `run.bat` double-click (ExecutionPolicy bypassed per-run) → `run.ps1`
  prints the PLAN (machine · engine · every model size + have/download/SKIP · disk · tests) →
  `[Y/n/s(elect)]` → fit-filtered downloads (`.part` + size-check, no corrupt masquerade,
  everything logged to bench-log.txt) → detect-facts → bench. `kit-common.ps1` = the ONE source
  (pin b10083 · 0.7 fit factor · model list incl. E2B/E4B). Flags: `-Yes/-PlanOnly/-RamGB/-Build`.
  16 GB path proven by dry-run (`-RamGB 16`: MoE skipped, 12.6 GB download).
  **2026-07-23 reorg: the kit's ONE home is `bench/speed-kit/`** (root `bench/` = harness ·
  speed-kit · results; root `tests/` = smoke · probes · lib; `E:\laptop-speed-kit` RETIRED —
  models moved into the repo kit's git-ignored `models/`, raw laptop results salvaged into
  `bench/results/laptop-core-ultra-7/kit/`). Cross-platform: `run.sh` + `kit-common.sh` etc.
  for Mac/Linux (untested on a real Mac/Linux box — honest caveat).
  **USER ACTION (16 GB laptop): copy `bench/speed-kit/` → double-click `run.bat` → Y →
  bring back the four files.** OPEN: E2B/E4B not yet downloaded into the kit (~6.4 GB);
  results-folder name for the new machine (your naming call when files return).
- **UPDATE 2026-07-22 (latest): the LAPTOP SPEED KIT IS BUILT** — was `E:\laptop-speed-kit`
  (RETIRED 2026-07-23 — one home now: `bench/speed-kit/`; entry kept as history) (20 GB,
  desktop-verified; full record in the recovery doc §6). USER ACTION: copy the folder to the
  Core Ultra 7 laptop, unzip the engine, run the two scripts, bring back `detect-facts.txt` +
  `results.jsonl` + `bench-log.txt`. Those three files then decide: the iGPU speed verdict,
  detection decision ③ (qwMemorySize for "Arc Graphics" → threshold vs DXGI), and decision ②
  (the A2 Vulkan-for-iGPU revisit) — plus the newly found `uma:` flag as an engine-native
  unified/integrated signal. Detection fixes ①–③ are deliberately WAITING on these facts.
- **UPDATE 2026-07-22 (late): hardware class = NAMED, TYPE-FIRST entity SHIPPED** (runner
  `ec693f6` backend + `0340231` UI). After the iGPU/unified-memory discussion, the class is no
  longer VRAM+RAM-only: three types (discrete VRAM+RAM · integrated one-pool · unified one-pool),
  a free NAME, detection by platform/vendor (macOS→unified fixes the Mac-as-CPU bug), the panel
  rebuilt as a class-list-holding-configs with one add/edit form per thing and no popup. Full
  record + verification: `docs/plans/2026-07-22-hardware-class-named-entity.md`. OPEN: the user's
  eyeball on the two-editor form shape (their app was live on :1420/:17495, so no headless smoke —
  their own hot-reloaded view is the gate) · a splash-aware smoke on alternate ports · a
  known-unified-device list for DGX-Spark auto-detect (override covers it for now).
- **UPDATE 2026-07-22 (evening): Pass 4 SHIPPED** — the class-system rebuild to the user's §9
  final ruled shape (hidden pick table DELETED; the visible class-tunes library IS the
  recommendation; `class_key_override` = "detection proposes, never dictates"; Copy in the
  per-model editor; key suggestions on Add; the "2-minute optimize" rename). Full record: the
  execution plan doc's PASS 4 section. NEW OPEN items it leaves: **(a) the headless smoke needs
  a splash-aware wait** — `shell-structure` fires during the new splash gate's boot window and
  fails before the shell mounts (pre-existing on this branch; every route + AI tab passes with
  0 JS errors) · **(b) your-box look**: the class panel's "Your PC" line + Change…/Use
  auto-detect, the editor Copy, the Add key suggestions, and the rename strings.
- **UPDATE 2026-07-22 (later): Pass 1 SHIPPED (runner `cc62d92` + JW `836e8bf` — defects A–G +
  the real-router smoke, 8 cases green live) · CPU band COMPLETE 4/4** (run `…_14-04-05-cpu`:
  bonsai loads 13 s but unusable, 0/10 runs; qwen honest at ctx 8192 — 6.8 tok/s, cold 66.7 s /
  warm 0.55 s, defect-C fix held through the embed co-load; verdict: pure CPU not viable for
  interactive book-chat) · **engine REVERTED to CUDA** · routing reseeded clean · llama-bench
  matrix failures root-caused (the harness's invalid `-c` flag — fixed; CPU matrices refill on
  the user's word). REMAINING: the rag/bible legs (wiring next) · the iGPU laptop kit ·
  Pass 2 (backend columns) · Pass 4 (class-system redesign). Detail: the recovery doc §7 + the
  execution plan's Pass-3 log. The original entry below stands as history:
- **Runner lifecycle defects + CPU band + iGPU research (2026-07-22, OPEN — the live queue).**
  The interrupted CPU band exposed FIVE real lifecycle/bench defects, root-caused in the lifecycle
  log (recovery doc §8): (A) bench `cpu.json` names `ternary-bonsai-27b` but the catalog id is
  `ternary-bonsai-27b-q2-g64` → 114 ms `unknown model` failure, no model-id validation · (B) the
  bench can't see `status="error"` → 30-min dead wait · (C) a later co-load re-emits `models.ini`
  from DB, dropping ephemeral launch switches — qwen respawned at ctx 131072 instead of 8192 →
  the 21 GB RAM exhaustion · (D) a zombie in-flight request re-loads a just-stopped model via
  `ensure-ready` (the real "stop gets undone") · (E) ledger↔router drift errors ("model is already
  running" 400) instead of idempotent adoption. Bonsai itself loads fine (user-proven, 5.7 s raw).
  **PLAN: fix A–E + build the real-router integration SMOKE** (tiny model; load/unload/switch/ctx
  echo/stop-stays-stopped assertions — the user's "testing system" ask) **before re-running the
  owed legs** (bonsai never ran; qwen tainted by C). **⛔ Leftover box state: DB still flipped to
  the CPU engine** (`preferred_gpu='cpu'` + cpu binary row) **and routing still bench-dirty on 5
  keys — needs a reseed, not a restore** (nested un-restored runs; detail §3). Clean legs stand:
  gemma-26b 9.4 tok/s / 53 s TTFT · gemma-12b 96–130 s TTFT. Then: GPU rag/bible legs · CPU rag
  (gated) · the iGPU band (laptop; portable speed kit). The GPU Qwen head-to-head completed
  overnight (`bench/results/desktop-rtx-2070s/bench/2026-07-22_03-28-55-gpu/summary.md`) — answer-key judging still owed.
  Full record: `docs/plans/2026-07-22-igpu-research-and-cpu-band-recovery.md`.
- **Boot splash restyle (2026-07-21, SHIPPED)** — the loading screen redone to a warm CREAM
  ground (not near-white) with the brand **JW** mark + a thin green ring instead of a bare
  spinner, on a barely-there warm wash; a reassurance line ("runs entirely on your computer").
  The model-load control (DownloadBar) is kept fully functional, restyled via CSS only. Lives
  in `index.html #app-boot` (pre-JS, inline SVG mark) + `App.vue .jw-bootwarm` (post-mount warm
  overlay), kept in sync. build:vite + headless smoke clean (no new JS errors).
- **Boot splash v2 — the "book plate" (2026-07-22, SHIPPED).** The bare cream splash was replaced
  with an ornate **aged-parchment book plate** (user pick after several mockups — artifact
  `a46689e9`, "keep the center as-is, fill the four empty corners"): a double-rule frame, a filigree
  flourish mirrored into every corner (one `<symbol>` + four `<use>`), and four themed corners —
  **The Book** (active title · author · words · chapters), **This Week** (a 7-day sparkline · week
  words · streak), **The Instrument** (feature list, with **"Audiobooks in JustVoice"** — the
  companion app, not a JW feature), and **While You Wait** (a tip). The center is unchanged in intent:
  JW mark + green ring + **JustWrite** wordmark moved up, a small banner ribbon **"A quiet room for the
  long form"**, the untouched model-load **DownloadBar**, the privacy line, and the always-present
  Continue. Lives in `App.vue .jw-bootwarm` (post-mount, live store data via `useSessionsStore` +
  `project` getters; the two DATA corners gate on `hasBook`) + its pre-JS twin `index.html #app-boot`
  (frame + the two STATIC corners only — no store — matching `.jw-bootwarm`'s no-book state, KEEP IN
  SYNC comment on both). Light + dark. build:vite + headless smoke clean (every route `errors=0`; the
  lone `shell-structure` fail is the pre-existing empty-DB onboarding-shell case, proven identical at
  clean HEAD).
- **Model catalog — benchmark column + sortable columns + fit-to-data width (2026-07-22, SHIPPED).**
  `LuModelCatalog.vue`: a right-aligned **Bench** column (pulled out of the meta line), **click-to-sort
  column headers** (arrow shows the active column + direction; the Sort dropdown retired), and
  **fit-to-data width** (`width:auto` + `white-space:nowrap` on the narrow columns, only Model grows
  within a cap — no hand-set px). The crowded actions collapse into a **⋯** menu (Reka `DropdownMenu`,
  portaled so it escapes the list's `overflow:auto` clip): Tune · Unload · Re-download · Delete-downloaded ·
  Delete; **Edit + the Set-as-default/Default ✓/Download toggle stay inline** (Load ≡ set-default =
  `makeDefault`, so no separate "Load" item). Smoke's stale `search` assertion updated to the new headers.
  build:vite + headless smoke clean (13-row catalog renders, `errors=0`).
- **QuickSetup effective-context line — DROPPED 2026-07-21 (user's call).** The only honest
  form is done-step-only (the loaded model's real `n_ctx` → "reads ~N words"); a once-seen
  post-setup number that informs no decision wasn't worth building. Confirm-step display is
  impossible for the fresh-box case regardless — `preview_fit` refuses an un-downloaded model
  (`lifecycle.py:1046`) and the models endpoint carries no ctx. Won't-do.
- **MTP-verify + think A/B + bench report (2026-07-20/21, SHIPPED — committing)** — MTP
  proven live (acceptance 0.47–0.91; was broken pre-07-15 exactly as the user suspected).
  Shipped: think-ON A/B leg in `gpu.json` (T1) · MTP draft-acceptance in the bench report,
  from the measure probe's completion timings (T3) · true engine binary-build reporting +
  the dir-name-lies fix, b9993-in-a-b10069-dir (T4) · comment/doc fixes (T5) · human-readable
  `summary.md` with the MTP + A/B tables (T-SUM). The reasoning-TEXT capture (T2) was built
  then REVERTED on the user's call — over-scoped: the A/B only needs the two answers, which
  the bench already captured. **First A/B run 2026-07-21:** think-off validated ON EASY
  PROMPTS at the 1024 cap (TTFT ~40s with think on = disqualifying as the interactive
  default) — but the run could not test the user's real question, so the **robustness fix**
  shipped same day (§6 of the plan doc): 4 hard-question chat legs with ANSWER KEYS
  (`gpu-gemma-26b-hq*`, think A/B at the 8192 budget, n=3) + the measure bug fixed
  (router-authority fallback — this is why the MTP-acceptance table was empty). **Still
  owed:** the user runs `npm run bench:gpu -- --legs gpu-gemma-26b-hq1,gpu-gemma-26b-hq1-think,gpu-gemma-26b-hq2,gpu-gemma-26b-hq2-think`;
  the captures get judged against the keys. Detail: `docs/plans/2026-07-20-mtp-verify-think-ab-bench.md` §6.
  **Qwen head-to-head added 2026-07-21 (user):** `gpu-qwen-35b` + `-think`/`-hq1`/`-hq1-think`/`-hq2`/`-hq2-think`
  mirror the Gemma battery on `qwen3.6-35b-a3b-mtp` (same questions + ANSWER KEYS) so the two catalog
  flagships compare directly — run `--legs gpu-qwen-35b,gpu-qwen-35b-hq1,gpu-qwen-35b-hq1-think,gpu-qwen-35b-hq2,gpu-qwen-35b-hq2-think`
  (needs a ~23 GB download first). The CPU band already carries `cpu-bonsai-27b` (Ternary Bonsai · Q2_g64 —
  Smart-Add first; known load-risk noted). Both configs self-document in `bench/harness/configs/{gpu,cpu}.json`.
- **Panel-dismiss decisions (2026-07-19) — both resolved 2026-07-20, no code change.**
  (a) `AGENTS.md` §5 amendment BLESSED (panels use `usePanelDismiss`, not a backdrop —
  the shipped panel-closes-and-nav-lands behavior is correct). (b) Cross-panel toggle
  WON'T DO (the two-panels-open scenario doesn't arise; revisit if it does). Rulings +
  the revert path: `just-llm-runner/docs/plans/2026-07-19-panel-dismiss-and-no-dim.md`.
- **#256 — spell-check** — not yet scoped.
- **I1 tail — legs 1+2 SHIPPED 2026-07-21, leg 3 dropped.** (1) SettingsView's `.wb-*`
  fragment removed — it was dead CSS (no template ref), a delete not a repoint; the
  shared `.entity-*` family is the live source. (2) CommandPalette entity-creates now
  pass `?new=1` for character/location/object/note/strand (worldbuilding excluded,
  popup-kept). (3) popup-probe → `scripts/` DROPPED (user). Verified: build:vite +
  headless smoke (0 JS errors, all routes). Detail: ledger §I1 + `docs/plans/2026-07-12-i1-css-popup-voicedrift.md`.
- **I4 follow-up — SHIPPED 2026-07-21.** Per-model "Delete downloaded model" row action on the catalog
  (`LuModelCatalog.vue`): deletes a model's downloaded weights while KEEPING its catalog
  row (models-cache/delete keeps the row) → re-downloads on demand; unloads first if
  resident. Shows on any DOWNLOADED row (incl. errored-but-downloaded — checker T5 parity),
  gated on `m.downloaded`, hidden mid-load/unload. Verified: build:vite + smoke 0 JS errors
  on #/ai. Detail: ledger §I4.

## Research (needs a research pass → plan → build, each on its own go)

- **Single-source text system + i18n / translation** — one authored source (the docs)
  that feeds the `?` help drawer, the inline field hints/labels, **and** the translations,
  so they can't drift; plus a real translation story: an **in-app language switcher in the
  title bar**, a `$t()`-vs-hardcoded coverage audit, and tooling (json-autotranslate ·
  json-translator · possibly our own local runner for on-box translation). Whole-system
  (JW + JV + kit). Current-state grounding + the questions to answer:
  `docs/IDEAS.md` → "Single-source text system + i18n".

## Open — awaiting a go (shared AI stack)

- **Batches 5 + 6 (§8) — FROZEN** by the user's hard stop ("do nothing until i say
  go"). Detail + the list: `just-llm-runner/docs/plans/2026-07-08-big-batch-queue.md`
  §8. Nothing builds until a fresh go.
- **QC queue (§9)** — the live findings the user drops while QC-ing shipped batches on
  their box; discussion-first, each needs its own go. Detail: the same queue doc §9.
- **A5-1 — "Update available" names the target build — ✅ verified DONE 2026-07-21.** The
  button reads "Update to {latest}" with tooltip "…to {latest} (you have {current})"
  (`LuRunnerEngine.vue:221-222`); the row's "Installed · {current}" subtitle carries the
  current build. Goal met (see the target before you click); the literal "bNNNN → bMMMM"
  one-string was never needed. Detail: ledger §A5-1 (marked done to match, 2026-07-21).
- **I2 — cloud prompt caching** — the Anthropic/Gemini adapters send no caching hints;
  never built, never decided. A cloud-cost optimization — worth a decision only when
  cloud usage matters. Detail: ledger §I2.
- **1b-F4 — SHIPPED 2026-07-21 (option A).** A fit-placed load (`n_gpu_layers is None`)
  that failed for ANY reason hit the explicit-placement retry + `_bounce_router` (a full
  engine restart knocking down every healthy co-resident model), even for an UNFIXABLE
  failure the retry can't fix. Fix: `_looks_like_unfixable` (process.py, beside
  `_looks_like_oom`) gates the retry on a TIGHT grounded set of llama.cpp stderr signatures
  ("error: invalid argument:", "error while handling argument", "unknown model
  architecture") — fail fast, no bounce; drafts + bare "invalid argument" excluded. NB the
  original "skip bounce when not OOM" idea was WRONG (it'd regress the #18066 fit-bug the
  retry exists for — those exit non-OOM). **Watermark hardening (2026-07-21):** every
  failure-signature read (the unfixable gate, OOM shed, draft crash, child-exit) now reads
  only THIS attempt's log bytes via `_log_appended_since(log_offset)`, so a stale line from a
  previous attempt/model in the shared router log can't false-match — this fixed the
  PRE-EXISTING OOM/draft-shed twin too. Verified: ruff + 7/7 fit-placed+draft+stale-line
  tests (new `test_fit_placed_stale_log_line_does_not_suppress_retry`); the 4 other lifecycle
  failures are pre-existing (0-VRAM container, stash-run-proven).
- **"Stalling" thresholds mislabel a slow model (runner)** — a 2.6 tok/s model reads as
  "stalled"; the load-cancel plan doc lists this out-of-scope ("own go"), not built (verified
  2026-07-21 — no stall-detector in the runner). *(The two other former live-queue items are
  RESOLVED: **multi-click unload — FIXED** by the shipped cancel/progress control (`lifecycle.py`
  cancelling/stopping statuses; `LuModelCatalog.vue:918` "Unloading…"; user-confirmed 2026-07-21);
  **the cancel/progress "do not build as written" warning — STALE**, it described the v1 plan,
  v2 SHIPPED — T1/T2/T2b/T3 all present.)* Detail:
  `just-llm-runner/docs/plans/2026-07-17-load-cancel-and-one-progress-control.md`.

## JustVoice

- **F1 — Convergence onto the current shared stack (THE big one)** — JV can't even
  import today's `llm_runner` (`models.py` imports `LLMRolesSettings`, gone from the
  shared schema; 30 tests die at collection). Blocks F2/F4/F6/I6; delivers the whole
  month's shared work (catalog/tune, auto-MTP, Logs, provider connect) for free.
  Detail: ledger §F1 (+ the F1 renderer records).
- **F5 — JV Appearance knob-set gap** — JV exposes only Theme/size/accent/language
  while the shared appearance engine (already adopted) supports the full JW set (font
  pairing, second accent, nav/heading styles, status hues). Renderer-Settings gap —
  NOT delivered by F1. Small-medium, independent of F1. Detail: ledger §F5.
- **F6 — online TTS providers, official-SDK way** — after the JW SDK pivot proves the
  glue, give JV's TTS the same treatment (OpenAI `/audio/speech` + Gemini native TTS
  come near-free; ElevenLabs is the one new vendor SDK to survey). Survey-first. After
  F1. Detail: ledger §F6.
- **F2 — speaker-attribution task scaffolding** — no `speaker_attribution` task in the
  shared taxonomy; a JV-only need, meaningful only after F1. Detail: ledger §F2.

## Your-box checks (only the Windows / 2070S machine can finish these)

- **Warm the default local model into VRAM on startup (2026-07-21, user).** New
  `src/renderer/src/services/warmDefault.js`, fired fire-and-forget at the `main.js`
  boot tail. Self-gated: the `warmDefaultOnStartup` engine-config flag (default ON;
  toggle in the Local-engine panel) + the built-in provider being the routing default
  with a DOWNLOADED chat model + engine installed + not already resident — else a no-op
  (so cloud-default users + fresh/CI boxes never trigger a load/pull). Shows as an AI
  task ("Loading your writing model") in the TitleBar chip + status panel. The
  server/setting/toggle side is in the shared runner. **Full record + touch-list:**
  `just-llm-runner/docs/plans/2026-07-21-builtin-row-engine-update-and-warm-load.md`
  (Part 2). **Box check:** with the engine installed + the default model downloaded +
  built-in as default, launch and confirm the model is resident by first chat with the
  task visible during load; toggle it off → confirm a cold start. (Can't be exercised
  in-container — no engine/GPU; the gate was proven by the smoke no-oping.)
- **Ask-the-book chat panel — header + button colour pass (2026-07-21, user-driven).**
  `src/renderer/src/components/ChatPanel.vue`. Header: "New chat" / "Chat history"
  text labels restored beside their icons; Help **?** moved to the top-right corner
  (aligned with the title); "Close" reduced to a bare **✕**; icon↔label gap fixed
  (icons moved into `UiButton`'s `#icon` slot — the inline `<Icon/> text` form put both
  in one label span, so the button `gap` never applied). Buttons re-coloured to SOLID
  fills (user rejected ghost/outlined "clear" buttons and the red-only monotony):
  **New chat = success (green)** · **Chat history = info (blue)** · **Close = primary
  (accent)** · **Build index = primary** · **Update = success** · **Rebuild = info** ·
  Rename row = info · **Delete row = danger (red)**. Verified in-container by screenshot
  (thread view: header + Build-index strip) + headless smoke (0 JS errors) + `build:vite`;
  **the history-view rows (Rename/Delete colours) could NOT be screenshot here** (a fresh
  container has no active project → no saved sessions), so give the History list one look
  on your box. Colours are a taste call — say the word to retune any.
- **CPU-only band test (2026-07-19)** — measure prefill + generation pure-CPU
  (`-ngl 0`, prompt 512/2k/8k) for the catalog MoEs + the 12B dense, against the GPU
  tune as baseline; numbers decide whether a CPU chat band (for no-dGPU users) joins
  fit/QuickSetup and whether the no-GPU empty-state copy softens. **Now automated —
  run `npm run bench:gpu` once for the baseline, then `npm run bench:cpu`** (always
  headless — watch the terminal; `--legs cpu-gemma-26b` for the one leg needing
  no download), then hand back `bench/results/<run-id>/summary.md`. The CPU band recalls
  the GPU baseline from the store rather than re-running it. `cpu-gemma-12b`,
  `cpu-qwen-35b` and `cpu-bonsai-27b` each need a download first (Bonsai also needs a
  Smart Add — repo `prism-ml/Ternary-Bonsai-27B-gguf`, file
  `Ternary-Bonsai-27B-Q2_g64.gguf`; see the caveats in `configs/cpu.json`). Recipe
  + results table: `just-llm-runner/docs/plans/2026-07-19-cpu-only-band-test.md`; the
  Google-answer fact-check behind it:
  `just-llm-runner/docs/plans/2026-07-19-cpu-inference-research.md`.
- **19 probe scripts still carry a Linux-only `findChrome()` (2026-07-19).** An unfiltered
  grep found 20 copies of it under `scripts/`; the two GATES (`headless-smoke`,
  `book-smoke`) plus the bench now import the shared `tests/lib/smoke-common.js`, which
  also handles Windows/macOS layouts. The remaining 19 (`rag-probe`, `chip-probe`,
  `switch-probe`, `shot.js`, `reset-ui-test.js`, …) are one-off probes for shipped work
  and **cannot find a browser on Windows at all**. Convert them to the shared import, or
  delete the dead ones. Detail: `docs/plans/2026-07-19-llm-bench-harness.md`.
- **`book-smoke.js` unverified since the shared-helper extraction (2026-07-19)** — it needs
  the DEV renderer (`window.__jwProject`) and so a vite dev server on port 1420, which was
  occupied by the live app all session. One run when 1420 is free closes it.
- **Bench harness — first real run + the restore fire-test (2026-07-19).** The harness
  is built and unit-green but has **never run end-to-end**: no feature run has reached a
  live model through it, and `--restore` is proven only against a fake client. Owed: one
  full run (the CPU-band config above) and one deliberate mid-leg kill → `npm run bench --
  --restore bench/results/<run-id>` → confirm the Routing tab shows the original
  assignments (the escape proven to FIRE). *(2026-07-20: the `--headed`/`--tauri` watch
  modes were removed — the bench is headless-only, the terminal is the view — so the old
  "one `--tauri` attach" leg of this check no longer exists.)* Detail:
  `docs/plans/2026-07-19-llm-bench-harness.md`; usage: `docs/bench.md`.
- **Thinking-budget redesign (2026-07-16)** — the visual look (your call) + two box
  tests: think OFF/ON A/B (the day's original question) and the b9993 loop re-test.
  Detail: `just-llm-runner/docs/plans/2026-07-16-think-ab-and-loop-retest.md`.
- **Load / unload / download control (2026-07-17)** — the look: load phases/words ·
  instant cancel · "Unloading…" no-flicker · QuickSetup unchanged. Plus the pre-existing
  Windows **lspci** test failure (Linux-only path; the 2× `ensure_model_ready` GIL-starvation
  races were FIXED 2026-07-20 — `_yield_poll`, runner `tests/test_lifecycle.py`). Detail:
  `just-llm-runner/docs/plans/2026-07-17-load-cancel-and-one-progress-control.md`.
- **Provider SDK pivot — OpenAI/xAI/Mistral only (2026-07-17)** — the re-add flow
  (Gemini/Claude/Ollama delete→restart→re-add, key, Fetch → chat/entitySweep/ask-the-book)
  and the #12 key mask/reveal were **box-checked good 2026-07-20**. Remaining: OpenAI, xAI
  and Mistral stay live-unverified until you have funded keys — connect them then. Detail:
  `just-llm-runner/docs/plans/2026-07-17-provider-native-dialects-plan.md`.
- **Unit 2 reasoning acceptance** — one local High chat run stopping at the hardware
  cap · one new-Anthropic run with reasoning words on the wire, no 400. Ledger §G.
- **Ledger §G1–G6** — Plan B on-device gates (G1) · portable data folder (G2) · the
  RTX 2070S spawn failure, now self-reporting (G3) · marketing screenshots run (G4) ·
  full RAG end-to-end + router-flag confirm (G5) · Windows AMD/Intel detection
  spot-check (G6). Detail: ledger §G.
- **Providers-surface rounds** — the per-round box checks (ROUNDs 9–19; newest is
  ROUND 19's four). Detail: `just-llm-runner/docs/plans/2026-07-06-providers-surface-redesign.md`.
- **AI-surface pass (2026-07-19) — NOTHING in it has been looked at.** Six shipped changes,
  three of them pure look/feel, verified only by jsdom (asserts presence, never geometry).
  Each panel opened + closed from its nav trigger TWICE · click-outside and Esc on each · no
  dimming on any surface · modals still do NOT close on outside click · a Select opened inside
  chat picks an option WITHOUT closing the panel (the mousedown-vs-click edge `usePanelDismiss`
  exists for) · a modal dragged: jump on grab, clamp at each screen edge · the tab strip's
  GUESSED `max-width: 520px` · the `.lu-qs-band` seating · the built-in row's density with its
  third badge. Detail: the four `2026-07-19-*` plan docs (recap GO section names them).

## Parked (wakes on a trigger or a fresh user ask — not active work)

- **D5 — remote curated model catalog** — parked by the user; the recorded shape is
  ready for when it wakes (versioned JSON manifest as a GitHub release asset, overlaid
  on the seed). Detail: ledger §D5.
- **D6 — in-app HF "Discover" surface + the TurboLLM feature-adoption study** —
  discuss/research later (keep our curated list as the quality floor, add HF search).
  Detail: ledger §D6.
- **I3 — Apple-Silicon fit/tune refinements** — parked until a Mac exists to verify
  against. Detail: ledger §I3.
- **I5 — the deferred parking lot** — per-scene incremental snapshots · full per-entity
  write REST · RAG sqlite-vec ANN index · spawn boot/splash UX · extract kit `common/`
  → a `@delebash/ui` package · llama-swap optional layer · the Tauri/package rename PR.
  Wake on need. Detail: ledger §I5.
- **claude-config standalone provisioning** — prove a fresh web container can provision
  `~/.claude` directly from `github.com/delebash/claude-config`, after which JW's
  vendored `claude-config/` copy can go. Context (was the recap's "STAGED → RESOLVED",
  deleted 2026-07-19): the extraction itself is DONE — `github.com/delebash/claude-config`
  is the source of truth, local clone `~/.claude/claude-config`, pulled by `self-update.sh`
  each new session; JW's `claude-config/` copy is the synced WEB provisioner that the env
  Setup script installs from. Only the fresh-container proof is outstanding.
- **F3 — audiobook converters + speaker-attribution deep research** (JV) — parked
  research TODO. Detail: ledger §F3.
- **I6 — the JV tail beyond F1–F5** — gated on F1; F1's own scope discovers the
  survivors. Detail: ledger §I6.
