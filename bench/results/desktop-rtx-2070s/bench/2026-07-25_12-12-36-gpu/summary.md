# Bench run — gpu (gpu band)

- **Run id:** `2026-07-25_12-12-36-gpu`
- **Started / finished:** 2026-07-25T12:12:36.633Z → 2026-07-25T12:18:50.822Z
- **Config:** `E:\Dev\Web\justwrite-app\bench\harness\configs\gpu.json` — 29 leg(s) shown, 2 measured now, features: chat, characterChat, entitySweep, critique, writerAI.continue, writerAI.rewrite
- **Box:** AMD Ryzen 7 5700X 8-Core Processor              · 32 GB RAM · NVIDIA GeForce RTX 2070 SUPER 8192MB (driver 610.62)
- **Engine:** build b10107 (cuda12) · app cf935df
- **Restore:** assignments restored + verified

## Raw engine (llama-bench)

| Leg | model | pp512 | pp2048 | pp8192 | tg128 | TTFT@2k | TTFT@8k | leg peak VRAM | leg peak RAM | source |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 174.0 | 157.5 | 125.7 | 13.4 | 13.0s | 65.2s | 7899 | 21471 | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b | qwen3.6-35b-a3b-mtp | 90.2 | 90.5 | 239.9 | 6.9 | 22.6s | 34.2s | 7926 | 24391 | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-uncensored-ez | gemma-4-26b-a4b-uncensored-ez | 174.8 | 157.8 | 126.5 | 10.7 | 13.0s | 64.8s | 7675 | 21890 | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b | gemma-4-31b-qat | 51.9 | 42.8 | — | 1.2 | 47.8s | — | 7675 | 25601 | stored 2026-07-25 ⚠ app 56388f0 → cf935df |

_pp/tg in tokens/s. TTFT is derived (prompt ÷ pp), not measured. The peak columns cover the WHOLE leg (llama-bench + the feature runs), not llama-bench alone._

## llama-bench legs that produced no rows

- **gpu-styletune** — no rows parsed
- **gpu-uncensored-hh** — model id "gemma-4-26b-a4b-uncensored" matches several cached repos equally (models--EZForever--gemma-4-26B-A4B-it-qat-uncensored-heretic-UDmerge-GGUF, models--HauhauCS--Gemma4-26B-A4B-QAT-Uncensored-HauhauCS-Balanced-MTP) — set "gguf" explicitly in the leg

## Features through the app

