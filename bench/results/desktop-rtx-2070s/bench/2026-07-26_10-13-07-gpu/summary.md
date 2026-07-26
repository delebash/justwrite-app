# Bench run — gpu (gpu band)

- **Run id:** `2026-07-26_10-13-07-gpu`
- **Started / finished:** 2026-07-26T10:13:07.481Z → 2026-07-26T11:15:56.947Z
- **Config:** `E:\Dev\Web\justwrite-app\bench\harness\configs\gpu.json` — 18 leg(s) shown, 3 measured now, features: chat, characterChat, entitySweep, critique, writerAI.continue, writerAI.rewrite
- **Box:** AMD Ryzen 7 5700X 8-Core Processor              · 32 GB RAM · NVIDIA GeForce RTX 2070 SUPER 8192MB (driver 610.62)
- **Engine:** build b10107 (cuda12) · app dc43be6
- **Restore:** assignments restored + verified

## Raw engine (llama-bench)

| Leg | model | pp512 | pp2048 | pp8192 | tg128 | TTFT@2k | TTFT@8k | leg peak VRAM | leg peak RAM | source |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 174.0 | 157.5 | 125.7 | 13.4 | 13.0s | 65.2s | 7899 | 21471 | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-styletune | gryphe-styletune-v2 | 190.4 | 172.7 | 136.9 | 9.2 | 11.9s | 59.8s | 7797 | 23793 | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-uncensored-ez | gemma-4-26b-a4b-uncensored-ez | 174.2 | 157.7 | 134.7 | 11.9 | 13.0s | 60.8s | 7742 | 21626 | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-gemma-31b | gemma-4-31b-qat | 60.1 | 48.8 | — | 1.2 | 42.0s | — | 7773 | 24612 | fresh |

_pp/tg in tokens/s. TTFT is derived (prompt ÷ pp), not measured. The peak columns cover the WHOLE leg (llama-bench + the feature runs), not llama-bench alone._

## Legs with no result yet

- **gpu-refusal-stock** (gemma-4-26b-a4b-qat) — never measured. Run: `npm run bench:gpu -- --legs gpu-refusal-stock`

## Features through the app

