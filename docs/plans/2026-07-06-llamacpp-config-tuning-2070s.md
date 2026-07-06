# llama-server config tuning — RTX 2070 SUPER (8 GB) / Ryzen 5700X

**Status: DONE — tuned ini applied + end-to-end verified; all approved shared-stack fixes implemented (2026-07-06). Backup: `models.ini.bak-2026-07-06`.**
**Goal:** best `models.ini` settings for the two working AI configs on this machine.
**Rule for this effort:** investigation is free; nothing runs or gets edited without the user's explicit **"go"**. The tuned values land in `models.ini` only at Phase D, after a shown diff.

## The two targets (user-defined)

| | `writing-assistant-gemma-moe-mtp` | `book-chat-gemma-moe-mtp` |
|---|---|---|
| Job | Raw creative continuation, autocomplete, expansion, dialogue | Deep research, reading logs, cross-referencing lore |
| Model | Gemma 4 26B-A4B QAT Q4_K_XL — 14.2 GB, **30 layers**, 128 experts/8 used, + Q4_0 MTP draft (252 MB) | **Same Gemma model**, different launch config |
| ctx / thinking | 8192 / `reasoning-budget 0` | 32768 / `reasoning-budget 1024` |
| Optimize for | **TTFT + snappy short generations** (in-editor typing aid) | **Long-prompt prefill throughput + sustained gen** |

> **Correction (user, 2026-07-06):** book-chat runs the **Gemma** section, not `book-chat-qwen-moe-mtp` — the only Qwen actually in use is the embedding model (`book-index`). The Qwen3.6-35B chat sweep was cancelled mid-run; its Phase 0 metadata below is kept for reference only.

Both sections live in `src-tauri/target/debug/data/ai-cache/llamacpp/b9870/models.ini`
(llama.cpp build b9870, router mode, `models-max = 2`, CUDA).

## Hardware facts

- **GPU:** RTX 2070 SUPER, 8192 MB VRAM; ~600 MB used by desktop at idle (re-verify each session).
- **CPU:** Ryzen 7 5700X — 8 physical / 16 logical. **RAM:** 32 GB (~18 GB free). **SSD:** ~2.45 GB/s reads.
- `--n-cpu-moe N` = experts of the *first N layers* stay on CPU. Gemma has 30 layers → the ini's `37` clamps to 30 = **all experts on CPU** (slowest/safest). Speed = lower N until VRAM runs out.

## Measured so far (Gemma 26B-A4B, ctx 32768, MTP on, batch 64/32, threads 8, q8_0 KV)

~960-token prompt → 250-token gen, single run each, **no embed co-resident**:

| n-cpu-moe | pp tok/s | tg tok/s | VRAM total | note |
|---|---|---|---|---|
| 30 (=37, current) | 64.0 | 22.3 | 3648 MB | ~4 GB VRAM idle |
| 28 | 67.3 | 24.7 | 4472 MB | |
| 26 | 72.8 | 26.1 | 5282 MB | |
| 24 | 78.7 | 25.0 | 6097 MB | |
| 22 | 85.8 | 29.6 | 6913 MB | |
| **20** | **93.2** | **30.4** | 7731 MB | floor at 32k ctx; ~460 MB free |
| 18 | — | — | — | **OOM** (exit at load) |

≈ **+46% prefill / +36% gen** available just from the ncmoe knob. MTP acceptance ≈ 58–60% throughout (creative-prose prompt). Cost ≈ 0.41 GB VRAM per expert layer moved to GPU. Writing-assistant runs ctx 8192 (KV ~4× smaller) → its floor will be lower than 20.

## Embed model findings (code-verified 2026-07-06)

`book-index` = Qwen3-Embedding-0.6B Q8 (~640 MB GGUF), currently `n-gpu-layers = -1` (GPU).