| Leg | Feature | n | ok | TTFT (med) | wall (med) | out chars (med) | prompt/compl tok | flags | source |
|---|---|--:|--:|--:|--:|--:|---|---|---|
| gpu-gemma-26b | chat | 2 | 2/2 | 6.0s | 12.7s | 873 | 1915/212 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b | characterChat | 2 | 2/2 | 3.1s | 7.9s | 514.5 | 2565/139 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b | entitySweep | 2 | 2/2 | 14.5s | 39.4s | 4083 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b | critique | 2 | 2/2 | — | 16.8s | 1651 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b | writerAI.continue | 2 | 2/2 | 1.1s | 10.5s | 1156 | 636/258 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b | writerAI.rewrite | 2 | 2/2 | 0.6s | 9.5s | 1280 | 420/315 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-think | chat | 2 | 2/2 | 35.9s | 41.5s | 763 | 1913/1145.5 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-think | characterChat | 2 | 2/2 | 38.9s | 41.7s | 386 | 2563/1128.5 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-think | entitySweep | 2 | 2/2 | 12.0s | 36.7s | 4069 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-think | critique | 2 | 2/2 | — | 16.6s | 1579.5 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-think | writerAI.continue | 2 | 2/2 | 37.4s | 45.3s | 1230 | 634/1303.5 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-think | writerAI.rewrite | 2 | 2/2 | 33.6s | 43.2s | 1406.5 | 418/1361 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-hq1 | chat | 3 | 3/3 | 0.4s | 11.5s | 1286 | 1740/296 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-hq1-think | chat | 3 | 3/3 | 61.0s | 63.5s | 898 | 1738/1966 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-hq2 | chat | 3 | 3/3 | 0.4s | 11.1s | 1253 | 2039/292 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-hq2-think | chat | 3 | 3/3 | 39.3s | 46.1s | 987 | 2037/1430 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b | chat | 2 | 2/2 | 13.6s | 23.4s | 1108.5 | 1901/257.5 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b | characterChat | 2 | 2/2 | 7.0s | 10.9s | 349.5 | 2542/91.5 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b | entitySweep | 2 | 2/2 | 35.1s | 100.9s | 5555 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b | critique | 2 | 2/2 | — | 35.1s | 2800 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b | writerAI.continue | 2 | 2/2 | 2.3s | 19.3s | 1621.5 | 626/366.5 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b | writerAI.rewrite | 2 | 2/2 | 1.3s | 11.7s | 1214 | 416/301 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-think | chat | 2 | 2/2 | 49.5s | 57.7s | 1008 | 1899/1240 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-think | characterChat | 2 | 2/2 | 53.5s | 60.5s | 720 | 2540/1207 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-think | entitySweep | 2 | 2/2 | 17.4s | 74.6s | 6423.5 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-think | critique | 2 | 2/2 | — | 25.6s | 1875.5 | —/— | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-think | writerAI.continue | 2 | 2/2 | 48.5s | 92.5s | 4804 | 624/2109 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-think | writerAI.rewrite | 2 | 2/2 | 42.3s | 99.4s | 6177 | 414/2528.5 | — | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-hq1 | chat | 3 | 3/3 | 0.5s | 24.1s | 2257 | 1738/503 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-hq1-think | chat | 3 | 3/3 | 87.7s | 107.4s | 1740 | 1736/2534 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-hq2 | chat | 3 | 3/3 | 0.5s | 22.9s | 2068 | 2038/443 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-qwen-35b-hq2-think | chat | 3 | 3/3 | 91.6s | 110.9s | 1857 | 2036/2680 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ engine b10079 → b10107; app d65e652 → cf935df |
| gpu-gemma-26b-bible | chat | 2 | 2/2 | 1.0s | 4.8s | 537.5 | 466/125.5 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-qwen-35b-bible | chat | 2 | 2/2 | 11.3s | 18.6s | 653.5 | 464/151.5 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-hh | chat | 2 | 2/2 | 9.0s | 17.3s | 851.5 | 1915/209.5 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-hh | characterChat | 2 | 2/2 | 3.9s | 10.3s | 519.5 | 2565/137.5 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-hh | entitySweep | 2 | 2/2 | 20.1s | 50.7s | 3512 | —/— | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-hh | critique | 2 | 2/2 | — | 19.9s | 1524.5 | —/— | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-hh | writerAI.continue | 2 | 2/2 | 1.4s | 13.8s | 1328 | 636/290.5 | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-hh | writerAI.rewrite | 2 | 2/2 | 0.8s | 11.3s | 1243.5 | 420/307 | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-hh-hq1 | chat | 3 | 3/3 | 0.4s | 13.3s | 1080 | 1740/262 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-hh-hq2 | chat | 3 | 3/3 | 0.4s | 14.1s | 985 | 2039/224 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-ez | chat | 2 | 2/2 | 5.9s | 12.0s | 804 | 1915/187.5 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-ez | characterChat | 2 | 2/2 | 4.4s | 9.5s | 539.5 | 2565/144 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-ez | entitySweep | 2 | 2/2 | 16.2s | 43.1s | 3713.5 | —/— | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-ez | critique | 2 | 2/2 | — | 19.6s | 1798.5 | —/— | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-ez | writerAI.continue | 2 | 2/2 | 1.4s | 12.8s | 1484 | 636/320.5 | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-ez | writerAI.rewrite | 2 | 2/2 | 0.8s | 9.4s | 1271 | 420/316.5 | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-ez-hq1 | chat | 3 | 3/3 | 0.4s | 11.1s | 1338 | 1740/305 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-uncensored-ez-hq2 | chat | 3 | 3/3 | 0.4s | 12.2s | 1320 | 2039/304 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b | chat | 2 | 2/2 | 10.6s | 114.9s | 909.5 | 1915/224.5 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b | characterChat | 2 | 2/2 | 11.3s | 98.2s | 546 | 2565/152.5 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b | entitySweep | 2 | 2/2 | 197.9s | 440.6s | 5304.5 | —/— | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b | critique | 2 | 2/2 | — | 208.6s | 1685 | —/— | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b | writerAI.continue | 2 | 2/2 | 4.2s | 183.2s | 1503 | 636/337 | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b | writerAI.rewrite | 2 | 2/2 | 2.7s | 124.4s | 1257.5 | 420/310 | — | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b-hq1 | chat | 3 | 3/3 | 1.3s | 173.8s | 1263 | 1740/298 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-gemma-31b-hq2 | chat | 3 | 3/3 | 1.2s | 112.6s | 1004 | 2039/226 | temperature-fixed-by-caller | stored 2026-07-25 ⚠ app 56388f0 → cf935df |
| gpu-refusal-stock | refusalProbe | 2 | 2/2 | 0.6s | 41.2s | 4867 | —/— | — | stored 2026-07-25 |
| gpu-refusal-hh | refusalProbe | 2 | 2/2 | 23.0s | 61.6s | 4440.5 | —/— | — | fresh |
| gpu-refusal-ez | refusalProbe | 2 | 2/2 | 4.4s | 64.1s | 4554 | —/— | — | fresh |

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
| gpu-gemma-26b-bible | gemma-4-26b-a4b-qat | 24.5 | 60.1% | 173→104 |
| gpu-qwen-35b-bible | qwen3.6-35b-a3b-mtp | 4.3 | 76.7% | 150→115 |
| gpu-styletune | gryphe-styletune-v2 | — | — (no spec) | — |
| gpu-styletune-hq1 | gryphe-styletune-v2 | — | — (no spec) | — |
| gpu-styletune-hq2 | gryphe-styletune-v2 | — | — (no spec) | — |
| gpu-uncensored-hh | gemma-4-26b-a4b-uncensored | 8.6 | 64.5% | 166→107 |
| gpu-uncensored-hh-hq1 | gemma-4-26b-a4b-uncensored | 22.1 | 58.9% | 175→103 |
| gpu-uncensored-hh-hq2 | gemma-4-26b-a4b-uncensored | 22.5 | 58.9% | 175→103 |
| gpu-uncensored-ez | gemma-4-26b-a4b-uncensored-ez | 27.3 | 60.5% | 172→104 |
| gpu-uncensored-ez-hq1 | gemma-4-26b-a4b-uncensored-ez | 25.3 | 53.0% | 185→98 |
| gpu-uncensored-ez-hq2 | gemma-4-26b-a4b-uncensored-ez | 28.6 | 60.5% | 172→104 |
| gpu-gemma-31b | gemma-4-31b-qat | 2.1 | 56.1% | 180→101 |
| gpu-gemma-31b-hq1 | gemma-4-31b-qat | 2.3 | 67.9% | 162→110 |
| gpu-gemma-31b-hq2 | gemma-4-31b-qat | 2.2 | 65.5% | 165→108 |
| gpu-refusal-stock | gemma-4-26b-a4b-qat | 26.6 | 57.6% | 177→102 |
| gpu-refusal-hh | gemma-4-26b-a4b-uncensored | 23.4 | 63.7% | 168→107 |
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

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-25_12-12-36-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — gemma-4-26b-a4b-qat — chat: “Before the party ever reaches Manufactory Nine, what early signs conne…”

