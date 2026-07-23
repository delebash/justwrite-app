# Bench run — gpu (gpu band)

- **Run id:** `2026-07-22_03-28-55-gpu`
- **Started / finished:** 2026-07-22T03:28:55.959Z → 2026-07-22T04:33:22.851Z
- **Config:** `E:\Dev\Web\justwrite-app\scripts\bench\configs\gpu.json` — 12 leg(s) shown, 12 measured now, features: chat, characterChat, entitySweep, critique, writerAI.continue, writerAI.rewrite
- **Box:** AMD Ryzen 7 5700X 8-Core Processor              · 32 GB RAM · NVIDIA GeForce RTX 2070 SUPER 8192MB (driver 610.62)
- **Engine:** build b10079 (cuda12) · app d65e652
- **Restore:** assignments restored + verified

## Raw engine (llama-bench)

| Leg | model | pp512 | pp2048 | pp8192 | tg128 | TTFT@2k | TTFT@8k | leg peak VRAM | leg peak RAM | source |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 174.0 | 157.5 | 125.7 | 13.4 | 13.0s | 65.2s | 7899 | 21471 | fresh |
| gpu-qwen-35b | qwen3.6-35b-a3b-mtp | 90.2 | 90.5 | 239.9 | 6.9 | 22.6s | 34.2s | 7926 | 24391 | fresh |

_pp/tg in tokens/s. TTFT is derived (prompt ÷ pp), not measured. The peak columns cover the WHOLE leg (llama-bench + the feature runs), not llama-bench alone._

## Features through the app

| Leg | Feature | n | ok | TTFT (med) | wall (med) | out chars (med) | prompt/compl tok | flags | source |
|---|---|--:|--:|--:|--:|--:|---|---|---|
| gpu-gemma-26b | chat | 2 | 2/2 | 6.0s | 12.7s | 873 | 1915/212 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b | characterChat | 2 | 2/2 | 3.1s | 7.9s | 514.5 | 2565/139 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b | entitySweep | 2 | 2/2 | 14.5s | 39.4s | 4083 | —/— | — | fresh |
| gpu-gemma-26b | critique | 2 | 2/2 | — | 16.8s | 1651 | —/— | — | fresh |
| gpu-gemma-26b | writerAI.continue | 2 | 2/2 | 1.1s | 10.5s | 1156 | 636/258 | — | fresh |
| gpu-gemma-26b | writerAI.rewrite | 2 | 2/2 | 0.6s | 9.5s | 1280 | 420/315 | — | fresh |
| gpu-gemma-26b-think | chat | 2 | 2/2 | 35.9s | 41.5s | 763 | 1913/1145.5 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b-think | characterChat | 2 | 2/2 | 38.9s | 41.7s | 386 | 2563/1128.5 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b-think | entitySweep | 2 | 2/2 | 12.0s | 36.7s | 4069 | —/— | — | fresh |
| gpu-gemma-26b-think | critique | 2 | 2/2 | — | 16.6s | 1579.5 | —/— | — | fresh |
| gpu-gemma-26b-think | writerAI.continue | 2 | 2/2 | 37.4s | 45.3s | 1230 | 634/1303.5 | — | fresh |
| gpu-gemma-26b-think | writerAI.rewrite | 2 | 2/2 | 33.6s | 43.2s | 1406.5 | 418/1361 | — | fresh |
| gpu-gemma-26b-hq1 | chat | 3 | 3/3 | 0.4s | 11.5s | 1286 | 1740/296 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b-hq1-think | chat | 3 | 3/3 | 61.0s | 63.5s | 898 | 1738/1966 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b-hq2 | chat | 3 | 3/3 | 0.4s | 11.1s | 1253 | 2039/292 | temperature-fixed-by-caller | fresh |
| gpu-gemma-26b-hq2-think | chat | 3 | 3/3 | 39.3s | 46.1s | 987 | 2037/1430 | temperature-fixed-by-caller | fresh |
| gpu-qwen-35b | chat | 2 | 2/2 | 13.6s | 23.4s | 1108.5 | 1901/257.5 | temperature-fixed-by-caller | fresh |
| gpu-qwen-35b | characterChat | 2 | 2/2 | 7.0s | 10.9s | 349.5 | 2542/91.5 | temperature-fixed-by-caller | fresh |
| gpu-qwen-35b | entitySweep | 2 | 2/2 | 35.1s | 100.9s | 5555 | —/— | — | fresh |
| gpu-qwen-35b | critique | 2 | 2/2 | — | 35.1s | 2800 | —/— | — | fresh |
| gpu-qwen-35b | writerAI.continue | 2 | 2/2 | 2.3s | 19.3s | 1621.5 | 626/366.5 | — | fresh |
| gpu-qwen-35b | writerAI.rewrite | 2 | 2/2 | 1.3s | 11.7s | 1214 | 416/301 | — | fresh |
| gpu-qwen-35b-think | chat | 2 | 2/2 | 49.5s | 57.7s | 1008 | 1899/1240 | temperature-fixed-by-caller | fresh |
| gpu-qwen-35b-think | characterChat | 2 | 2/2 | 53.5s | 60.5s | 720 | 2540/1207 | temperature-fixed-by-caller | fresh |
| gpu-qwen-35b-think | entitySweep | 2 | 2/2 | 17.4s | 74.6s | 6423.5 | —/— | — | fresh |
| gpu-qwen-35b-think | critique | 2 | 2/2 | — | 25.6s | 1875.5 | —/— | — | fresh |
| gpu-qwen-35b-think | writerAI.continue | 2 | 2/2 | 48.5s | 92.5s | 4804 | 624/2109 | — | fresh |
| gpu-qwen-35b-think | writerAI.rewrite | 2 | 2/2 | 42.3s | 99.4s | 6177 | 414/2528.5 | — | fresh |
| gpu-qwen-35b-hq1 | chat | 3 | 3/3 | 0.5s | 24.1s | 2257 | 1738/503 | temperature-fixed-by-caller | fresh |
| gpu-qwen-35b-hq1-think | chat | 3 | 3/3 | 87.7s | 107.4s | 1740 | 1736/2534 | temperature-fixed-by-caller | fresh |
| gpu-qwen-35b-hq2 | chat | 3 | 3/3 | 0.5s | 22.9s | 2068 | 2038/443 | temperature-fixed-by-caller | fresh |
| gpu-qwen-35b-hq2-think | chat | 3 | 3/3 | 91.6s | 110.9s | 1857 | 2036/2680 | temperature-fixed-by-caller | fresh |

