# 2026-07-22 — iGPU model research + the CPU-band run: recovered session record

> **⚠ SUPERSEDED IN PART (2026-07-25) — §"The real structural flaw" + "THE REDESIGN" (lines
> ~462-490) are STALE.** All five parts are done or moot: the pick map was DELETED 2026-07-22
> (`just-llm-runner/llm_runner/llm/db.py:312-318`), the architecture token exists
> (`runner/hardware.py:80-90` + the Hardware-type dropdown), and there is **no pending "EXACT
> GRAMMAR" decision** — users never see the key, they pick a type and type two numbers.
> Detection is also NOT broken (`hardware.py:123-133`). Detail:
> `docs/plans/2026-07-25-session-handoff-and-verification-debt.md`.


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

## 17. THE iGPU CLASS + CONFIG WIRED INTO THE APP (2026-07-24, the user's go)

What the user asked. "Lock in the models/configs for the RTX (8 GB VRAM / 32 GB) and the Core Ultra 7
iGPU (32 GB) and set it up to work correctly in the app — detection, hardware config, downloading the
correct version." Both boxes run the SAME model (gemma-4-26B-A4B MoE); the machine-specific parts are the
engine (CUDA vs Vulkan) and the laptop's tuning. Design discussion first settled that the class should be
GENERIC — "Intel Xe iGPU + RAM tier", NOT iris-vs-arc — because the two U-series iGPUs are only ~15-20%
apart (Iris Xe 96 EU / 102 GB/s vs Meteor Lake Arc 64 EU-Xe-LPG / 120 GB/s; web-checked), and the seed
principle already lets each machine MEASURE its own numbers, so a slightly-slower Iris Xe gets its own
speed rather than the Arc's. The big cliffs to encode are RAM (fits the model or not) and real-Xe-vs-
ancient-UHD, not Iris-vs-Arc.

What was ALREADY built (verified in code, not memory). The §9 redesign is done: `hardware.py` classifies
arch-first — `mem_arch()` → discrete|integrated|unified, `format_class_key()` → `dgpu-vram8|ram32` /
`igpu-mem32` / `unified-mem<M>`, RAM snapped to a standard ladder, the Intel-Arc NAME regex DELETED so an
iGPU keys on dedicated-VRAM<4 GB (not marketing), Intel→Vulkan detection widened (A2). The engine pick
rides `binary.py`'s `_gpu_preference` (runtimes → build). The schema is done: `hardware_classes` +
`class_tunes` (arch-aware), `model_class_picks` already deleted. So detection, class keys, engine pick,
and model download were all in place.

The gap (all that was missing). Only the DISCRETE class was seeded. Added TWO seed rows in
`just-llm-runner/llm_runner/llm/seed.py`: (1) `DEFAULT_HARDWARE_CLASSES` gains `igpu-mem32`
(mem_type integrated, ram 32, vram 0, blank name → UI shows "Integrated GPU · 32 GB"); (2)
`DEFAULT_CLASS_TUNES` gains the (gemma-4-26b-a4b-qat, igpu-mem32) row from the kit matrix:
`n_gpu_layers=99`, `flash_attn=off`, `ubatch_size=512`, `n_cpu_moe=0` (MEASURED — fa hurts this iGPU,
UMA offload is closed), `ctx_len=32768`/`batch_size=512`/`reasoning_budget=1024` (mirror the blessed
discrete row), `threads` OMITTED (machine-specific, derived per box from cpu_cores). flash_attn=off
overrides the base bundle's "on" because class_tunes resolve above the bundles — right, since "on" is a
CUDA-only win. Two seed tests updated to the new count + strengthened to assert the iGPU row
(`test_class_tune_refs.py`, `test_switch_resolve.py`).

How it was verified (all with the app venv python, real code). Runner suite 689 passed / 9 skipped / 1
failed, the one failure being the PRE-EXISTING Windows known-bad `test_pci_gpus_linux_lspci_name_match`
(a Linux `/sys` path test), untouched by this change. A standalone check (in the scratchpad, not the repo)
seeded an in-memory DB and asserted: both rows present with the right values; and detection classifies
RTX→`dgpu-vram8|ram32`, Core 7 (Arc iGPU)→`igpu-mem32`, AND an Iris Xe 32 GB→`igpu-mem32` too — the SAME
class as the Arc, proving the generic no-iris-vs-arc design. Engine pick proven: Core 7 →
`['vulkan','cpu']`, RTX → `['cuda12','vulkan','cpu']` — the correct version each.

What would reverse it / OPEN. If a machine's own measurement shows the class default is wrong for it, its
per-machine ModelTune overrides (resolves above class_tunes) — the class is a starting point, not a
lock. The Iris Xe 16 GB box still has no class row because the 26B MoE does not fit 16 GB (the fit rule
skips it) — a smaller model for `igpu-mem16` is a future row once benched. Not verified end-to-end on a
real box: the actual Vulkan-engine + model DOWNLOAD (needs the machine + network) — only the selection
logic is proven here.

## 18. THE DFLASH DRAFT TEST — setup for both boxes (2026-07-24, the user's go)

What the user asked. "Further fine-tune and test our 2 top models — set up the tweaks and the DFlash
for our two systems." Context: b10094 taught mainline llama.cpp to recognize `mtp-/dflash-/eagle3-`
draft sidecars (priority mtp > dflash > eagle3; an explicit `--spec-type` overrides), and community-
trained DFlash drafters EXIST for both our models (live-checked 2026-07-24):
`Alittlehammmer/gemma-4-26B-A4B-it-DFlash-GGUF-llama.cpp` (Q4_K_M 266 MB · Q5_K 315 · Q6_K 367 ·
Q8_0 471 · BF16 874) and `lym00/Qwen3.6-35B-A3B-DFlash-GGUF-Test` (q8_0 421 MB · bf16/f16 783 MB —
"Test" in the name, treat accordingly). DFlash drafts a whole token block in one forward pass (block
diffusion) — a small drafter targeting exactly our weak spot (Gemma MTP acceptance ~67%), WITHOUT the
2.4 GB VRAM cost of the earlier E2B-as-draft idea (demoted in the Fable re-evaluation: on the laptop
E2B decodes 18.7 vs the 26B's 10.2 — a ~1.7x draft/target ratio too poor for speculation).

Why the runner change is TINY (verified at file:line, not assumed). The launch path is already
generic: `process.py:186-189` emits `--spec-type <value>` verbatim and picks `--spec-draft-n-max`
for any non-ngram type; `model_draft` -> `--model-draft` (`:129`); the Overrides builder setattr's ANY
switch row whose name matches an Overrides field (`lifecycle.py:247` + `:297-304`), so
spec_type/spec_n_max/model_draft rows flow end-to-end with no new plumbing. `_wants_draft`
(`lifecycle.py:333-345`) only auto-fills the MTP sidecar when spec_type=draft-mtp AND no explicit
model_draft — an explicit DFlash path bypasses it cleanly. And the 2026-07-19 draft-fit fix is
generic — `_draft_fit_inputs` is "keyed on ov.model_draft" (`lifecycle.py:1480-1488`), so a hand-set
drafter IS charged to the VRAM budget (no silent over-booking). What was actually missing: the
spec_type help still said "MTP GGUF only; Values: none, draft-mtp, ngram-mod", and model_draft was a
hidden power-user escape you had to know the name of.

What changed (runner `llm_runner/llm/seed.py`, DEFAULT_KNOBS): spec_type's help now lists
draft-dflash + draft-eagle3 (+ the engine >= b10094 note); spec_n_max's help records the measured
mtp best (2) and the DFlash author's guidance (6); and `model_draft` is promoted to a first-class
ADVANCED-tier knob with help (same shape as its spec_type sibling), so testing an alternate drafter
is a visible switch row, not a guessed name. No schema change, no new mechanism.

How it was verified. Full runner suite: 689 passed / 9 skipped / 1 failed = the pre-existing Windows
known-bad `test_pci_gpus_linux_lspci_name_match` (untouched). Direct assertion: the model_draft knob
row seeds with the right shape, spec_type's help mentions draft-dflash, and the flag name aligns with
the Overrides dataclass field (ASSERT: PASS). NOT verified here (needs the boxes): that the CURRENT
llama.cpp release actually accepts `--spec-type draft-dflash` (b10094's commit text names the type in
mainline, but the desktop app engine is b10079 — the FIRST instruction below is the engine update,
and an "unknown spec type" error means the build is still too old); and whether the community
drafters' acceptance is any good — that is the measurement itself.

THE TEST PROTOCOL (what the user runs, per box — the A/B is 3-way per model:
baseline draft-mtp / draft-dflash / spec_type=none, each via the Lab's Load & measure):
- DESKTOP (RTX 2070S, CUDA): 1) update the app engine to the latest release (>= b10100s; b10079 is
  too old for dflash). 2) download `gemma-4-26B-A4B-it-DFlash-Q4_K_M.gguf` (266 MB — the small quant;
  VRAM is tight beside ncmoe 21) into the data root's models folder. 3) Gemma 26B -> Tune: add rows
  spec_type=draft-dflash · spec_n_max=6 · model_draft=<full path> (a machine tune outranks the mtp
  bundle: ModelTune > ClassTune > bundles). 4) Load & measure; note tok/s (+ acceptance in the router
  log). Baseline to beat: 28.6 (MTP, b10079). 5) optional Qwen arm: same rows with
  `Qwen3.6-35B-A3B-DFlash-q8_0.gguf` (421 MB); Qwen baseline 23.4.
- LAPTOP (Core Ultra 7, Vulkan, 32 GB): same steps with `...DFlash-Q8_0.gguf` (471 MB — the pool is
  ample); ALSO measure draft-mtp once (never measured on this box — raw is 10.2-11.5). Qwen is not
  tested here (22.8 GB file does not fit the pool sensibly).
What would reverse it. If dflash loses or fails to load on both boxes, the rows revert to draft-mtp
(one switch row) and the knob simply remains documented. If it WINS, the productization follow-up is
seeding the winning spec_type/spec_n_max (and a drafter-acquisition story akin to mtp_draft_*) — a
separate designed change, not this one. OPEN: the user's measurements; eagle3 (a Gemma-4 EAGLE
drafter is reported to exist — same test shape if/when a GGUF is located).

RESULTS (2026-07-24, the user's desktop runs; reconstructed from the router logs at
`src-tauri/target/debug/data/ai-cache/llamacpp/logs/router-20260724-*.log` — the SERVER eval tok/s,
which is the same metric as the bench's 28.6; the UI's number is wall-based and reads lower).
VERDICT: DFlash is DEAD on this box; draft-mtp n2 stays the config; NOTHING regressed.

| run | config | draft loaded | eval tok/s | acceptance |
|---|---|---|---|---|
| 102814 | mtp n2 | yes | 26.63 | 53.7% |
| 103236 | dflash n6 | yes | 15.95 | (prefill 1.79 t/s!) |
| 103356 | mtp n6 | yes | 26.36 | 37.3% |
| 103451 | "dflash n6" | NO — ran as none | 27.48 | — |
| 103607 | dflash n6 | yes | 17.32 | 19.5% |
| 103724 | mtp n2 | yes | 28.33 | 58.6% |
| 103816/29 | spec_type "nobe" (typo) | — | LOAD FAILED | — |
| 103838/103919 | none | — | 26.80 / 24.90 | — |
| 104111 | mtp n6 | yes | 23.70 | 33.2% |
| 104349 | dflash n2 | yes | 22.20 | — |
| 105100 | mtp n2 | yes | 30.42 | — |

