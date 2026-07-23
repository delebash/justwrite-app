# Bench run — gpu (gpu band)

- **Run id:** `2026-07-21_06-45-46-gpu`
- **Started / finished:** 2026-07-21T06:45:46.149Z → 2026-07-21T07:03:48.168Z
- **Config:** `E:\Dev\Web\justwrite-app\scripts\bench\configs\gpu.json` — 2 leg(s) shown, 2 measured now, features: chat, characterChat, entitySweep, critique, writerAI.continue, writerAI.rewrite
- **Box:** AMD Ryzen 7 5700X 8-Core Processor              · 32 GB RAM · NVIDIA GeForce RTX 2070 SUPER 8192MB (driver 610.62)
- **Engine:** build b9993 (cuda12) · app 42cd335 ⚠ the binary self-reports **b9993** but sits in a **b10075** dir — the folder name lies; staleness uses the binary build
- **Restore:** assignments restored + verified

## Raw engine (llama-bench)

| Leg | model | pp512 | pp2048 | pp8192 | tg128 | TTFT@2k | TTFT@8k | leg peak VRAM | leg peak RAM | source |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 163.0 | 147.7 | 117.5 | 10.0 | 13.9s | 69.7s | 7846 | 21672 | fresh |

_pp/tg in tokens/s. TTFT is derived (prompt ÷ pp), not measured. The peak columns cover the WHOLE leg (llama-bench + the feature runs), not llama-bench alone._

## Features through the app

| Leg | Feature | n | ok | TTFT (med) | wall (med) | out chars (med) | prompt/compl tok | flags | source |
|---|---|--:|--:|--:|--:|--:|---|---|---|
| gpu-gemma-26b | chat | 2 | 2/2 | 3.2s | 10.8s | 877 | 1915/216 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b | characterChat | 2 | 2/2 | 3.1s | 8.2s | 544.5 | 2565/141 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b | entitySweep | 2 | 2/2 | 15.9s | 40.8s | 3867.5 | —/— | — | fresh |
| gpu-gemma-26b | critique | 2 | 2/2 | — | 18.8s | 1749 | —/— | — | fresh |
| gpu-gemma-26b | writerAI.continue | 2 | 2/2 | 1.1s | 14.2s | 1589.5 | 636/348.5 | — | fresh |
| gpu-gemma-26b | writerAI.rewrite | 2 | 2/2 | 0.7s | 10.3s | 1301 | 420/315 | — | fresh |
| gpu-gemma-26b-think | chat | 2 | 2/2 | 36.9s | 42.7s | 806 | 1913/1148 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b-think | characterChat | 2 | 2/2 | 42.8s | 47.2s | 504.5 | 2563/1159 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b-think | entitySweep | 2 | 2/2 | 15.5s | 43.2s | 4492.5 | —/— | — | fresh |
| gpu-gemma-26b-think | critique | 2 | 2/2 | — | 17.8s | 1653 | —/— | — | fresh |
| gpu-gemma-26b-think | writerAI.continue | 2 | 2/2 | 40.0s | 48.1s | 1276.5 | 634/1311.5 | — | fresh |
| gpu-gemma-26b-think | writerAI.rewrite | 2 | 2/2 | 35.8s | 45.6s | 1459 | 418/1371 | — | fresh |

## A/B — gemma-4-26b-a4b-qat

Legs: `gpu-gemma-26b` (think off) · `gpu-gemma-26b-think` (think on)

| Feature | gpu-gemma-26b | gpu-gemma-26b-think |
|---|---:|---:|
| chat | 10.8s · 216tok | 42.7s · 1148tok |
| characterChat | 8.2s · 141tok | 47.2s · 1159tok |
| entitySweep | 40.8s · —tok | 43.2s · —tok |
| critique | 18.8s · —tok | 17.8s · —tok |
| writerAI.continue | 14.2s · 348.5tok | 48.1s · 1311.5tok |
| writerAI.rewrite | 10.3s · 315tok | 45.6s · 1371tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench-results/2026-07-21_06-45-46-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## Reading these numbers

- Medians, not means: single measures on this class of workload carry roughly ±10% run-to-run noise.
- `TTFT` for feature rows is time to FIRST TOKEN of the model's reply, measured client-side; it includes retrieval + prompt assembly, so it is the number a user actually waits.
- `critique` and `entitySweep` have no TTFT (they don't stream) and no token counts — their services discard the usage the server returns, so the numbers exist on the wire but not in the result object.
- `temperature-fixed-by-caller` (`chat`, `characterChat`): those two callers send their own temperature, which overrides the preset's — a leg's temperature does not reach them.
- Accuracy is NOT scored here. Read the per-feature capture files for the actual outputs.
- The **source** column says whether a row was measured in this run or recalled from an earlier one. A recalled row carries its date, and `⚠` when the engine build or the leg's own config has changed since — those comparisons are still useful, they just aren't like-for-like.