Legs: `gpu-gemma-26b-hq1` (think off) · `gpu-gemma-26b-hq1-think` (think on)

| Feature | gpu-gemma-26b-hq1 | gpu-gemma-26b-hq1-think |
|---|---:|---:|
| chat | 11.5s · 296tok | 63.5s · 1966tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-25_12-12-36-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — gemma-4-26b-a4b-qat — chat: “Why did the three earlier parties never come out of Manufactory Nine, …”

Legs: `gpu-gemma-26b-hq2` (think off) · `gpu-gemma-26b-hq2-think` (think on)

| Feature | gpu-gemma-26b-hq2 | gpu-gemma-26b-hq2-think |
|---|---:|---:|
| chat | 11.1s · 292tok | 46.1s · 1430tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-25_12-12-36-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

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

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-25_12-12-36-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — qwen3.6-35b-a3b-mtp — chat: “Before the party ever reaches Manufactory Nine, what early signs conne…”

Legs: `gpu-qwen-35b-hq1` (think off) · `gpu-qwen-35b-hq1-think` (think on)

| Feature | gpu-qwen-35b-hq1 | gpu-qwen-35b-hq1-think |
|---|---:|---:|
| chat | 24.1s · 503tok | 107.4s · 2534tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-25_12-12-36-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

## A/B — qwen3.6-35b-a3b-mtp — chat: “Why did the three earlier parties never come out of Manufactory Nine, …”

Legs: `gpu-qwen-35b-hq2` (think off) · `gpu-qwen-35b-hq2-think` (think on)

| Feature | gpu-qwen-35b-hq2 | gpu-qwen-35b-hq2-think |
|---|---:|---:|
| chat | 22.9s · 443tok | 110.9s · 2680tok |

_Cells: wall (median) · completion tokens. The numbers show the COST of the difference (e.g. thinking); QUALITY is judged by reading the captures side by side — `bench/results/2026-07-25_12-12-36-gpu/<NN>-<legId>/<feature>-<n>.json` for each leg._

