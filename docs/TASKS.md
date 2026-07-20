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

- **QuickSetup: effective context in writer terms** — a small follow-up to the verdict +
  QAT-note + no-GPU-routing polish that **SHIPPED 2026-07-19** (runner `54fcfff`): show the
  model's *effective* (tuned) context as "reads ~N words at once". Deferred from that build
  because the effective ctx isn't plumbed into the wizard yet — the catalog's trained 256k
  would mislead. kit `QuickSetup.vue`.
- **Panel-dismiss decisions (2026-07-19) — both resolved 2026-07-20, no code change.**
  (a) `AGENTS.md` §5 amendment BLESSED (panels use `usePanelDismiss`, not a backdrop —
  the shipped panel-closes-and-nav-lands behavior is correct). (b) Cross-panel toggle
  WON'T DO (the two-panels-open scenario doesn't arise; revisit if it does). Rulings +
  the revert path: `just-llm-runner/docs/plans/2026-07-19-panel-dismiss-and-no-dim.md`.
- **#256 — spell-check** — not yet scoped.
- **I1 tail (3 small legs)** — SettingsView's `.wb-search*` fragment → fold into the
  shared `.entity-*` family · CommandPalette entity-creates lack the `?new` focus
  parity · promote the popup-probe from scratchpad to `scripts/` if a standing guard
  is wanted. Detail: ledger §I1 + `docs/plans/2026-07-12-i1-css-popup-voicedrift.md`.
- **I4 follow-up** — per-model GGUF delete on the catalog surface (the disk-reclaim
  panel shipped; this was the deliberate v1-excluded follow-up). Detail: ledger §I4.

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
- **A5-1 — "Update available" names the target build** — the engine-row affordance
  must read "Update available · bNNNN → bMMMM" (the TurboLLM shape) so a click's target
  is visible before committing. Small copy/data on A5's existing check. Detail: ledger §A5-1.
- **I2 — cloud prompt caching** — the Anthropic/Gemini adapters send no caching hints;
  never built, never decided. A cloud-cost optimization — worth a decision only when
  cloud usage matters. Detail: ledger §I2.
- **1b-F4 bounces the engine on a guaranteed-to-fail load (flagged 2026-07-20, needs a
  ruling)** — a fit-placed load whose child reports `failed` for a NON-OOM reason (corrupt
  GGUF, a rejected flag) hits the `n_gpu_layers is None` retry (`lifecycle.py:2159`), which
  re-emits with explicit placement and calls `_bounce_router` — a full engine restart that
  knocks down + reloads every healthy co-resident model — before failing fast on the retry.
  So one bad model can bounce the whole engine once. Surfaced by the rules-checker during
  the ensure-test fix; not built/decided. Cheap guard: skip the bounce when the failure tail
  isn't OOM. Discussion-first.
- **Recap live-queue (runner):** multi-click unload · "stalling" thresholds mislabel a
  2.6 tok/s model as stalled · the cancel/progress plan (⚠ it FAILED its 3-lens review —
  do **not** build as written; T2 would unload a different resident model). Detail:
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

- **CPU-only band test (2026-07-19)** — measure prefill + generation pure-CPU
  (`-ngl 0`, prompt 512/2k/8k) for the catalog MoEs + the 12B dense, against the GPU
  tune as baseline; numbers decide whether a CPU chat band (for no-dGPU users) joins
  fit/QuickSetup and whether the no-GPU empty-state copy softens. **Now automated —
  run `npm run bench:gpu` once for the baseline, then `npm run bench:cpu`** (add
  `--tauri` to watch it in the real app, `--legs cpu-gemma-26b` for the one leg needing
  no download), then hand back `bench-results/<run-id>/summary.md`. The CPU band recalls
  the GPU baseline from the store rather than re-running it. `cpu-gemma-12b`,
  `cpu-qwen-35b` and `cpu-bonsai-27b` each need a download first (Bonsai also needs a
  Smart Add — repo `prism-ml/Ternary-Bonsai-27B-gguf`, file
  `Ternary-Bonsai-27B-Q2_g64.gguf`; see the caveats in `configs/cpu.json`). Recipe
  + results table: `just-llm-runner/docs/plans/2026-07-19-cpu-only-band-test.md`; the
  Google-answer fact-check behind it:
  `just-llm-runner/docs/plans/2026-07-19-cpu-inference-research.md`.
- **19 probe scripts still carry a Linux-only `findChrome()` (2026-07-19).** An unfiltered
  grep found 20 copies of it under `scripts/`; the two GATES (`headless-smoke`,
  `book-smoke`) plus the bench now import the shared `scripts/lib/smoke-common.js`, which
  also handles Windows/macOS layouts. The remaining 19 (`rag-probe`, `chip-probe`,
  `switch-probe`, `shot.js`, `reset-ui-test.js`, …) are one-off probes for shipped work
  and **cannot find a browser on Windows at all**. Convert them to the shared import, or
  delete the dead ones. Detail: `docs/plans/2026-07-19-llm-bench-harness.md`.
- **`book-smoke.js` unverified since the shared-helper extraction (2026-07-19)** — it needs
  the DEV renderer (`window.__jwProject`) and so a vite dev server on port 1420, which was
  occupied by the live app all session. One run when 1420 is free closes it.
- **Bench harness — first real run + the restore fire-test (2026-07-19).** The harness
  is built and unit-green but has **never run end-to-end**: no feature run has reached a
  live model through it, `--tauri` has never attached to a real window, and `--restore`
  is proven only against a fake client. Owed: one full run (the CPU-band config above),
  one `--tauri` attach, and one deliberate mid-leg kill → `npm run bench -- --restore
  bench-results/<run-id>` → confirm the Routing tab shows the original assignments (the
  escape proven to FIRE). Detail: `docs/plans/2026-07-19-llm-bench-harness.md`; usage:
  `docs/bench.md`.
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