## MTP acceptance (per leg)

| Leg | model | measure tok/s | draft acceptance | drafted→accepted |
|---|---|--:|--:|--:|
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 28.6 | 66.9% | 163→109 |
| gpu-gemma-26b-think | gemma-4-26b-a4b-qat | 25.5 | 61.1% | 172→105 |
| gpu-gemma-26b-hq1 | gemma-4-26b-a4b-qat | 29.1 | 64.1% | 167→107 |
| gpu-gemma-26b-hq1-think | gemma-4-26b-a4b-qat | 26.7 | 57.3% | 178→102 |
| gpu-gemma-26b-hq2 | gemma-4-26b-a4b-qat | 25.1 | 50.3% | 189→95 |
| gpu-gemma-26b-hq2-think | gemma-4-26b-a4b-qat | 27.1 | 58.0% | 176→102 |
| gpu-qwen-35b | qwen3.6-35b-a3b-mtp | 14.4 | 76.7% | 150→115 |
| gpu-qwen-35b-think | qwen3.6-35b-a3b-mtp | 23.7 | 70.9% | 158→112 |
| gpu-qwen-35b-hq1 | qwen3.6-35b-a3b-mtp | 23.0 | 71.3% | 157→112 |
| gpu-qwen-35b-hq1-think | qwen3.6-35b-a3b-mtp | 22.7 | 68.8% | 160→110 |
| gpu-qwen-35b-hq2 | qwen3.6-35b-a3b-mtp | 23.6 | 74.0% | 154→114 |
| gpu-qwen-35b-hq2-think | qwen3.6-35b-a3b-mtp | 20.4 | 69.4% | 160→111 |

_Acceptance is one representative generation (the measure probe), not every run. Read the router log for per-request detail._

## A/B — gemma-4-26b-a4b-qat

Legs: `gpu-gemma-26b` (think off) · `gpu-gemma-26b-think` (think on)