### Recalled legs missing data for current features

- **gpu-styletune** — no data for: chat, characterChat, entitySweep, critique, writerAI.continue, writerAI.rewrite (measured before these joined the band, or those runs recorded nothing)
- **gpu-styletune-hq1** — no data for: chat (measured before these joined the band, or those runs recorded nothing)
- **gpu-styletune-hq2** — no data for: chat (measured before these joined the band, or those runs recorded nothing)

## Legs whose model never loaded

- **gpu-styletune** (gryphe-styletune-v2) — model 'gryphe-styletune-v2' failed to load (status=failed) with an unfixable error — not retrying, since a retry would restart the engine and disrupt other loaded models. If this is the MTP draft (an unsupported/unknown draft architecture), turn MTP off for this model or set a draft the built-in engine can load. Details: 3af6bef1151c2116ec838ec2c7e62\gemma-4-26B-A4B-it-assistant-Q8_0.gguf'

[57762] 0.54.528.331 I srv    operator(): operator(): cleaning up before exit...

[57762] 0.55.117.435 E srv  llama_server: exiting due to model loading error

[57760] 0.58.898.972 W resolve_fused_ops: layer 0 is assigned to device CPU but fused Gated Delta Net (chunked) is assigned to device CUDA0 (usually due to missing support)

[57760] 0.58.898.984 W resolve_fused_ops: fused Gated Delta Net (chunked) not supported, set to disabled

1.02.076.270 I srv    operator(): instance name=gryphe-styletune-v2 exited with status 1

- **gpu-styletune-hq1** (gryphe-styletune-v2) — model 'gryphe-styletune-v2' failed to load (status=failed) with an unfixable error — not retrying, since a retry would restart the engine and disrupt other loaded models. If this is the MTP draft (an unsupported/unknown draft architecture), turn MTP off for this model or set a draft the built-in engine can load. Details: ef1151c2116ec838ec2c7e62\gemma-4-26B-A4B-it-assistant-Q8_0.gguf'

[57851] 0.21.782.260 E srv    load_model: failed to load draft model, 'E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\hf\models--Radamanthys11--Gemma-4-26B-A4B-it-assistant-GGUF\snapshots\85ba72109653af6bef1151c2116ec838ec2c7e62\gemma-4-26B-A4B-it-assistant-Q8_0.gguf'

[57851] 0.21.782.277 I srv    operator(): operator(): cleaning up before exit...

[57851] 0.21.783.398 E srv  llama_server: exiting due to model loading error

1.29.259.737 I srv    operator(): instance name=gryphe-styletune-v2 exited with status 1

- **gpu-styletune-hq2** (gryphe-styletune-v2) — model 'gryphe-styletune-v2' failed to load (status=failed) with an unfixable error — not retrying, since a retry would restart the engine and disrupt other loaded models. If this is the MTP draft (an unsupported/unknown draft architecture), turn MTP off for this model or set a draft the built-in engine can load. Details: ef1151c2116ec838ec2c7e62\gemma-4-26B-A4B-it-assistant-Q8_0.gguf'

[56204] 0.18.936.301 E srv    load_model: failed to load draft model, 'E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\hf\models--Radamanthys11--Gemma-4-26B-A4B-it-assistant-GGUF\snapshots\85ba72109653af6bef1151c2116ec838ec2c7e62\gemma-4-26B-A4B-it-assistant-Q8_0.gguf'

[56204] 0.18.936.321 I srv    operator(): operator(): cleaning up before exit...

[56204] 0.18.937.318 E srv  llama_server: exiting due to model loading error

1.54.096.088 I srv    operator(): instance name=gryphe-styletune-v2 exited with status 1


## Reading these numbers

- Medians, not means: single measures on this class of workload carry roughly ±10% run-to-run noise.
- `TTFT` for feature rows is time to FIRST TOKEN of the model's reply, measured client-side; it includes retrieval + prompt assembly, so it is the number a user actually waits.
- `critique` and `entitySweep` have no TTFT (they don't stream) and no token counts — their services discard the usage the server returns, so the numbers exist on the wire but not in the result object.
- `temperature-fixed-by-caller` (`chat`, `characterChat`): those two callers send their own temperature, which overrides the preset's — a leg's temperature does not reach them.
- Accuracy is NOT scored here. Read the per-feature capture files for the actual outputs.
- The **source** column says whether a row was measured in this run or recalled from an earlier one. A recalled row carries its date, and `⚠` when the engine build or the leg's own config has changed since — those comparisons are still useful, they just aren't like-for-like.
