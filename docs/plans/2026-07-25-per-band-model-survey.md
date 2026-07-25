# The per-band model survey — Part 2 (2026-07-25, the user's "do 1 and 2")

The widened survey (supersedes the old "higher-tier 24 GB+ survey" item): every dGPU band
resolves to appropriate models — the user's ruling. Keys are BANDS since the same-day band
ruling (recovery doc §22), so each band's recommendation is a plain `(model, band-key)`
class-tune row and exact match covers every real card. This doc records the candidates, the
verdicts, what was seeded, and the two decisions left open for the user.

## The law applied throughout

An untested outside candidate never becomes a recommendation (the A/B law — "test both, keep
the winner"; the Goetia lesson: the fastest candidate of its screen had a broken chat template
that only a real run exposed). So every SEEDED recommendation below is a carried, tested model;
outside candidates are named for FUTURE testing with the facts that would get them a fair
trial.

## The seeded recommendations (runner seed.py, DEFAULT_CLASS_TUNES — shipped with this doc)

| band key(s) | model | why | placement |
|---|---|---|---|
| `dgpu-vram12\|ram16/32/64` | **Gemma 4 12B QAT** | fully resident at est ~10.7 GB — the clean 12 GB pick; RAM-light (dense) so all three rungs | ngl 99 + the blessed mirrors |
| `dgpu-vram16\|ram16` | **Gemma 4 12B QAT** | the flagship's ~24 GB RAM appetite (min_ram 24000; measured 21.5 GB leg peak) excludes 16 GB-RAM boxes — the resident dense rung is the honest pick | ngl 99 + mirrors |
| `dgpu-vram16\|ram32/64` | **Gemma 4 26B-A4B QAT** (the flagship) | near-resident at est ~17.7 GB — needs SOME expert offload; the honest amount is unmeasured on unowned hardware | NO placement flags — `--fit` places (see the #24350 caveat below) |
| `dgpu-vram24\|ram32/64` | **Gemma 4 26B-A4B QAT** | fully resident (est ~17.7 GB < 24 GB) — the flagship at full speed, no offload | ngl 99 / ncmoe 0 (estimator-grounded; also sidesteps #24350) |

Deliberately NOT seeded: **`dgpu-vram8|ram16`** (the most common budget build). Its pick is a
genuine quality-vs-speed call with zero measurements — 12B partially offloaded on the 8 GB card
(better prose, slower) vs E4B fully resident (faster, a quality step down). The user's word
decides; either seeds in one row.

**The #24350 caveat, stated once:** llama.cpp's `--fit` (default on) fails to create a context
when loading a `gemma4_mtp` draft (upstream, reproduced on b10107, cure `--fit off`). The
16-band flagship rows leave placement to `--fit`, so those users can hit it with MTP on — but
that exposure exists with or without the row (fit-by-omission is the default behavior for any
untuned model) and is tracked in TASKS.md; newer builds are expected to fix it (#24795 shows
the family moving). The 24-band rows' explicit ngl 99 sidesteps it there.

## The candidates (GGUF-only screen; carried baselines to beat)

| candidate | band | facts (verified 2026-07-25) | verdict |
|---|---|---|---|
| **Qwen3.6-27B (dense)** | 24+ | Apache-2.0, dense 27B, 262K ctx, **built-in MTP**; `unsloth/Qwen3.6-27B-GGUF` exists — Q4_K_M 16.8 GB / IQ4_XS 15.4 GB → fully resident on 24 GB. Marketed on coding/agentic; prose quality UNKNOWN. Called "the strongest single default" for 24 GB by the July-19-2026 MarkTechPost roundup. | **THE test candidate for the 24+ crown.** Cannot be fairly benched on the 2070S (16.8 GB → heavy offload); quality-probe-only there, or judged when a 24 GB box exists. Until tested, the flagship keeps the band. |
| **Mistral Small 3.2 (24B dense)** | 16 / 24+ | Apache-2.0 family, Q4_K_M ~14 GB; 3.1/3.2's creative output reputed strong (community, not benchmarked); ~32K-class ctx | Second test candidate. On 16 GB it's tight (14 GB + KV, no iSWA); on 24 GB it competes with better-fitting options. Test after Qwen3.6-27B if at all. |
| Mistral Small Creative (25.12) | — | **API-only, deprecated 2026-03-31** (Mistral docs) — no weights, no GGUF | **OUT** — fails cross-platform/local outright, despite being the only prose-purpose-built official model found. |
| gpt-oss-20b | 16 | MoE 21B/3.6B active, native MXFP4 ~14 GB | Noted only — reasoning/tool-use emphasis; no prose signal anywhere found. Not shortlisted. |
| DeepSeek-R1-Distill-Qwen-32B | 24+ | Q4 ~18-20 GB | OUT for this catalog — a reasoning distill, not a prose model. |
| DavidAU Qwen3.6-27B "Fable-Fusion" (uncensored heretic MTP merge) | 24+ | community mega-merge of the same base | Noted for the uncensored lane only; community-merge class (never auto-picked; the Goetia template lesson applies doubly to deep merges). |

12-band: nothing found that beats resident Gemma 4 12B QAT on the stated criteria (prose-first,
QAT/proven quant, clean license); Qwen3.5-9B exists (MTP drafts, ~5.5 GB) but sits below the
12B on quality expectations — not worth a slot while 12B fits resident.

**Sources:** [MarkTechPost 24 GB roundup (2026-07-19)](https://www.marktechpost.com/2026/07/19/best-local-llms-you-can-run-on-a-single-24gb-gpu-in-2026-qwen-gemma-mistral-deepseek-compared/) ·
[Qwen/Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B) ·
[unsloth/Qwen3.6-27B-GGUF](https://huggingface.co/unsloth/Qwen3.6-27B-GGUF) ·
[Mistral Small Creative card](https://docs.mistral.ai/models/model-cards/mistral-small-creative-25-12) ·
[llmhardware.io writing guide](https://llmhardware.io/guides/best-llm-for-writing-locally) ·
[EQ-Bench creative writing](https://eqbench.com/creative_writing.html) (JS-rendered; table not
retrievable headlessly — worth a manual look for the 27B when deciding its test).

## Open decisions (the user's)

1. **`dgpu-vram8|ram16`** — 12B-offloaded vs E4B-resident; one row either way.
2. **Qwen3.6-27B's trial** — quality-probe it slowly on the 2070S (prose judgment only, speed
   meaningless there), wait for a 24 GB box, or skip until a user reports. Until tried, the
   flagship keeps the 24+ recommendation.

## Verification

Runner suite after the seeds: 707 passed / 1 documented Windows lspci known-bad / 9 skipped.
The eight band rows + eight band class rows follow the shapes verified in recovery doc §21-22;
the refs list (the visible recommendation library) now carries 12 seeded rows and the wire-shape
test asserts membership rather than position.
