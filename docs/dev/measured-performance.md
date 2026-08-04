# Measured performance — the distilled evidence (JW's box + laptop)

Distilled 2026-08-04 by the docs campaign from the measurement plans, all now in
`../plans/archive/` (llamacpp-config-tuning-2070s · igpu-research-and-cpu-band-recovery ·
per-band-model-survey · mtp-verify-think-ab-bench · onbox-profile-ab-test ·
session-handoff-and-verification-debt). Numbers are quoted from the originals —
re-measure before trusting any of them across an engine pin bump or hardware change.
Box: RTX 2070 SUPER 8 GB · Ryzen 7 5700X · 32 GB RAM. Laptop: Core Ultra 7 165U ·
32 GB · Arc iGPU.

## The 2070S tuning verdicts (llama.cpp b9870 era)

- **The ncmoe knob is the big lever** (Gemma 26B-A4B, ctx 32k, MTP on): ncmoe 30 →
  pp 64.0 / tg 22.3 / 3.6 GB … **ncmoe 20 → pp 93.2 / tg 30.4 / 7.7 GB** (floor,
  ~460 MB free); 18 = OOM. ≈ +46% prefill / +36% gen from the knob alone; cost
  ≈ 0.41 GB VRAM per expert layer moved to GPU; MTP acceptance ~58-60% throughout.
- **Writer profile winner (ctx 8192): ncmoe 20 · batch/ubatch 512/512** — TTFT
  14.6 s → **1.7 s (8.6×)**, prefill 60.5 → 516 (8.5×), gen ~1.5×. Threads 8 ≈ 12 ≈
  16 > 6 (keep 8); spec-draft-n-max 2 ≈ 3 ≈ 4 (keep 2); batch 1024 = 512.
- **Book-chat winner (ctx 32k): ncmoe 21 · 512/512** — TTFT 144 s → **14.9 s**,
  pp 561, tg 32.3, 7.7 GB (478 MB free); ncmoe 20 OOMs with the embed co-resident.
  Reasoning budget: rb0 50.6 s · **rb1024 88 s complete+structured (the keeper, as a
  loop SAFETY CAP)** · rb2048 thinks itself out of the answer.
- **Embeds run on CPU** (`n-gpu-layers 0`): 549 MB vs 1233 MB on GPU, query latency
  unchanged (46 vs 51 ms), frees ~684 MB VRAM. (`--device none` is 5-8 min full-index
  — too slow.) NOTE: `-ngl 0` on a CUDA build is NOT pure CPU — 549 MB VRAM +
  GPU-offloaded large-batch matmuls; two "-ngl 0 = pure CPU" comments in the tree are
  wrong (tracked).
- **`sleep-idle-seconds = 30`** is the hands-free fix for the native-router
  autoload-while-awake 500 (7.1 GB → 440 MB asleep; next load 7-12 s; wake ~8 s).
- Gemma 4 iSWA supports neither `context-shift` nor `cache_reuse` — tested,
  deliberately not added.
- Arbiter lesson: `compute_fit` booked an ngl-0 load as 0 MB (measured 549 MB) —
  fixed by measure-and-true-up. A SLEEPING router child is NOT VRAM-free, and
  stopping the JW server can orphan its router child on Windows (tracked).
- Auto-tune rule as productized: best decode tok/s with a **5% tie band resolving to
  the HIGHER n-cpu-moe**; MoE-monotonic pruning below a failed ncmoe.

## One profile, not two (the on-box A/B, 2026-07-06)

Cache-busted medians: writer profile TTFT 1.68 s / 31.6 tok/s vs book-chat profile
**1.52 s / 28.3** — B equal-or-better on TTFT, decode ratio 0.89 (inside the 20%
tolerance) → **ONE catalog row** (`gemma-4-26b-a4b-qat`); the writer/chat split moved
to per-task `think` flags; rb1024 moved to the runner's base switch bundle. Model
switch price: **7.7 s** median. Per-request `enable_thinking` works on Gemma 4
(default 598 thinking chars / 15.9 s → off: 0 chars / 3.9 s).

## Think ON/OFF (judged A/B, 2026-07-20)

Think-off: Gemma 4/4 on HQ2 at ~10-15 s wall; Qwen 4/4 richer at ~21-31 s. Think-on
adds NOTHING on Gemma (one run got THINNER) for 4-10× the TTFT (38-70 s), polish on
Qwen for 87-119 s TTFTs → **think-off default confirmed; think stays per-request**.
Qwen ≥ Gemma by a real-but-modest margin at tg 6.9 vs 13.4 and peak RAM 24.4 vs
21.5 GB → **the 8 GB-class default stays Gemma 26B**. HQ1's ceiling was retrieval
(k=6), not the model.

## MTP verified (2026-07-20)