- **Call sites (all RAG, none in the writing path):** index build (manual + optional auto-rebuild 60 s after last edit — `services/rag/autoIndex.js`); one small query-embed per book-chat question (`rag/chat.js`); character chat same.
- **Residency design:** first embed call → `POST /v1/llm-runner/ensure-embedding` → loads + **pins** the embed in the VRAM arbiter (`just-llm-runner/llm_runner/runner/arbiter.py`: pinned embed + LRU-evictable chat model). Client tolerates router `sleeping` state (`services/embedApi.js`).
- **"Unload embed on demand" verdict: NO.** Load time isn't the issue (640 MB ≈ 1–3 s). The killer: book-chat needs embed → big-model back-to-back per question; with a VRAM-maxed big model, re-admitting the embed forces evicting the 14 GB chat model → ~10–20 s reload **every question** = thrash.
- **Chosen direction instead: embed on CPU** (`n-gpu-layers = 0`). Frees the whole GPU for the big model, embed stays permanently resident in ~700 MB system RAM, zero eviction dance, one ini line, no app change. Expected query-embed cost on 5700X: ~100–300 ms (invisible vs generation). Risk to measure: bulk index-build speed on CPU + thread contention if a rebuild coincides with generation.

## Phase 0 results (2026-07-06)

- **Idle desktop VRAM: 471 MB** → usable budget ≈ 7.5 GB (user OK'd pushing to ~300–400 MB free).
- **Qwen3.6-35B-A3B** *(reference only — NOT a tuning target per user correction)*: 22.85 GB file, 41 layers, 256 experts/8 active, MTP embedded. ⚠ If ever activated: `no-mmap+mlock` at ncmoe 37 pins ~18 GB RAM — at this machine's edge.
- **Embed GPU-vs-CPU** (Qwen3-Embedding-0.6B Q8, measured):
  | variant | VRAM | query | bulk64 | full-book index |
  |---|---|---|---|---|
  | GPU `-1` (current) | 1233 MB | 51 ms | 1.3 s | ~18 s |
  | **`n-gpu-layers 0`** ✅ | 549 MB | 46 ms | 3.2 s | ~45 s |
  | `--device none` | 91 MB | 28 ms | 22–33 s | 5–8 min |
  **Decision: `n-gpu-layers = 0` for `book-index`** — frees 684 MB, query latency unchanged, index builds still GPU-assisted at big batch. Load time 1 s. Phases A/B benchmark with this embed co-resident (separate process, like router children).

## Phase A results — writing-assistant-gemma @ ctx 8192, embed(ngl0) co-resident

Continuation ≈ 890-token prompt → 200-token gen; autocomplete ≈ 400-token prompt → 60-token gen.

| config (ncmoe / batch / ubatch) | TTFT | pp t/s | tg t/s | auto-TTFT | VRAM peak |
|---|---|---|---|---|---|
| 30 / 64 / 32 *(current-ini behavior)* | 14.6 s | 60.5 | 18.8 | 5.7 s | 3679 |
| 20 / 64 / 32 | 10.1 s | 87.6 | 28.3 | 3.9 s | 7763 |
| 20 / 512 / 256 | 2.6 s | 335 | 31.4 | 1.3 s | 7489 |
| **20 / 512 / 512 (winner)** | **1.7 s** | **516** | 27.6* | **0.9 s** | 7586 |
| 18 / any | — | — | — | — | **OOM** |

\* tg readings carry ±10% run-to-run noise (MTP acceptance varies with sampled text); ub256-vs-ub512 tg is within noise — settled by Phase C repeats. Threads 8≈12≈16>6 → keep 8. spec-draft-n-max 2≈3≈4 → keep 2. batch 1024 = 512. no-MTP ≈ MTP-on for tg in this run (noise); MTP kept (no VRAM/latency cost measured: draft +~290 MB, load +2 s).
**Floor: ncmoe 20 (same as 32k ctx — Gemma iSWA means ctx size barely moves KV).** Net vs current ini: **TTFT 8.6× faster, prefill 8.5×, gen ~1.5×.**

## Phase B results — book-chat-gemma @ ctx 32768, embed(ngl0) co-resident, chat API

8.3k-token lore corpus + cross-ref question, thinking on (reasoning-budget 1024):

| config | TTFT | pp t/s | tg t/s | total answer | VRAM |
|---|---|---|---|---|---|
| current ini (30 / 64 / 32) | **144 s** | 57.8 | 24.4 | ~197 s | 3862 |
| 22 / 512 / 512 | 15.3 s | 544 | 32.7 | ~56 s | 7304 |
| **21 / 512 / 512 (winner)** | **14.9 s** | **561** | 32.3 | ~54 s | 7714 (478 free) |
| 20 / any | — | — | — | — | **OOM** (embed pushes the 32k floor up one layer) |

**reasoning-budget probe** (complete answers, n_predict 2500): rb0 = 50.6 s wall, decent but conflates roles; rb1024 = 88 s, complete + structured; rb2048 = 6.3k chars of thinking that starved the answer. **Keep 1024 — and per the user it exists as a SAFETY CAP against reasoning loops** (same rationale as book-chatIQ4's `256` note), not a quality dial: do not raise it; at ~32 t/s it bounds a stuck loop to ~30 s before the budget message forces the answer. rb0 remains a valid "fast mode" (–40% wall) if a loop-free quick path is ever wanted.

## Phases

- **Phase 0 — recon/measure:** idle VRAM; embed footprint + latency on GPU vs CPU (1 query + 64-chunk batch + load time); Qwen GGUF metadata → predicted ncmoe starting points; synthesize prompt sets (writing: autocomplete/continuation/dialogue; research: ~12k-token lore corpus + cross-ref question, thinking on).
- **Phase A — writing-assistant (Gemma @ 8192, thinking off):** ncmoe floor → batch/ubatch (64/32→512/256, TTFT headline) → threads (6/8/12/16) → spec-draft-n-max (2/3/4) → re-tighten ncmoe. Embed co-resident per Phase 0 decision. Push to ~300–400 MB free (user-approved).
- **Phase B — book-chat (**Gemma** @ 32768, thinking 1024):** ncmoe floor with embed co-resident (expect 21–22: the 32k no-embed floor was 20 at 7731 MB; +549 MB embed pushes it) + ubatch 256/512 + reasoning-budget 512/1024/2048 (wall time vs eyeballed quality). Chat API (template + reasoning-budget apply). Headline: long-prompt prefill + total answer wall time.
- **Phase C — validation:** winners ×3 runs + ~90%-ctx stress; **router switch test** (writing-assistant ↔ book-chat-gemma share one GGUF but are separate router ids → expect full evict+load on switch; measure cold/warm — page cache should make warm ≈ 6–10 s); **eviction-order check** (switching big models must evict the old big model, not the pinned embed).
- **Phase D — ship:** back up `models.ini` → edit the two sections (+ embed line if CPU wins) → show diff → user tests in app.

## Phase C results — validation + router behavior (2026-07-06)

- **ub256 vs ub512 tiebreak (3× each):** tg identical within noise (30.6 vs 30.8 avg); ub512 prefill 544 vs 333 t/s → **ub512 wins**. Writer final: ncmoe 20 / 512 / 512 (TTFT 1.6 s, auto-TTFT 0.87 s).
- **28k full-ctx stress (book-chat):** pp sustained 551 t/s over ~28k tokens, tg 34.7, VRAM peak 7729, no OOM.
- **Native-router switching** (models-max 2, autoload — the production shape):
  - Explicit `POST /models/unload` → clean ~12 s switch, always.
  - **Autoload while the other model is awake → HTTP 500 AND the target id stays bricked until router restart** (router spawns the new child without evicting; co-load exhausts VRAM/RAM; child dies on draft load `invalid vector subscript`; retries keep 500ing). This was the pre-existing failure mode of the user's setup, independent of tuning.
  - **`sleep-idle-seconds = 30` (now in `[*]`) → hands-free fix:** idle model sleeps + fully frees VRAM (7.1 GB → 440 MB); next model loads clean in 7–12 s; sleeper wakes on demand in ~8 s. Caveat: switching within the 30 s window still hits the brick path — after a 500, restart the router.
  - Embed child survives all switching; embed sleeping is harmless (client accepts `sleeping`; wake ≈ 1 s).
- Proper long-term fix: the `just-llm-runner` service arbiter does explicit unload→load (pin + LRU) — when JW's runner-service cutover lands, the brick path disappears.

## Phase D — applied to `b9870/models.ini` (backup: `models.ini.bak-2026-07-06`)

- `[*]`: + `sleep-idle-seconds = 30`
- `[writing-assistant-gemma-moe-mtp]`: n-cpu-moe 37→**20**, batch 64→**512**, ubatch 32→**512**
- `[book-chat-gemma-moe-mtp]`: n-cpu-moe 37→**21**, batch 64→**512**, ubatch 32→**512** (rb 1024 kept — loop safety cap)
- `[book-index]`: n-gpu-layers -1→**0** (CPU embed, frees 684 MB)
- End-to-end verified against the real file: router healthy, embed 1.2 s, writer gen OK, idle-sleep frees VRAM, switch 10.5 s, thinking OK, embed survives.

## Shared-stack (DB) integration — the follow-up work (evaluated 2026-07-06)

**User-set frame:** the DB world is the destination — the hand ini was per-machine tuning; Gemma 26B will be added to the DB catalog (user does this in-app), the engine on disk is **b9870** (the b9644 seed value is stale/wrong), and the tuned values must land as DB data so Gemma becomes a selectable option.

**What the dive established** (live DB `data/justwrite.db` + `just-llm-runner` code):
- JW mounts the whole shared stack in-process (`app.py:142-149`); local serving = lifecycle router @8080 + ini GENERATED from DB. `llm_usage` empty + `rag_vectors` 0 → this path is essentially unused so far; the manual b9870 router carried all real use.
- Resolution chain for a launch: `switch_presets` base (flash_attn on, q8_0 KV, mlock, **context_shift true, cache_reuse 256**) + type preset `moe` (no_mmap) + `hardware_switches` (machine-wide, keyed `hw_key`) + `model_tunes` (model+machine) → `Overrides` → emitted ini. `model_tunes` + catalog `mtp_draft_*` columns are in code (`llm/db.py`) but the live dev DB predates them — per MORNING_RECAP's dev-harness note this needs the documented **one-time `POST /v1/data/reset`** (the schema does NOT auto-migrate on boot; the smoke 500s on `no such column: model_catalog.mtp_draft_repo` until reset). After a reset, the reseed writes `pinned_build = b9870` automatically (the seed constant was fixed 2026-07-06), so the reset does not regress the direct row update.
- External MTP drafts are first-class: catalog `mtp_draft_file` (e.g. `"MTP/gemma-4-26B-A4B-it-Q4_0-MTP.gguf"`, same-repo) → lifecycle auto-downloads + wires `--model-draft` (`lifecycle.py:791-808`).
- The service path has NO brick-on-switch bug (explicit `pick_evict` → `/models/unload` before load) and idle-TTL 900 s.

**DB data needed to reproduce this tuning in-app** (once Gemma is added to the catalog):
1. `runner_setting.pinned_build` → **b9870** (+ fix the seed constant `runner/config.py DEFAULT_PINNED_BUILD` and re-verify the release asset URLs for b9870, else it regresses/re-downloads b9644 — which likely can't load Gemma 4 MoE at all). The existing `ai-cache/llamacpp/b9870/` dir is exactly `binary_dir(cache_root,"b9870")`, so discovery finds the installed exe — no re-download.
2. Catalog: Gemma 26B-A4B entry — `hf_repo unsloth/gemma-4-26B-A4B-it-qat-GGUF`, quant `UD-Q4_K_XL`, `type moe`, `mtp 1`, `mtp_draft_file MTP/gemma-4-26B-A4B-it-Q4_0-MTP.gguf`, min_vram ~4000 / min_ram ~24000. **Open design point:** writing (ctx 8192, rb 0) vs book-chat (ctx 32768, rb 1024) is a per-TASK split; per-model tunes can't hold both → either two catalog entries over the same GGUF (HF snapshot shared, no double download) or the `engine_preset_switches` surface if it feeds launch flags (verify — table exists, empty).
3. `model_tunes` rows under this machine's `hw_key`: Gemma → `n_cpu_moe 20` (@8k) / `21` (@32k), `batch_size 512`, `ubatch_size 512`, `threads 8`; embed `qwen3-embedding-0.6b` → `n_gpu_layers 0` (CPU embed; frees 684 MB).
4. Re-point the 8 `engine_presets` (all currently `qwen3.6-35b-a3b-mtp`) at the Gemma entries per task kind.

**Code fixes recommended in `just-llm-runner`:** *(all but the last APPLIED 2026-07-06 — see §Approved fixes below for the full implementation record)*
- ✅ **Arbiter under-reserve** — fixed via measure-don't-assume true-up (not a constant; see below). Original finding: `process.py:335-341` assumes an `n_gpu_layers 0` load reserves 0 VRAM — measured: a CUDA-build child at ngl 0 still holds **~550 MB** CUDA context (only `--device none` avoids it, at 10× bulk-embed cost).
- ✅ Seed `DEFAULT_PINNED_BUILD` → b9870 with verified asset URLs (above) + the live DB row.
- ⬜ (Nice-to-have, NOT done) foreign-listener guard: if :8080 is already held by a non-service llama-server, fail with a clear message instead of a bind error.

**Hand-ini parity notes:** the DB base preset adds `context-shift` + `cache-reuse 256` (multi-turn/RAG prompt-prefix reuse) which the hand ini lacks — worth adding to the two Gemma sections; conversely the hand ini's `sleep-idle-seconds 30` is the manual-mode substitute for the service's explicit unload. Until the DB cutover is done, don't run the manual router and the app's local-llamacpp path at the same time (:8080 collision / two routers on one 8 GB card).

## Approved fixes — applied 2026-07-06 (user: "go do it all")

### ① Pinned build b9644 → b9870 (seed + live DB)

**Why:** the user's actual engine on disk is llama.cpp **b9870** (installed at `ai-cache/llamacpp/b9870/` — exactly where `binary_dir(cache_root, "b9870")` looks, so discovery finds it with no re-download). Gemma 4 MoE (26B-A4B) + its external MTP draft need the newer build; the b9644 seed default was stale ("the seed info is wrong" — user, 2026-07-06).

**Asset verification (prerequisite):** all 11 filenames in `DEFAULT_BINARIES` were checked against the GitHub release API (`GET /repos/ggml-org/llama.cpp/releases/tags/b9870`, 25 assets total) — every one exists under the identical naming scheme: `llama-b9870-bin-win-cuda-12.4-x64.zip` + `cudart-llama-bin-win-cuda-12.4-x64.zip`, `llama-b9870-bin-win-cuda-13.3-x64.zip` + `cudart-llama-bin-win-cuda-13.3-x64.zip`, `llama-b9870-bin-win-hip-radeon-x64.zip`, `llama-b9870-bin-win-vulkan-x64.zip`, `llama-b9870-bin-win-cpu-x64.zip`, `llama-b9870-bin-macos-arm64.tar.gz`, `llama-b9870-bin-ubuntu-x64.tar.gz`, `llama-b9870-bin-ubuntu-rocm-7.2-x64.tar.gz`, `llama-b9870-bin-ubuntu-vulkan-x64.tar.gz`. Only the tag constant changes — the URLs derive from it.

**Changes:**
- `just-llm-runner/llm_runner/runner/config.py` — `DEFAULT_PINNED_BUILD = "b9870"` with a comment recording the verification date and the seed caveat.
- **Live DB** `data/justwrite.db` — `UPDATE runner_setting SET value='b9870' WHERE key='pinned_build'` (now `('pinned_build','b9870',built_in=1)`). This direct update was REQUIRED because `seed_default_runner_settings` (`llm/seed.py:589-597`) is **insert-if-missing** — it never overwrites an existing row, so the `config.py` fix alone would not have corrected this machine's DB. The constant fixes fresh installs and the Binaries panel's "reset to defaults"; the row fixes this box now. Both remain UI-editable via Settings → AI engine → Binaries panel (`LuRunnerBinaries.vue` — `pinnedBuild` input, PUT `__settings`).

### ② Arbiter VRAM true-up — measure, don't assume (no constants, nothing hardcoded)

**The bug:** `process.py compute_fit` books an `n-gpu-layers = 0` load as **0 MB** VRAM (`vram_mb = ... if n_gpu > 0 else 0`, with a comment claiming a fully-CPU load "touches no GPU (no CUDA context)"). Box-measured reality (2026-07-06, RTX 2070 SUPER): a CUDA-build llama-server child at ngl 0 still initializes a CUDA context and holds **549 MB** (the Qwen3-Embedding-0.6B child). Booking 0 makes `remaining_vram_mb` over-report the budget by ~0.5 GB for every CPU-offloaded co-resident — e.g. the pinned RAG embed — so the next chat load can be admitted ~1 expert layer too fat. (`--device none` avoids the context but was rejected: bulk-embed drops from 3.2 s to 22–33 s per 64 chunks because ngl-0-with-CUDA still GPU-offloads large-batch matmuls.)

**The fix (per the user's no-hardcoding requirement):** instead of a constant reserve, the lifecycle now **measures** each load's real footprint and trues-up the ledger:
- `runner/hardware.py` — new `used_vram_mb() -> int | None`: total currently-used VRAM across NVIDIA GPUs via the existing `_nvidia_query("memory.used")` helper; `None` when unmeasurable (no nvidia-smi — AMD/Metal/CPU boxes). Full WHY docstring with the box-measured numbers.
- `runner/lifecycle.py` — new constructor DI param `used_vram_fn=_hw_used_vram` (same injection pattern as `router_load`/`router_unload`); new helpers `_probe_used_vram()` (probe wrapped so a probe failure can never fail a load) and `_trued_up_vram_mb(estimate_mb, before)`; `_run_load` snapshots used VRAM just before `_load_via_router(...)` and reserves `max(fit estimate, measured delta)` after the confirmed load. Loads serialize under `_router_lock`, so the growth between snapshots is attributable to this load.
- **Floor rationale (why `max`, never the raw delta):** the delta can UNDER-count — an evicted victim's child still draining VRAM at the `before` snapshot, or a co-resident going to idle-sleep mid-load, both shrink it — and a shrunken measurement must not let the ledger book less than the formula's own floor. Unmeasurable (None) → estimate unchanged, exactly the pre-fix behavior.
- **Tests** (`tests/test_lifecycle.py`): harness `_service_for` gains `used_vram_fn` (defaulting to `lambda: None` so every existing exact-value reservation assertion stays deterministic on any box — the real probe would read the test machine's live nvidia-smi) and `hardware_fn` forwarding. New `test_reserve_trues_up_with_measured_vram_delta` (no-GPU hardware → estimate 0; readings 1000→1549 → reservation must be **549**) and `test_reserve_floors_at_estimate_when_delta_undercounts` (GPU hardware → real estimate; 1 MB delta must NOT shrink the reservation).
- **Test results:** `tests/test_lifecycle.py + tests/test_runner.py` → **112/112 pass**; full suite → **341 pass, 1 fail** — the failure (`test_pci_gpus_linux_lspci_name_match`, `OSError WinError 123`) is **pre-existing** (fails identically on a stashed/clean tree: it fabricates a Linux sysfs path `0000:03:00.0` whose colons are illegal in Windows filenames — a Linux-only test artifact, unrelated).

### ③ Hand-ini parity flags — tested and deliberately NOT added

The app DB base preset carries `context_shift = true` + `cache_reuse = 256`, which the hand ini lacked. Both were added to the two Gemma sections and **live-verified against the real ini** (router boot on :18099, writer long-prompt ×2 with a shared prefix, 35 s idle-sleep, book-chat switch). Result: llama-server accepts the flags but **Gemma 4's iSWA (interleaved sliding-window attention) context supports neither** — the child logs `KV cache shifting is not supported for this context, disabling` and `cache_reuse is not supported by this context, it will be disabled`, and the shared-prefix second request confirmed no real reuse (`cache_n = 7` — just the template head, not the ~600-token shared prefix). Harmless no-ops, but misleading config lines → **removed**, replaced with an in-file comment documenting the test and the reason, so nobody re-adds them expecting a win. Implication for the app path: the DB base preset's same flags will be auto-disabled identically for Gemma children — no preset change needed, the graceful-disable is the designed behavior; the flags still benefit models whose context supports them (e.g. the Qwen dense/MoE family).

**Everything else in the verified switch flow re-passed** after the final ini edit: router healthy, writer pp 355 t/s on a 632-token chat-API prompt, idle-sleep freed the writer, book-chat switch loaded clean and produced thinking (1390 chars) + answer.

## Decisions locked by the user

1. Big models used **one at a time** (router); embed co-resident. 2. Test data: synthesized. 3. VRAM headroom: push close (~300–400 MB), desktop load to be re-verified. 4. Nothing executes without "go".

## Open items / flags

- ~~Clobber check~~ **RESOLVED (2026-07-06):** the runner's generated ini path is `ai-cache/llamacpp/models.ini` (`lifecycle.py:973`) — a *different file* from the hand-maintained `llamacpp/b9870/models.ini` (read by llama-server as the models.ini beside the exe), and the generated one doesn't exist in this data root yet. Hand-editing `b9870/models.ini` is safe today. **Follow-up:** when the runner-service cutover starts emitting its ini, migrate these tuned values into the DB tunes (per-(model,hw) tune-save) or they won't apply.
- Benchmark harness + raw results: session scratchpad `bench.py`, `out_baseline.json`, `out_phase1.json` (port 18099; production ini untouched).
