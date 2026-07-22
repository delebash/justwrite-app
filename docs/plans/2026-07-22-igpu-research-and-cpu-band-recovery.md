# 2026-07-22 — iGPU model research + the CPU-band run: recovered session record

**Provenance.** The morning session of 2026-07-22 (Claude session `ff8f9629-2a8a-4d9a-93fa-c27a4dd6e324`,
~09:00–09:59 UTC / ~5:00–6:00 AM local) was accidentally closed by the user before its findings were
persisted. This doc is the recovery: the full record was extracted from the session transcript on disk
(`~/.claude/projects/E--Dev-Web-justwrite-app/ff8f9629….jsonl`) the same morning, on the user's "yes
persist". Everything below was said/measured in that session; file:line anchors marked "(re-verified
in-session)" were read against the working tree during that session, not asserted from memory.

## 1. The instrument decision — a real CPU build, because `-ngl 0` on CUDA is NOT pure CPU

The user asked whether the CPU band needs the CPU build of llama.cpp. First answer (from the bench
config's own comment) was "no — `nGpuLayers: 0` on the CUDA build forces pure CPU"; the user pushed
back ("i think you are mistaken that is old info… think again") and was right. The on-box measurement
of 2026-07-06 (`docs/plans/2026-07-06-llamacpp-config-tuning-2070s.md:176`) shows a CUDA-build child
at `ngl 0` still holds ~549 MB VRAM **and still GPU-offloads large-batch matmuls** (bulk-embed 3.2 s
vs 22–33 s with `--device none` — a ~10× swing on exactly the prefill path). So measuring the CPU
band on the CUDA build would have returned GPU-accelerated, falsely-fast `pp` numbers on the one axis
the band exists to measure. **The comments in `scripts/bench/configs/cpu.json:8` ("nGpuLayers 0
forces it even on the CUDA build") and `2026-07-19-cpu-only-band-test.md:60` are wrong as written**
— still to be corrected. The chosen instrument: the user manually downloaded
`llama-b10083-bin-win-cpu-x64` (a build with no CUDA backend compiled in, so `-ngl 0` is genuinely
pure CPU), and the bench runs against a server whose engine IS that build — the harness derives
`llama-bench` from the running server's engine dir (`scripts/bench/lib/llamaBench.js:44-48`), so
flipping the server flips the whole run.

## 2. What was changed on the box to run it — STATE THAT PERSISTS (revert owed)

Three changes were made, all still in effect when the session died; **verified still present
2026-07-22 morning by direct DB read during recovery**:

1. **Folder move:** `…\ai-cache\llamacpp\llama-b10083-bin-win-cpu-x64\` →
   `…\ai-cache\llamacpp\b10083\cpu\` (the layout `binary.py:119-124` expects; the `b10079/cuda12`
   GPU engine untouched beside it). Data root: `E:\Dev\Web\justwrite-app\src-tauri\target\debug\data`.
2. **A `cpu` `runner_binary` row registered** in `justwrite.db` — necessary because the CPU rows
   were retired from the engine config (`config.py:122-126`, "CPU builds retired"; the seeder even
   prunes cpu rows), so `preferred_gpu=cpu` alone fell back to CUDA. The row is read live
   (`stores.py:742` — no restart needed). Row as recovered: `('windows','cpu','github',
   'https://github.com/ggml-org/llama.cpp/releases/download/b10083/llama-b10083-bin-win-cpu-x64.zip',
   NULL,NULL,NULL,'llama-server.exe',0,99)`.
3. **`preferred_gpu='cpu'`** in `runner_setting` — honored by the read path (`stores.py:1388` →
   `_gpu_preference`) even though the UI write-API rejects the value.

Before any model loaded, engine status was verified to report `b10083\cpu\llama-server.exe`,
`activeGpu: cpu` — so the run is a genuine CPU measurement.

**⛔ THE OWED REVERT (not yet done):** the app will boot on the **CPU engine** until this is
reversed. Revert = set `preferred_gpu=''` + delete the `cpu` `runner_binary` row (the
`b10083/cpu` folder may stay on disk — ignored while CUDA is preferred). Additionally the bench was
killed mid-run, so **feature routing is still bench-modified**; the pre-run snapshot is saved
(`bench-results/2026-07-22_09-11-52-cpu/restore.json`, captured 09:11:55Z) and the documented fix is
`npm run bench -- --restore bench-results/2026-07-22_09-11-52-cpu`. Both actions await the user's go.

## 3. The run itself — 2 of 4 legs completed, then the session close killed it

Run `bench-results/2026-07-22_09-11-52-cpu/` (an earlier partial attempt `…_08-36-08-cpu/` was
superseded). Planned legs: `cpu-gemma-26b` → `cpu-gemma-12b` → `cpu-bonsai-27b` → `cpu-qwen-35b`,
all models already on disk, threads 8, pure CPU.

- **Leg 1 — gemma-26b-a4b (MoE, ~4B active): COMPLETE.** Load 21 s · decode **9.4 tok/s** (above
  reading speed — sparse activation working; a 26B dense would crawl) · chat cold TTFT **53.2 s**
  (wall 72 s) · chat warm TTFT **0.49 s** (wall 19 s — prompt-cache hit) · characterChat cold TTFT
  56.1 s · critique wall 100 s. The shape in one line: generation fine, cold-prefill painful.
- **Leg 2 — gemma-12b (dense): COMPLETE.** Cold TTFT **96–130 s** (dense pays full-parameter
  prefill — worse than the twice-as-big MoE, exactly as predicted); warm 39–61 s. **Harness wart:**
  the raw `llama-bench` matrix for this leg **failed on the b10083 CPU build** (backend-load error;
  feature numbers unaffected) — undiagnosed.
- **Leg 3 — bonsai-27b: NEVER ATTEMPTED — a bench-config id typo, NOT a model failure
  (CORRECTED 2026-07-22 after the user loaded it by hand in 5.7 s).** This entry originally read
  "LOAD FAILED / the model does not load on this setup" — **that was wrong.** The lifecycle log
  (`<data-root>/logs/justwrite.log` 06:24:26) shows the load failed in **114 ms** with
  `ValueError: unknown model 'ternary-bonsai-27b'` — the bench config (`cpu.json:81`) names
  `ternary-bonsai-27b` but the catalog id is **`ternary-bonsai-27b-q2-g64`** (DB-verified). The
  identical instant-failure occurred in the killed morning run at 05:37:51. The "30-minute timeout"
  was the bench's `waitLoaded` dead-waiting: the lifecycle marks a failed load `status="error"`
  (`lifecycle.py:1816`) but the bench only short-circuits on `failed|unloaded`
  (`scripts/bench/lib/llamaBench.js` / `lib/server.js:137`), so it never saw the error. The user
  then proved the model loads fine raw: `llama-server -m <bonsai blob> -c 4096 -t 8` → **model
  loaded in 5.7 s**. Bonsai's CPU leg is therefore STILL OWED, with the corrected id. Full
  diagnosis of every defect this exposed: **§8**.
- **Leg 4 — qwen-35b: loaded but slow + RAM-bound (same run).** Loaded in **73 s**, `measure` decode
  **4.6 tok/s** (slower than gemma-26b's 9.4 despite fewer active params — the larger total pages
  harder on CPU + MTP-draft overhead), chat run 1 cold **TTFT 92 s / wall 120 s / 997 chars**. The
  run was then **killed by RAM exhaustion** during chat run 2: qwen-35b held **~21 GB** and the RAG
  retrieval co-loaded **qwen3-embedding-4b (~4 GB)**, driving a 32 GB box to **0.8 GB free** → thrash
  → kill. **This is itself a headline finding: a 21 GB model + the RAG embedding model does not fit
  32 GB with headroom** — leg 4 has no `summary.md` and no `leg.json` (legs write on completion).

**CPU viability verdict (big models) — three of four legs read: not viable for interactive
book-chat.** Best case gemma-26b is 9.4 tok/s decode but 53 s cold TTFT; gemma-12b 96–130 s;
qwen-35b 4.6 tok/s + 92 s TTFT + exhausts 32 GB RAM with RAG (the 92 s/21 GB numbers are TAINTED —
qwen was respawned at ctx 131072 instead of the leg's 8192 by defect C in §8, so its leg needs a
re-run after the fix). Bonsai has NO datapoint yet (§8 defect A — never attempted; leg owed).
Decode is tolerable; **cold prefill (50–130 s to first token) and RAM capacity are the walls** —
consistent with the thesis that pure CPU is only the floor and the real target is small models on
an iGPU (§5–§6).

**Box state after the finish run (cleaned 2026-07-22):** the reconciler + `warm_default_on_startup=1`
kept re-warming qwen-35b (routing still points 5 features at the Bench preset → qwen) to 21–23 GB
every time it was stopped — `/stop` would not make it stay down. Since nothing was actively running,
the bench server (that this session started) was stopped to free the RAM (25.3 GB free after); the
CPU engine flip in the DB is untouched (kept for possible small-model CPU legs). The orphan vite on
:1420 (from the killed morning session) was left up — negligible RAM.

**ROUTING IS DIRTY — needs a reseed, values from the seed not guessed.** `feature_preset_refs` has
five features pointed at the Bench preset `9d4ebeddeb96` from *nested un-restored* bench runs:
`chat`, `characterChat`, `critique`, `writerAI.continue`, `writerAI.rewrite`. The true seed values
were overwritten *before any restore.json snapshot existed*, so **no restore file recovers them** —
the `09-11-52/restore.json` "baseline" is itself already dirty (it snapshotted a prior bench's
Bench-routing). Siblings imply most (`writerAI.continue`→`p_prose_voiced`, `writerAI.rewrite`/
`critique`→`p_prose_edit`/`p_judge`), but `chat`/`characterChat` have no sibling — so the correct fix
is to reseed those five keys to the **seed's** defaults (source of truth `just-llm-runner` seed), not
to hand-pick values. Held for the user's go.

## 4. The locked sequencing (the user's rulings in-session)

1. **Now:** the plain CPU band to completion — no rag legs.
2. **Viability read** off `summary.md` — the go/no-go gate for CPU.
3. **Then, regardless of the CPU verdict — the GPU rag (bible-vs-index) comparison**, which the user
   wants unconditionally ("i cant believe we did not do that in the first place"): revert the engine
   to CUDA, wire `forceBibleOnly`, add **permanent** `-bible` legs to `gpu.json`, run ONLY the new
   legs (the stored full-GPU results recall; nothing reruns).
4. **CPU rag — gated on step 2:** only if a model runs ok on CPU, the same `-bible` legs go into
   `cpu.json` and run on the (trivially re-flipped) CPU engine.

**The `forceBibleOnly` mechanism (all anchors re-verified in-session):** mode is decided by index
existence — `chat.js:102` `const bibleOnly = !st.exists` (st from `status(projectId)` at `:101`),
retrieval gated at `:108`; `k` is a retrieval count (`chat.js:82`, `benchHook.js:127`), it does NOT
switch modes. `askManuscript`'s signature (`chat.js:79-89`) has **no `forceBibleOnly` param today** —
a genuine 2-line addition (param at ~`:89`, OR-ed into `:102`), plus a passthrough where the bench's
chat feature calls it (`benchHook.js:128`). No capture change needed — the bench already records the
mode (`benchHook.js:111` `extra: { bibleOnly: … }`). Open when writing the legs: whether
`characterChat` (`benchHook.js:142`) also gets a bible variant.

Also decided in-session: an unrelated stale claim got corrected — the GPU band ran **every**
chat/characterChat leg with the RAG index built (`gpu.json` band-level `ensureIndex: true`); there
was never an index-off leg, so the bible-vs-index difference has never been measured.

## 5. The iGPU pivot — why the CPU band is a floor, not the target

The user's reframe (agreed): "no one has pure CPU" — real no-dGPU users have an **iGPU**. Weak
iGPUs (UHD-class) perform ≈ pure CPU (bandwidth-starved on shared RAM), so the pure-CPU band stays
legitimate as the **floor/proxy**; the deliverable target is "what makes an iGPU laptop usable."
The user has an iGPU laptop to test on (model/RAM not yet named). Key mechanism notes settled along
the way: **ctx size is the #1 lever** (less prefill compute + less KV RAM; iGPU degrades rapidly
past ~4k ctx); **context shift is NOT a speed knob** (an infinite-generation feature, adds recompute
— likely why it made GPU runs worse); **cache-reuse** is the real prefill win and is already on in
the base preset (it's the 0.49 s warm TTFT); `llama-bench`'s pp512/2048/8192 matrix IS the
prefill-vs-length curve, so the ctx sweet spot largely falls out of the raw matrix. On MoE: the
`--n-cpu-moe` VRAM/RAM split is meaningless on an iGPU (one memory pool) but **sparse activation
survives on shared memory** (the Apple-Silicon precedent); the real iGPU blocker is **capacity**
(all experts must be resident), and MoE does not rescue prefill (most experts are touched across a
long prompt's positions). The user's box has no iGPU middle ground (Ryzen 7 5700X is a non-G part —
verified one display adapter), so iGPU numbers can only come from the laptop. Side fact worth
keeping: `Win32_VideoController` truncates VRAM at 4 GB — the 2070S really has 8 GB.

## 6. The deep-research synthesis (recovered verbatim in substance; URLs are the session's citations)

### Two RAM tiers, not one "iGPU user"

**32 GB shared-RAM iGPU (780M-class mini-PCs, AI-3xx laptops):** the headline — our exact default,
Gemma4 26B Q4_K_M, fully offloaded on a Radeon 780M runs pp ~209 t/s / **~25 tok/s generation**
(https://github.com/ggml-org/llama.cpp/discussions/24222 — re-verified against the fetched
discussion: Q4_K_M, `-ngl 99`, pp 208.7/tg 25.0). Faster decode than the 2070S gets on the 35B, and
it beats a dense Mistral 7B (18 t/s) on the same chip. So the 32 GB tier needs **no special catalog
— same default model as everyone else**; 8k prefill ≈ 40 s cold (4k ≈ 20 s; cache-reuse makes
follow-ups instant). This REVERSED an earlier in-session claim that 26B-A4B was dead on iGPU — it's
dead only on the 16 GB tier.

**16 GB shared-RAM iGPU (the typical laptop):** the 26B (~16 GB file) cannot fit beside the OS —
this tier needs **≤ ~8 GB total footprint**. This is where the real product work is.

### The quant law for iGPU (Vulkan)

K-quants are the fast path on Vulkan; IQ-quants are slower or incompatible there
(https://github.com/ggml-org/llama.cpp/wiki/Feature-matrix ·
https://github.com/ggml-org/llama.cpp/discussions/10879). Gemma QAT ships as UD-Q4_K_XL (K-family)
— ideal. **Q4_K_M / UD-Q4_K_XL everywhere; never IQ*/exotic quants for iGPU users.** Bonsai's
ternary g64 is CPU/Metal-only — no iGPU path; it stays a pure-CPU curiosity.

### The 16 GB candidate ladder (to Smart-Add and bench on the laptop)

| Model | File | Why it's in | Signal |
|---|---|---|---|
| **Gemma 4 E4B QAT** | ~5 GB | The primary sweet-spot bet: dense, QAT holds 4-bit quality, Gemma prose reputation, fits with room for 8k KV | ~3× memory cut, near-bf16 (https://unsloth.ai/docs/models/gemma-4/qat) |
| **Gemma 4 12B QAT** | ~7 GB | The quality ceiling that still fits (tight); already in catalog + on the user's disk | runs in ~7 GB (unsloth doc above) |
| **Qwen3.5-9B** | ~5.5 GB | Current-gen cross-family control (Qwen3.6 has no smalls; Qwen3.5 Small = 0.8/2/4/9B, https://awesomeagents.ai/news/qwen-3-5-small-models-series/) — family ships **MTP drafts** | 9B wins knowledge/agentic vs E4B-class (https://gemma4all.com/blog/gemma-4-vs-qwen-3-5-benchmarks) |
| **Gemma 4 E2B QAT** | ~3 GB | The floor — what an 8 GB-RAM machine or weak UHD iGPU can still run | |
| **LFM2.5-8B-A1B** (wildcard) | <6 GB Q4 | The one MoE that fits 16 GB: 8.3B/A1.5B, official GGUFs (https://www.liquid.ai/blog/lfm2-5-8b-a1b) — possible speed king on weak iGPUs | quality ≈ 3–4B dense — floor-tier prose |
| **Granite 4.0 Micro/Tiny** (watch) | 2–4 GB | Hybrid Mamba: ~70% memory cut in long context (https://www.ibm.com/new/announcements/ibm-granite-4-0-hyper-efficient-high-performance-hybrid-models) — directly the RAG-at-8k pain | **Risk:** SSM kernel gaps even on CUDA (https://github.com/ggml-org/llama.cpp/issues/23015); Vulkan unverified; enterprise-flavored prose |

The Gemma naming: `E2B`/`E4B` are unsloth's small "efficient" variants (`unsloth/gemma-4-E2B-it-qat-GGUF`,
`-E4B-`, `-12B-`); the seed carries only `gemma-4-12b-qat` + `gemma-4-31b-qat` (`seed.py:175,184`) —
no small QAT in the seed, Smart-Add from HF.

**Deliberately skipped:** gpt-oss-20b (~13 GB MXFP4 doesn't truly fit 16 GB; assistant-tuned prose;
MXFP4-MoE-on-Vulkan unproven) · stale-gen web-list favorites (Llama-3.1-8B, Mistral-7B, NemoMix —
two generations old) · fiction fine-tunes for now (e.g. the heretic decensor of Gemma-4-12B,
https://huggingface.co/igorls/gemma-4-12B-it-heretic-GGUF — a later Lab A/B on top of whichever
base wins, same policy as the StyleTune entry).

### Settings to sweep on the laptop

1. **ctx 4k vs 8k** — the #1 lever; RAG budget must shrink with it or the 8k prompt just truncates.
2. **ubatch 512 → 2048** — claimed 2–3× prefill on this hardware class.
3. **flash-attn on/off** — 26% slower on CPU; unknown on Vulkan iGPU — measure, don't assume.
4. **`-ngl 99` vs `-ngl 0`** on the same box — the honest "does the iGPU help THIS laptop" A/B.
5. **MTP draft on the Qwen3.5-9B leg** — spec decode should help bandwidth-bound decode; Vulkan
   behavior unverified; one leg answers it.

Hardware honesty: "iGPU" spans ~4× (Arc 140V pp512 ≈ 468 t/s on an 8B —
https://github.com/ggml-org/llama.cpp/discussions/12570; 780M ≈ 209 on the 26B; older Iris Xe well
under; UHD ≈ CPU). The laptop measures its tier only — identify which iGPU it has first.

### Prose quality — the honest gap

No trustworthy small-model creative-writing ranking exists (EQ-Bench's table wouldn't render; the
web lists are stale or generic). POLARIS (https://arxiv.org/pdf/2606.04095) shows 9B-class can hold
longform narrative, but for our features the instrument is the bench's captured outputs +
hard-question legs, judged by reading. Speed picks the shortlist; **the user's eyes pick the winner.**

### The session's own sharpest doubts (carried forward)

1. **Vulkan-vs-SYCL on Intel iGPUs** — we ship Vulkan only, and SYCL now outruns Vulkan on Intel
   (https://github.com/ggml-org/llama.cpp/discussions/23313), so Intel laptops may underperform
   their hardware with our engine.
2. **E4B/E2B Vulkan offload support** — the per-layer-embedding "effective-param" architecture's
   Vulkan support is unverified anywhere found, and it's the ladder's centerpiece — the laptop
   bench must check it first.

## 7. OPEN (the whole queue, in order)

0. **DONE 2026-07-22 (Pass 1, committed runner cc62d92 + JW 836e8bf):** defects A–G fixed + the
   real-router smoke (8 cases green live). Full log: the execution plan doc.
1. **CPU big-model band — COMPLETE, 4/4 legs read (run `2026-07-22_14-04-05-cpu`, summary.md).**
   - gemma-26b (MoE): decode 9.4 · chat med TTFT 26.9 s · the band's best.
   - gemma-12b (dense): chat med TTFT 48.5 s, characterChat 65.6 s — dense prefill pain.
   - **bonsai: loads in 13 s (the "won't load" claim was defect A's typo) but is UNUSABLE** —
     first chat blew the 10-min ceiling, the child wedged, 0/10 runs completed, every failure
     recorded with its reason (the fixed bench failing FAST and loud, as designed).
   - **qwen-35b (honest re-run at ctx 8192, T3 holding through the embed co-load):** loads 28 s ·
     decode 6.8 (was 4.6 thrashing) · chat cold 66.7 s / warm 0.55 s (med 33.6 s) · ~21 GB
     resident (no_mmap) — fits 32 GB at the honest ctx, completed all 10 runs.
   **VERDICT: pure CPU is not viable for interactive book-chat on this box** (cold first-token
   27–67 s best-case, decode ok) — the floor is real; the target stays iGPU (§5–§6).
2. *(routing reseeded — T9, done)*.
3. **Engine REVERTED to CUDA (2026-07-22, post-re-runs):** `preferred_gpu=''`, cpu binary row
   deleted; `b10083/cpu` stays on disk, ignored. Next app boot is CUDA.
4. **llama-bench matrix failures ROOT-CAUSED + FIXED (supersedes the earlier "backend-load
   error" label — that was wrong, from a truncated capture):** llama-bench has NO `-c` flag
   (fatal "invalid parameter" on b10079/b10083); the harness passed the leg's `ctxLen` as `-c`,
   so every CPU leg's matrix died instantly (GPU legs don't set ctxLen — that's why the GPU band
   worked). Fixed at `llamaBench.js` (the `-c` mapping removed, comment records it). The CPU
   band's raw pp/tg matrices remain UNMEASURED — refill is a targeted per-leg re-run on the
   user's word (each pp8192 rep is many minutes of box time on CPU); the feature TTFTs already
   answer the viability question.
2. **Reseed the dirty routing** — five `feature_preset_refs` keys stuck on the Bench preset
   `9d4ebeddeb96` (`chat`/`characterChat`/`critique`/`writerAI.continue`/`writerAI.rewrite`); reseed
   to the runner seed's defaults (NOT hand-picked). See §3 "ROUTING IS DIRTY". Held for a go.
3. **Revert the engine flip** — `preferred_gpu=''` + drop the `cpu` `runner_binary` row → next boot
   is CUDA. **Keep the flip** if doing small-model CPU legs (step 5) first.
4. **Diagnose the `llama-bench` backend-load failure on the b10083 CPU build** (gemma-12b leg 2's raw
   matrix failed; feature numbers unaffected).
5. **Small-model CPU legs** (the user's "test more models on my cpu") — Smart-Add Gemma 4 E4B/E2B QAT
   + Qwen3.5-9B (12B QAT already on disk), add `cpu-*` legs, run on the CPU engine. Small models
   won't hit the RAM wall. Gives floor numbers **+ captured prose** (prose is hardware-independent —
   judged from these desktop captures; the laptop then only measures speed).
6. **The laptop iGPU test — the portable speed kit (the user's "easy way to test on my laptop").**
   Since the laptop only needs SPEED (prose judged from desktop captures), the right shape is NOT the
   full node/app harness and NOT the packaged installer for numbers: it's a self-contained folder —
   the llama.cpp **Vulkan** build (same b-release) + the small GGUFs copied from the desktop (no
   re-download) + a script running the `llama-bench` matrix (pp512/2048/8192 · tg128) across
   models × sweep knobs (`-ngl 99` vs `0` · ubatch 512/2048 · flash-attn on/off), writing one results
   file. Copy folder over → run → copy results back. Zero installs. (The packaged installer is a
   separate later test of QuickSetup's iGPU detect/fit on the real box — not for the numbers.)
   **Needs first:** which laptop iGPU (Iris Xe / Arc / Radeon 6xx/7xx) + RAM — decides its tier.
7. **GPU rag comparison** (unconditional, the user still wants it): wire `forceBibleOnly` + permanent
   `-bible` legs in `gpu.json`; run only the new legs. Decide the `characterChat` bible variant when
   writing them. (`chat.js`/`benchHook.js` anchors in §4.)
8. **CPU rag** — the user's original gate was "only if a model runs ok on CPU"; big models don't, so
   this reduces to rag legs on whichever SMALL model (step 5) proves usable.
9. **Correct the stale "-ngl 0 forces pure CPU" comments** (`scripts/bench/configs/cpu.json:8`,
   `2026-07-19-cpu-only-band-test.md:60`) — proven wrong again this run (the CPU build was required).
10. **Other-OS testing — SEQUENCED LAST (the user's call, 2026-07-22):** per-OS Tauri builds are the
    easy part and happen only after the bug fixes land and Windows is stable; the user can run Linux
    on their box (WSL). Facts to carry in: Linux engine rows are seeded (rocm + vulkan,
    `config.py:130-135`) and Linux+NVIDIA deliberately resolves to the vulkan archive — the Linux
    CUDA row is a docker-only future seam, never auto-selected (`config.py:136-146`). UNVERIFIED
    caveat to check before spending time there: Vulkan compute inside WSL2 goes through the
    Mesa/Dozen layer and has historically been slow or broken for llama.cpp — verify against the
    current pin on the day; a WSL run may not represent a real Linux box's GPU path.

## 8. FULL DIAGNOSIS — the 2026-07-22 CPU-band failures, root-caused in the lifecycle log (Fable pass)

**Evidence base.** `<data-root>/logs/justwrite.log` (the lifecycle trace — the decisive source),
the four router logs `ai-cache/llamacpp/logs/router-20260722-{062427,065429,065626,070120,070251}.log`,
the emitted `ai-cache/llamacpp/models.ini`, the bench run log, and the user's manual control:
`llama-server -m <bonsai blob> -c 4096 -t 8` → loaded in **5.7 s**. Earlier same-day claims that
"the router starved the requested model" and "bonsai won't load on CPU" are **retracted** — both
were made before the lifecycle log was read.

**Defect A — bench config: wrong catalog id for Bonsai (the "30-min load failure" root cause).**
`scripts/bench/configs/cpu.json:81` names `"model": "ternary-bonsai-27b"`; the catalog id is
`ternary-bonsai-27b-q2-g64` (DB `model_catalog.id`, read 2026-07-22). The load fails in 114 ms:
`ValueError: unknown model 'ternary-bonsai-27b'` (`lifecycle.py:1568` via `_run_load:1722`), logged
at 05:37:51 and again 06:24:26. The bench validates FEATURE keys against the running app before any
leg (`run.js:293-297`) but never validates MODEL ids against the catalog — an id typo costs a
30-minute silent hang instead of a 2-second config error. Fix: correct the id in `cpu.json` AND add
the mirror-image model-id validation next to the feature validation.

**Defect B — the bench cannot SEE a failed load.** The lifecycle marks a failed load
`status="error"` on the ledger entry (`lifecycle.py:1816`); the bench's `waitLoaded` short-circuits
only on `/^(failed|unloaded)$/` (`scripts/bench/lib/server.js:137`) and otherwise polls `/resident`
until its 30-min ceiling. So every instant config failure becomes a full-timeout "load failure"
with the real error never surfaced. Fix: `waitLoaded` also reads `runnerStatus()` (which carries
`status:"error"` + the message) each tick and fails fast with the server's own error text.

**Defect C — ephemeral launch switches are LOST on any ini re-emit, and the bounce reloads
residents at the wrong config (the RAM-exhaustion root cause; PRODUCT bug, not bench-only).**
Sequence proven in the logs: 06:54 the qwen leg loads with the bench's ephemeral `ctxLen 8192` —
the child's ready payload says `n_ctx:8192` (router log 065429). 06:56:24 the RAG embed joins
(`trigger=ensure-embedding`); the emitter re-renders every co-resident section **from DB switch
rows** (`_emit_models_ini`, `lifecycle.py:2024` — `_switches_to_overrides(self._switches_fn(m.id))`),
so qwen's section reverts to its GPU-tuned `ctx-size 131072`; the ini text change bounces the
router, and the respawned qwen reports `n_ctx:131072` (router logs 065626/070120/070251). A 131072
q8_0 KV on CPU ≈ the ~21 GB child → 0.8 GB free → thrash → child death → respawn loop. The same
mechanism silently reverts any Lab ephemeral tune when a later co-load re-emits. Fix (the redesign
invariant, below): keep `{model_id → the ModelIniEntry it was actually loaded with}` and re-emit
co-resident sections from THAT map, DB only for the model being loaded now.

**Defect D — a stop can be undone by a zombie in-flight request (`trigger=ensure-ready`).**
07:00:48 `stop qwen` → 07:00:58 `load qwen (trigger=ensure-ready)` → 07:02:46 `stop` → 07:02:48
`ensure-ready` again. The bench client was dead; a server-side in-flight chat dispatch kept
retrying via `ensure_model_ready` (`lifecycle.py:1283→1307`), re-loading the model the user had
just stopped. This — not the llama router and not the reconciler — is the real shape of the
long-standing "stop gets undone" observation. Fix: (1) client-disconnect aborts the dispatch run;
(2) an explicit stop sets a short tombstone that `ensure_model_ready` respects (raise "model was
just stopped" instead of reloading).

**Defect E — ledger↔router drift errors instead of idempotent adoption.** 04:36:41
`RuntimeError: /models/load 'qwen3-embedding-4b' failed [400]: model is already running`
(`_default_router_load:193`) — router-truth said running, the ledger disagreed, and the load thread
ERRORED instead of adopting the running child. Related: 07:00:53 `confirm-unload timeout: router
still reports qwen… popping anyway` — the ledger pops while the child lives (the later "already
running" is this drift coming home). Fix: router_load treats "already running" as
confirm-and-adopt success; unload treats "not found" as success; never pop-anyway without marking
the entry router-orphaned so the next reconcile re-adopts it.

**Defect F — the bench's own driver triggers the app's warm-boot, which fights the bench.**
06:24:25.394 `load gemma-4-26b-a4b-qat (trigger=api)` — one second before the bench's leg load;
that is the headless Chromium booting the renderer, whose `warmStartup` warms the default chat
model. A 14 GB co-resident rode along the whole CPU band (RAM pressure), and a warm load can evict
a leg's model via the arbiter. Fix: the bench hook sets a flag the renderer's `warmStartup` checks
(`window.__JW_BENCH__`-style) → no warm-boot under the bench.

**Defect G (flagged, user's call) — Windows/CPU switch hygiene.** Every section emits
`mlock = true` and VirtualLock fails every time ("Invalid access to memory location" — no
SeLockMemoryPrivilege on Windows) → warning spam, zero effect; `no-mmap = true` on qwen/gemma-26b
forces a full-RAM copy on the CPU engine (a real RAM contributor — sensible for CUDA, wrong for
CPU). Root design note: per-model switch rows were tuned on the CUDA engine; a different ACTIVE
engine inherits them blindly (ctx 131072 came from the same tune rows). Whether switches should be
keyed/filtered by engine variant is a DESIGN decision held for the user. Also minor: the fit retry
computed `ngl=8 ncmoe=33` on the CPU-only build (07:01:19) — GPU placement math on an engine with
no GPU backend; harmless but should short-circuit.

**MTP emit rule (the user's ruling, VERIFIED HOLDING).** "Launch MTP only when the box is checked
AND a draft file is downloaded": Bonsai (`mtp=0`, no draft fields) emitted **no** `model-draft`/
`spec-type` — correct; gemma 12B/26B (checked, drafts on disk under `MTP/`) and qwen (built-in
heads) emitted theirs — correct; the emitter's bounce path already guards against handing
llama-server a broken draft preset (`lifecycle.py:2040` comment). The file-exists guard gets a
dedicated assertion in the integration smoke rather than new code.

**The redesign invariant (one sentence).** *The router is the single truth for WHAT is resident,
and the entry a model was loaded with is the single truth for HOW it runs* — the ledger reconciles
from the router (already the design, `lifecycle.py:492`), the emitter renders resident sections
from the loaded-with entries (new, fixes C), and router ops are idempotent against drift (new,
fixes E). D adds "an explicit stop outranks a zombie request." No new machinery — the fixes
RESTORE the existing invariant where three code paths quietly violate it.

## 9. THE HARDWARE-CLASS SYSTEM — provenance verified, the real flaw, the redesign (2026-07-22)

**Provenance of "never a GUI" — an AGENT's editorial, NOT the user's decision.** The user
challenged the `db.py:316-317` claim ("SEED DATA … never a GUI") — "I don't remember saying
never." Verified: the docstring landed whole in runner commit `dc97798` (2026-07-06, Phase 3),
and the plan section it cites (`2026-07-06-model-per-hardware-plan.md:105`) says only "mechanism
now, research fills later" — no user ruling about a GUI anywhere in it. Meanwhile the CLASS-TUNE
side records the opposite intent as the user's own: `class_key` is "the 'similar systems' bucket
**(user, 2026-07-07)**" (`hardware.py:73-74`), and the seed calls the layer "the seeded +
**EDITABLE** hardware-CLASS tune library … portable to every box of that class (the user's
argument)" (`seed.py:403-407`). Verdict: the multi-class, editable, shareable library was ALWAYS
the recorded intent; "never a GUI" on the pick map was agent-authored scope framing that then got
quoted back as if decided. The docstring gets corrected in the redesign pass.

**What detection ACTUALLY is (corrects this doc's earlier framing).** `hardware.py` already
detects NVIDIA via nvidia-smi, and AMD/Intel via PCI (Linux, `:168-236`) or the display-class
REGISTRY (`qwMemorySize`, a QWORD — `:239-303`) on Windows — so the product does NOT use WMI and
does NOT have the Win32_VideoController 4 GB truncation (that quirk was in this session's ad-hoc
PowerShell probe and the closed session's; §5's note is about WMI itself, which the product
bypasses). There is even an Intel DISCRETE (Arc) name regex (`:172-175`). What's genuinely
missing for iGPUs: an integrated-vs-discrete CLASSIFICATION (the Arc regex is the only piece) and
an honest key form for shared-memory boxes. `class_key` today: `vram<GB>|ram<GB>`, or `cpu|ram<GB>`
when no GPU (`hardware.py:79-83`); `machine_key` (per-box tunes) is separate and stays
(`:56-68`).

**The real structural flaw (confirmed): TWO class identities.** The class-TUNE library is keyed by
`class_key` (string, GUI-editable + shareable via the panel's export/paste —
`LuClassTunes.vue:129-188`, backend `class_tunes_api.py`), while the class→MODEL pick map is keyed
by a bare `min_vram_mb` threshold (`db.py:321`, one seeded row: ≥6 GB → gemma-26b,
`seed.py:395-401`; consumed map-first by QuickSetup via `classPicks` on the catalog wire —
read-only, no write API). Same concept, two identities, one of them invisible. That — not a
missing GUI button — is the design defect.

**THE REDESIGN (the class subsystem done right — contained, not a whole-system rewrite):**
1. **One class identity for everything.** The pick map re-keys onto `class_key`. Proposed row
   shape: `(class_key TEXT PK, arch TEXT, mem_gb INT, model_id TEXT)` — explicit columns, no
   key-parsing; resolution for a box with no exact row = nearest-lower `mem_gb` within the same
   `arch`, else the existing §10 speed-floor fallback (today's threshold behavior, made explicit).
2. **The key gains an architecture token** so every box type is an honest class:
   `dgpu-vram8|ram32` · `igpu|ram16` · `metal|ram16` (unified) · `cpu|ram32`. Derivation extends
   `class_key()` with integrated-vs-discrete classification (Arc regex exists; add iGPU name
   patterns + the no-dGPU case). Existing `vram8|ram32` rows re-key on reseed (drop+reseed
   policy). EXACT GRAMMAR = the user's decision.
3. **One GUI surface, both libraries**: the existing Hardware classes panel grows the pick — each
   class row shows its recommended model (editable) above its tune rows; the share payload gains
   the pick. Add-row works for classes you don't own (the user's "share it" vision: publish your
   class's config; the seed ships evidence-backed rows per tier as the bench produces them).
4. **The tune-backend column (Pass 2) stays** — NOT redundant with the arch token: the same
   dgpu class can run cuda OR vulkan via the acceleration selector, so a tune still records the
   backend it was measured on.
5. **The bench is the row producer**: the user's box row exists; the laptop bench adds the first
   iGPU row; research adds more. Data follows the mechanism — the mechanism no longer waits for
   data (reverses this doc's earlier Pass-4 gating, per the user's correction).

**THE PRIMARY CONSUMER IS AUTO-DETECT (the user's ruling, 2026-07-22: "we want auto detect …
a normal user is not going to go into hardware class and set up a model, power user maybe").**
The product path is the PIPELINE: `detect()` → `class_key` (arch-aware) → pick (nearest-in-arch,
§10 floor as fallback) → class tunes applied → fit fills the rest — all inside QuickSetup with no
user action. The panel is the POWER-USER escape hatch + the sharing surface, nothing more — GUI
investment stays minimal (the pick joins the existing panel row; no new surface, no class-manager
UI). Two consequences: (1) the load-bearing engineering is the RESOLUTION + DETECTION
CLASSIFICATION (integrated-vs-discrete, honest keys for boxes we've never seen), not the GUI;
(2) since normal users never open the panel, **the seed rows ARE the product** for them — which
is exactly why the bench-as-row-producer matters (their box row · the laptop's iGPU row ·
research rows). QuickSetup already consumes the map-first pick + class tunes today, so the
redesign lands in the existing flow rather than adding one.

**⛔ FINAL RULED SHAPE (the user, 2026-07-22 evening — SUPERSEDES the earlier §9 redesign where
they conflict, esp. the flat re-keyed pick table, which is now DELETED, not re-keyed):**
After the user audited the whole class subsystem ("you have a hidden table doing the same
thing"), the converged design — their original vision confirmed ("exactly why we built it…
1 row now, more rows as we test more… copy config so other users with their hardware test and
share config"):
- **ONE table: the class configs** — (hardware class · model · switches · a "recommended" mark
  when a class has configs for several models). **`model_class_picks` is DELETED/ABSORBED** —
  the recommendation IS the config row; a research-only recommendation is a row with a model
  and no switches. No second table, no hidden anything.
- **One panel = the visible list**: plain-language hardware labels, model name, settings,
  Copy/Import per row (exists), Add-with-model-picker (exists), "this PC" tag.
- **Detection proposes, never dictates**: the PC's bucket is a detected DEFAULT with a visible
  override (the preferred_gpu pattern); the detected raw facts stay visible so a lying sensor
  is diagnosable at a glance (the ram0 lesson).
- **QuickSetup reads the SAME rows the user sees**; no matching row → the fit formula as the
  fallback suggestion. Growth = tested rows accumulate (the user's box row exists · the iGPU
  laptop row next · other users via share).
Context that forced the audit: the RAM sensor read 0 on Windows for the system's entire life
(fixed, runner `816004a`), so the user's hand-measured config never applied and the whole
subsystem produced zero user value to date — their scoring, accepted as accurate.

**Decisions — state as of 2026-07-22 (later the same day):**
- **Class-ID format: APPROVED by the user** ("id is fine as long as user understands what it
  means") **with the plain-language condition**: the UI always shows the translated label — the
  existing `classKeyLabel()` (`LuClassTunes.vue:29` import) extends to the new grammar:
  `dgpu-vram8|ram32` → "Dedicated GPU · 8 GB VRAM · 32 GB system RAM", `igpu|ram16` →
  "Integrated GPU · 16 GB shared RAM". The key stays the machine ID; users see the words.
- **mlock — RESOLVED BY EVIDENCE (the user asked "I thought we tested this and it was better").**
  Both true: the tuning record treats `no-mmap+mlock` as a PAIR ("no-mmap+mlock at ncmoe 37 pins
  ~18 GB RAM", tuning doc `:73`) — and the router logs prove **mlock itself has NEVER locked a
  byte on this box, GPU or CPU engine**: every VirtualLock attempt fails "(after previously
  locking 0 bytes)" — including the overnight CUDA run (router-20260722-000444.log, 20.5 GB
  buffer) and 07-21 CUDA runs. So the measured win was **no-mmap** (which works and does the RAM
  pinning for the CUDA MoE offload); mlock rode along, inert, producing only warning spam.
  **RESEARCHED 2026-07-22 (the user's challenge "will it actually work in windows if we change
  some config — you are just dismissing without checking") — my earlier privilege claim was
  WRONG, retracted:** per the Microsoft VirtualLock doc, NO privilege is required — the lock
  limit is the process's MINIMUM WORKING SET, and apps "must first call SetProcessWorkingSetSize"
  for large locks (SeLockMemoryPrivilege belongs to AWE/large pages, a different API). llama.cpp
  already does exactly that (verified in `src/llama-mmap.cpp`: VirtualLock → on failure grow the
  working set by len+1 MB → retry once → the exact warning we see). Our error is 998
  ERROR_NOACCESS, and the MS doc names its meaning: "All pages in the specified region must be
  committed. Memory protected with PAGE_NOACCESS cannot be locked" — i.e. an ALLOCATION-SHAPE
  problem inside these llama.cpp builds (b10079/b10083) on this box, NOT a Windows setting anyone
  can flip. Precedent that Windows itself is fine: llama.cpp issue #5293 shows a Win10 box
  successfully VirtualLocking **17.9 GB** (build 2050) before one buffer 998'd. **Would it help
  if it worked?** The MS doc states both sides: locked pages "are guaranteed not to be written to
  the pagefile" (no decode stutter from paged-out experts under RAM pressure) but locking "may
  degrade the performance of the system … forcing the system to swap out other critical pages"
  (on a 32 GB box locking 14–18 GB, everything else pays). Net: an A/B question — unanswerable
  today because locking fails at the llama.cpp layer; the path to a working mlock is an upstream
  allocation fix, not our config. **SUPERSEDED same day by the probes below** (the "upstream allocation fix"
  theory did not survive them either — standalone locking WORKS on this build).
  **ON-BOX PROBES RUN (2026-07-22, after the user pasted external advice claiming "run as
  Administrator fixes it"):** (1) a non-admin ctypes probe (scratchpad `mlock-probe.py`) locked
  **256 MB / 2 GB / 8 GB successfully** after `SetProcessWorkingSetSize` (first-try failures were
  err **1453** ERROR_WORKING_SET_QUOTA — NOT 998); (2) the real **b10083 `llama-server --mlock`
  run STANDALONE** loaded the 2.5 GB embed model with a SUCCESSFUL lock (no VirtualLock warning),
  un-elevated, 3.3 s. **VERDICT: the admin claim is FALSIFIED on this box** — the account locks
  gigabytes un-elevated, and quota failures are 1453, so llama's 998 is not quota. (3) The Job
  Object suspect is ALSO dead: `_win_job_for_child` (`process.py:534-613`) sets ONLY
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` — no memory/working-set limits. **NEW DEFECT G (OPEN,
  joins Pass 1): mlock works standalone but EVERY router-spawned child fails VirtualLock with 998
  at 0 bytes — even a 151 MB buffer — cause unidentified (some router/runner spawn-context
  variable).** The smoke gains the pinning assertion: "mlock under the router locks exactly as
  standalone." **RECOMMENDATION — awaiting the user's call (CORRECTED: an earlier revision of this line
  wrongly recorded the user's "what do you think?" question as their decision):** fix G in Pass 1
  (a bug regardless of the mlock verdict — the seeded config says mlock and it silently does
  nothing), THEN a bench leg pair (mlock on/off, think-A/B pattern) on the GPU offload config,
  judged on first-prompt-after-idle TTFT + decode steadiness; full-VRAM configs get no leg
  (nothing in RAM to lock). The seed keep/drop decision then follows the measured numbers. Sources: learn.microsoft.com VirtualLock page ·
  github.com/ggml-org/llama.cpp issue #5293 · llama-mmap.cpp (master).
  Options for the user: (a) drop mlock from the seeded Windows rows (no behavior change — it
  never worked; the knob stays available in the GUI), keep no-mmap where measured; or (b) keep
  the row as-is (inert + warnings). Recommendation: (a). On Linux/Mac mlock can genuinely work —
  Pass 2's applicability handles per-OS/backend defaults if wanted.
  **RESOLVED + SHIPPED (2026-07-22, the user's ruling "b … they already know" — no upstream
  report).** The T7 bisection superseded this block's framing: mlock is broken ONLY in
  combination with no-mmap on Windows (mlock alone locks — proven standalone AND through the
  real router). Shipped as the `_strip_inert_mlock` merge rule (both ini section-construction
  sites; seeds untouched — the base mlock row keeps working for dense/mmap'd models), 3 unit
  tests + a live smoke case. Full record: the execution plan's T7 addendum.
  **PROVENANCE (the user, 2026-07-22).** The no-mmap+mlock+ncmoe+128k-ctx config traces to a
  YouTube walkthrough (youtube.com/watch?v=8F_5pdcD3HY — qwen3.6-35b on an old 6 GB card) whose
  command is a LINUX DOCKER run with **`--cap-add=IPC_LOCK`** — the Linux capability that makes
  `--mlock` actually function. So the reference was right IN ITS ENVIRONMENT; on bare Windows the
  equivalent right (SeLockMemoryPrivilege, "Lock pages in memory") is granted to nobody by
  default, hence the inert flag. Two closures: the video's image is literally our unwired
  linux/cuda12 docker seam (`config.py:144-146`), and its `--ctx-size 128000` is the provenance
  of the qwen tune row's ctx 131072 that defect C re-applied on the CPU engine. Note (not
  pursued): Windows CAN grant the privilege via secpol — but locking ~18-21 GB on a 32 GB box
  invites memory-pressure instability; no-mmap already delivers the measured win.
- **Schema shape: FLAT — APPROVED by the user 2026-07-22 ("flat is ok")**: one row per class
  `(class_key, arch, mem_gb, model_id)`, tunes keep matching on class_key exactly as today; a
  parent `hardware_classes` registry only if classes ever grow their own properties (additive
  later via create_all).
- **Share payload includes the pick — recommended yes, awaiting the word.**

**The runner integration SMOKE (the user's ask: "a testing system that finds these kinds of
problems").** Why it doesn't exist: the 650+ runner pytests fake the router (`_service_for` injects
fake `router_load`/`router_models`), so all five defects sat green. The gap is specifically
Python↔real-router↔real-child, so the new suite runs the REAL engine + REAL router with ONE tiny
model (~0.5–1B Q4 GGUF, a few hundred MB, downloaded once through the normal product path) and
asserts OBSERVED truth — the child's ready payload (`n_ctx`, meta) and the router's `/models` —
against what was REQUESTED. Cases, each mapped to today's defect class: load with an ephemeral ctx
→ child reports THAT ctx (C) · co-load the embed → the first child's ctx SURVIVES the re-emit (C) ·
stop → model STAYS down N seconds (D) · load an unknown id → visible `error` + message within
seconds (A/B) · double-load → idempotent, no 400 (E) · switch/temp change → reflected on reload ·
MTP off-model emits no draft args, on-model emits a file that EXISTS (the MTP rule). Placement:
`just-llm-runner` pytest behind a marker (`-m realrouter`), skipped where no engine is installed
(CI/dev-container), run on the box before any bench band — NOT part of the 2.6-min fleet. The
BENCH stays the measurement instrument; preflight correctness lives in the smoke, plus the bench's
own new model-id validation (A). Open decisions for the user: which tiny model; whether the suite
may auto-download it; the command name.