The findings, in order of importance. (1) MTP n2 remains the WINNER (26.6-30.4 eval, acceptance
54-59%) with a real ~2-4 tok/s edge over none (24.9-26.8) — the earlier "MTP ≈ none" scare came from
comparing the UI's wall-based number to the bench's server-eval 28.6; server-side, 28.3-30.4 ≈ the
b10079 record, so the ENGINE UPDATE REGRESSED NOTHING. (2) DFlash with the drafter actually loaded:
acceptance 19.5% (n6), eval 15.9-22.2, and one run's PREFILL collapsed to 1.79 t/s (13.4 s for 24
tokens) — the community drafter does not fit our QAT model; the laptop test is CANCELLED (the
drafter, not the hardware, is the problem). (3) Two of the user's six pasted numbers were phantoms:
run 103451 launched spec-type=draft-dflash with NO --model-draft (the switch row was briefly
absent) and llama-server SILENTLY ran unspeculated — a no-op that looked like a dflash datapoint;
runs 103816/103829 carried a typo ("nobe" for "none") and the server REFUSED the load ("unknown
speculative type") — the error visible only in the router log. (4) The recurring
"[spec] failed to measure draft model memory" warning on every draft load is COSMETIC — speculation
demonstrably engages (the acceptance lines above). Follow-ups OFFERED, not built: seed SwitchChoice
enum rows for spec_type (db.py:551 mechanism) so the dropdown prevents the typo class; the
ncmoe-aware fit term (the §-known arbiter over-booking, its 2026-07-11 six-item plan still awaiting
the user's go). ACTION for the user: delete the three test rows from the Gemma machine tune —
the seeded draft-mtp/n2 config stands. (Superseded same day: the user never clicked
Apply — the test rows were modal-state only, nothing to delete. That also explains the
phantom runs: unsaved modal state mid-iteration.)

## 20. THE HONEST FIT — ncmoe-aware weights + iSWA-aware KV + the spec_type dropdown (2026-07-24, the user's go)

CORRECTION FIRST. I twice told the user the 2026-07-11 six-item fix plan was "awaiting go" — the
memory INDEX line said so, but the memory body records it SHIPPED the same night (rounds 1-6, pushed
runner 29a193e/c0016c1/f7e87f2). What genuinely remained was exactly one root: item 2's fix was the
measured TRUE-UP after load; the PRE-load estimate still over-booked. Today's go built that, plus the
spec_type dropdown from the DFlash test's "nobe" incident.

THE TWO ESTIMATE DEFECTS, both fixed from GGUF-header facts (no constants invented):
(1) ncmoe-blind weights: `compute_fit`'s forward estimate booked the FULL file per GPU layer.
New: `GgufMeta.expert_byte_share()` (runner gguf.py) computes the routed-expert byte share
structurally (experts 3·n_embd·exp_ff·E vs attention n_embd²·(2+2·kv_ratio) + dense + shared FFN;
missing dims → 0 → old behavior; MHA fallback deliberately UNDERSTATES the share = conservative), and
`fit.moe_gpu_size_share()` scales the size term: of g GPU layers, min(ncmoe, g) keep only non-expert
bytes (the overlap semantics the box MEASURED — ngl 30/ncmoe 21 ≈ 6.5 GB real).
(2) iSWA-blind KV: the regression projects full-ctx KV per layer, but Gemma-4 is interleaved
sliding-window — the REAL header (dumped live): head_count_kv is a PER-LAYER ARRAY [8,8,8,8,8,2,...],
sliding_window=1024, a 30-bool pattern (25 windowed / 5 global), key/value_length 512 (256 _swa). Real
KV at 32k ctx ≈ 440 MB vs ~5,450 projected. New: gguf.py materialises exactly those two per-layer
arrays (everything else still skips — the tokenizer-array guard stands), `GgufMeta.kv_mb_at_ctx()`
sums per-layer KV with the window clamp (None unless the FULL iSWA picture is present — uniform
full-attention models stay on the fitted regression ON PURPOSE, its KV factor is part of the
calibration), and `fit.estimate_vram_mb(kv_mb=...)` swaps the fitted KV term for the real one.
Both apply ONLY to the forward reservation estimate; the inverse split (max_gpu_layers) stays
undiscounted (a placement behavior change needing its own measurement round). Guarded getattr-style
for duck-typed metas (the first full-suite run caught 73 failures from SimpleNamespace metas — fixed
to the same pattern as the existing context_length getattr).

GOLD VERIFICATION (the real Gemma-4 26B GGUF on this box, the exact incident config ngl 30/ncmoe 21/
ctx 32768/q8_0): expert_byte_share = 0.9389; size-share on GPU 0.343; precise KV 440 MB.
OLD estimate 19,758 MB (the arbiter warned "needs 20638" — the delta is the MTP draft's marginal);
NEW estimate **6,456 MB** vs measured reality 6.5-7.9 GB. The recurring "over budget ... proceeding"
warning stops firing for this config because the estimate now fits the 8 GB card, and co-load
admissions (the ask-the-book embed flow) now run on real numbers pre-load, not post-true-up.

THE DROPDOWN (QC-18 amended, recorded in code + tests): spec_type seeds KnobOption rows
(none/draft-mtp/draft-dflash/draft-eagle3/ngram-mod); the kit's `plane1SwitchCatalog` passes options
through and KnobGrid's add-row mode renders a UiSelect for option-carrying knobs ONLY — every other
knob stays a free text box, so a new llama.cpp param still needs no code. The pinning test
(`test_plane1_carries_no_engine_default_claims`) now asserts spec_type's exact option list and
no-options for everything else.

Gates: runner pytest **694 passed** / 9 skipped / 1 failed = the pre-existing Windows known-bad
lspci test; ruff clean; JW vitest + build:vite clean (the kit UI change). New tests:
moe_gpu_size_share boundaries · expert_byte_share math (incl. the conservative MHA fallback) · the
iSWA array round-trip + kv_mb_at_ctx hand-sum + guards · the kv_mb override · the compute_fit
discount integration (discounted < 0.55× undiscounted; ncmoe-0 byte-identical) · the spec_type
options pin. What would reverse it: a model whose n-cpu-moe semantics DON'T overlap-from-the-front
would need the overlap term revisited (the measured evidence pinned it); extending the discount to
the inverse split is the recorded follow-up if untuned-MoE placement should improve too. The user
must RESTART the app server to load the new estimate + seed the dropdown.

## 19. THE DEV SIDECAR PREFERS THE REPO VENV (2026-07-24, the user's go)

What broke. Restarting the app for the DFlash setup, the user ran `npm run dev` from a plain
terminal and the Python sidecar died: the dev spawn arm (`src-tauri/src/lib.rs` spawn_sidecar)
tried PATH `justwrite-server` (absent — no venv on PATH), then fell back to PATH `python -m
justwrite_server.cli` — which resolved a bare `F:\Python312` that lacks the package
(ModuleNotFoundError; the app booted into the connection-error screen). It had always worked
before only because VS Code's terminal auto-activates `.venv`, putting the venv's Scripts dir on
PATH — an invisible dependency on WHICH shell launched the dev app.

The fix (the user's go). The dev arm now resolves the repo's OWN venv entry point FIRST, from the
compile-time crate path (repo root = `CARGO_MANIFEST_DIR/..` → `.venv/Scripts/justwrite-server.exe`
on Windows, `.venv/bin/justwrite-server` elsewhere), guarded by `.exists()`; the old PATH →
`python -m` chain stays as the fallback and the release arm (bundled exe beside the binary) is
untouched. Verified: `.venv` has both `justwrite-server.exe` and an importable `llm_runner`
(checked live before the fix); `cargo check` clean after it. What would reverse it: moving the dev
server out of `.venv` (the compile-time path only affects debug builds, recomputed per build).
OPEN: JustVoice's sidecar is documented as kept in lock-step (`lib.rs` sidecar section) — the same
preference belongs there; not applied (separate repo, needs its own go).

## 21. THE E-SERIES ROWS + THE integrated-16 CLASS (2026-07-25, the user's go — "your rec, think twice on it, go")

What shipped (runner, one commit). The two E-series catalog rows — `gemma-4-e2b-qat` and
`gemma-4-e4b-qat`, unsloth QAT UD-Q4_K_XL, the repos this doc named at line 201 — and the
`igpu-mem16` hardware-class row (integrated, ram 16, vram 0; the i7-1355U / Iris Xe laptop). The
header-derived facts were GENERATED, not typed: `scripts/refresh-seed-facts.py --only … --write`
ran the same `inspect_model_from_link` path Read-from-link uses and wrote trained_ctx 131072,
size_label 4.6B / 7.5B, size_bytes 2,620,370,976 / 4,215,695,776, est_vram_mb 3711 / 5411 for
E2B / E4B respectively; samplers curated in from its report (the family's top_k 64 / top_p 0.95 /
temperature 1). Positions: both share position 0 with the 12B rung (catalog order is
(position, id)), deliberately NOT renumbering the ladder — the JW extras sit at position 20 and
their relative order was chosen against the current numbering.

The one deliberate divergence from Read-from-link parity, and why. The tier-C probe found only
THIRD-PARTY assistant heads for both rows — E2B: `Radamanthys11/Gemma-4-E2B-it-assistant-GGUF`
(the same publisher and `-it-assistant-Q8_0` naming as StyleTune's seeded drafter, which made
that model UNLOADABLE for nineteen days and was fixed only this same morning); E4B:
`AtomicChat/gemma-4-E4B-it-assistant-GGUF`. Neither head has ever been loaded against these
weights. So both rows RECORD the drafter fields but ship `mtp: False` — capability documented,
enablement off until one verified load per head on a real box. The row comment is the stop sign:
a future `refresh-seed-facts --write` will mechanically propose `mtp: True` again and must not
be accepted without that load.

What is deliberately NOT seeded. The (E4B, igpu-mem16) class TUNE — this doc's own §17 rule
stands ("a smaller model for igpu-mem16 is a future row once benched"; the seed principle: no
un-measured tune) — and the dGPU 8/12/16/24+ band classes: no written blessed shape exists (both
repos' plan docs searched 2026-07-25; the June "8/12/16/24" hits are catalog-tier language, not
class-row seeds), detection computes a box's class key without a library row
(`format_class_key`), and an empty band row with no tune does nothing. Recommendation given to
the user: close the clause rather than seed scaffolding; their word decides.

Verified by running: full runner suite 704 passed / 1 documented Windows lspci known-bad / 9
skipped — the same baseline as before the rows. What would reverse it: a verified drafter load
flips a row's mtp True; the laptop speed-kit run creates the igpu-mem16 tune; a user blessing
seeds the dGPU bands.

### §21 addendum (2026-07-25, same day): the (E4B, igpu-mem16) tune SEEDED — the laptop's numbers existed all along

The user pointed at `E:\Dev\Web\test`: the 16 GB laptop's complete speed-kit output set from
2026-07-24 (detect-facts names the i7-1355U / Iris Xe / 15.6 GB box; engine b10099) — the run
this doc's §17 was waiting on had already happened, its files just never left that machine. So
"a future row once benched" closed the same day the class row seeded: runner `f6428e3` adds
`(gemma-4-e4b-qat, igpu-mem16)` to `DEFAULT_CLASS_TUNES`, grounded line-by-line in those files
(now preserved at `bench/results/laptop-iris-xe-16gb/speed-kit-2026-07-24/`): ngl 99 from E4B's
own quick screen (9.8 tok/s decode, resident; quality probe non-empty, while the 12B probe is
EMPTY and 12B fell below the 7 tok/s cutoff — the user's "16 GB Iris Xe = E4B" pick confirmed as
the top viable rung); flash_attn off + ubatch 512 from the box's own full matrix (dense
Ternary-8B, same Vulkan backend — a backend-property transfer, stated in the seed comment: at
pp8192 fa-off wins 53.5 vs 40.2 tok/s and ub 2048 collapses depth to 22.7, the same signature
as the Arc box); ctx 32768 / batch 512 / reasoning_budget 1024 mirror the blessed rows. With
the §9 ruled shape ("the ref IS the recommendation") a 16 GB integrated box now resolves to
E4B + this config with zero setup. Suite 704 passed / 1 known-bad / 9 skipped. Still open from
§21: the drafter mtp flip (leave OFF; revisit only if a measured need appears — E4B decodes at
9.8 tok/s where a draft could plausibly help, but the only heads are unverified third-party;
any future laptop session can add one `-md` load leg) and the dGPU band map (the widened
survey — Part 1 from carried models delivered in-session 2026-07-25; Part 2, the per-band web
survey, next on its own go).

## 22. THE BAND RULING — the discrete class key IS the band (2026-07-25, the user's go)

What changed and why. The user's two rulings settled the dGPU-band design: "I never thought
exact matches should be used" (a 5090's vram32 missing a vram24 seed is absurd) and "don't
over-engineer" (which killed my first answer — a two-dimensional nearest-lower-rung fallback
matcher with tie-breaks and borrowed-origin UI). The simple shape the code itself endorsed:
`class_key`'s own charter says COARSE, and per-machine fidelity already lives in a different
layer (`model_tunes` by exact `machine_key`) — so the fix is to make the key BE the band and
keep plain exact-match lookup forever. `runner/hardware.py`: VRAM now down-snaps the
`_VRAM_BANDS` ladder (4, 6, 8, 12, 16, 24) AFTER the nearest-GB jitter round — a 3080's 10 GB
and a 2080 Ti's 11 GB are the 8 band, 20 GB is the 16 band, and everything ≥ 24 (4090's 24,
5090's 32) is ONE 24+ band; discrete system RAM down-snaps the coarse `_DGPU_RAM_RUNGS`
(16, 32, 64, 128) after `snap_ram_gb`'s fine jitter snap (24 → 16, 48 → 32, 96 → 64). DOWN on
both dimensions because it can never overstate a box — a config keyed at the band floor fits
every box above it, never the reverse (the flagship's ~24 GB RAM appetite on a 16 GB-RAM box
is the miss the direction prevents). Sub-band values pass through unchanged (a 6 GB card
honestly matches no band seed). Integrated/unified keys untouched — the pool is the identity
(`igpu-mem16`/`igpu-mem32` unchanged, so both laptops' seeded tunes keep matching, as does the
2070S box: vram8/ram32 are already band values).

The two consistency seams closed with it. `install.py` now wires the panel's create-class
derive through the new `banded_class_key` (a hand-typed vram 10 lands in the 8 band instead of
minting a class detection can never match), and the PUT handler re-reads the stored row's
numbers FROM the banded key via `parse_key_fn` (`class_tunes_api.py`) so a row's own numbers
can never disagree with its key. The stale "VRAM is NOT snapped" comment above `_RAM_LADDER`
was corrected in place — it described the pre-band design.

How verified: full runner suite 707 passed (three new tests: the band table incl. the 5090 →
24+ case and jitter-first ordering; the banded builder incl. one-pool passthrough; the PUT
banding with key-derived row numbers) / 1 documented Windows lspci known-bad / 9 skipped. No
other test pinned a fine-grained discrete key.

What would reverse it: a future card class that deserves its own band adds ONE ladder value
(e.g. 32 when a 32 GB-band config exists that a 24-band config wastes); if per-band duplicated
rows for dense picks ever grate, a five-line lower-RAM-rung convenience could return — as a
convenience, not the 2-D engine.

OPEN: Part 2 — the per-band survey — is UNBLOCKED (no RAM-rung ruling needed; the ruling
became the design): pick each band's model, seed each band's class row + config at its honest
RAM rung, on its go.

## 23. THE BAND LABEL — saying out loud that a class is a RANGE (2026-07-26, the user's go)

What changed and why. The band ruling made the key coarse on purpose, but every label kept
printing the band's FLOOR as though it were the user's own hardware, so the design's honesty
stopped at the wire. The user found it from the other end — asking why the class library
offers 24 GB VRAM and no 32 — and the answer ("everything at or above 24 is one band") was
nowhere on screen. The worse case was never the 5090: a 10 GB RTX 3080 keys to `vram8` and
read "8 GB VRAM", a number BELOW the card the user owns, which reads as the app getting the
detection wrong rather than as a class covering a range. `ui/src/classTunes.js` gains
`classKeyRangeLabel` beside the untouched short `classKeyLabel`: VRAM renders as the run it
covers ("8–11 GB VRAM"), the open top band as "24 GB VRAM and above", and a below-floor key
stays exact because `hardware.py:183-184` passes it through unbanded and a range there would
invent coverage. The classes panel and its editor use the range form; the catalog badge
(`LuModelCatalog.vue:413`) and the Tune modal's running sentences (`TuneMeasureModal.vue:584,
588`) keep the short form — the user's call, since both are tight spots where the long form
would swamp the sentence it sits in.

The RAM half is the part that nearly shipped wrong, and it is worth recording as the finding
rather than the fix. My first design ranged BOTH dimensions off the two rung tuples, which
would have printed "32–63 GB RAM" — a NEW lie replacing the old one, because system RAM takes
TWO snaps, not one: `snap_ram_gb` (`hardware.py:151-160`) picks the nearest standard capacity
FIRST, and only then does the coarse rung down-snap. The rung therefore holds a SET of nominal
capacities rather than an interval — `ram16` is 16 or 24 GB, `ram32` is 32 or 48, `ram64` is 64
or 96 — and a 60 GB box lands in `ram64`, outside any "32–63" claim. The user chose naming the
capacities ("32 or 48 GB RAM") over printing the raw 28–56 GB interval, on the grounds that
people know their machine as "48 GB". This was caught by the rules-checker panel, not by me:
I had verified the band table that supported the proposal and not the snap chain that could
break it, which is the failure mode T2 exists to prevent and the user named directly.

Two consistency seams closed with it. The drift guard for the three copied ladders
(`VRAM_BANDS`, `DGPU_RAM_RUNGS`, and `RAM_LADDER`, which the RAM wording makes load-bearing)
lives in `just-llm-runner/tests/test_class_label_ladders.py` — Python, in the repo where
`hardware.py` changes, because a guard in JustWrite's vitest would never run for the person
editing the ladders and running pytest here. It parses the JS and asserts a non-empty parse
before comparing, so a rename or reformat cannot make it pass vacuously. And the class editor
now states the snap BEFORE the save ("Saved as 8–11 GB VRAM · 32 or 48 GB RAM"), computed the
way the server bands a hand-typed class (`banded_class_key`, `hardware.py:193-196` — note that
detection's `snap_ram_gb` does NOT apply to typed numbers), so discovering that a typed 10
became the 8-band class no longer happens after the fact.

The English is written directly in the kit rather than through a message table. The kit is 0%
translated and its mechanism is already decided as a vue-i18n peer dependency in a later batch
(`docs/plans/2026-07-26-i18n-phase1-coverage-plan.md:6`); a hand-rolled lookup is the shape
that plan's research explicitly rejected, and "where English lives" is still the user's open
decision, so a table here would have created a precedent the kit batch must dissolve. What the
strings DO honor is Ruling 6 (`:151-158`): each phrase is a complete sentence per form, so
"and above" is its own message and never a suffix glued onto another — the join of the two
halves is a documented list separator, recorded in the code comment as a named choice.

The post-task checker then found two things worth recording. The first was a REACHABLE break in
the very affordance this change adds: the number box hands back a raw string, so a typed "3.5"
reached the key template untruncated, no regex matches a fractional key, and the preview printed
`dgpu-vram3.5|ram16` — internal key syntax leaked into copy that `classTunes.js:67` explicitly
forbids — after which the save would 422 on the server's int field. Both the preview and the save
now truncate through one `wholeGb` helper, mirroring Python's own `int()` at `hardware.py:194`, so
the two can never disagree; a vitest case pins that a fractional key is unrenderable, which is what
makes the truncation load-bearing rather than decorative. The second was T9: `git checkout --` is a
destructive op that was run without confirming, and the standing practice is now that a scratch
revert on a file holding uncommitted work takes a BACKUP COPY, never git. The residue was checked
rather than assumed — `git diff --stat -- ui/src/classTunes.js` reports 61 insertions and ZERO
deletions, so the file held no other uncommitted edit that the revert could have taken.

How verified: the new `test_class_label_ladders.py` PROVEN TO BITE — adding a bogus 32 to the
JS `VRAM_BANDS` failed it, then the file was restored. (Restoring it with `git checkout --`
also discarded the uncommitted feature edit in that file, which had to be re-applied.) JustWrite
vitest **450 passed / 49 files** including the 11 new label cases (`classBandLabels.test.js` — the
3080, the 5090 top rung, both RAM rung shapes, a below-floor key, the fractional key, both one-pool
types, name-wins, and the short form pinned UNCHANGED as the badge contract); `build:vite` green;
Biome exit 0 on all three changed kit files; runner pytest **709 passed / 1 documented Windows
lspci known-bad / 9 skipped**.

What would reverse it: revert the `classTunes.js` addition and the `LuClassTunes.vue` call-site
swap together — the panel imports `classKeyRangeLabel` and no longer imports `classKeyLabel`,
so they move in lock-step. The short form is untouched, so the badge and the Tune modal are
unaffected either way.

OPEN: the range labels have not been LOOKED at in the running app (the user's eyes remain the
look gate); and the §22 escape hatch is now cheaper to exercise — adding a 32 band is one value
in `hardware.py` plus the JS copy the guard will name.

## 24. "PC CLASS CONFIG" — the rename, the visible floors, and every model listed (2026-07-26, the user's go — "your rec have opus do the work")

What changed, and why it had to. The user hit the same chip three days running and named the
cause themselves on 2026-07-26: "we keep getting it wrong". Two faults sat on top of each
other. The catalog is a CHOOSER surface — it is where you decide what to run — and it was
speaking a TUNER's word, "Hardware/model class default", which describes the storage layer
rather than anything a chooser needs to know. And the word "default" was triple-booked on one
screen: Load as default, Hardware/model class default, and Global launch defaults are three
unrelated things sharing a noun. The user's direction across that conversation was to rename
the whole thing everywhere ("PC class config"), to make each catalog row's hardware story
visible without hovering ("when i look at list i have no idea what hardware it might run on"),
to show EVERY model under a class with the untested ones honestly bare ("just for those not
tested they have no switches"), to present correct information and simply inform ("long as we
present user with correct info … we just need to inform user") — and, mid-turn, "dont over
engineer", which killed the provenance-schema branch outright. This pass therefore changed
COPY and DISPLAY only: no schema, no server, no wire, no recommendation-logic change. It
supersedes the user's own QC-19 anchor wording from 2026-07-08 (their 2026-07-26 direction
overrides their 2026-07-08 anchor) and it is the resolution of the long-open question of
whether that chip wording stays.

The rename, and the one-source catch that made it more than a find-and-replace. The
user-facing noun is now "PC class"; the thing a class holds per model is a "PC class config".
INTERNALS ARE UNTOUCHED — `class_key`, the `/v1/ai/hardware-class` and `/v1/ai/class-tunes`
routes, `saveHardwareClass`, the table names, every Python identifier and test name still
speak the hardware-class vocabulary, and the kit's dev comments about the DATA concept were
deliberately left alone for that reason. What the rename exposed is that the class layer's
words existed as TWO independent literals that had ALREADY drifted apart:
`ui/src/tuneState.js:26` said "Hardware/model class default" while
`ui/src/composables/useResolvedRoute.js:51` said "hardware class default" — two spellings of
one layer, in a file whose own comment (`:43-47`) demands one-source for exactly this
vocabulary. Both now read from a single export, `CLASS_LAYER_LABEL = "PC class config"` in
`tuneState.js:25`, which `useResolvedRoute.js` imports and which `TuneMeasureModal.vue`'s
`TUNE_GROUPS` heading also took (that was a THIRD copy of the same words, found while
editing). The QC-1 law — tags use the real editor name, never an invented shorthand — is
unchanged and still satisfied, because the library button, both modal titles and the badge all
renamed in the same pass.

The catalog rows now state their hardware. `LuModelCatalog.vue`'s `rowMeta` appends
` · needs ~X GB VRAM + Y GB RAM` to the size line of every non-embedding row that carries both
floors, using the existing `gb()` formatter on `m.minVramMb`/`m.minRamMb` — fields that
already rode the fit-shaped rows, which is why this needed no wire change at all. The numbers
are RAW, never a class key: a class band rounds DOWN, which is safe when describing a PC but
would UNDERSTATE a requirement. Embedding rows are excluded because their line has a different
story to tell (policy places them on the CPU). The cell's `title="Download size"` was falsified
by the addition and became "Download size, and the minimum hardware it runs on". In the same
spirit of not overclaiming, the Fit hover's needs-VRAM branch now opens with "Estimated —" and,
on an untuned non-embedding row, closes with " · not yet tested on your PC class". That prefix
and suffix apply to that ONE branch: the cpu, unknown, no-floor and embed-placement returns
above it are already whole sentences, and appending a fragment to them would splice against
Ruling 6. The stale Recommended tooltip — still describing the curated hardware-class map
DELETED on 2026-07-22 — was rewritten to what the rule actually is now.

Every model, listed under every class. `LuClassTunes.vue` previously rendered only the models
that HAD a config, which made a class look like it held a short fixed roster. It now shows the
rest behind one collapsed line — "N more models — not tested on this class" — that opens to a
row per model reading "no switches" plus an Add switches button opening the EXISTING config
editor already pointed at (model, class); `startAddConfig` gained an optional `modelId`
parameter rather than growing a second flow, and the picker stays unlocked because the user
chose that row, not the app. This creates nothing: a config IS its per-switch rows keyed
(model_id, class_key, flag_name) — `llm_runner/llm/db.py:435-441`, there is no config-level
entity — so "not tested = no switches" was ALREADY the stored truth and every model × class was
already an addressable slot. The panel was merely hiding the empty ones. No floors appear in
the panel (that would have required a wire change, and "dont over engineer" ruled). Embedding
models are excluded, and the predicate is the shared singleton's STRICT flag,
`useCatalogMeta().embeddingById` — never an `/embed/i` name guess, which `bge-m3` defeats.

The one place execution adapted the plan's mechanics. The plan told the executor to read
`embeddingById` from the `useCatalogMeta` singleton while `LuClassTunes` kept its OWN
`/v1/ai/model-catalog` fetch for the model list. An independent rules-checker caught what that
would mean: two live copies of one wire response driving one derived list, with the flag map
populated only because `ProviderForm.vue:433` happens to co-mount `LuModelCatalog` (which
refreshes it) under the same `v-if` as the button — so in the per-model mount the map could be
empty and EVERY embedding model would silently read as "not an embedding", with no error
anywhere. The fix keeps the closed decision and removes the split: `LuClassTunes` now takes BOTH
the rows and the flag from the singleton (`const models = catalogRows`), calling its `refresh()`
only when the shared rows are empty, so the fetch count is unchanged and the component no longer
depends on a sibling having mounted first. The not-tested list is also gated to the GLOBAL mount:
in the per-model mount `tunes` is filtered to one model, so every OTHER model would falsely read
as untested.

How verified. Biome exit 0 on all twelve changed kit files. JustWrite vitest **458 passed / 50
files, zero failures** — one pinned string was updated as part of the change and that update is
the POINT, not a symptom: `resolvedRoute.test.js:139` pinned `resolvedSourceLabel("class")` to
"hardware class default", the very literal whose drift from the badge motivated the one-source
move, and it now pins "PC class config" with a comment recording why. `npm run build:vite` green.
Runner pytest **667 passed / 9 skipped / 1 failed**, that one failure being the documented Windows
`test_pci_gpus_linux_lspci_name_match` known-bad; `tests/test_adapter_extra.py` could not be
COLLECTED at all on this box (`ModuleNotFoundError: No module named 'google'`, a missing optional
SDK in the global interpreter, on a file this pass never touched) and was excluded from the run —
a pre-existing environment gap, recorded here rather than waved through. The widened sweep pattern
`hardware[ /-]?(model )?class|class (default|config|tune)s?` was re-run over `ui/src` after the
edits: every remaining hit is an internal identifier, an API route, a dated historical user quote,
or a dev comment about the DATA concept — no user-visible string survives in the old vocabulary.

The per-site rename table (file:line → old → new → kind). `tuneState.js:26` "Hardware/model class
default" → `CLASS_LAYER_LABEL` = "PC class config" (visible); `tuneState.js:7,21-22` QC-1 comment →
records the rename (comment). `useResolvedRoute.js:51` "hardware class default" → imported
`CLASS_LAYER_LABEL` (visible), `:43-47` one-source comment extended (comment).
`LuModelCatalog.vue:403` class badge title → "No applied config on this PC — launches start from
the PC class config for your class (<range>)" (visible); `:274-275` fit hover → "Estimated — …"
plus the not-tested suffix (visible); `:294-298` `rowMeta` → floors appended (visible); `:1039`
Recommended tooltip → the real rule (visible); `:1042`, `:1046`, `:406-411` comments → new
vocabulary (comment); `:1047` cell title → "Download size, and the minimum hardware it runs on"
(visible). `ProviderForm.vue:438` button → "PC class configs…", `:442` modal title → "PC class
configs — the library" (visible); `:440` caption kept — already correct; `:197` historical user
quote kept (historical). `TuneMeasureModal.vue:90` group label → `CLASS_LAYER_LABEL` (visible);
`:344` error → "Couldn't save the PC class config."; `:543` link → "PC class configs ↗" and its
`:542` title harmonized; `:584` "Saved as the default for PCs like this one" → "Saved as the PC
class config…"; `:590` button → "Save for PC class"; `:601` popup title → "PC class configs — …"
(all visible); `:13`, `:17`, `:311`, `:504` comments updated (comment); `:116` historical user
quote kept (historical). `LuGlobalSwitches.vue:94` and `:126` → "PC class config(s)" (visible);
`:10` comment kept (data concept). `LuMeasureHistory.vue:73`, `:127` → "PC class configs"
(visible). `LuClassTunes.vue` — `:302` "Hardware classes" → "PC classes", `:303` caption, `:308`
definition sentence, `:402-403` empty state (incl. the "Save for PC class" quote, which pins the
button's new words), `:440` "＋ Add PC class", `:193`/`:205` class errors, `:198-199` delete-class
confirm, `:122` load error, `:234` toast, `:244-245` delete-config confirm (all visible); `:3-12`
header comment records the copy/internal split (comment). `ConfigColumn.vue:615` budget-line title
→ "…→ PC class config →…" (visible); `:23`, `:227` comments (comment). `KnobGrid.vue:20`, `:309`
comments (comment). `LuFeatureChip.vue:221` comment (comment). `classTunes.js:4`, `:35` quoted
button copy, `:63` label description (comment); `:2`, `:16`, `:27-29` API/route mentions kept
(internal). `QuickSetup.vue:62,176,417,504,509,765` and `modelPick.js:151` kept — dev comments
about the DATA concept, and `modelPick.js` is explicitly out of scope. JW `docs/models.md` — the
catalog-row paragraph (`:162-167`), `:124`, `:204-209`, `:211`, `:230`, `:239-241`, `:254-255`,
`:268-279`, `:291-292`, `:373` all converted, plus new prose for the floors line and the
not-tested listing.

The DOC sweep, both repos, enumerated (the post-task checker's T5 catch — the first cut of this
table reported only `ui/src` and `models.md`, leaving the runner side unstated). The widened
pattern was run over BOTH `docs/` roots. **just-llm-runner:** `docs/` holds exactly two things —
`llama-cpp-watch.md` (no hits) and `docs/plans/`, whose seven hits
(`2026-07-08-big-batch-queue.md`, `2026-07-16-reasoning-budget-house-layering.md`,
`2026-07-14-feature-override-and-reasoning-plan.md`, `2026-07-14-thinking-budget-design-discussion.md`,
`2026-07-06-providers-surface-redesign.md`, `2026-07-04-serving-vram-manager-implementation.md`,
plus this pass's own plan doc) are all dated historical records and stay untouched by charter. The
one LIVE runner doc carrying the old shorthand is `README.md:19`, outside `docs/` and therefore
missed by a `docs/`-rooted grep: it read "a model with a **class config for THIS box's class**
wins — the visible class-tunes library IS the recommendation" and is now converted to "**PC class
config**" / "the visible PC-class-config library" (visible-doc), while the identifiers around it
(`classTuneRefs`, `myClassKey`, `classKeyOverride`, the route names) stay internal.
**justwrite-app:** nine files hit; three are LIVE and all three were handled — `docs/models.md`
(converted, above), `docs/TASKS.md` (new tracker line + your-box look item), and this recovery doc
(§24). `docs/ARCHITECTURE.md`'s single hit is the false-positive analysed under OPEN below. The
remaining five (`2026-07-20-mtp-verify-think-ab-bench.md`, `2026-07-25-per-band-model-survey.md`,
`2026-07-25-session-handoff-and-verification-debt.md`, `2026-07-22-hardware-class-named-entity.md`,
`2026-07-08-recap-archive.md`) are historical plan docs, deliberately kept as written records.

One reconciliation on the test baseline: the plan predicted JW vitest at 450 passed / 49 files
(the §23 figure) and the run reported 458 / 50. The extra file is
`src/renderer/src/components/__tests__/EntityIndex.test.js`, added by the EntityIndex extraction
in commit `be258c8` (2026-07-26) — another session's committed work, not anything this pass added.
No test file was created here, and the only test line touched is the one pin named above.

What would reverse it. The rename is a copy change with one structural piece: `CLASS_LAYER_LABEL`
in `tuneState.js` is imported by `useResolvedRoute.js` and `TuneMeasureModal.vue`, so reverting
the words means reverting that export and its three consumers together, plus the JW test pin.
The catalog floors are self-contained in `rowMeta` + the cell title; the Fit-hover wording is
self-contained in `fitTitle`'s last return. The not-tested list is the only behavioral addition:
removing `untestedByClass`, `showUntested`, the template block and the optional `modelId`
parameter restores the previous panel exactly — but the `useCatalogMeta` row-source convergence
should NOT be reverted with it, since it removes a duplicate fetch that was a drift hazard on its
own merits.

## 25. THE LOOK PASS — "This PC" says the machine, and the tag casing (2026-07-26, the user's go — "fix it")

Context, and the one thing that was NOT built. This session opened with a model-major rework of
`LuClassTunes.vue` — every model listed once with its classes as chips, the class table demoted
below it — built on the user's "go build it lets see how it turns out". They looked at it twice and
rejected it ("this is even more confusing than before", then "just go back to what it was that was
at least better what you made is bad"). It was reverted whole, not patched: `git stash push` of the
single modified file, leaving the tree at `ccb15ac` byte-for-byte, with the rework preserved as
`stash@{0}` ("model-major LuClassTunes rework (user rejected 2026-07-26)") rather than discarded.
`git status --porcelain` returned empty and `build:vite` was re-run green to prove the restore was
whole rather than half-overwritten. Two small fixes were then made ON TOP of the restored file, on
the user's explicit word for each; nothing of the rework came back with them.

What changed, first fix: "This PC" states the machine, not the band. `LuClassTunes.vue:400` rendered
`classKeyRangeLabel(myClassKey)`, so the line above the class list read *"This PC · 8–11 GB VRAM · 32
or 48 GB RAM"*. The user's words, twice: *"This PC · 8–11 GB VRAM · 32 or 48 GB RAM wrong it should
list what this pc hardwar is not a range"* and then *"wrong this pci is what it is that is all"*. A
PC class is by definition a bucket a RANGE of machines falls into (§23 built that label
deliberately), so the range label is correct for a CLASS and nonsense for a MACHINE — printing the
bucket where the user expects their own specs is what made the line unreadable. The component now
fetches `GET /v1/llm-runner/hardware` (`llm_runner/runner/api.py:73-81`) into a new `hw` ref and
derives `myHardware`, printing `8 GB VRAM · 32 GB RAM` from the machine's own numbers. The GPU it
names is the LARGEST one — `Math.max` over `gpus[].vramMb` — matching the server's own rule at
`llm_runner/runner/hardware.py:45` (`max_vram_mb`) and the class-key builder at `:212`. That detail
is load-bearing and was a real bug in the rejected rework, which read `gpus[0]`: on a laptop that
enumerates the iGPU first, `gpus[0]` names the wrong card and then disagrees with the class shown
beside it on the same line. The fetch is wrapped in its own try/catch beside the existing
`engine-config` enrichment call, and the template falls back to the class label when detection
yields nothing, so the line can never render blank. The class name that used to trail the hardware
was dropped per the user's "that is all"; the matching class is still tagged in the list below, so
nothing is lost, only un-repeated.

What changed, second fix: tag casing, audited rather than patched. The user pointed at two tags —
*"this PC / built-in why the mixed case this is lazy and looks bad again stpp being lazy do it
profressional jo0b"*. `.ui-tag` carries no `text-transform` (`ui/src/common/styles.css:136`), so the
literal string is what renders and the string layer is the right place to fix it. Every `UiTag`
label on the AI providers/models surface was enumerated before editing: eleven were already sentence
case (`Embedding`, `Recommended for this PC`, `MoE`/`Dense`, `MTP`, `Embed` at
`LuModelCatalog.vue:458,462,1168-1170`; the five `Tuned by …`/`Not tuned …` family at
`tuneState.js:42-47`; `Applied on this PC ✓` at `TuneMeasureModal.vue:130`) and five were not. The
five were fixed: `LuClassTunes.vue:422` `set manually` → `Set manually`; `:497` `this PC` → `This
PC`; `:498` `built-in` → `Built-in`; `LuMeasureHistory.vue:111` `auto-tune` → `Auto-tune`;
`TuneMeasureModal.vue:534` `unrecognized` → `Unrecognized`. The sharpest exhibit for why this was a
defect and not a preference: `AiModelsArea.vue:472` already renders `Built-in` with a capital B on
the provider row, and `.lu-cap` has no transform either (`:695`) — so one word was rendering two
ways on one page. Fixing only the two tags in the screenshot would have left `auto-tune` and
`unrecognized` wrong one screen over, which is the lazy version the user named.

How verified. `npm run build:vite` green (1.67 s). JustWrite vitest **472 passed / 51 files**, zero
failures, unchanged from before the edits. A post-change grep for `<UiTag[^>]*>[a-z]` across the
whole kit returns ZERO — no lowercase-initial tag label survives anywhere, which is the mechanical
check that the audit was complete rather than merely thorough-sounding. Before editing, the five
strings were grepped across both repos' test files: nothing pins them, and
`resolvedRoute.test.js:147`'s `"built-in default"` is a prose fragment in a different sentence and
was deliberately not touched. Biome on `LuClassTunes.vue` reports 3 errors, all pre-existing and none
from this change — an import-sort complaint about the untouched import block and the `||=`
assignment-in-expression inside `configsByClass` at `:112`. NOT verified by rendering: the user's app
holds `:1420`, so both fixes are confirmed by build, tests and grep only, and their eyes remain the
gate.

What would reverse it. The "This PC" fix is three self-contained pieces — the `hw` ref plus the
`myHardware` computed, the one `try { hw.value = await request("/v1/llm-runner/hardware") }` block
inside `reload()`, and the one template expression at the This-PC line; removing all three restores
`classKeyRangeLabel(myClassKey)` exactly. The casing fix is five string literals in three files and
reverses by retyping them. Neither touches storage, the wire, or launch resolution: switch
resolution is still the exact match on `(model_id, class_key)` at `switch_resolve.py`, and nothing
here changes which class a machine resolves to.

### §25 addendum (2026-07-26, same session): Dense/MoE made visible, and the speed badge deliberately NOT built

What prompted it. The user read the `igpu-mem32` class in the library and asked, of three members
with no switches — Qwen3.6 27B (MTP), StyleTune V2, Uncensored EZ — *"so for igpu 32gb all these
models run well?"* Checking the rule produced a wrong answer first and then the right one, and the
wrong one is worth recording because it nearly became a code change: the first reading claimed the
dense 27B could not fit at all, by ADDING its two floors (20,000 MB + 24,000 MB = 44 GB against a
32 GB pool). That is double-counting. The two floors mostly describe the SAME weights placed
differently, so on a shared pool the honest test is `max(floors) ≤ pool`, which is exactly what
`ui/src/classTunes.js:126-128` already computes and what its own comment at `:121-122` says it means
("an integrated class is ONE memory pool, so both floors must fit inside it"). The 27B's floors are
20,000 / 24,000 (`llm_runner/llm/seed.py:268`) against weights of 17,909,097,600 bytes ≈ 17.9 GB
(`:264`), so 24 ≤ 32 and it genuinely loads. **The membership rule needed no change and got none.**

What the list WAS hiding is architecture, not fit. A dense 27B pushes every parameter through shared
memory on every token; the 26B-A4B MoE touches roughly 4B active parameters for the same nominal
size. Both "fit"; they are not the same experience, and nothing on the screen said which was which.
So the fix is to state the FACT — Dense or MoE — wherever a model is named, and to say nothing about
speed, because nobody has ever run a dense 27B on an integrated GPU and the seed principle reserves
MEASUREMENTS to the machine. A "slow on integrated GPU" badge was proposed, considered, and rejected
on exactly that ground: it would be a bandwidth argument rendered as a fact, which is the same defect
class as every label on this surface the user has objected to.

What changed, file by file. The word itself now has one home: `modelTypeLabel(type)` plus the
`MODEL_TYPE_LABEL` map, exported from `ui/src/composables/useCatalogMeta.js` beside `typeById`, whose
default ("dense") it matches. Before this it existed only as an inline ternary in the catalog row
template, and putting the same words in two more places would have made three copies — the
extraction-vs-copies shape the user asked to be remembered after EntityIndex. A new
`ui/src/components/LuModelTypeTag.vue` owns the word, the `secondary` intent and the explanatory
`title`, so the tooltip cannot drift between surfaces; it is 30 lines and imports the label function
rather than restating it. `LuModelCatalog.vue:1168` swapped its ternary for `<LuModelTypeTag
:type="typeOf(m)" class="lu-typetag" />` — same render, one fewer copy. `LuClassTunes.vue` gained
`typeById` from the shared singleton plus a local `typeOf(id)`, and shows the tag on BOTH model row
kinds: the configured rows (beside `modelName(t.modelId)`) and the unconfigured "no switches" rows
(beside `m.name`), with a `.lu-ct-mtype` left margin. The add-model picker gets the type as a LABEL
SUFFIX (`"<name> · MoE"`), not a tag, because `UiSelect` renders `<SelectItemText>{{ opt.label }}</
SelectItemText>` (`ui/src/common/components/UiSelect.vue:99`) and cannot take markup; the `" · X"`
shape follows the catalog's own picker precedent at `LuModelCatalog.vue:779`.

How verified. `npm run build:vite` green (1.71 s). JW vitest **472 passed / 51 files** — unchanged,
and that total includes `useCatalogMeta.contract.test.js`, which matters here because
`LuClassTunes.vue` now destructures `typeById` and the contract test is what proves the name is
actually on the returned object (`useCatalogMeta.js:114` — the exact defect that broke QuickSetup's
embed dropdown). A grep for the old inline form (`"MoE" : "Dense"`) across `ui/src` returns ZERO, so
the extraction is complete rather than additive. Biome on the new component: 0 errors after
`--write` fixed its indentation to the kit's tabs; the 3 remaining warnings are the `<script setup>`
template-usage false positives every kit component carries. `useCatalogMeta.js` was NOT reformatted —
biome reports a whole-file CRLF complaint on it, but `git diff --numstat` shows `10 0`, proving the
tree was already CRLF before this edit, so reformatting would have produced a whole-file diff for
nothing. **NOT run: the headless smoke** — it is the renderer gate and `npm run smoke` refuses while
`:1420` is held, which it is by the user's own app; so this is confirmed by build, tests, grep and
lint only, and the look remains unverified.

What would reverse it. Delete `LuModelTypeTag.vue`, restore the ternary at
`LuModelCatalog.vue:1168`, drop the `modelTypeLabel`/`MODEL_TYPE_LABEL` exports, and remove from
`LuClassTunes.vue` the `typeById` destructure, the `typeOf` helper, the two template tags, the
`.lu-ct-mtype` rule and the picker's label suffix. Nothing touches storage, the wire, membership or
launch resolution — the tag is display over a field the rows already carried.

FLAGGED, not decided: the tooltip wording on the new tag is copy nobody ruled on ("Mixture of
experts — only a fraction of the parameters run on each token…" / "Dense — every parameter runs on
every token…"). It is the one string in this change that is mine rather than the user's.

### §25 addendum 2 (2026-07-26): the add-model picker stops filtering, and says the gap in words instead

Why the filter had to go, including the argument that reversed an earlier recommendation twice. The
picker under "＋ Add model to this class" ran its options through `modelBelongsToClass`, so a class
offered only models whose stated floors it cleared. The user hit it on the `8–11 GB VRAM · 16 or 24
GB RAM` class, which offered two models, and objected. Two independent reasons make the filter wrong,
and the second only surfaced when the user asked whether a newly catalogued model gets a class
automatically. First: the picker is an AUTHORING control inside a maintainer tool, while the
membership rule exists to stop a PRESENTATION lying — the two jobs are different, and refusing to let
an author record a config the estimate merely doubts is the app overruling the person maintaining it,
on numbers that are themselves estimates. Second, and decisive: a hand-added model has NO floors.
`LuModelCatalog.vue:758` creates the row with `minVramMb: null, minRamMb: null`; inspecting the HF
repo auto-fills Min VRAM only (`:686`, from the inspect result's `estVramMb`); Min RAM is never
auto-filled by inspect nor defaulted server-side (no hits in `model_catalog_api.py`). Since
`modelBelongsToClass` returns false unless BOTH floors are set (`classTunes.js:124`, pinned at
`classMembership.test.js:79-85`), a new model is a member of nothing — so a filtered picker made
every newly added model impossible to configure anywhere. That is a dead end, not a guard rail.

What was built. The membership filter is deleted from `modelOptions` (`LuClassTunes.vue`), which now
lists every non-embedding catalog model for every class; the embed exclusion stays, because embeds
are CPU by policy and not a class idea at all. In its place a new `pickedShortfall` computed states
the gap AFTER a pick, rendered as a muted line between the Model select and the switch grid: *"Llama
3.3 70B Instruct needs about 45 GB VRAM and 47 GB RAM — more than this PC class has. You can still
save a config for it."* It never blocks Save. It is silent when the floors are unknown, matching the
"unknown floors claim nothing" rule everywhere else. The warning deliberately does NOT live inside
the option label: `UiSelect` renders `<SelectItemText>` (`common/components/UiSelect.vue:99`), text
only and width-capped, so a reason clause would truncate — and the compact alternative, a bare "⚠",
is a glyph the reader must already understand, which is the same defect as the unexplained bold tag
this session started with. The editor has full width two lines down; the sentence goes there.

The membership rule is untouched and still governs the LIST. Grep confirms exactly two uses left in
the component: `:134`, the new advisory shortfall, and `:169`, `unconfiguredMembersByClass`, which is
the class list's own "N more models in this class" roster. So the 70B is still not presented as
something that runs on an integrated GPU; it is merely selectable if an author deliberately chooses
it, and the editor says why that is odd.

Verified. `build:vite` green (1.75 s); JW vitest **472 passed / 51 files**, unchanged. Biome on
`LuClassTunes.vue` still reports the same 3 pre-existing errors (import sort; the `||=`
assignment-in-expression at `configsByClass`) — no new ones. NOT rendered: `npm run smoke` refuses
while `:1420` is held by the user's app, so the shortfall line has never been seen on screen.

What would reverse it. Restore the two `.filter(...)` lines in `modelOptions`, delete
`pickedShortfall`, its `<p class="lu-ct-shortfall">` and the one CSS rule. Nothing else moves —
storage, wire, membership and resolution are untouched.

DECIDED NOT TO DO, with the reason. Auto-estimating `min_ram_mb` the way Min VRAM auto-fills was
proposed alongside this and rejected FOR NOW: Min VRAM is not computed here, it is READ from the
inspect response's `estVramMb`, and there is no equivalent RAM estimate to read. Producing one means
deciding how RAM demand is derived (a MoE's expert spill is the whole question), which is real work
and a real decision, not a ride-along. Until it exists, a hand-added model still shows under no class
in the LIST — the picker fix unblocks configuring it, it does not make it visible.

STILL OPEN from this exchange. The library's lede is factually wrong in one word. *"A PC class is a
memory RANGE that holds one PC class config per model — used automatically on any PC of that class,
unless the machine has its own applied config."* Checked clause by clause against
`switch_resolve.py:113-147`: "one config per model" is right (rows keyed `(model_id, class_key,
flag_name)`); "used automatically on any PC of that class" is right (the class layer, exact
`class_key` match, `:127-132`); "unless the machine has its own applied config" is right (the
per-machine `ModelTune` layer is applied LAST and wins, `:133-147`). But "a memory RANGE" contradicts
the labels shipped this week — the user ruled range wording out and every class now reads as a floor
(`8 GB VRAM · 32 GB RAM`), so the help still teaches the vocabulary the labels abandoned; and a range
does not "hold" configs, the class does. A rewrite is proposed and NOT applied, because it is copy
and the user owns copy.

### §25 addendum 3 (2026-07-26): the range labels are gone — "23 GB VRAM" was arithmetic, not hardware

The finding. The user read a class row as *"16–23 GB VRAM · 64 or 96 GB RAM"* and said: *"23gb vram
no card has that."* Correct, and it is not a rounding artefact — it is invented. `vramPhrase`
(`ui/src/classTunes.js:154-163`) renders a band as `${gb}–${next - 1}`, so with
`VRAM_BANDS = [4, 6, 8, 12, 16, 24]` the 16 band prints "16–23", the 8 band "8–11", the 12 band
"12–15". Nothing stores 23; no card ships 23; the label manufactures a ceiling to look precise.
`ramPhrase` (`:165-171`) does something different but no better: it enumerates the fine `RAM_LADDER`
entries falling between two coarse rungs, which is where "64 or 96 GB RAM" comes from — 96 is real
hardware, but presenting an arbitrary two-element subset reads as "this class is for 64 or 96 GB
machines" when it means "64 GB up to the next rung".

The BANDS themselves were not touched and are not wrong. `hardware.py:167` and `seed.py:488` record
the same intent the user ruled on 2026-07-25 (§22): a 3080's 10 GB and a 2080 Ti's 11 GB key to the 8
band, a 20 GB card to the 16 band, and everything ≥ 24 (a 4090's 24, a 5090's 32) is ONE 24+ band —
their words, *"a 5090's vram32 missing a vram24 seed is absurd"* and *"don't over-engineer"*. Down-
snapping real cards is the deliberate design. The defect was only ever the label's fake upper bound.

What changed. Every user-facing class label in the UI now uses `classKeyLabel` (the stored floor:
"16 GB VRAM · 64 GB RAM") instead of `classKeyRangeLabel`. Eight call sites across two components,
converted together rather than the two the user pointed at, because labelling one class two ways on
one screen is the drift that produced this complaint in the first place: `LuClassTunes.vue` —
`classLabel` and `classHardware` (the class rows), the `editorClassPreview` "Saved as …" snap line,
"This PC's class · …" in the per-model editor, the This-PC fallback, and "For class · …" in the
config editor; `LuModelCatalog.vue` — the Runs-on hover's full class names and the `classRange` used
in the class-badge title. `classKeyRangeLabel` is now imported by nothing in `ui/src` (grep returns
zero .vue callers).

How verified. `build:vite` green (1.87 s); JW vitest **472 passed / 51 files**. Notably nothing
failed, including `classBandLabels.test.js`, which still asserts the range strings directly — the
FUNCTION is unchanged and still tested; only the UI stopped calling it. Biome on the two components
reports 5 errors, all of the two pre-existing kinds this tree already carries (a whole-block
`organizeImports` complaint spanning lines 13-38, and `||=` assignment-in-expression); the identical
organize-imports error was observed on `LuClassTunes.vue` before any edit this session. NOT rendered
— the smoke still refuses while `:1420` is held.

What would reverse it. Swap the eight call sites back and restore `classKeyRangeLabel` to both import
lists. The function, `vramPhrase`, `ramPhrase` and `RAM_LADDER` were all left in place.

OPEN from this. `classKeyRangeLabel` is now DEAD in the UI but still exported and still pinned by
eleven assertions in `justwrite-app/src/renderer/src/services/__tests__/classBandLabels.test.js` —
including `expect(classKeyRangeLabel("dgpu-vram16|ram64")).toBe("16–23 GB VRAM · 64 or 96 GB RAM")`,
the exact string the user rejected. Deleting the function means deleting that test file (and probably
`vramPhrase`/`ramPhrase`/`RAM_LADDER` with it), which is a separate call and was NOT taken: leaving a
tested-but-unused export is the lesser harm versus removing tests unasked. It should not be left
indefinitely — a dead, tested, plausible-looking helper is exactly what someone reuses by accident.

### §25 addendum 4 (2026-07-26/27): the range label DELETED, and why §23's reason no longer holds

The decision, and the argument that settled it. §23 (same week) introduced `classKeyRangeLabel`
precisely so a class would not print its floor as if it were the reader's hardware — its stated
failure case being *"a 10 GB RTX 3080 keys to `vram8` and read '8 GB VRAM', a number BELOW the card
the user owns, which reads as the app getting the detection wrong."* Addendum 3 converted every call
site to the floor form on the user's *"23gb vram no card has that"*, which reversed §23 without
engaging its reason — a real process failure, caught only when the user asked *"but what about range
we dont use that anymore"* and then *"didnt we have range for reason?"*. Two candidate repairs were
weighed: a real-capacity VRAM ladder so the label could name cards ("8, 10 or 11 GB VRAM") the way
the RAM half already named capacities, or plain floors. The user closed it: *"stop with the odd vram
just dont do it"* — no 10, no 11, no 20, no ladder.

What makes floors SAFE now, which is the part §23 could not assume. §23 was written when the class
label was the only memory figure on those surfaces. It no longer is: the library states `This PC ·
8 GB VRAM · 32 GB RAM` from the machine's own probe (addendum 1), and the AI page header states the
GPU and its VRAM independently. A floor underneath a stated machine reads as a bucket; a floor with
nothing beside it reads as a misdetection. The one surface where that was still untrue is fixed in
this pass — see the per-model mount below — so the premise now holds everywhere the label appears.

What was deleted, with its dependency chain. From `ui/src/classTunes.js`: `classKeyRangeLabel`,
`vramPhrase` (its `${gb}–${next - 1}` is where the imaginary 23 came from), `ramPhrase`, and the JS
copy of `RAM_LADDER` — whose only use in the kit was `ramPhrase` naming the nominal capacities inside
a rung. `VRAM_BANDS` and `DGPU_RAM_RUNGS` STAY: `bandOf`, `modelBelongsToClass`'s top-band check and
the class editor's snap preview all still need them. Python's `_RAM_LADDER` stays untouched —
detection still snaps real RAM with it (`hardware.py:151`); only the second copy is gone, which
removes a drift surface rather than creating one. In `justwrite-app/src/renderer/src/services/
__tests__/classBandLabels.test.js` the `describe("classKeyRangeLabel")` block was removed (8 `it`s;
the file's other two blocks, `classKeyLabel (the short form)` and `bandOf`, stay and now cover the
form actually in use) and the header rewritten to state the floor rule. In `just-llm-runner/tests/
test_class_label_ladders.py` the `RAM_LADDER` equality assertion was replaced by a re-copy guard.

The re-copy guard caught its own author, which is worth recording. The first version asserted
`"RAM_LADDER" not in src` and FAILED immediately — matching the kit comment that explains why the
ladder left, not a declaration. Rewritten to `re.search(r"export const RAM_LADDER\s*=", src)`, it
passes; appending `export const RAM_LADDER = [2, 3];` to the kit module makes it fail with its own
message, and removing that line makes it pass again. So the guard is proven to bite, not merely
green. Its comment now names the condition for restoring the equality check: if any kit label needs
those capacities again, re-copy the ladder AND pin it here.

Two copy changes, both blessed by the user before landing. The library lede no longer calls a class
a RANGE (it was wrong twice over once ranges left the labels, and a range does not "hold" configs):
it now reads *"A PC class groups PCs with similar memory. Each class stores one set of launch
switches per model, used automatically on every PC in that class — unless that machine has its own
tuned config. Detection picks your class; you can override it below."* And the PER-MODEL mount — the
`directEdit` branch reached from a model's Tune modal → "Save for PC class" — gained the machine's
own numbers. That mount renders the config editor ALONE, with no This-PC line above it, and
`TuneMeasureModal.vue` never prints VRAM or RAM anywhere (grep: zero hits for `GB VRAM`/`vramMb`), so
it was the single place where §23's failure survived the floor ruling. It now reads `This PC · 8 GB
VRAM · 32 GB RAM` above `Saving to PC class · 8 GB VRAM · 32 GB RAM`.

Verified. `build:vite` green (1.77 s). JW vitest **464 passed / 51 files** — down exactly 8 from 472,
which is the deleted `describe`'s eight `it` blocks and nothing else; no failures. Runner pytest
**667 passed / 9 skipped / 1 failed**, the failure being the documented Windows-only
`test_pci_gpus_linux_lspci_name_match`; `test_adapter_extra.py` excluded as ever (the missing
optional `google` SDK, untouched by this work). Ruff clean on the guard. Biome on `classTunes.js`
reports one `useOptionalChain` finding at `:71` inside the untouched `classKeyLabel`, plus the
file-wide tabs-vs-spaces formatter complaint that predates this change; `git diff --numstat` reads
`19 48`, confirming a scoped diff with no line-ending flip. NOT rendered — `npm run smoke` still
refuses while `:1420` is held.

What would reverse it. `git show` the pre-change `classTunes.js` for the four deleted symbols,
restore the eight assertions and the old header in `classBandLabels.test.js`, swap the guard's
re-copy check back to the equality assertion (re-adding `_RAM_LADDER` to its import), and put
`classKeyRangeLabel` back into the two component import lists plus the eight call sites addendum 3
converted. The per-model hardware line and the lede are independent of all of that.

DELIBERATELY NOT BUILT: the coverage MATRIX (models × classes, one cell per pair) sketched during
this exchange. It is the cleanest answer to the "why does one class list seven models" complaint —
each model once, each class once, the gaps visible as dots — but it was the fourth reframing of this
screen in a day, it needs twelve columns against a panel that already fought for width at 1100px,
and the switch summaries have no cell to live in. The screen's actual defects were wrong labels and
missing facts, and those are now fixed. Parked as an idea, to be built only if coverage maintenance
turns out to hurt in practice.

### §25 addendum 5 (2026-07-27): the catalog row's Runs-on line becomes chips, and the id line goes

Two findings before the fix, both of which changed what the fix was. The user pasted
`Runs on: 8|3212|3212|6416|3216|6424|3224|64iGPU 32` and asked for readable labels. The
run-together is NOT a display bug: `.lu-mruns-c + .lu-mruns-c::before { content: " · " }` supplies a
separator, and pseudo-element text simply does not survive copy-paste — on screen it always read
`8|32 · 12|32 · …`. The real defect was the vocabulary, and the reason the cryptic form existed at
all: with `·` separating classes, a full label ("8 GB VRAM · 32 GB RAM") would put the same
character INSIDE each item, so the line could only stay parseable by compressing each class to
`8|32`. My first proposal was therefore to delete the enumeration and show the floors instead —
`runsOnTitle` (`LuModelCatalog.vue:328-332`) already builds "needs ~4 GB VRAM + 23 GB RAM" and hides
it in the hover, so the plain form existed and was invisible while the cryptic form was on the row.
The user rejected that: *"no i wnat the class conig info i want it in nice labels dont care if you
have to wrap it."* Which is the better answer, because the length objection only holds for a run-on
sentence: as wrapped CHIPS the separator problem disappears entirely, since the chip border marks
the boundary and the interior `·` becomes unambiguous.

What changed. `LuModelCatalog.vue:1152` renders `classKeyLabel(c.classKey, c.name)` instead of
`shortClassLabel(c)`, so each class reads in the same plain words as the class library and the
This-PC line. `.lu-mruns` became `display:flex; flex-wrap:wrap; gap:4px` and `.lu-mruns-c` a
bordered pill; the `::before` separator rule is deleted. The user's own class keeps `is-mine` — now
an accent BORDER plus weight rather than a colour, deliberately: a fill would compete with the Fit
chip's verdict in the next column. The catalog id line (`<div class="lu-mid">{{ m.id }}</div>`) and
its CSS rule are removed on the user's word — *"Qwen3.6 27B (MTP) / qwen3.6-27b diplicate name"*, and
"drop id" — since on a chooser row the id restates the name in slug form; it remains visible and
editable in the model's Edit form, which is where you need it to match a config or an HF repo.
`shortClassLabel` is no longer imported here.

How verified. Both removals were grepped ACROSS ALL THREE REPOS BEFORE deleting, because the
headless smoke — the one gate that would catch a dead selector — cannot run while the user's app
holds `:1420`. `.lu-mid` had exactly two references, the element and its own CSS rule; no test, no
smoke assertion, nothing in JustVoice. `build:vite` green (1.88 s); JW vitest **464 passed / 51
files**, unchanged. Biome on the file reports the same 2 pre-existing errors as before the edit;
`git diff --numstat` reads `24 14`. NOT rendered.

What would reverse it. Restore the `.lu-mid` div and its CSS rule, put `shortClassLabel` back in the
import and at `:1152`, and swap the three `.lu-mruns*` rules for the previous two plus the `::before`
separator.

OPEN from this. `shortClassLabel` (`classTunes.js`) now has NO product consumer — its only remaining
caller is `classMembership.test.js:101`, which maps through it to express expected display order
compactly. That is the same orphan shape as the `RAM_LADDER` case in addendum 4, one step short:
a function alive only because a test uses it. Left in place deliberately rather than deleted
unasked (removing it means rewriting that test's assertions to compare class keys), but it should
not be left indefinitely.

### §25 addendum 6 (2026-07-27): the Runs-on line becomes the floors; the class list moves to the hover

The reversal, and why it is the right end state rather than a flip-flop. Addendum 5 turned the row's
class enumeration into wrapped chips with full labels, on the user's *"i want it in nice labels dont
care if you have to wrap it"*. Looking at it, they returned to the option offered before it —
*"go back to your suggestion So swap the two"* — so the row now states the model's hardware FLOORS
in plain words and the class enumeration lives in the hover. Both shapes were built and seen, which
is the reason to record this as settled rather than as churn: the chips proved that full labels CAN
be shown without the separator collision that forced the cryptic `8|32` form, and seeing them proved
the enumeration is not what a chooser row is for. The floors answer the question actually being
asked at that moment — will this run on my PC — and they compare directly against the VRAM and RAM
the AI page header already states for the box. The class list answers a maintainer-shaped question
(which shipped classes cover this model) and it now sits one hover away.

What changed. `LuModelCatalog.vue` renders `Needs {{ gb(m.minVramMb) }} GB VRAM · {{ gb(m.minRamMb) }}
GB RAM` in place of the chip list. The condition is keyed on the FLOORS, not on `rowClasses()`, which
fixes a latent hole: a model whose floors clear no shipped class previously fell through to the
"unknown" branch and claimed its requirements were unknown when they were perfectly well known. The
fallback now reads "Hardware needs unknown — edit the model to set its requirements". `runsOnTitle`
no longer repeats the floors (the row states them) and returns "" when no class covers the model, so
the hover never claims coverage that does not exist. The `.lu-mruns*` chip rules are deleted — the
line is one short sentence in the shared `.lu-mrowmeta`/`.lu-muted` treatment, exactly like "Size on
disk · …" above it — with a comment pointing at git for the chip CSS should a chip list ever return.
`shortClassLabel` was already out of this file (addendum 5); `classKeyLabel` stays, used by the hover
and two other call sites.

What was LOST, deliberately and with the user's knowledge: the per-row marker of the user's own
class. The chip list bolded it; a floors sentence has nowhere to put it. The Fit column still gives
the per-row verdict for this machine, which is the question that marker was standing in for.

How verified. `build:vite` green (1.68 s); JW vitest **464 passed / 51 files**, unchanged. A grep for
`lu-mruns` and `is-mine` in the component returns zero, so no orphaned rules or classes were left
behind. `gb()` was confirmed to be a top-level `<script setup>` binding (`:256`) BEFORE writing it
into the template — a missing binding there renders blank rather than erroring, which no gate would
catch. Biome reports the same 2 pre-existing errors; `git diff --numstat` reads `35 27`. NOT
rendered: the smoke needs `:1420`.

TWO FINDINGS TO ACT ON, neither touched here. First, a THIRD instance of the "This PC" defect the
user has now ruled on twice: `LuModelCatalog.vue:1084-1086` renders `This PC · {{ classKeyLabel(
tuneState.classKey) }}` — the CLASS label under a "This PC" heading. On the author's own box the
class floors happen to equal the real hardware (8 GB card, 32 GB RAM), so it is invisible there; on a
10 GB / 48 GB machine it would state "This PC · 8 GB VRAM · 32 GB RAM" and be wrong on both numbers.
The fix is cheap because the component ALREADY probes hardware (`:385-387`), though it currently
keeps only `gpus[0].vramMb` — and `gpus[0]` is the wrong GPU on a laptop that lists the iGPU first
(the server's own rule is the largest, `hardware.py:45`). Second, and the reason to fix it properly
rather than locally: `/v1/llm-runner/hardware` is fetched independently by FOUR files —
`LuClassTunes.vue`, `LuModelCatalog.vue`, `AiModelsArea.vue`, `QuickSetup.vue` — each keeping its own
slice, with no shared composable, while `useCatalogMeta` sits next door as the precedent for exactly
this. That is the extraction-vs-copies shape the user asked to be watched for; a `useHardware()`
singleton would collapse all four and give the "This PC" line one honest source.

### §25 addendum 7 (2026-07-27): `useHardware()` — five fetches to one, and the third "This PC" fixed

What was wrong. `/v1/llm-runner/hardware` was fetched FIVE times from FOUR files, each keeping its
own slice and none sharing a rule: `LuClassTunes.vue` (the This-PC line), `LuModelCatalog.vue` (the
embed-leftover VRAM), `AiModelsArea.vue` TWICE (the hardware strip, and the hardware-change detector
which fetched again independently), and `QuickSetup.vue` (the wizard's card). They had already
drifted in the way copies do: three of them read `gpus[0].vramMb` while the server's own rule is the
LARGEST GPU (`max_vram_mb`, `runner/hardware.py:45`, and the class-key builder at `:212`) — so on any
laptop that enumerates its integrated GPU first, the catalog scored embed leftover against the wrong
card and Quick Setup sized the whole wizard against it. This is the extraction-vs-copies shape the
user asked to be watched for, found by grep while fixing something else.

What was built. `ui/src/composables/useHardware.js`, modelled deliberately on `useCatalogMeta` —
same file shape, a module singleton with computed accessors and an explicit `refresh()`, no poller
(hardware does not change while the app runs, except in the one case the detector checks on purpose).
It exposes `hardwareInfo` (raw), `mainGpu` (the largest, by reduce), `maxVramMb`, `ramMb`,
`hardwareLabel` ("8 GB VRAM · 32 GB RAM") and `refresh()`, which returns the response so a caller
needing the fresh value in the same tick does not read the ref back. Failure collapses to `null` and
every accessor degrades to 0/"" — no surface here is worth blocking on a missing probe.

The four consumers now share it, and two behaviours changed as a RESULT rather than as a side quest:
`LuModelCatalog`'s embed leftover and QuickSetup's `wizardLeftoverMb`/`embedPlaceLine`/`hwLine` all
move off `gpus[0]` onto the largest GPU, which is the server's rule they were supposed to mirror all
along. `hardwareLabel` is now the single source of the This-PC sentence, which is what makes the
class FLOOR labels honest wherever they sit beside it.

Two things deliberately NOT changed. `AiModelsArea`'s hardware-change fingerprint still reads
`gpus[0]` (`checkHardwareChange`): correcting it to the largest GPU would mismatch every stored
`ackHwFingerprint` exactly once and fire a spurious "Your graphics hardware changed" toast at every
existing user. That is a real migration question, not a cleanup, and it is left with the copy of the
wrong rule visible in one place rather than silently changed. And the detector still forces a FRESH
read — it calls `refresh()` rather than reading the cache, because comparing a cached value against
the stored fingerprint could miss the very change it exists to notice.

The third "This PC" mislabel, fixed. `LuModelCatalog.vue` printed
`This PC · {{ classKeyLabel(tuneState.classKey) }}` — the class FLOOR under a "This PC" heading, the
same defect the user ruled on twice before (the library line, then the per-model editor). On a box
whose hardware equals its floor it is invisible, which is why it survived two rounds; on a
10 GB / 48 GB machine it stated "8 GB VRAM · 32 GB RAM" and was wrong on both numbers. It now reads
`This PC · <machine> — PC class <floor>`, with the class kept because every row's Runs-on hover is
keyed to it, and falls back to the class label alone if the probe fails.

The contract test was PARAMETERISED rather than copied. `useCatalogMeta.contract.test.js` existed
because destructuring an absent key is silent — legal JS, invisible to Biome, invisible to
`build:vite`, and survivable by the smoke — and `useHardware` landed with six exported names across
four consumers, exactly that shape. Writing a second scanner would have been the duplication this
whole addendum is about, so `consumedNames()` now takes the composable name and a `COMPOSABLES`
table drives `describe.each`; adding a composable to that table is all it takes to police it. Each
entry carries a minimum-consumer count as a vacuity guard, so a rename that made the scanner find
nothing fails rather than passing on an empty set.

How verified. Grep proves the consolidation: `request("/v1/llm-runner/hardware")` now appears exactly
ONCE in `ui/src`, inside the composable, and no local `hw`/`hardware`/`totalVramMb` ref survives.
`build:vite` green (1.70 s). JW vitest **466 passed / 51 files** — up 2, the new composable's contract
pair. Proven to BITE: removing `hardwareLabel` from the composable's return failed the contract test
with `hardwareLabel (wanted by components/LuModelCatalog.vue)`, and restoring it went green. Biome
clean on the new file after `--write` fixed its indentation to the kit's tabs. NOT rendered — the
smoke needs `:1420`, which the user's app holds; four surfaces changed here and none has been looked
at.

Worth recording as method: the parameterisation was first attempted with a scripted string
replacement, which mangled the regex escapes and silently produced a file where only one composable
was policed — the tests still "passed" at 3 of 3. It was caught because the RUN was checked
(5 expected, 3 reported), not because anything errored. Second time today a regex-driven edit to
source produced a plausible-looking wrong result; both were caught by running rather than reading.

What would reverse it. Delete `useHardware.js`, restore the five private fetches (git holds each),
put `classKeyLabel(tuneState.classKey)` back in the catalog's This-PC line, and collapse the
contract test's `COMPOSABLES` table back to a single hard-coded `useCatalogMeta` describe.

OPEN, and all three need the user's call rather than a build. (1) **The Add-model picker filters to
class members.** `LuClassTunes.vue:100-107` runs `modelOptions` through `modelBelongsToClass`, so the
`8–11 GB VRAM · 16 or 24 GB RAM` class offers only the 12B and E4B — the 26B's 24 GB RAM floor
excludes it. The user hit this and hated it. The recommendation on the table is to list every model
and MARK the ones that do not clear the class, rather than withhold them: the floors are estimates,
the library is the user's, and refusing to author a config the app merely predicts won't run is the
app deciding. Not changed — and the picker's callers have not been grepped for a dependency on
pre-filtering, which is the first step if it is changed. (2) **MoE vs dense needs to be visible
wherever hardware numbers are.** The user asked for the distinction; the grounds are that the 26B is
MoE (experts spill to system RAM: ~4 GB VRAM but 24 GB RAM) while the 12B is dense (8.5 GB VRAM, 12
GB RAM), so the *bigger* model wants *less* VRAM — the inversion that has made every version of these
screens read as nonsense. The catalog already tags `MoE`/`Dense` (`LuModelCatalog.vue:1168`); the
class library and the picker do not. Display only, so it cannot affect resolution. (3)
**`LuMeasureHistory.vue:113` renders the bare word `measured` as plain text** in the same cell where
`Auto-tune` is now a capitalised tag; either it becomes a tag too or it stays prose, and that was not
decided here. Also still unresolved from the wider design thread: whether the class library should be
a single-machine view at all (the observation that it is a fleet-authoring tool — twelve classes,
class CRUD, JSON copy/import at `:360-401` — shown to someone who owns one PC), and whether
"Recommended" should become user-settable instead of derived at `modelPick.js:159-165`.

OPEN. Nothing here has been LOOKED at in the running app — the user's eyes remain the look gate,
and the new surfaces (the floors on the row, the "Estimated" hover, the collapsed not-tested line
and its Add switches prefill) are exactly the kind of change that reads differently in place. Two
of the plan's own doc claims turned out to be factually wrong and were NOT acted on, and both need
the planner's call: `justwrite-app/docs/ARCHITECTURE.md:198` "### Model class defaults" is not
about PC classes at all — it is the per-model-FAMILY thinking-defaults table (reasoning-first /
hybrid / non-reasoning), so renaming it to the PC vocabulary would have made the doc lie; it was
left untouched, though the heading now collides with retired wording and may deserve a
disambiguating rename of its own ("Model family thinking defaults") as a separate decision. And
`docs/TASKS.md` has no item #214 — the chip-wording question was never tracked as a numbered item
(the nearest relative is the SHIPPED 2026-07-25 bullet noting the class-default chip now names its
class), so the resolution was recorded as a new tracker line pointing here instead of editing a
non-existent one. Finally, nothing in this pass is committed: the planner diff-reviews first and
the user owns the commit word.

### §25 addendum 8 (2026-07-27): the last two `gpus[0]` reads, and a ruling I invented

Addendum 7 consolidated five hardware fetches into `useHardware()` and fixed the wrong-GPU rule at
three call sites, but left two reads of `gpus[0]` in `AiModelsArea.vue` and described them as ONE
site held back by a migration question. That description was wrong, and the error is worth
recording because it is the shape of mistake this doc exists to catch: I filed a plain bug under a
harder adjacent problem and stopped looking. The two are `AiModelsArea.vue:99`, which is the GPU
name and VRAM shown on the AI page's hardware strip — pure display, nothing stored, no migration
question of any kind, and simply wrong on a machine whose first-enumerated GPU is not its largest —
and `AiModelsArea.vue:358-373`'s `checkHardwareChange()`, which builds a `"<gpu name>|<vramMb>"`
fingerprint, compares it against `ackHwFingerprint` in `/v1/ai/engine-config`, and on a mismatch
saves the new value and raises a one-time "Your graphics hardware changed" toast offering Quick
Setup (a first sight seeds the baseline silently, so a fresh install never toasts). Only the second
carried a consequence, and I had reported both as blocked by it.

Both now read the largest GPU, which is the server's own rule (`max_vram_mb`, `hardware.py:45`, and
the class-key builder at `:212`). The rule itself was extracted rather than written a third time:
`useHardware.js` now exports `largestGpu(gpus)` as a PURE function over an array, with `mainGpu`
defined as `computed(() => largestGpu(hardware.value?.gpus))` on top of it. The pure form exists for
a real reason rather than tidiness — `checkHardwareChange()` legitimately holds a FRESH probe
response and must fingerprint THAT, not whatever the ref was last read as, so without a pure helper
it would have re-implemented the max and re-created exactly the drift addendum 7 removed. It is
also returned from `useHardware()` alongside the refs, so a consumer may destructure it and so
`useCatalogMeta.contract.test.js` polices it like every other name. The strip at `:99` takes
`mainGpu.value`, keeping the computed→computed dependency chain intact; a raw non-reactive read
there would have frozen the strip at first paint.

The accepted cost, stated because it is a real behaviour change and not a refactor: on any box whose
first-listed GPU is not its largest, the fingerprint string now differs from whatever is stored, so
one "your graphics hardware changed" toast fires that no hardware change caused. After that it is
correct permanently. On the author's single-GPU desktop the two rules produce a byte-identical
string and nothing happens at all.

**The process error, recorded deliberately.** When first raising this, I wrote that the user "ruled
that acceptable". They had not. Their words were *"we dont need db migration i just reset db via
app"* — a ruling about migrations, made before the toast consequence had been described to them at
all. They caught it immediately (*"i did not rule anything … what is ite"*), the consequence was
then explained in plain terms, and the actual go came afterwards as *"but it is ok, continue"*.
Converting a user's statement about one thing into approval of an undisclosed other thing is the
precise failure mode the never-own-decisions rule exists to prevent, and it is more dangerous than
an ordinary wrong claim because the fabricated approval would have been quoted back as precedent.

**How to verify:** `grep -n "gpus\[0\]" ui/src` returns nothing in the kit. The strip names the
larger card on a multi-GPU box; on a single-GPU box it is unchanged. **What would reverse it:** if
the one-time toast proves confusing in the field, the fingerprint alone can go back to `gpus[0]`
(`AiModelsArea.vue:369`) while the strip and every fit calculation keep the correct rule — they are
independent, which is why the two were separable in the first place.

**CLOSED 2026-07-27 — the user looked: *"both ui are ok"*.** The class-configs modal and the
QuickSetup wizard were the two surfaces this session reshaped and the two the headless smoke cannot
reach (both sit behind a click its sweep never makes), so they were carried as the only outstanding
gate through four commits. The user opened both on their box and passed them. That closes §25 and
every addendum under it: the look pass is done, not merely built.

Worth keeping for the next time this shape recurs: the automated fleet — biome, 466 unit tests,
`build:vite`, and a real-data headless smoke over 25 routes and 5 AI sub-tabs — was fully green on
these surfaces for the whole session while the question the user actually cared about ("as a user i
just dont understnad what i am looking at") stayed completely unanswered by it. Every gate here
measures whether something throws. None of them measures whether a screen reads correctly, and the
entire session was about the second thing. That is not a gap to close with more automation; it is
the reason the look pass is a named step with a person in it.

One thing NOT established by the sentence above: the specific check the QuickSetup item in
`docs/TASKS.md` asks for — that the EMBEDDING dropdown is populated and the "Couldn't finish
reading your setup" banner is gone (the `estVramById` regression of 2026-07-26). It was recorded
as an inference rather than folded into the closure, and then **confirmed outright the same day —
the user: *"quicksetup ok"***. The `estVramById` fix and the contract test that guards it are now
verified in the running app, not merely by their unit assertions.

### §25 addendum 9 (2026-07-27): min-RAM estimate — the Add form's last blank floor

**What changed.** The Add/Edit model form now pre-fills **Min RAM (MB)** from the GGUF Read-from-link,
the way it has always pre-filled Min VRAM. Until today nothing anywhere in either repo produced a RAM
estimate at all, so a hand-added model carried a blank `min_ram_mb` forever, and
`classTunes.js:132` (`if (!minVramMb || !minRamMb || !cls) return false`) requires BOTH floors before a
model may claim membership in any PC class. That single blank field is why a hand-added model showed
under no class in the list — the exact shortfall recorded above in the "DECIDED NOT TO DO" note of the
class-picker addendum, which rejected this work at the time on the grounds that "there is no equivalent
RAM estimate to read" and that inventing one is a real decision rather than a ride-along. That remained
true; what changed is that the decision was made rather than the work being smuggled in.

**The rule, and why it is one formula.** `est_ram_mb_from_bytes(total_bytes)` in
`llm_runner/llm/identity.py` (added directly under `est_vram_mb_from_meta`, which sits at the same
place in the file) returns `None` for a falsy size; otherwise it takes the file size in decimal MB
(`ceil(bytes / 1e6)`, the same 1e6 convention `est_vram_mb_from_meta` already uses), adds 4096 MB of
headroom, and snaps the result UP to the first rung of the real-RAM ladder
`[8, 10, 12, 16, 24, 32, 48, 64, 96, 128]` GB, returning MB. Past the top rung the ladder is exhausted,
so the computed need is rounded up to the next multiple of 32 GB instead. The source of the rule is not
invented: it is transcribed from the seeded catalog's own documented basis at
`llm_runner/llm/seed.py:151-154` — *dense: weights-in-RAM + overhead; MoE: the FULL model in RAM since
experts offload to RAM*. Those two clauses look like two rules but converge on one, because both cases
end up holding the whole file: the dense model's weights ARE the file, and the MoE's expert spill puts
the file there too. So the estimator needs nothing from the GGUF header — only the download size. It is
therefore named `from_bytes`, not `from_meta`, and deliberately does NOT take an unused `meta`
parameter that would advertise a dependence it does not have (the standing names-must-match-behaviour
rule).

**How it was calibrated, including where it is wrong.** The rule was checked against all ten seeded
catalog rows carrying both `min_ram_mb` and `size_bytes`. **8 of 10 land on the seeded rung exactly:**
the 12B QAT (6716355328 B → 12 GB, seeded 12000), the 70B (42520398432 → 48 GB, seeded 48000), Qwen3.6
27B (17909097600 → 24 GB), the 26B-A4B Gryphe tune (17211252288 → 24 GB), the 26B-A4B base
(14329791488 → 24 GB), Qwen3 Embedding 4B (2496703776 → 8 GB), Qwen3 Embedding 8B (4676804928 →
10 GB), and KaLM Embedding 12B (7300777920 → 12 GB). **The two misses are named rather than tuned
away.** `gemma-4-e4b-qat` is seeded at 8 GB where the rule says 10 — the rule errs toward MORE RAM,
which is the safe direction for a floor, and bending the constant to recover this one row would push
several others off their rung. `glm-4.5-air` is seeded at **64 GB against a 67.7 GB file**, where the
rule says 96; the seeded row is being left exactly as it is because whether a 67.7 GB model may declare
a 64 GB floor is a judgement about acceptable swap/spill pressure that belongs to the user, not to this
change. **Seeded rows are never re-derived from the estimator.** The function fills a BLANK form field
and nothing else; it does not run over the catalog, and no migration touches `min_ram_mb`.

**The wire, and the trap that was checked for.** `inspect_model_from_link` now returns
`"estRamMb"` beside `"estVramMb"` (`identity.py`, the returned dict). That alone would have been a
silent no-op: the route `POST /v1/ai/model-catalog/inspect` is declared
`response_model=InspectResponse` and constructs `InspectResponse(**data)`
(`llm_runner/llm/model_catalog_api.py:339-354`), and a Pydantic response model **drops** any field it
does not declare — which is precisely the failure the 2026-07-19 rules-checker caught on the draft-floor
flag, where a UI feature was dead on the wire while every test stayed green. So `estRamMb: int | None`
was added to `InspectResponse` alongside `estVramMb`, with a comment saying why it must be declared
there. On the client, `LuModelCatalog.vue`'s `applyInspect` reads the parsed JSON as `r`, so the UI
casing follows the wire casing verbatim, and the new line
`if (!e.minRamMb && r.estRamMb) e.minRamMb = r.estRamMb;` sits directly under the existing Min VRAM
mirror. **Fill-only-when-blank**: a value the user typed is never overwritten, on this field or the
other.

**The label, which was actively false.** The Fit-estimate note read *"a pre-download guess so the list
can show 'will it fit?'; once downloaded the GGUF sets the real fit."* The second clause is untrue for
Min RAM — nothing has ever written that field at download time, and now nothing writes it after the
form either. It now reads: *"Fit estimate — a pre-download guess, filled in from the file when you Read
from link, so the list can show 'will it fit?'. Both numbers stay yours to edit."* **This wording is
flagged for the user's veto** — it is copy on their screen, it was written by the executor rather than
ruled by them, and it should be read and replaced if it is not how they would say it.

**How verified.** Runner pytest from `E:\Dev\Web\just-llm-runner` on the JW venv interpreter: **710
passed, 9 skipped, 1 failed**, the single failure being
`test_hardware.py::test_pci_gpus_linux_lspci_name_match`, the known-bad Linux `lspci` path test on
Windows. The new coverage is `tests/test_identity.py::test_est_ram_mb_from_bytes_snaps_to_real_ram_rungs`
(None and 0 → `None`; a small file → the 8 GB floor rung; the exact-rung boundary at 4.096 GB → 8 GB
with one byte more → 10 GB, which is the off-by-one this shape invites; the 12B and 26B-A4B seeded
exhibits; and 200 GB → 224 GB for the past-the-ladder branch), plus an added assertion on the existing
`test_inspect_model_from_link` that `estRamMb == 24 * 1024` — that one is the wire test: it fails if the
key stops riding the payload. `npx biome check` on `LuModelCatalog.vue` exits 0. JW `npm run test:unit`
and `npm run build:vite` were run as the renderer gates. The headless smoke was deliberately NOT run:
the Add form sits behind a click its sweep never makes, so it could not observe this either way, and the
user's box may hold `:1420`/`:17495`.

**What would reverse it.** Delete `est_ram_mb_from_bytes` and its two call sites (the `"estRamMb"` key
and the `InspectResponse` field), and the one `if (!e.minRamMb …)` line in `LuModelCatalog.vue`; the
label edit is independent and should survive regardless, since the sentence it replaced was false. The
narrower reversal, if the ladder proves wrong rather than the idea, is the constants alone —
`_RAM_RUNGS_GB` and `_RAM_HEADROOM_MB` are the only tunables and both sit at the top of the function's
own block. Nothing is stored, migrated, or derived from this at rest: it writes one form field before
a Save the user still has to press.

### §25 addendum 10 (2026-07-27): the seed floors become real memory sizes

**The ruling.** The user, on seeing the catalog rows render *"23 GB RAM"*, *"8.3 GB VRAM"* and
*"45 GB"*: **"vram and ram usually only come in even sizes and certainly not 8.5"**. That is the whole
basis of this change. It is not a rounding preference — it is a statement about what the field MEANS. A
memory floor names the machine a model needs, and machines ship 8/12/16/24/32/48/64 GB, so a floor that
cannot be read back as a real machine size is not a floor, it is arithmetic residue.

**What changed.** Every CHAT row's `min_vram_mb` / `min_ram_mb` in the seeded catalog is now binary MB
of a real memory size. The seeded values had been written as decimal thousands — 24000 meaning "24 GB"
— while the UI's `gb()` divides by 1024, which is what produced the numbers the user saw. The exact map
applied, and it is total (every chat-row floor value that existed appears in it):

    4000 → 4096 · 6000 → 6144 · 8000 → 8192 · 8500 → 8192 · 12000 → 12288
    20000 → 20480 · 24000 → 24576 · 46000 → 49152 · 48000 → 49152 · 64000 → 65536

Applied at `just-llm-runner/llm_runner/llm/seed.py` — `gemma-4-12b-qat` (:191), `gemma-4-e4b-qat`
(:219), `llama-3.3-70b-q4_k_m` (:237), `glm-4.5-air` (:258), `qwen3.6-27b` (:280),
`gryphe-styletune-v2` (:305) and `gemma-4-26b-a4b-uncensored-ez` (:336) — the convention itself is
written into that list's header comment at `seed.py:157-166` — and at
`justwrite-app/server/justwrite_server/seed_presets.py:125`, which is the JW half of the catalog and
carries the flagship `gemma-4-26b-a4b-qat` row at the same 4000/24000. That second file was NOT in the
executed plan's file list; it was found by grepping for the literals and is included because the ruling
says *every chat row*, the map covered its exact values, and leaving it would have meant the flagship —
the single most-seen row on the user's own box — kept rendering "3.9 GB / 23 GB" while every other row
was clean. This is flagged as a scope addition rather than buried.

**Three of those ten mappings are judgements, not arithmetic, and are recorded so nobody re-derives
them.** The 12B's VRAM 8500 → 8192: the user's own bench measured that model at 39.1 tok/s at `ngl 99`
on their 8 GB card, and it is the band pick for `dgpu-vram8|ram16` — a floor of 8.5 GB contradicted a
ruling the measurements had already settled, so the floor comes down to a real 8 GB rather than up.
The 70B's VRAM 46000 → 49152: 48 GB is a real workstation card and 46 GB is nothing, so the floor snaps
to the card that exists. The 27B's VRAM 20000 → 20480: 20 GB cards do exist (RTX 4000 Ada, RX 7900 XT),
so 20 GB is kept as a real rung rather than rounded to 24. **GLM's RAM floor was normalized 64000 →
65536 and nothing more** — whether a 67.7 GB model may declare a 64 GB floor at all, or should say 96,
is the open user call already recorded in addendum 9, and it stays open.

**Scope: chat rows only; the embed rows keep their decimal floors deliberately.**
`qwen3-embedding-4b` (4500/8000), `qwen3-embedding-8b` (7000/10000) and `kalm-embedding-gemma3-12b`
(10000/12000) are untouched. Their floors are never displayed on a row — `LuModelCatalog.vue:1178`
gates the Needs-line with `v-if="!embeddingOf(m) && …"` — so there is no display gain to be had. They do
steer wizard placement through `modelPick.js`, so changing them is live behaviour risk for that zero
gain, and `just-llm-runner/tests/test_embed_templates.py:172` pins `b4["min_ram_mb"] == 8000`, a green
test that would have had to be edited to buy nothing.

**Zero membership flips, and this was checked rather than assumed.** The 9-model × 12-class truth table
the user approved on 2026-07-26 (`src/renderer/src/components/__tests__/classMembership.test.js`) is
byte-identical across the snap: only the fixture FLOOR values were re-copied from the seed, and every
expected class set stayed as it was, with the suite green. The margins, since they are what a future
edit will need: the 12B against the 8 GB band computes 8500/6144 = 1.383 before and 8192/6144 = 1.333
after, both inside fit's 1.5x slack, so no flip; the 70B's 46000 and 49152 both live only in the
open-ended `dgpu-vram24` band, which means "24 GB and above" and swallows either; the 27B's
20000/16384 = 1.22 becomes 20480/16384 = 1.25, both inside 1.5x on the 16 GB band and both failing the
12 GB band either way. The rule under test is `classTunes.js` `modelBelongsToClass`; the test's own
header now carries these ratios.

**The display's trailing zero.** With the floors snapped, `8192 / 1024` rendered as **"8.0"**, which is
still not the "8" the ruling asks for. `LuModelCatalog.vue:257`'s `gb()` kept its two-branch shape —
at or above 10240 MB it rounds to a whole number, below that it keeps one decimal — but the sub-10 GB
branch became `+(mb / 1024).toFixed(1)` inside the template literal: the unary plus turns "8.0" into 8
while a genuine half survives as 4.5. This is display polish, but it serves the same ruling, and
shipping it separately would have left the user looking at "8.0 GB" and reasonably concluding the fix
had not landed.

**The propagation truth: an existing DB does NOT pick these up.** The catalog seeder is
insert-or-fill-empty, never update. `seed_default_catalog` (`seed.py:1014`) looks the row up by id and,
when it exists, touches exactly four things: `size_bytes`, `est_vram_mb` and `size_label` **only when
they are empty**, `_fill_inherited_draft`, and the `STALE_SEED_VALUES` heal — whose entries today cover
only draft-file paths, no floor. `seed_extra_catalog` (`seed.py:1045`) is the same minus the heal. So
`min_vram_mb` / `min_ram_mb` on an already-seeded row are never rewritten at boot: **the clean numbers
land on a fresh install or after "Reset catalog" only.** If the user wants them on their existing DB
without a reset, the mechanism already exists and is the honest one — add `(model_id, "min_vram_mb")`
entries to `STALE_SEED_VALUES` naming the exact old value, which by design heals only a row still
carrying the historically-seeded number and never a value the user typed. That was deliberately NOT
built here; it is a one-line-per-row addition whenever the user asks.

**The estimator's calibration note, recomputed.** `est_ram_mb_from_bytes`'s docstring
(`identity.py:208`) claimed *"8/10 land on the seeded rung exactly"*. Re-running the rule against all
ten rows after the snap: still 8/10 at the rung, but the composition changed, and "exactly" was doing
unearned work even before today — the function only ever returns `rung_gb * 1024`, so it could never
have been byte-equal to a seeded 12000. Now five of the eight — `gemma-4-12b-qat` 12288,
`llama-3.3-70b-q4_k_m` 49152, and `qwen3.6-27b` / `gryphe-styletune-v2` /
`gemma-4-26b-a4b-uncensored-ez` at 24576 — ARE byte-equal, because the snap put the chat floors on the
same binary rungs the ladder returns. The other three matches are the embed rows (8000/10000/12000
against 8192/10240/12288), which agree at the rung but not to the byte, deliberately, per the embed
scope above. The two misses are unchanged: `gemma-4-e4b-qat` seeded 8 GB where the rule says 10, and
`glm-4.5-air` seeded 64 GB where the rule says 96. The docstring now says all of this in those terms.
**Addendum 9's calibration paragraph is superseded on its numbers** — it lists the pre-snap seeded
values (12000, 48000, 24000) and is left standing as the record of that day.

**The two failed transforms that came first, recorded so the next normalization does not repeat them.**
The first attempt was mechanical: `round(x / 1000) * 1024`. It silently LOWERED two VRAM floors, because
Python's `round` is half-to-even — 8500/1000 = 8.5 rounds to 8, not 9, so the 12B's floor moved down by
accident rather than by the reasoning above, and the same banker's rounding was waiting on any future
`.5`. The second attempt was multiplication by 1.024, which is arithmetically the "right"
decimal-to-binary conversion and produced 8500 → 8704, i.e. **8.5 GB** — the exact number the user then
caught and named in the ruling. Both failures share one root: they treat the old value as data to be
converted, when the old value is a typo for a machine size and the machine size is the data. **The next
normalization starts from the ruling — name the real hardware rung — not from arithmetic on the old
numbers.**

**How verified.** Runner pytest from `E:\Dev\Web\just-llm-runner` on the JW venv interpreter; `npx
biome check` on the touched kit file; JW `npm run test:unit` (the classMembership truth table among
them, expectations unchanged) and `npm run build:vite`; the headless smoke run subject to the user's box
holding `:1420`. Exact counts are in the session report.

**What would reverse it.** Revert the floor values in the two seed files and the fixture floors in
`classMembership.test.js` — the expected class sets need no change in either direction, which is the
point of the zero-flip check. The `gb()` unary plus is independent and would survive a revert, since
"8.0" is not a number any hardware ships either. Nothing was migrated and no existing DB row was
touched, so a revert reaches exactly the same population the change does: fresh installs and resets.

### §25 addendum 11 (2026-07-27): the GLM floor stands — the estimator is what is wrong there

The one floor deliberately left un-normalized in substance (its 64000 became 65536, but the VALUE
in GB was never touched) was `glm-4.5-air`'s 64 GB against a 67.7 GB file. Addenda 9 and 10 both
carried it as an open question with the estimator's 96 GB implicitly on the other side. The user
asked for a recommendation rather than a ruling, and reading the row settled it against my own
expectation: **the seed is right and `est_ram_mb_from_bytes` is what is wrong there.**

The row declares a 12 GB VRAM floor beside its 64 GB RAM floor (`seed.py:258`). Those are two
different memory pools, and together they are 76 GB of memory for a 67.7 GB model — so roughly
56 GB of weights plus overhead in system RAM, which 64 GB holds. The estimator returns 96 only
because it reads `total_bytes` and nothing else, charging the ENTIRE file to RAM. That assumption
is correct on a CPU-only machine and wrong on any row that also carries a VRAM floor, where part of
the weights are resident on the card. GLM is simply the only seeded row large enough for the error
to cross a ladder rung, which is why it alone surfaced it; the same flaw is present, and harmless,
on every other row.

The blind spot is being KEPT, not fixed, and the reasoning is worth holding: when this function
runs on a hand-added model there is no VRAM floor to subtract yet, and over-stating a floor is the
safe error for a number whose entire job is to say "this will not fit on your machine". Correcting
it would mean deciding what fraction of a file to charge to VRAM, which is a design decision about
placement policy rather than an arithmetic fix, and it is not on the table today.

**What changed:** `identity.py:217-236` — the docstring's calibration section, which had filed GLM
under "the two real misses" as though the seeded number were suspect. It now names it as this
function's known blind spot, shows the two-pool arithmetic, and states the honesty limit explicitly:
nobody here owns a 64 GB box, nobody has run GLM on one, and what is recorded is arithmetic plus the
seed author's original judgement, which the user declined to overturn. `gemma-4-e4b-qat` (seeded
8 GB, rule 10 GB) remains the one genuine miss.

**How to verify:** read the docstring against `seed.py:258`'s paired floors. **What would reverse
it:** a measurement — someone running `glm-4.5-air` on a 64 GB machine and finding it thrashes would
move the seed to 96 and turn this addendum into the record of a wrong call.
