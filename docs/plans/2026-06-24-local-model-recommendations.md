> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-27-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# Local model recommendations + the MoE-offload investigation (2026-06-24)

Shared LLM stack (JW + JV). Captures the model-selection research + the
MoE/offload switch findings so they survive context compaction (RULE #2).
Sources are cited — recommendations come from **external benchmarks, not our own
testing** (we can only test what we can run).

## The core problem (user, 2026-06-24)

- Users don't know model names and won't search HuggingFace.
- **We** can't hand-curate from testing either — only Qwen3 8B/14B were ever run
  locally; we don't know "what's best for job X."
- → Recommendations must come from **boards/benchmarks + community signal**, and
  we **cite** them. The user's own **Lab** (A/B two recommended models on their
  real text → promote) closes the loop for "best for *my* writing."

## The two facts that flip "what fits"

1. **Small dense models fail hard structured tasks.** User saw 8B do "crappy" on
   JV **speaker attribution**. Dense 8B is genuinely weak for attribution /
   extraction / critique.
2. **MoE + `--n-cpu-moe` offload runs a 35B on a 6 GB card.** Qwen3.6-35B-A3B
   (35B total, ~3.6B active) keeps active params + KV on the GPU and offloads
   experts to system RAM → **~30 tps on 6 GB VRAM** (needs ~24 GB RAM);
   58–62 tps on 12 GB. Quality ≈ 14B dense general / near 32B on structured
   reasoning *with thinking on*. **`-ncmoe` only helps MoE models, not dense** —
   so a 14B *dense* on a 6 GB card just spills to CPU and stays slow.
   - Sources: [Run Qwen3.6-35B-A3B on 6GB (~30 tps)](https://mychen76.medium.com/run-qwen3-6-35b-a3b-on-6gb-vram-using-llama-cpp-30-tps-a89032e5a60c) ·
     [RTX 3060 -ncmoe](https://knightli.com/en/2026/05/26/rtx-3060-llama-cpp-n-cpu-moe-local-35b/) ·
     [Qwen3 lineup](https://baeseokjae.github.io/posts/qwen-3-full-lineup-guide-2026/) ·
     [Qwen3 report](https://arxiv.org/html/2505.09388v1)

**The real constraint for MoE is RAM, not VRAM** (experts live in RAM). Fit must
gate MoE picks on **system RAM** (the 35B-A3B needs ~24 GB), not just VRAM.

## What runs, by hardware tier

> **⚠️ 8 GB VRAM is our MIN supported GPU spec** (user, 2026-06-24); the **6 GB** row
> below is the video's *example*, possible but not our floor. CPU-only is the no-GPU
> fallback. These per-tier picks are **not yet verified** — the corrected deep research
> (`just-llm-runner/docs/plans/2026-06-24-server-model-management-brief.md` §1.5) must
> confirm them with measured data before we implement.

| Hardware | Hard tasks (attribution, extraction, critique) | Fast/light (brainstorm, drafts) |
|---|---|---|
| **CPU-only** | Qwen3.6-35B-A3B (MoE is the CPU hero — 3.6B active) | Qwen3 4–8B dense |
| **6 GB + ≥24 GB RAM** | **Qwen3.6-35B-A3B via `-ncmoe`** (~30 tps) ← the pick | Qwen3 8–9B dense |
| **12 GB** | 35B-A3B @ 58–62 tps, or dense 14B on GPU | 8–9B dense |
| **16 GB** | dense 14B / 35B-A3B mostly on GPU | 14B |
| **24 GB** | dense 27–32B or 35B-A3B fully on GPU (top local) | 14B |

## Which model family per job (boards overlaid)

| Job (features) | Pick | Source |
|---|---|---|
| Reasoning / analysis + **speaker attribution** | **Qwen3** (A3B MoE w/ thinking on small cards) | [Qwen vs Mistral vs Llama](https://www.promptquorum.com/local-llms/qwen-vs-llama-vs-mistral) |
| Extraction / strict JSON | **Mistral Small 24B** (native JSON/function-calling) @ 16–24 GB; else Qwen3-A3B + tight prompt | [Mistral Small](https://mistral.ai/news/mistral-small-3/) |
| Prose / rewrite | best *open* model on [EQ-Bench Creative Writing](https://eqbench.com/creative_writing.html) at the tier (Qwen3/Gemma); **prose is where cloud (Claude) still leads** | EQ-Bench |
| RAG / "Ask the book" | **Qwen 2.5/3** (best at "answer only from context"); Command R 35B for built-in citations | [best local RAG](https://insiderllm.com/guides/best-local-llms-rag/) |
| Embeddings | **nomic-embed-text** (274 MB, CPU); bge-m3 stronger; Qwen3-Embedding-8B SOTA | [MTEB](https://huggingface.co/spaces/mteb/leaderboard) · [Ollama embeddings](https://www.morphllm.com/ollama-embedding-models) |

**Design rule:** recommend **"best-quality model that runs on your card incl. MoE
offload, per job"** — boards pick the family, Fit (VRAM **+ RAM**) picks the
variant. Route per-feature (local for extraction/RAG/analysis; cloud option for
prose).

## Switch state — what's saved vs the gap

**Saved (verified):**
- `runner-manifest.json` → `flagPresets`: `base` (`-ngl 999 --flash-attn on
  --cache-type-k q8_0 --cache-type-v q8_0 --mlock`), `mtp` (`--spec-type
  draft-mtp --spec-draft-n-max 3`), `turboquant` (exp: `--cache-type-k turbo4
  --cache-type-v turbo3`, fork `TheTom/llama-cpp-turboquant`).
- `runner/process.py`: `Overrides(n_gpu_layers, n_cpu_moe, ctx_len, extra_flags)`
  + computed FitPlan + OOM back-off (sheds GPU layers, recomputes `n_cpu_moe`).
- The 35B-A3B MoE entry (6 GB VRAM / 24 GB RAM / mtp / `candidateFor:
  ['attribution']`).

**Gap (the "we need options to test"):** `/v1/llm-runner/load` takes only
`{modelId}` — it does **not** pass `n_cpu_moe` / `n_gpu_layers` / `ctx` through,
and no UI exposes them. So the switches exist in the engine but **can't be tuned
from the app to test speed**. → Build: plumb `Overrides` through `/load` + a
per-local-model tuning UI (sliders for `n_cpu_moe` / `n_gpu_layers` / `ctx`,
mtp + turboquant toggles) with a **tokens/sec readout** so the user finds the
fast split on their machine.

## Open decisions
- Prose default: cloud (Claude) with local fallback, vs local-only best-open?
- Embedding default: nomic-embed-text (easy) vs bge-m3 (stronger)?
- Recommendation set: a cited in-repo `recommended_models.json` (refreshed from
  the boards) vs a live-fetched feed. (Leaning: cited JSON.)

## QuickSetup design (decided so far)
Modal wizard (like JV) · card/VRAM chooser (re-scores Fit via the new
`/v1/llm-runner/models?vram_mb=`) · pick Card + Quick + Accuracy + Embedding from
a benchmark-cited, Fit-filtered (VRAM+RAM, MoE-aware) list · Apply sets routing +
downloads/loads · the Lab A/Bs the top picks. JW LLM first; JV gets a separate
TTS QuickSetup (U5).