| Leg | Feature | n | ok | TTFT (med) | wall (med) | out chars (med) | prompt/compl tok | flags | source |
|---|---|--:|--:|--:|--:|--:|---|---|---|
| gpu-gemma-26b | chat | 2 | 2/2 | 6.0s | 12.7s | 873 | 1915/212 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b | characterChat | 2 | 2/2 | 3.1s | 7.9s | 514.5 | 2565/139 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b | entitySweep | 2 | 2/2 | 14.5s | 39.4s | 4083 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b | critique | 2 | 2/2 | — | 16.8s | 1651 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b | writerAI.continue | 2 | 2/2 | 1.1s | 10.5s | 1156 | 636/258 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b | writerAI.rewrite | 2 | 2/2 | 0.6s | 9.5s | 1280 | 420/315 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-think | chat | 2 | 2/2 | 35.9s | 41.5s | 763 | 1913/1145.5 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-think | characterChat | 2 | 2/2 | 38.9s | 41.7s | 386 | 2563/1128.5 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-think | entitySweep | 2 | 2/2 | 12.0s | 36.7s | 4069 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-think | critique | 2 | 2/2 | — | 16.6s | 1579.5 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-think | writerAI.continue | 2 | 2/2 | 37.4s | 45.3s | 1230 | 634/1303.5 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-think | writerAI.rewrite | 2 | 2/2 | 33.6s | 43.2s | 1406.5 | 418/1361 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-hq1 | chat | 3 | 3/3 | 0.4s | 11.5s | 1286 | 1740/296 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-hq1-think | chat | 3 | 3/3 | 61.0s | 63.5s | 898 | 1738/1966 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-hq2 | chat | 3 | 3/3 | 0.4s | 11.1s | 1253 | 2039/292 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-hq2-think | chat | 3 | 3/3 | 39.3s | 46.1s | 987 | 2037/1430 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → dc43be6 |
| gpu-gemma-26b-bible | chat | 2 | 2/2 | 1.3s | 5.6s | 545.5 | 466/130.5 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-styletune | chat | 2 | 2/2 | 3.4s | 12.6s | 828.5 | 1915/198.5 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-styletune | characterChat | 2 | 2/2 | 3.3s | 9.4s | 511.5 | 2565/130.5 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-styletune | entitySweep | 2 | 2/2 | 27.5s | 68.1s | 4663.5 | —/— | — | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-styletune | critique | 2 | 2/2 | — | 26.1s | 1811.5 | —/— | — | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-styletune | writerAI.continue | 2 | 2/2 | 1.2s | 13.4s | 1229.5 | 636/257.5 | — | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-styletune | writerAI.rewrite | 2 | 2/2 | 0.7s | 15.9s | 1346.5 | 420/318.5 | — | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-styletune-hq1 | chat | 3 | 3/3 | 0.4s | 15.6s | 1052 | 1740/241 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-styletune-hq2 | chat | 3 | 3/3 | 0.4s | 16.1s | 1426 | 2039/306 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-uncensored-ez | chat | 2 | 2/2 | 2.5s | 8.7s | 792 | 1915/190 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-uncensored-ez | characterChat | 2 | 2/2 | 3.1s | 6.9s | 380.5 | 2565/102 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-uncensored-ez | entitySweep | 2 | 2/2 | 14.2s | 41.3s | 4533.5 | —/— | — | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-uncensored-ez | critique | 2 | 2/2 | — | 18.9s | 1943.5 | —/— | — | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-uncensored-ez | writerAI.continue | 2 | 2/2 | 1.1s | 12.0s | 1286 | 636/284.5 | — | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-uncensored-ez | writerAI.rewrite | 2 | 2/2 | 0.7s | 10.2s | 1336.5 | 420/324 | — | stored 2026-07-26 ⚠ app cb7a453 → dc43be6 |
| gpu-uncensored-ez-hq1 | chat | 3 | 3/3 | 0.3s | 10.7s | 1198 | 1740/282 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app f83ff14 → dc43be6 |
| gpu-uncensored-ez-hq2 | chat | 3 | 3/3 | 0.4s | 11.2s | 1263 | 2039/295 | temperature-fixed-by-caller | stored 2026-07-26 ⚠ app f83ff14 → dc43be6 |
| gpu-gemma-31b | chat | 2 | 2/2 | 14.1s | 121.0s | 900.5 | 1915/225.5 | temperature-fixed-by-caller | fresh |
| gpu-gemma-31b | characterChat | 2 | 2/2 | 9.3s | 106.6s | 614 | 2565/168 | temperature-fixed-by-caller | fresh |
| gpu-gemma-31b | entitySweep | 2 | 2/2 | 125.8s | 358.8s | 3716.5 | —/— | — | fresh |
| gpu-gemma-31b | critique | 2 | 2/2 | — | 208.9s | 1558.5 | —/— | — | fresh |
| gpu-gemma-31b | writerAI.continue | 2 | 2/2 | 4.4s | 191.7s | 1569 | 636/345 | — | fresh |
| gpu-gemma-31b | writerAI.rewrite | 2 | 2/2 | 3.0s | 130.3s | 1250.5 | 420/308.5 | — | fresh |
| gpu-gemma-31b-hq1 | chat | 3 | 3/3 | 1.1s | 154.7s | 1285 | 1740/304 | temperature-fixed-by-caller | fresh |
| gpu-gemma-31b-hq2 | chat | 3 | 3/3 | 1.1s | 103.2s | 930 | 2039/199 | temperature-fixed-by-caller | fresh |
| gpu-refusal-ez | refusalProbe | 2 | 2/2 | 4.4s | 64.1s | 4554 | —/— | — | stored 2026-07-25 ⚠ app cf935df → dc43be6 |

## MTP acceptance (per leg)

