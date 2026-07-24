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
6. **BUILT 2026-07-22 (late; the user's go after naming the laptop: Core Ultra 7 / 32 GB).**
   The kit sits at **`E:\laptop-speed-kit`** (20 GB): the b10083 win-vulkan zip (URL verified by
   HTTP; b10083 = the desktop's own installed CPU-leg engine, so builds are comparable) ·
   the two on-disk GGUFs (gemma-12B QAT Q4_K_XL 6.7 GB + gemma-26B-A4B QAT Q4_K_XL 14.2 GB; the
   §5 small models E2B/E4B/9B were never downloaded — add later if wanted) · `run-bench.ps1`
   (the §6 matrix: models × ngl 99/0 × ub 512/2048 × fa 1/0 → pp512/2048/8192 + tg128, one JSON
   line per combo into results.jsonl, RESUMABLE — reruns skip finished combos, failures recorded
   so they don't repeat) · `detect-facts.ps1` (the user-approved addition: display-class registry
   DriverDesc + qwMemorySize decode, RAM/CPU/OS, and the engine's own `--list-devices`) ·
   README.txt (copy over → unzip engine → run two scripts → send back three files). VERIFIED on
   the desktop: both scripts parse clean; detect-facts ran end-to-end (2070S / 8 GB qwMemorySize
   decoded correctly; `--list-devices` works at b10083); the exact llama-bench flag set
   (`-ngl -ub -fa -p -n -o json`) validated with a tiny live run — valid JSON, exit 0. BONUS
   detection signal discovered in that run: the Vulkan device line prints **`uma: 0/1`**
   (unified-memory flag) per device — on the laptop's iGPU it should read `uma: 1`, an
   engine-native integrated/unified signal beside the registry numbers. What the laptop's three
   returned files answer: iGPU speed (the matrix), the `qwMemorySize`-for-Arc-Graphics unknown
   (detection decision ③), and Vulkan-on-iGPU viability (the A2 revisit, decision ②).
   **LAPTOP RESULTS (2026-07-23, the full 16-combo matrix, ~5.7 h overnight; raw
   llama-bench full-prompt numbers — NOT feature-level TTFT, which a warm KV cache makes
   far smaller).** Core Ultra 7 165U · 32 GB · Arc iGPU (`uma: 1` in every device line —
   the engine-native unified/integrated signal CONFIRMED on both boxes: laptop 1, 2070S 0).
   **gemma-26B-A4B (MoE, the main writing model):** the iGPU wins PREFILL — best pp8192
   **117 tok/s** at ngl99/fa0/ub512 (≈70 s to ingest 8k cold) vs CPU's 55–63 (≈130–148 s);
   the CPU wins DECODE — **15.3–16.7 tok/s** at ngl0 vs the iGPU's 10.8–11.5. Both decode
   figures clear reading speed; the laptop's CPU decode BEATS the desktop Ryzen 5700X's
   9.4. **gemma-12B dense:** decode CPU 5.7–6.0 vs iGPU 3.7–4.3 — marginal either way; the
   MoE is the laptop model. **flash-attn HURTS this iGPU's prefill badly** (26B pp8192:
   117→65.6 with fa1; 12B: 61.4→37.1) — fa OFF is the Intel-iGPU-Vulkan rule; ubatch 512
   edges 2048. VERDICT: the laptop is **borderline-usable for local book-chat on the MoE
   only** — recommended class config for `igpu-mem32` + gemma-26B-A4B: **ngl 99 · fa 0 ·
   ub 512** (prefill-optimal, decode 11.5 still above reading speed); pure-generation use
   would prefer ngl 0. A future refinement worth testing: n_cpu_moe on UMA (the matrix
   didn't sweep it). Raw data: `E:\cpu\results.jsonl` + `bench-log.txt`.
   **FOLLOW-UP QUEUED (user "yes", 2026-07-23): `run-bench-2.ps1`** — the n_cpu_moe sweep
   (26B MoE only · ngl 99/fa 0/ub 512 fixed · ncmoe 0/8/16/24/32/40/48 · pp8192+tg128 only,
   ~1–2 h): hunting ONE config with the iGPU's prompt speed AND the CPU's writing speed
   (experts on CPU, attention on iGPU — no reload trade-off; ngl is launch-time, so
   per-request switching is off the table). `-ncmoe` flag verified against the b10083
   binary. The user copies just this script into the laptop kit folder and returns
   `results-2.jsonl` + `bench-log-2.txt`.
   **RESULT (returned + committed 2026-07-23): the sweep CLOSES the question — ncmoe 0 wins
   on both axes** (pp8192 108.9 t/s · tg128 10.98 t/s; every offload step worse, tg bottoming
   at 4.83 @ ncmoe 24, never recovering past baseline). On a UMA one-pool box the experts
   "on CPU" still share the iGPU's RAM bandwidth — offload swaps iGPU compute for slower CPU
   compute plus sync; the dGPU technique does not transfer to integrated graphics. The matrix
   pick stands: ngl 99 / fa 0 / ub 512, ncmoe 0. Data + table:
   `bench/results/laptop-core-ultra-7/kit/` (results-2.jsonl · bench-log-2.txt · summary.md).
   **KIT → REPO + RESULTS → GIT (user rulings 2026-07-23, JW `3abd8c7`):** the kit's four
   scripts live at `scripts/speed-kit/` (models/engine NOT committed — `download-models.ps1`
   fetches them, BITS-resumable, URLs HEAD-verified); `run-bench.ps1` is ONE full script
   (phase 1 matrix + phase 2 ncmoe sweep, one resumable results file); ALL bench results are
   committed under `bench-results/<machine>/{bench,kit}/` (un-ignored; layout in its README);
   the harness defaults its output there (`run.js`). The laptop's raw `results.jsonl` +
   36 KB `bench-log.txt` still need re-copying from the laptop into
   `bench-results/laptop-core-ultra-7/kit/` (the desktop copy was deleted after parsing;
   the parsed table is committed as that folder's `summary.md`).
   The original ruled shape, for reference:
   **The laptop iGPU test — the portable speed kit (the user's "easy way to test on my laptop").**
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

## 10. THE KIT ONE-CLICK REDESIGN — detect → PLAN → confirm → run (2026-07-23, post-reboot session)

What changed and why. The kit grew from four independent scripts into a confirmed one-click
instrument after the user's morning rulings: it stays ONE portable kit (their word — "why can't
it be one portable kit"; the per-machine-type folder idea was examined and rejected because its
duplicate model lists would silently break cross-machine comparability), detection proposes and
never dictates (the same law as the product's class_key_override), the plan shows the models,
sizes and disk cost before anything runs (their ask), downloads are fit-filtered so a 16 GB box
never pulls the 14 GB MoE it cannot bench (their "add guard and skip model download that are not
necessary for machine type"), and errors are logged like a real tool (their "normal debug and
error handling"). The engine stays PINNED (b10083) after an explicit latest-vs-pin decision: the
kit's job is cross-machine comparison, so the build is a controlled variable; every results row
self-labels (`build_commit 846e991ec` / `build_number 10083` — verified in the laptop's real
results.jsonl), so a deliberate `-Build` re-test stays readable. Windows gets a `run.bat`
double-click launcher (stock Windows opens .ps1 in Notepad; ExecutionPolicy bypassed per-run);
Mac/Linux `.sh` runners are deliberately deferred per the user's Windows-first sequencing ruling
(2026-07-22) — stock Windows 11 does not execute .sh natively, so .bat is the honest Windows path.

The shape. `kit-common.ps1` is the ONE source (engine pin `$KitBuild`, fit factor
`$KitFitFactor = 0.7`, the model list `$KitModels`, HEAD-based `Get-KitModelSize` with the
local-file-first rule, `Get-KitFit`, and the `Add-KitLog` timestamped logger writing to the same
bench-log.txt the human sends back). `run.ps1` (+`run.bat`) detects RAM/CPU/GPU, prints the PLAN
(machine · engine presence · per-model size + have/download/SKIP · total download vs free disk ·
the three tests), then prompts Proceed? [Y/n/s(elect tests)] — flags `-Yes` (unattended),
`-PlanOnly` (look without committing), `-RamGB` (override/dry-run another machine's fit),
`-Build` (deliberate re-test). `download-models.ps1` fit-filters BEFORE downloading, lands files
as `.part`, size-checks against the HEAD answer, renames only on success (a failed download can
never masquerade as a complete model — the hole the user's error-handling ask exposed), deletes
a corrupt engine zip so a rerun refetches, exits 1 with a logged failure summary. It unzips into
`engine/<build>/` so a `-Build` override can never silently run an older exe (run-bench prefers
that dir, falls back to any exe for pre-existing stocked kits). `run-bench.ps1` gained
`-Phases "1,2,3"` (the select plumbing) + `-RamGB`, and now sources the shared factor — the 0.7
lives once. `detect-facts.ps1` unchanged.

How it was verified. All five scripts parse-clean (PS language parser). Live `-PlanOnly` on the
real 32 GB desktop: all four models fit (real HEAD sizes 2.44/3.93/6.26/13.27 GB), download total
25.89 GB, disk free shown. Live `-PlanOnly -RamGB 16` (the laptop's exact path): MoE SKIPped
"over the 11.2 GB fit", test 2 "auto-skipped - no MoE model fits", download total 12.62 GB.
`run.bat -PlanOnly -RamGB 16` through cmd renders the same plan (the double-click path works).
`run-bench.ps1 -Phases 3 -RamGB 16` exits cleanly with the no-engine message in the repo's
model-less copy. The stocked master kit (`E:\laptop-speed-kit`) was synced and its own PlanOnly
shows engine "already present" + 12B/MoE "have" + E2B/E4B "download ~6.37 GB" — the legacy
flat-engine fallback proven live. NOT tested: a full bench run (hours, needs models beside the
scripts) and the interactive prompt's keystrokes (non-interactive shell; logic is three literal
regex branches). The repo kit keeps zero binaries (.gitignore proven earlier with a fake .gguf).

What would reverse it. A ruling that the kit should track the app's engine build instead of its
own pin (breaks comparability with the committed b10083 matrices — re-run everything or accept
mixed builds); a per-machine-type kit split (re-opens the duplicate-list drift this design
closed); or a real Mac/Linux port (adds kit-common.sh mirrors of the facts file).

OPEN from this pass: E2B/E4B not yet downloaded into the stocked master kit (~6.4 GB — one
`run.ps1` there, or on the laptop itself); the 16 GB laptop run itself; its results folder name
under `bench-results/<machine>/kit/` (user's naming call when the results come back).

## 11. THE REPO REORG + THE CROSS-PLATFORM KIT — bench/ + tests/ roots, sh mirrors, one home (2026-07-23)

What changed and why. The user's ruling ("things should be labeled and organized, instead of
lumped in scripts folder … tests in test folder, bench in bench … scripts is for app function"):
the repo grew two labeled roots. `bench/` holds `harness/` (was `scripts/bench/` — the
app-pipeline bench), `speed-kit/` (was `scripts/speed-kit/` — the portable kit), and `results/`
(was `bench-results/`). `tests/` holds `smoke/` (headless-smoke.js + book-smoke.js, was loose in
`scripts/`), `lib/` (smoke-common.js, was `scripts/lib/`), and `probes/` (the 19 one-off probe/
verification scripts that had accumulated in `scripts/`). `scripts/` is back to app function only
(bump.js, release.js). `e2e/` stays at root — the user cited it as the good example, and no
ruling moved it. All moves are `git mv` (history preserved). Every live reference was
grep-enumerated and updated in the same commit: package.json (bench/bench:gpu/bench:cpu),
vitest.config.js (the include pattern `bench/harness/**/*.test.js` + its stale `.mjs` comment),
the harness's own outDir/usage strings (`bench/harness/run.js`), the real imports
(`bench/harness/lib/drive.js`/`server.js` → `../../../tests/lib/smoke-common.js`; the smokes →
`../lib/smoke-common.js`), config self-doc strings, CLAUDE.md's tooling paragraph,
MORNING_RECAP.md, docs/TASKS.md live lines, docs/bench.md, and both READMEs. Historical
summary.md files inside results keep their old-path text (they are generated history).

The kit's ONE home + retirement. `E:\laptop-speed-kit` is GONE (the user: "we are not using the
e:\laptop speed kit, confusing to use both"). Before deletion: the laptop's raw `results.jsonl`
(75,092 B) + `bench-log.txt` (36,608 B) — which existed ONLY there — were salvaged into
`bench/results/laptop-core-ultra-7/kit/` (its detect-facts.txt proved byte-identical to the git
copy modulo CRLF); the two stocked models (12B 6.7 GB, MoE 14.2 GB) and the engine zip moved into
the repo kit's git-ignored `models/`/`engine/` (the ignore guard re-proven at the new path);
everything else was script copies or the rebuildable unpacked engine. The kit README, TASKS.md
and bench/results/README.md now name `bench/speed-kit/` as the one home.

Cross-platform (the user's directive I had wrongly deferred: "bat for windows, sh for mac
linux"). The kit gained the sh face: `kit-common.sh` (THE SAME FACTS as kit-common.ps1 — pin,
model list, fit rule as integer math, curl-HEAD sizing, kit_log; cross-referenced headers both
ways: change one, change both), `run.sh` (detect → PLAN → [Y/n/s] confirm → run; --yes /
--plan-only / --ram-gb / --build; KIT_OS/KIT_ARCH env overrides for off-target testing),
`download-models.sh` (.part + size-check + rename, per-build engine dir, failure summary + exit
1), `detect-facts.sh`, `run-bench.sh` (3 phases, grep-based resume on the printf'd JSON lines,
RAM-guard backstop). Engine assets were HEAD-verified against the b10083 release API — the
guessed names were WRONG (.zip) and the real ones are .tar.gz (`ubuntu-vulkan-{x64,arm64}`,
`macos-{arm64,x64}`); a `.gitattributes` forces `.sh`=LF / `.ps1`/`.bat`=CRLF so a kit copied
from any machine runs on any other. Bash 3.2-safe throughout (macOS stock bash).

How it was verified. 429 vitest tests pass from the new paths (the bench harness suites
discovered under `bench/harness/`), build:vite green, all five ps1 parse-clean from the new home,
all five sh parse-clean (`bash -n`), and TWO live plan runs: `run.ps1 -PlanOnly` (32 GB real:
stocked models show "have", engine "zip here - will unpack", download 6.37 GB) and
`KIT_OS=linux KIT_ARCH=x64 bash run.sh --plan-only --ram-gb 16` (Git Bash: the verified
ubuntu-vulkan asset named, MoE SKIP at 11.2 GB, test 2 auto-skipped — the sh logic runs end-to-end
on the plan path). A final grep sweep shows zero stale `scripts/bench|bench-results|scripts/
speed-kit` references outside generated history and the probes' historical comments. NOT tested:
a real Mac/Linux box (first run there is the sh side's true test — honest caveat in the README),
the full bench, the interactive keystrokes.

What would reverse it. A ruling to move `e2e/` under `tests/` (one git mv + package.json line);
un-retiring a stocked master copy outside the repo (re-opens two-home drift — don't); a kit model
whose filename gains spaces (run-bench.sh's word-split model loop would need quoting rework).

## 12. THE PRISM-FORK TEST — their own launcher's recipe, adopted (2026-07-23)

Context. The 2026-07-23 pre-reboot session staged the PrismML fork test (their release
`prism-b9596-9fcaed7`, CUDA + CPU builds, and the card-canonical `Ternary-Bonsai-27B-Q2_0.gguf`,
7,165,121,600 bytes — all surviving in the dead session's scratchpad `prism-engine/`) and crashed
the box on the first CUDA load: `-ngl 99` + auto ctx put 7.17 GB + KV onto the 8 GB 2070S,
Windows WDDM oversubscription paged it into system RAM, an orphaned llama-cli thrashed, lockup.
Two findings survived: our long-held `Q2_g64` is STRANDED (their current builds reject it —
tensor-offset mismatch from an older converter; mainline still reads it but a dense 27B on the
5700X blew the 10-minute ceiling, 0/10 runs), and the Q2_0 is the current-format file.

The user pointed at `github.com/PrismML-Eng/Bonsai-demo` — their official launcher — and ruled
"go" on adopting its recipe (the adopt-working-reference-code rule). Extracted, with receipts:
`scripts/common.sh:157-195` — ctx is RAM-TIERED, never `-c 0`, their comment describing our crash
verbatim ("memory-unaware, so with -ngl it picks the maximum and OOMs constrained machines");
tiers ≤11 GB→8192 / ≤23→16384 / ≤35→32768 / ≤71→65536 / else 131072 (27B only).
`common.sh:212-228` — ngl auto is BINARY (nvidia-smi→99, else 0), no partial split.
`start_llama_server.sh:147-149` — 27B sampling: temp 0.7, top-p 0.95, top-k 20, min-p 0,
`--jinja`, `-fa on`; a thinking model (`--reasoning-budget N` available).
`start_llama_server.sh:26,30` — their picker EXCLUDES g64 by comment and code ("a leftover F16
or g64 file must never be picked up") — the g64 question is closed in their own words.
Tight-machine levers: opt-in 4-bit KV (`--cache-type-k q4_0 --cache-type-v q4_0`,
`start:120-140`; optional kv-bias + `LLAMA_ATTN_ROT_DISABLE=1`), mmproj-to-CPU frees ~0.9 GiB
(27B is a VLM; text-only needs no mmproj), opt-in dspark speculative (`-md *dspark-Q4_1*
--spec-type draft-dspark --spec-draft-n-max <block_size> -ngld 999 -np 1`, ~1.8-2x decode,
kills prompt cache). `scripts/download_binaries.sh:13` pins `prism-b9596-9fcaed7` — exactly
what we staged; nothing re-downloads. NEW for the watch: ternary 8B/4B/1.7B (+ 1-bit family)
exist — a ternary 8B could fit the 8/16 GB classes (IDEAS updated).

The honest gap in their defaults for OUR card: tiers key on SYSTEM RAM, so their auto on this
box would pick `-ngl 99 -c 32768` — the same oversubscription crash. The 2070S needs the budget
keyed on VRAM.

THE QUEUED RE-RUN (awaiting the user's "run leg 1"): LEG 1 = CPU quality probe, zero lockup
risk — their CPU build, `-ngl 0 -c 8192`, THEIR sampling, lighthouse + two book-ish prompts,
`-n` capped, file-redirected, background with a taskkill guard. LEG 2 (only if quality passes) =
their CUDA build, `-c 8192` (VRAM-keyed tier), KV4 on, EXPLICIT partial `-ngl` from ~36 stepping
up (~150 MB/layer, total ≤~7 GB), never 99/auto on 8 GB. Then llama-bench legs → results to
`bench/results/desktop-rtx-2070s/prism-fork/`. What would reverse this: mainline CUDA PR #25707
merging (the IDEAS promote-trigger — then the fork path is moot and the Lab A/B runs on a
pinnable mainline release).

**LEG 1 RAN (2026-07-23 16:24–16:50, the user's "go"; artifacts committed under
`bench/results/desktop-rtx-2070s/prism-fork/`).** Three probes (lighthouse · literary
continuation · JSON extraction) on their CPU build, their exact 27B sampling, `-ngl 0 -c 8192
-n 700`, 20-min timeout each, file-redirected, llama-cli-only kill guard — no lockup, box fine.
What it proved: the backend is SANE (coherent, structured, self-critiquing reasoning; zero
garbage/repetition — the fast-garbage failure mode is absent), the embedded draft prose is
genuinely promising (the lighthouse "bruised purples" draft; the Margaret "sharp as promises"
line), and the JSON reasoning identified all three characters correctly. What it disqualified:
CPU — 1.5 tok/s generation AND a thinking model that spent the ENTIRE 700-token budget
deliberating on all three probes, so no probe emitted a final answer (time-to-first-answer-token
would be 8+ minutes interactively). The leg-2 gate question (final-answer quality) is therefore
STILL OPEN — the queued cheap step is a thinking-OFF re-probe using their own non-27B flag set
(`--reasoning-budget 0 --reasoning-format none --chat-template-kwargs '{"enable_thinking":
false}'`, their `start_llama_server.sh:161-162` — flags proven in their build), ~3–4 min per
probe, same zero-risk path; awaiting the user's word. Verify: the three
`quality-probe-*.txt` + `leg1-cpu-log.txt` (per-probe timings + exit codes). What would reverse
the CPU disqualification: nothing plausible on this box — it restates the CPU-band verdict for
dense 27Bs; the model's remaining chance here is leg 2 (GPU) or the smaller ternary sizes.

**THE LAPTOP-BONSAI QUESTION (2026-07-23, the user's "go for bonsai" — verification FAILED the
premise, model NOT added to the kit).** The plan was to add Bonsai as a fifth kit model so both
laptops bench it on the kit's mainline b10083 win-vulkan engine. The load-bearing fact ("Vulkan
Q2_0 merged" — the IDEAS entry) was box-tested first and is FALSE: mainline b10083 REJECTS the
fork's Q2_0 file outright (`gguf_init_from_reader: failed to read tensor data` — the format churn
cuts both ways: mainline reads only the g64 generation, the fork reads only Q2_0), and while the
Vulkan build LOADS the g64 and generates coherently (the "[Start thinking]" block — template
applied, no garbage), a VRAM watch proved SILENT CPU FALLBACK: 597 MiB flat through a -ngl 40 run
with Vulkan0 enumerating fine. Upstream confirms: CPU #24448 merged Jul 7; Vulkan TQ2_0 = #25850
OPEN (Jul 18); CUDA #25188 abandoned, #25707 open. So mainline ternary is CPU-only everywhere
today, and CPU is already disqualified (leg 1: 1.5 tok/s on the desktop's stronger CPU) — kit
inclusion would measure a dead path. IDEAS corrected with the PR numbers + box proof. The watch
trigger is now PRECISE: when #25850 (Vulkan) or a CUDA PR merges into a pinnable release → bump
the kit pin deliberately → add Bonsai-g64 → the laptops top-up (~8 combos + a probe via resume).
The fork-on-laptops alternative (their win-vulkan builds, a second engine, numbers not
kit-comparable) stays available but was not chosen — awaiting the desktop quality gate (leg 1b)
before it's worth anyone's hours.

**LEG 1b RAN (2026-07-23 16:54–17:20; artifacts committed).** The thinking-OFF re-probe using
their non-27B flag set — and the flags DON'T WORK on the 27B: all three probes show
`[Start thinking]` again and truncate in-thinking at -n 700 (their own script's comment said it:
"The 27B is a thinking model and thinking stays on", start_llama_server.sh:83-84 — the
`enable_thinking` template knob evidently doesn't exist in the 27B's template, and
`--reasoning-budget 0` doesn't force-stop it on their b9596 build). What the six probes (1+1b)
establish anyway: ZERO garbage across all runs (backend numerically sane); the JSON probe
produced a COMPLETE, VALID, CORRECT array (all three characters, right roles) — inside thinking;
prose drafts consistently competent. What remains impossible on CPU: ever seeing a FINAL emitted
answer — 1.4-1.5 tok/s x an unstoppable ≥700-token thinking pass means every probe truncates;
a complete answer needs -n ~2500 ≈ 30+ min per probe. VERDICT: the quality gate cannot be closed
efficiently on CPU; LEG 2 (their CUDA build, the §12 safe recipe: -c 8192, KV4, explicit partial
-ngl from ~36 stepping up, never 99/auto) is now ALSO the cheapest way to see final answers
(~10-20 tok/s → full think+answer in minutes) and yields the GPU speed numbers regardless.
Garbage-risk low (six coherent transcripts). Awaiting the user's word on leg 2.

**LEG 2 LAUNCHED (2026-07-23 ~18:15, the user's "go").** The GPU leg is running in the
background per the §12 recipe, with the anti-thrash mechanism the crashed run lacked: STEP 1
loads at `-ngl 36 -c 8192` + KV4 and MEASURES (real layer count parsed from the load output,
real VRAM peak from a 20 s sampler), then the probe `-ngl` is projected as
peak + extra-layers × measured-per-layer-weight, CAPPED at ≤6900 MiB (≥500 MiB headroom on the
8 GB card) — never 99/auto. Then the same three probes (lighthouse · continuation ·
JSON-extract) at `-n 2500` (room for the full think + the final answer the CPU legs could never
reach), their 27B sampling, 25-min timeout each, VRAM sampled to the log throughout; the kill
guard targets the leg-2-only exe copy (`llama-cli-leg2.exe`) so the app's llama-server is
untouchable. Runner: the session scratchpad `prism-leg2.sh` (throwaway); outputs →
`bench/results/desktop-rtx-2070s/prism-fork/` (`quality-probe-*-gpu.txt` + `leg2-gpu-log.txt`
with the chosen ngl, VRAM peaks, and per-probe exit codes). Verify when it lands: the log's
"chosen -ngl" + "peak VRAM" lines and three complete final answers. What would reverse the
approach: a measured per-layer cost so high that ≤6900 MiB keeps ngl at 36 and decode stays
CPU-bound-slow — then the honest fallback is fewer GPU probes (lighthouse only) or accepting
the timeout as the answer that the 27B doesn't fit this card usefully.

**LEG 2 COMPLETE (2026-07-23 20:10–21:03; artifacts committed).** The GPU leg answered the
quality gate and closed the speed question — but only at a partial offload, and it exposed a bug
in my own runner. QUALITY: PASSED, decisively. All three probes emitted COMPLETE final answers
(the first in the whole test): the lighthouse paragraph is genuinely good prose whose visible
reasoning self-critiques a weak first draft ("Too simple... 'purple sky' is okay, but 'bruised
purple' might be better"); the JSON probe emitted a VALID, CORRECT array — all three characters,
right roles, raw JSON exactly as instructed. Zero garbage across nine probes now (legs 1+1b+2).
SPEED: 1.4 tok/s generation on all three probes — no better than CPU's 1.5 — with prompt
processing 0.7/14.5/20.9 t/s. Each probe took 11-21 min. BUG (mine): the runner's layer-count
regex (`offloaded N/M`) does not match their fork's load output, so NTOT never parsed, the
step-up projection never ran, and -ngl stayed pinned at the starting 36 (log reads
"step1:  layers" and "of ? layers"). Peak VRAM was 4765 MiB against the 6900 MiB cap — ~2.1 GB
left unused. So 1.4 tok/s is a FLOOR from partial offload, not the 2070S's verdict on this model;
the un-offloaded tail (roughly 7.17 GB file - 4.77 GB resident ≈ 2.4 GB) is slightly more than
the headroom, so a fixed re-run would approach but probably not reach full offload — the honest
expectation is a few tok/s, not a usable model. Verify: leg2-gpu-log.txt (chosen ngl, VRAM peaks,
per-probe timings) + the three quality-probe-*-gpu.txt.

**THE DESKTOP VERDICT (why the prism track stops here on this box).** gemma-4-26B-A4B is a MoE
with ~4B ACTIVE params per token out of 25,233,142,046 total (its own results row) — it already
delivers 26B-class capacity at ~4B-dense inference cost, measured at 117 tok/s pp8192 / ~11 tok/s
tg on the laptop's weaker Arc iGPU. A dense ternary model of ANY size is strictly dominated here:
more compute per token for less capacity. That also kills the ternary-8B idea I floated earlier
(8B dense active vs 4B active MoE, 8B capacity vs 25B) — withdrawn on the arithmetic. Q1_0 (the
1-bit family, `common.sh:27`) is likewise not worth testing: strictly lower fidelity than ternary
by construction (2 weight states vs 3, no "off" state), and quality was never the failing axis.

**⚠️ CORRECTION — the laptop path is NOT closed (the user caught this).** I tested MAINLINE
b10083 Vulkan (no ternary kernels, #25850 open, VRAM flat 597 MiB) and then over-generalized to
"Vulkan". PrismML's fork ships its OWN `llama-bin-win-vulkan-x64.zip` (31.6 MB) in the same
release we already pulled from — verified against the GitHub release API this session. The
naming trap: their Windows assets are UN-PREFIXED while Linux/macOS carry the prism tag, so the
Windows Vulkan zip looks like a vanilla upstream artifact — but it is not: our CPU build came
from that same un-prefixed pattern and its banner reads `build : b9596-9fcaed763`. So the 16 GB
laptop case is genuinely reopened: the gemma MoE is auto-skipped there (13.27 GB > the 11.2 GB
fit ceiling) while a 7.17 GB ternary 27B fits, and a plausible GPU backend now exists for it.
Caveat that stands: it would be THEIR engine, not b10083, so any numbers sit outside the kit's
cross-machine comparison. OPEN, one cheap test: download that 31.6 MB zip, load Q2_0 at a modest
-ngl on the 2070S (a valid Vulkan device — `Vulkan0: NVIDIA GeForce RTX 2070 SUPER`, and the
same SPIR-V shaders serve Intel Arc), watch VRAM. Climbs = laptop path live; flat = the fork's
Vulkan lags its CUDA target and the path really is closed. What would reverse the desktop
verdict: nothing plausible — the MoE's active-param advantage is architectural.

## 13. THE KIT GOES LATEST-ENGINE + THE TERNARY MODELS LAND (2026-07-23, the user's go)

What changed and why. The user proved on their 32 GB laptop that MAINLINE llama.cpp runs
Ternary-Bonsai — replacing the fork's Vulkan with mainstream and running the 8B at 12.0 tok/s —
which overturned three of my conclusions and exposed that the kit's b10083 pin was hiding a
fixed bug. Verified here before rebuilding: b10099 is the latest release (published 2026-07-23
23:34) and its win-vulkan build LOADS `Ternary-Bonsai-27B-Q2_g64.gguf` and OFFLOADS it (VRAM
565 -> 4188 MiB on the 2070S), while REJECTING `Ternary-Bonsai-27B-Q2_0.gguf` with the same
error b10083 gave. So the variable was never the build, it was the FILE: the plain `*-Q2_0.gguf`
files are the fork's packing; the g64 variants are mainline's. The repos label the same format
inconsistently (8B `Q2_0_g64`, 27B `Q2_g64`), and the demo launcher's picker globs `*-Q2_0.gguf`
while its own comment says a g64 file "must never be picked up" — which is why the user had to
RENAME files to run them, silently destroying the provenance of which packing a result used.
My earlier IDEAS correction was wrong on two counts and is now re-corrected: #25850 is TQ2_0
(BitNet, tensor type 35), not PrismML's Q2_0 (type 42, confirmed by parsing both GGUF headers).

The build policy is now LATEST, not pinned (the user's ruling: "llama changes so fast with bug
fixes ... in prod we use latest"). Comparability is preserved by DATA rather than by freezing:
`Get-KitLatestBuild` / `kit_latest_build` resolve the newest release at run time (cached in
`.latest-build` so an offline or rate-limited rerun knows what it used; `$KitFallbackBuild` only
when there is neither network nor cache), the resolved tag is printed in the PLAN BEFORE the
confirm prompt, and `-Build`/`--build` pins deliberately when two machines must be matched.
Critically, THE RESUME KEY NOW INCLUDES THE BUILD (`Get-KitComboKey` = build|model|ngl|ub|fa) —
without that, latest-per-run plus the old build-free key would have silently skipped combos
measured on an older engine and produced a mixed-build matrix with no indication. Quality-probe
filenames carry the build for the same reason. `-Force` re-runs even what the current build did.

The plan gained a prior-results status column (the user's idea, and it is a DEPENDENCY of
persistence, not a nicety — invisible state is worse than none): each fitting model is numbered
and annotated `8/8 done @b10099 tg 9.1 -> skip (current)` / `3/8 done -> resume 5` /
`8/8 done @b10083 -> RE-RUN (build changed)` / `-- not run --`, and the confirm became
`[Y=all / n=abort / m=pick models / t=pick tests]` with numbered multi-select (not a toggle-UI,
which would break under -Yes and when piped). Both Bonsai g64 models are in `$KitModels` with
TRUE filenames; both clear the 16 GB box's 11.2 GB ceiling, so the same set benches on both
laptops. Data stays inside the kit folder per the user's ruling (a data-dir split was designed
and dropped as machinery for a short-lived tool); the README now says to paste new scripts OVER
the folder rather than delete it, which is what preserves ~20 GB of models and the resume history.

How it was verified. All five ps1 and all five sh scripts parse clean. A synthetic results.jsonl
seeded with three cases proved the status column: 12B 8/8 on b10099 -> "skip (current)", E4B 3/8
-> "resume 5", E2B 8/8 on b10083 -> "RE-RUN (build changed)"; re-reading the same file as though
the current build were b10083 flipped E2B to done=8 and 12B to done=0, proving build-sensitivity
rather than a cosmetic label. One runtime bug was caught that the parser could not see:
`if (Test-Path $results -and -not $Force)` binds `-and` as a Test-Path parameter — fixed to
parenthesised operands. Live plan runs: ps1 resolved b10099 from the API and listed all six
models (35.11 GB total on the 32 GB box, MoE included); `-Build b10083` correctly showed
"(PINNED via -Build)"; the sh face resolved b10099 and selected the correct per-OS asset
(`llama-b10099-bin-ubuntu-vulkan-x64.tar.gz`) with the MoE SKIPped at the 16 GB fit. NOT tested:
a full bench (hours), the interactive keystrokes, and any real Mac/Linux or Intel Arc run.

What would reverse it. A ruling back to a fixed pin (then the build drops out of the resume key
and matched runs become the default rather than the `-Build` escape); or PrismML republishing the
27B with mainline packing under the plain `Q2_0` name, which would make the g64 rule obsolete.
OPEN: whether to re-baseline the existing b10083 gemma matrices at latest (recommended: leave
them — rows self-label, so mixed history stays interpretable) and the user's laptop runs.

## 14. QUICK SCREEN FIRST, THEN THE KIT JUDGES IT (2026-07-24, the user's go)

What changed and why — two linked corrections in one arc. FIRST, the whole test methodology was
inverted and the user named it: "the only time we run full tests for hours is after we determine
the model will actually run at decent speed ... you made me waste all this time running tests we
shouldn't run." The kit had brute-forced the 16-combo tuning matrix on every fitting model and
buried the one-shot quality probe last. That was reordered (commit `40d7d7c`): the single
generation became the DEFAULT and runs FIRST (phase 3 moved above phase 1, made live via
`Tee-Object`/`tee`), and the hours-long matrix runs only on the opt-in `2) Also run the FULL
tuning matrix? [y/N]`. `run.ps1`/`run.sh` default phases to `3`; `1,2,3` only on the y answer.
Nothing is auto-thrown-out — every selected model that fits RAM is screened, including the
ternary 27B (the user's explicit instruction: it may run fine on a 32 GB unified-memory iGPU even
though it crawled on the 8 GB desktop card).

SECOND, and the reason for this section: showing the speed was not enough. The user corrected a
mis-read — that they had judged the ternary model "by hand" only because they are a person, not
because they want to keep doing it: "I did not mean for me to determine manually ... I am not a
computer." So the kit must DECIDE, not just display. Also clarified for the record (the user
noticed the quick screen calls a different binary): the quick screen runs `llama-cli` (which
generates real text AND prints a timing line), NOT `llama-bench` (which emits only numbers and no
readable prose); neither has a built-in "quick test" — that mode is the kit's own. The full
matrix still uses `llama-bench`.

The verdict layer. A single editable cutoff was added to the ONE source — `kit-common.ps1`
`$KitQuickMinTg = 7` and `kit-common.sh` `KIT_QUICK_MIN_TG=7` (same home as `$KitFitFactor`, one
tier, one number). WHY 7: decode tok/s is the speed a reader watches prose stream on screen, and
~7 keeps pace with reading (below ~5 is painful — that is the ternary-27B "it didn't work"); the
value is the user's call ("your rec"), advisory only, and never blocks a run. In `run-bench`'s
quick-screen block (both faces) the decode number is parsed from the `llama-cli` timing line
(`[ Prompt: … | Generation: N t/s ]`) and each model gets a verdict printed inline —
`run full` at/above the cutoff (inclusive), `SKIP too slow` below it, and `no speed line` when
the model errored or printed no timing (never a false "skip"). All rows are written, fastest
decode first, to `quick-summary.txt` — the ONE file the user glances at or sends back instead of
eyeballing N probe files, which was the literal ask ("are there results to file ... to tell me
which models to run full tests on or can that be built into kit?"). Two options were offered and
deliberately deferred to keep it simple: a second (batch) tier, and auto-gating the full run to
only the `run full` models.

file:line. Cutoff constant: `bench/speed-kit/kit-common.ps1` `$KitQuickMinTg` · `kit-common.sh`
`KIT_QUICK_MIN_TG`. Verdict + summary: the `phase 3` quick-screen block in
`bench/speed-kit/run-bench.ps1` and `run-bench.sh`. Flow default: `run.ps1`/`run.sh` (`phases`
default `3`, full on the y opt-in). Docs: `bench/speed-kit/README.md` (the two-test description,
the QUICK SCREEN bullet, the cutoff rule, the folder-layout line, the send-back list).

How it was verified. All four edited scripts parse clean (`Parser::ParseFile` for the two ps1;
`bash -n` for the two sh, plus `run.sh`/`download-models.sh`). The new extraction → verdict →
summary logic was unit-tested in the scratchpad (never in the repo — the standing rule) against
synthetic probe lines for four cases: fast 18.3 (`run full`), slow 2.1 (`SKIP too slow`), edge
7.0 == cutoff (`run full`, proving `>=` is inclusive), and a probe with no timing line
(`no speed line`, sorted last). Both the ps1 and the sh face returned `ASSERT: PASS` with
byte-identical output and the fastest-first order `FAST,EDGE,SLOW,NONE`. NOT yet tested: a real
model quick screen on the user's boxes — the `Tee`/extraction against a REAL `llama-cli` was
proven last session (it streamed, saved, and yielded `Generation: 1.7 t/s`), but the verdict +
`quick-summary.txt` layer is new and only synthetic-tested here; and no Mac/Linux box has run the
sh face.

What would reverse it. A different cutoff is one constant edit in `kit-common` (both faces share
the value). If the user later wants the full run auto-gated to the `run full` models, or a second
batch tier, both were scoped here and can be added without disturbing this layer. A ruling that
the quick screen should judge on prompt/prefill speed rather than decode would change which number
the parse targets.

OPEN: the user's box runs (quick screen on both laptops + the desktop, then send `quick-summary.txt`
back); whether to add auto-gating; whether a second batch tier is wanted.

## 15. THE 16 GB-LAPTOP FALLOUT — cached≠skipped, download-if-missing, the "Chinese" log (2026-07-24, the user's go)

What triggered it. The user ran the updated kit on the 16 GB i7-1355U (Iris Xe) laptop and hit
three things at once, shown in one screenshot of `bench-log.txt`: (1) the log rendered as a wall
of CJK; (2) the 27B ternary printed `have (cached)` then `no speed line`; (3) the paths were all
`engine\b10083`, the OLD broken engine. Each was a real defect, and the user named the right
designs for all three - I had made the kit decide where it should have informed.

What changed and why.

CACHED NEVER MEANS SKIPPED (the core one). The quick screen used to skip a model whose probe file
already existed (`$cached = (Test-Path $probe) -and (-not $Force)`), so a prior broken run's empty
probe was re-shown as `no speed line` instead of being re-run. The user: "just because cached
doesn't mean I want them skipped - I decide, not you ... show what is cached before I choose ...
that way what I pick just runs no matter what." So: the skip is DELETED - a picked model ALWAYS
runs (Tee overwrites its probe); and the PLAN now shows each model's cached quick-screen result
BEFORE the picker (`quick screen: 12.0 tok/s -> run full` / `no speed line` / `not yet run`), read
from the probe files, so the choice is made with the info in front of you. `-Force` is no longer a
quick-screen knob (it stays a full-matrix knob). The verdict logic is now ONE function
(`Get-KitQuickVerdict` / `kit_quick_verdict`) shared by the run-time print and the PLAN's cached
read, so the two can't disagree; the PLAN's per-model read is `Get-KitQuickStatus` /
`kit_quick_status`.

DOWNLOAD IF MISSING, NEVER SILENTLY FALL BACK (the b10083 cause). `run-bench` looked for the
resolved build's binary and, if absent, fell back to ANY `llama-{cli,bench}` under `engine\` - which
silently ran b10083 on that laptop and produced garbage. The user: "always download latest engine
... if missing just download." So the fallback line is DELETED on both binaries and both faces; if
the resolved build isn't present, `run-bench` invokes `download-models` for it (with the same
`-Models`/`--models` filter) and looks again; only a failed download stops the run. The engine dir
is now computed once (`$engDir` / `$ENGDIR`) and both `llama-bench` and `llama-cli` resolve from it
alone.

THE "CHINESE" LOG (encoding). `bench-log.txt` was written by two mechanisms with different
encodings: the `2>>` redirect (Windows PowerShell 5.1 = UTF-16) and `Add-Content` (5.1 = ANSI). A
half-and-half file can't display in one encoding, so an editor that picked UTF-16 turned the ANSI
half into CJK. Fix: a per-version `$KitTextEnc` (`unicode` on 5.1 to MATCH the redirect, `utf8` on
PS 7 where both are already UTF-8) applied to every kit-owned `Add-Content`/`Set-Content` in the
human-read text files (bench-log, quick-summary, detect-facts), plus `[Console]::OutputEncoding =
UTF8` at each script's top so llama.cpp's UTF-8 output decodes correctly before it is written.
`results.jsonl` is left as-is (ASCII JSON, machine-read, never displayed). The model ALSO genuinely
produced garbage on b10083+Intel-Vulkan+ternary - that is a real broken-combo signal, separate from
the encoding, and the download-latest fix addresses it.

file:line. Skip deleted + always-run + shared verdict: `bench/speed-kit/run-bench.ps1` and
`run-bench.sh` quick-screen loop. Engine download-if-missing (no fallback): the `$engDir`/`$ENGDIR`
block near the top of both `run-bench` faces + the cli lookup in the quick-screen block. PLAN cached
column: `run.ps1` (`$quick = Get-KitQuickStatus` + the per-model sub-line) and `run.sh` (the
`kit_quick_status` printf). Shared helpers + `$KitTextEnc`: `kit-common.ps1`
(`Get-KitQuickVerdict`/`Get-KitQuickStatus`/`$KitTextEnc`, Add-KitLog encoding) and `kit-common.sh`
(`kit_quick_verdict`/`kit_quick_status`). Encoding on the other writers: `run-bench.ps1` log lines +
summary, `detect-facts.ps1` (now dot-sources kit-common for `$KitTextEnc`). Docs: `README.md`.

How it was verified. All five ps1 and all four sh scripts parse clean (`Parser::ParseFile` /
`bash -n`). The verdict + cached-status helpers were unit-tested in the scratchpad (not the repo)
against synthetic probes: a present-with-speed probe (18.3 -> `run full`), a present-without-timing
probe (-> `no speed line`), and an absent probe (-> `not yet run`); plus the inclusive cutoff
(7 -> run full, 6.9 -> SKIP). Both faces returned `ASSERT: PASS`, byte-consistent. `run.ps1
-PlanOnly` rendered the PLAN with the new `quick screen: not yet run` sub-line under all six models,
no runtime error, nothing written. NOT run: a real quick screen with a model (no engine/model in
this env); the PS 5.1 encoding branch (`$KitTextEnc = unicode`) - reasoned from documented 5.1
redirection behaviour, confirmed `utf8` on PS 7.6.3 here; and the `run.sh` PLAN render (Git Bash
reports "unknown OS"; `kit_quick_status` was tested directly).

What would reverse it. Wanting the quick screen to resume-skip again (it doesn't; deliberate).
Wanting the full matrix to also "just run what I pick" (its combo-resume is kept because it saves
hours - one word flips it). A ruling that the log should be UTF-8 even on 5.1 would mean dropping
`2>>` for a captured-and-rewritten stderr path (heavier; not done because it risks the timing
parse). OPEN: the user's box runs on b10099 (delete `engine\b10083\` first); whether auto-gating
the full run to only `run full` models is wanted.

## 16. QUICK -> FULL IN ONE SESSION — the continuation flow (2026-07-24, the user's go)

What was wrong. The user: "when I run quick test it tells me what to run full test, but then it exits,
so I restart and have to remember which ones were recommended ... I make my pick then it asks if I want
to run full test, and I say yes, and it runs quick test AGAIN, why!!!" Two defects, one root cause: the
full-test decision was asked BEFORE the quick screen existed to inform it, and the two phases were
bolted together. Verified: `run.ps1:152` set `$phases="1,2,3"` on a "yes"; `run-bench.ps1` runs phase 3
(quick) THEN phase 1 (matrix) - so "yes, full" = quick screen AGAIN then matrix (the double-run). And the
default `$phases="3"` ended the run after the quick screen, forcing a restart-and-re-pick to do the full
test. The user's instruction: "think twice on the design and do it right how a user would expect ... not
having to restart after quick test. Professional programming 101."

What changed and why. The orchestration moved into `run.ps1`/`run.sh` (the UI layer); `run-bench` is
unchanged (it already runs whatever phases it is handed - the right primitive). The new flow: (1) ask
ONLY "which models" up front - the upfront "run the full matrix?" question is DELETED, because a user
can't answer it before seeing results. (2) Run the quick screen once (phase 3). (3) Read the FRESH
verdicts, print a numbered list of the just-screened models with their tok/s + verdict, mark the winners
(cleared the cutoff), and OFFER the full matrix in the SAME session: Enter = the recommended winners,
your own numbers = a custom pick (including a model that did not clear - you decide), n = stop. (4) If a
set is chosen, run the matrix (phases "1,2" only - the quick screen NEVER re-runs) on exactly that set.
`-Yes` auto-continues to the winners' matrix; if nothing cleared, it stops (nothing worth hours). The
number-pick parsing is now ONE shared function - `Resolve-KitNumbers` (ps1) / `pick_rank` over a `RANK`
array (sh) - used by both the model picker and the full-test picker so they behave identically; the
winner read reuses `Get-KitQuickStatus`/`kit_quick_tg` + the shared `Get-KitQuickVerdict`/
`kit_quick_verdict`.

file:line. Removed upfront question + continuation: `run.ps1` confirm+run tail (the STEP 1/2/3 block)
and `run.sh` (same, with `pick_rank` + a bash `RANK` array). Shared parser: `kit-common.ps1`
`Resolve-KitNumbers`. Winner tok/s read: `kit-common.sh` `kit_quick_tg` (+ `kit_quick_status` refactored
to use it). PLAN "Tests" wording updated in both faces. `run-bench` untouched.

How it was verified. All ps1 + sh parse clean. Scratchpad logic tests (not the repo): `Resolve-KitNumbers`
handles ranges/dedup/out-of-range/empty; the winner+rank computation over a mocked quick-status gives
winners=[8B] #1 (only the >=cutoff model), Enter-default = winners, custom "1,3" maps through the rank to
the right files; `pick_rank` mirrors it in sh; both faces ASSERT: PASS, byte-consistent. `run.ps1
-PlanOnly` renders the new "offered right after the quick screen ... SAME session, no restart" Tests
text, no error, nothing written. NOT run: the live end-to-end interactive flow (no engine/model in this
env) - every logic piece is unit-tested and the phase split is a `run-bench` behaviour already proven.

What would reverse it. Wanting a way to skip the quick screen and go straight to the matrix (a -FullOnly
flag) - not added, because the quick screen is ~1 min and always informative, matching the user's
philosophy. Wanting the continuation to auto-run winners with no prompt (fewer keystrokes) - one edit,
drop the Read-Host and always use the winners. OPEN: the user's live run on a real box is the true test;
whether -FullOnly is ever wanted.