All 17 requests speculated — draft acceptance 0.47-0.91, mean accepted run 1.94-2.83;
bare-GGUF llama-bench 11.47 tok/s vs the app path's 23.5 ("the measured 2×" = MTP +
q8_0-KV/flash-attn deltas). Before ~07-15 MTP was configured-but-broken (wrong
drafter filename pattern). Qwen's MTP lives INSIDE the main GGUF (`spec-type
draft-mtp`, no `model-draft`). Untuned rows keep MTP (measured 58.9-60.5% acceptance
with zero tune rows). StyleTune's drafter earns nothing (10.85-11.71 ≈ without);
Goetia is fastest (16.3 tok/s) but REJECTED — leaks `<|channel|>thought` raw and
returns empty messages on `/v1/chat/completions`.

## CPU band + iGPU laptop (2026-07-22)

- **Pure CPU is not viable for interactive book-chat on the 5700X** — cold first
  token 27-67 s across models (26B-A4B the band's best at med TTFT 26.9 s; 12B dense
  48.5 s). Decode is fine (9.4 tok/s). The floor is real; the target stays iGPU.
- Bonsai-27B: the "won't load" was a catalog-id typo; loads in 13 s but **0/10 chat
  runs completed** — unusable pending CUDA Q2_0.
- Qwen-35B honest re-run: 6.8 tok/s decode but ~21 GB resident — the original "4.6"
  was memory-thrash (0.8 GB free).
- **Intel Arc iGPU rules**: iGPU wins prefill (pp8192 117 vs CPU 55-63), CPU wins
  decode (15.3-16.7 vs 10.8-11.5) — and the laptop's CPU decode beats the desktop's.
  **flash-attn HURTS Arc prefill** (117 → 65.6) — fa OFF is the Intel-iGPU-Vulkan
  rule; ubatch 512; **ncmoe 0 wins both axes on iGPU** (the dGPU technique does not
  transfer). Class config `igpu-mem32` + 26B-A4B: ngl 99 · fa 0 · ub 512. `uma`
  flag: laptop 1, 2070S 0.
- Radeon 780M (32 GB shared): Q4_K_M 26B at pp 208.7 / tg 25.0 — that tier needs no
  special catalog. 16 GB shared tier needs ≤ ~8 GB total footprint. **Quant law for
  iGPU/Vulkan: Q4_K_M / UD-Q4_K_XL, never IQ*/exotic.**
- llama-bench has NO `-c` flag — the harness once passed ctxLen and killed every CPU
  matrix (fixed); the CPU raw pp/tg matrices are still unmeasured (tracked).

## Per-band seeds (2026-07-25, the shipped `DEFAULT_CLASS_TUNES`)

vram12 (any RAM) + vram16|ram16 → **12B QAT** (12B fully resident ~10.7 GB; the
26B's measured 21.5 GB leg peak excludes 16 GB-RAM boxes) · vram16|ram32/64 →
**26B-A4B, no placement flags — `--fit` places** (est ~17.7 GB) · vram24 → 26B-A4B
ngl 99/ncmoe 0. vram8|ram16 closed by measurement: 12B decodes **39.1 tok/s at
ngl 99** (6.7 GB, "nearly resident") vs E4B 82.3 — quality-first rule gives 12B the
row. Trimmed: Qwen3.6-35B (2× slower than flagship here), E2B. Embeds: **Qwen3-4B
default everywhere** (won the 07-12 A/B vs 0.6B, +6.6 English retrieval); 8B on the
big rung; KaLM-Gemma3-12B contender-only. Embed placement subtracts the chat
default's est_vram claim, not the bare floor (the 16 GB proof case: floor math said
10+ GB leftover; est math says 0 → CPU). Upstream trap #24350: `--fit` (default on)
fails to create a context when loading a `gemma4_mtp` draft — cure `--fit off`.

## Boot + downloads (2026-07-20 §20-33 — the mtp-verify doc, not igpu)

- **Boot 4.1 s → 2.3 s (-45%)**: provider registration cost 2,088 ms of a ~4,100 ms
  cold start (openai +586 · claude +584 · gemini +918) — fixed by deferring
  vendor-SDK imports (`llm_runner/llm/_lazy.py`, the user's Option A). Earlier:
  `seed_workspace` ~900 → 86 ms by lazy `httpx.Client` (4× `load_verify_locations`
  = 0.844 s). The user's venv boots ~5.2 s cold — the biggest un-built lever is
  `lib.rs:377-391` killing + respawning the server every launch (reuse VETOED by
  the user). Latent: providerBackend/routingBackend retry 3×700 ms = a silent 2.8 s
  on any shape-check failure (tracked).
- **Downloader 429s**: one request per 8 MB chunk (~1,775 for a 14 GB GGUF) against
  HF's per-IP request caps; retries capped at 2 s all landed in one window. Fix:
  chunk-size floor scaling (≤ ~32 requests/file), one `_RateGate` per download
  (floor 1 s cap 300 s), HF token on every call. `huggingface_hub` rejected — no
  cancellation API.
- Fonts: 15 render-blocking Google families → 16 static `@fontsource` families,
  0 external requests (variable packages rename families JustVoice consumes — static
  on purpose).
- Splash plate: 275 KB JPG; **fit = `fill`** — contain bands, cover crops ("E BOOK"),
  fill distorts 2.6-14% but never loses content.
- `/health`-before-seed: buys 36 ms of a ~975 ms warm pre-listen window — dropped
  (the 2026-07-25 record's one measured line; there is no snippet).