| Leg | model | measure tok/s | draft acceptance | drafted→accepted |
|---|---|--:|--:|--:|
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 28.6 | 66.9% | 163→109 |
| gpu-gemma-26b-think | gemma-4-26b-a4b-qat | 25.5 | 61.1% | 172→105 |
| gpu-gemma-26b-hq1 | gemma-4-26b-a4b-qat | 29.1 | 64.1% | 167→107 |
| gpu-gemma-26b-hq1-think | gemma-4-26b-a4b-qat | 26.7 | 57.3% | 178→102 |
| gpu-gemma-26b-hq2 | gemma-4-26b-a4b-qat | 25.1 | 50.3% | 189→95 |
| gpu-gemma-26b-hq2-think | gemma-4-26b-a4b-qat | 27.1 | 58.0% | 176→102 |
| gpu-gemma-26b-bible | gemma-4-26b-a4b-qat | 24.4 | 54.1% | 183→99 |
| gpu-styletune | gryphe-styletune-v2 | 18.5 | — (no spec) | — |
| gpu-styletune-hq1 | gryphe-styletune-v2 | 20.0 | — (no spec) | — |
| gpu-styletune-hq2 | gryphe-styletune-v2 | 19.6 | — (no spec) | — |
| gpu-uncensored-ez | gemma-4-26b-a4b-uncensored-ez | 26.4 | 63.1% | 168→106 |
| gpu-uncensored-ez-hq1 | gemma-4-26b-a4b-uncensored-ez | 27.1 | 55.3% | 181→100 |
| gpu-uncensored-ez-hq2 | gemma-4-26b-a4b-uncensored-ez | 24.1 | 49.0% | 192→94 |
| gpu-gemma-31b | gemma-4-31b-qat | 2.1 | 65.5% | 165→108 |
| gpu-gemma-31b-hq1 | gemma-4-31b-qat | 2.1 | 60.1% | 173→104 |
| gpu-gemma-31b-hq2 | gemma-4-31b-qat | 2.1 | 60.5% | 172→104 |
| gpu-refusal-ez | gemma-4-26b-a4b-uncensored-ez | 10.4 | 53.8% | 184→99 |

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

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-26_10-13-07-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — gemma-4-26b-a4b-qat — chat: “Before the party ever reaches Manufactory Nine, what early signs conne…”

Legs: `gpu-gemma-26b-hq1` (think off) · `gpu-gemma-26b-hq1-think` (think on)

| Feature | gpu-gemma-26b-hq1 | gpu-gemma-26b-hq1-think |
|---|---:|---:|
| chat | 11.5s · 296tok | 63.5s · 1966tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-26_10-13-07-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — gemma-4-26b-a4b-qat — chat: “Why did the three earlier parties never come out of Manufactory Nine, …”

Legs: `gpu-gemma-26b-hq2` (think off) · `gpu-gemma-26b-hq2-think` (think on)

| Feature | gpu-gemma-26b-hq2 | gpu-gemma-26b-hq2-think |
|---|---:|---:|
| chat | 11.1s · 292tok | 46.1s · 1430tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-26_10-13-07-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## Reading these numbers

- Medians, not means: single measures on this class of workload carry roughly ±10% run-to-run noise.
- `TTFT` for feature rows is time to FIRST TOKEN of the model's reply, measured client-side; it includes retrieval + prompt assembly, so it is the number a user actually waits.
- `critique` and `entitySweep` have no TTFT (they don't stream) and no token counts — their services discard the usage the server returns, so the numbers exist on the wire but not in the result object.
- `temperature-fixed-by-caller` (`chat`, `characterChat`): those two callers send their own temperature, which overrides the preset's — a leg's temperature does not reach them.
- Accuracy is NOT scored here. Read the per-feature capture files for the actual outputs.
- The **source** column says whether a row was measured in this run or recalled from an earlier one. A recalled row carries its date, and `⚠` when the engine build or the leg's own config has changed since — those comparisons are still useful, they just aren't like-for-like.