| Feature | gpu-gemma-26b | gpu-gemma-26b-think |
|---|---:|---:|
| chat | 12.7s · 212tok | 41.5s · 1145.5tok |
| characterChat | 7.9s · 139tok | 41.7s · 1128.5tok |
| entitySweep | 39.4s · —tok | 36.7s · —tok |
| critique | 16.8s · —tok | 16.6s · —tok |
| writerAI.continue | 10.5s · 258tok | 45.3s · 1303.5tok |
| writerAI.rewrite | 9.5s · 315tok | 43.2s · 1361tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench-results/2026-07-22_03-28-55-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — gemma-4-26b-a4b-qat — chat: “Before the party ever reaches Manufactory Nine, what early signs conne…”

Legs: `gpu-gemma-26b-hq1` (think off) · `gpu-gemma-26b-hq1-think` (think on)

| Feature | gpu-gemma-26b-hq1 | gpu-gemma-26b-hq1-think |
|---|---:|---:|
| chat | 11.5s · 296tok | 63.5s · 1966tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench-results/2026-07-22_03-28-55-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — gemma-4-26b-a4b-qat — chat: “Why did the three earlier parties never come out of Manufactory Nine, …”

Legs: `gpu-gemma-26b-hq2` (think off) · `gpu-gemma-26b-hq2-think` (think on)

| Feature | gpu-gemma-26b-hq2 | gpu-gemma-26b-hq2-think |
|---|---:|---:|
| chat | 11.1s · 292tok | 46.1s · 1430tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench-results/2026-07-22_03-28-55-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — qwen3.6-35b-a3b-mtp

Legs: `gpu-qwen-35b` (think off) · `gpu-qwen-35b-think` (think on)

| Feature | gpu-qwen-35b | gpu-qwen-35b-think |
|---|---:|---:|
| chat | 23.4s · 257.5tok | 57.7s · 1240tok |
| characterChat | 10.9s · 91.5tok | 60.5s · 1207tok |
| entitySweep | 100.9s · —tok | 74.6s · —tok |
| critique | 35.1s · —tok | 25.6s · —tok |
| writerAI.continue | 19.3s · 366.5tok | 92.5s · 2109tok |
| writerAI.rewrite | 11.7s · 301tok | 99.4s · 2528.5tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench-results/2026-07-22_03-28-55-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — qwen3.6-35b-a3b-mtp — chat: “Before the party ever reaches Manufactory Nine, what early signs conne…”

Legs: `gpu-qwen-35b-hq1` (think off) · `gpu-qwen-35b-hq1-think` (think on)

| Feature | gpu-qwen-35b-hq1 | gpu-qwen-35b-hq1-think |
|---|---:|---:|
| chat | 24.1s · 503tok | 107.4s · 2534tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench-results/2026-07-22_03-28-55-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — qwen3.6-35b-a3b-mtp — chat: “Why did the three earlier parties never come out of Manufactory Nine, …”

Legs: `gpu-qwen-35b-hq2` (think off) · `gpu-qwen-35b-hq2-think` (think on)

| Feature | gpu-qwen-35b-hq2 | gpu-qwen-35b-hq2-think |
|---|---:|---:|
| chat | 22.9s · 443tok | 110.9s · 2680tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench-results/2026-07-22_03-28-55-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## Reading these numbers

- Medians, not means: single measures on this class of workload carry roughly ±10% run-to-run noise.
- `TTFT` for feature rows is time to FIRST TOKEN of the model's reply, measured client-side; it includes retrieval + prompt assembly, so it is the number a user actually waits.
- `critique` and `entitySweep` have no TTFT (they don't stream) and no token counts — their services discard the usage the server returns, so the numbers exist on the wire but not in the result object.
- `temperature-fixed-by-caller` (`chat`, `characterChat`): those two callers send their own temperature, which overrides the preset's — a leg's temperature does not reach them.
- Accuracy is NOT scored here. Read the per-feature capture files for the actual outputs.
- The **source** column says whether a row was measured in this run or recalled from an earlier one. A recalled row carries its date, and `⚠` when the engine build or the leg's own config has changed since — those comparisons are still useful, they just aren't like-for-like.
