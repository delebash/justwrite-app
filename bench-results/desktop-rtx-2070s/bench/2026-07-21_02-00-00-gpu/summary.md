# Bench run — gpu (gpu band)

- **Run id:** `2026-07-21_02-00-00-gpu`
- **Started / finished:** 2026-07-21T02:00:00.349Z → 2026-07-21T02:09:27.643Z
- **Config:** `E:\Dev\Web\justwrite-app\scripts\bench\configs\gpu.json` — 1 leg(s) shown, 1 measured now, features: chat, characterChat, entitySweep, critique, writerAI.continue, writerAI.rewrite
- **Box:** AMD Ryzen 7 5700X 8-Core Processor              · 32 GB RAM · NVIDIA GeForce RTX 2070 SUPER 8192MB (driver 610.62)
- **Engine:** build b10069 (cuda12) · app 0aa8f2f
- **Restore:** assignments restored + verified

## Raw engine (llama-bench)

| Leg | model | pp512 | pp2048 | pp8192 | tg128 | TTFT@2k | TTFT@8k | leg peak VRAM | leg peak RAM | source |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 168.5 | 149.8 | 117.1 | 11.5 | 13.7s | 69.9s | 7872 | 21066 | fresh |

_pp/tg in tokens/s. TTFT is derived (prompt ÷ pp), not measured. The peak columns cover the WHOLE leg (llama-bench + the feature runs), not llama-bench alone._

## Features through the app

| Leg | Feature | n | ok | TTFT (med) | wall (med) | out chars (med) | prompt/compl tok | flags | source |
|---|---|--:|--:|--:|--:|--:|---|---|---|
| gpu-gemma-26b | chat | 2 | 2/2 | 6.1s | 14.8s | 858.5 | 1915/207.5 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b | characterChat | 2 | 2/2 | 3.3s | 8.3s | 393 | 2565/107 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b | entitySweep | 2 | 2/2 | 15.8s | 44.1s | 4105 | —/— | — | fresh |
| gpu-gemma-26b | critique | 2 | 2/2 | — | 19.5s | 1754 | —/— | — | fresh |
| gpu-gemma-26b | writerAI.continue | 2 | 2/2 | 1.1s | 14.3s | 1611 | 636/350 | — | fresh |
| gpu-gemma-26b | writerAI.rewrite | 2 | 2/2 | 0.6s | 9.6s | 1217 | 420/306 | — | fresh |

## Reading these numbers

- Medians, not means: single measures on this class of workload carry roughly ±10% run-to-run noise.
- `TTFT` for feature rows is time to FIRST TOKEN of the model's reply, measured client-side; it includes retrieval + prompt assembly, so it is the number a user actually waits.
- `critique` and `entitySweep` have no TTFT (they don't stream) and no token counts — their services discard the usage the server returns, so the numbers exist on the wire but not in the result object.
- `temperature-fixed-by-caller` (`chat`, `characterChat`): those two callers send their own temperature, which overrides the preset's — a leg's temperature does not reach them.
- Accuracy is NOT scored here. Read the per-feature capture files for the actual outputs.
- The **source** column says whether a row was measured in this run or recalled from an earlier one. A recalled row carries its date, and `⚠` when the engine build or the leg's own config has changed since — those comparisons are still useful, they just aren't like-for-like.
