# Bench run — cpu (cpu band)

- **Run id:** `2026-07-22_14-04-05-cpu`
- **Started / finished:** 2026-07-22T14:04:05.763Z → 2026-07-22T14:46:48.970Z
- **Config:** `E:\Dev\Web\justwrite-app\scripts\bench\configs\cpu.json` — 5 leg(s) shown, 2 measured now, features: chat, characterChat, critique, writerAI.continue, writerAI.rewrite
- **Box:** AMD Ryzen 7 5700X 8-Core Processor              · 32 GB RAM · NVIDIA GeForce RTX 2070 SUPER 8192MB (driver 610.62)
- **Engine:** build b10083 (cpu) · app 836e8bf
- **Restore:** assignments restored + verified

## Raw engine (llama-bench)

| Leg | model | pp512 | pp2048 | pp8192 | tg128 | TTFT@2k | TTFT@8k | leg peak VRAM | leg peak RAM | source |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 174.0 | 157.5 | 125.7 | 13.4 | 13.0s | 65.2s | 7899 | 21471 | baseline 2026-07-22 ⚠ engine b10079 → b10083; app d65e652 → 836e8bf |

_pp/tg in tokens/s. TTFT is derived (prompt ÷ pp), not measured. The peak columns cover the WHOLE leg (llama-bench + the feature runs), not llama-bench alone._

## llama-bench legs that produced no rows

- **cpu-gemma-26b** — Command failed: E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\llamacpp\b10083\cpu\llama-bench.exe -m E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\hf\models--unsloth--gemma-4-26B-A4B-it-qat-GGUF\snapshots\7b92b5b28818151e8669af2e45e88d6086f490dd\gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf -p 512,2048,8192 -n 128 -r 2 -ngl 0 -t 8 -c 8192
load_backend: loaded RPC backend f
- **cpu-gemma-12b** — Command failed: E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\llamacpp\b10083\cpu\llama-bench.exe -m E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\hf\models--unsloth--gemma-4-12B-it-qat-GGUF\snapshots\980b060c40a8539ac159e0501a3e0f66a6365af3\gemma-4-12B-it-qat-UD-Q4_K_XL.gguf -p 512,2048,8192 -n 128 -r 2 -ngl 0 -t 8 -c 8192
load_backend: loaded RPC backend from E:\D
- **cpu-bonsai-27b** — Command failed: E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\llamacpp\b10083\cpu\llama-bench.exe -m E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\hf\models--prism-ml--Ternary-Bonsai-27B-gguf\snapshots\abbae723028d71be674e71e1a71201a6f43fab22\Ternary-Bonsai-27B-Q2_g64.gguf -p 512,2048,8192 -n 128 -r 2 -ngl 0 -t 8 -c 8192
load_backend: loaded RPC backend from E:\Dev\
- **cpu-qwen-35b** — Command failed: E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\llamacpp\b10083\cpu\llama-bench.exe -m E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache\hf\models--unsloth--Qwen3.6-35B-A3B-MTP-GGUF\snapshots\5bc3e238d916f48a861bac2f8a1990a0e9b7e98d\Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf -p 512,2048,8192 -n 128 -r 2 -ngl 0 -t 8 -c 8192
load_backend: loaded RPC backend from E:\Dev

## Features through the app

| Leg | Feature | n | ok | TTFT (med) | wall (med) | out chars (med) | prompt/compl tok | flags | source |
|---|---|--:|--:|--:|--:|--:|---|---|---|
| cpu-gemma-26b | chat | 2 | 2/2 | 26.9s | 45.5s | 795.5 | 1915/189.5 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-26b | characterChat | 2 | 2/2 | 28.3s | 42.2s | 487 | 2565/127 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-26b | critique | 2 | 2/2 | — | 74.5s | 1807.5 | —/— | — | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-26b | writerAI.continue | 2 | 2/2 | 5.7s | 39.7s | 1415 | 636/307 | — | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-26b | writerAI.rewrite | 2 | 2/2 | 3.2s | 27.4s | 1255.5 | 420/311.5 | — | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-12b | chat | 2 | 2/2 | 48.5s | 87.0s | 815.5 | 1915/202 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-12b | characterChat | 2 | 2/2 | 65.6s | 104.6s | 667.5 | 2565/175 | temperature-fixed-by-caller | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-12b | critique | 2 | 2/2 | — | 157.9s | 1867.5 | —/— | — | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-12b | writerAI.continue | 2 | 2/2 | 14.3s | 89.0s | 1496 | 636/330.5 | — | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-gemma-12b | writerAI.rewrite | 2 | 2/2 | 8.0s | 59.7s | 1251 | 420/310 | — | stored 2026-07-22 ⚠ app d65e652 → 836e8bf |
| cpu-bonsai-27b | chat | 2 | 0/2 | — | — | — | —/— | timeout, error | fresh |
| cpu-bonsai-27b | characterChat | 2 | 0/2 | — | — | — | —/— | error | fresh |
| cpu-bonsai-27b | critique | 2 | 0/2 | — | — | — | —/— | error | fresh |
| cpu-bonsai-27b | writerAI.continue | 2 | 0/2 | — | — | — | —/— | error | fresh |
| cpu-bonsai-27b | writerAI.rewrite | 2 | 0/2 | — | — | — | —/— | error | fresh |
| cpu-qwen-35b | chat | 2 | 2/2 | 33.6s | 68.0s | 1174.5 | 1901/271 | temperature-fixed-by-caller | fresh |
| cpu-qwen-35b | characterChat | 2 | 2/2 | 29.0s | 43.9s | 403.5 | 2542/101.5 | temperature-fixed-by-caller | fresh |
| cpu-qwen-35b | critique | 2 | 2/2 | — | 107.7s | 2573.5 | —/— | — | fresh |
| cpu-qwen-35b | writerAI.continue | 2 | 2/2 | 6.1s | 53.6s | 1606 | 626/352 | — | fresh |
| cpu-qwen-35b | writerAI.rewrite | 2 | 2/2 | 3.3s | 33.1s | 1215 | 416/299 | — | fresh |
| gpu-gemma-26b | chat | 2 | 2/2 | 6.0s | 12.7s | 873 | 1915/212 | temperature-fixed-by-caller | baseline 2026-07-22 ⚠ engine b10079 → b10083; app d65e652 → 836e8bf |
| gpu-gemma-26b | characterChat | 2 | 2/2 | 3.1s | 7.9s | 514.5 | 2565/139 | temperature-fixed-by-caller | baseline 2026-07-22 ⚠ engine b10079 → b10083; app d65e652 → 836e8bf |
| gpu-gemma-26b | entitySweep | 2 | 2/2 | 14.5s | 39.4s | 4083 | —/— | — | baseline 2026-07-22 ⚠ engine b10079 → b10083; app d65e652 → 836e8bf |
| gpu-gemma-26b | critique | 2 | 2/2 | — | 16.8s | 1651 | —/— | — | baseline 2026-07-22 ⚠ engine b10079 → b10083; app d65e652 → 836e8bf |
| gpu-gemma-26b | writerAI.continue | 2 | 2/2 | 1.1s | 10.5s | 1156 | 636/258 | — | baseline 2026-07-22 ⚠ engine b10079 → b10083; app d65e652 → 836e8bf |
| gpu-gemma-26b | writerAI.rewrite | 2 | 2/2 | 0.6s | 9.5s | 1280 | 420/315 | — | baseline 2026-07-22 ⚠ engine b10079 → b10083; app d65e652 → 836e8bf |

## MTP acceptance (per leg)

| Leg | model | measure tok/s | draft acceptance | drafted→accepted |
|---|---|--:|--:|--:|
| cpu-gemma-26b | gemma-4-26b-a4b-qat | 9.4 | 53.0% | 185→98 |
| cpu-gemma-12b | gemma-4-12b-qat | 5.4 | 58.9% | 175→103 |
| cpu-bonsai-27b | ternary-bonsai-27b-q2-g64 | — | — (no spec) | — |
| cpu-qwen-35b | qwen3.6-35b-a3b-mtp | 6.8 | 72.9% | 155→113 |
| gpu-gemma-26b | gemma-4-26b-a4b-qat | 28.6 | 66.9% | 163→109 |

_Acceptance is one representative generation (the measure probe), not every run. Read the router log for per-request detail._

## Failures

- **cpu-bonsai-27b · chat** (timeout) — BodyStreamBuffer was aborted
- **cpu-bonsai-27b · chat** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.
- **cpu-bonsai-27b · characterChat** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.
- **cpu-bonsai-27b · characterChat** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.
- **cpu-bonsai-27b · critique** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.
- **cpu-bonsai-27b · critique** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.
- **cpu-bonsai-27b · writerAI.continue** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.
- **cpu-bonsai-27b · writerAI.continue** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.
- **cpu-bonsai-27b · writerAI.rewrite** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.
- **cpu-bonsai-27b · writerAI.rewrite** (error) — Couldn't reach the LLM — Timed out — local models often need to load before the first call.

## Reading these numbers

- Medians, not means: single measures on this class of workload carry roughly ±10% run-to-run noise.
- `TTFT` for feature rows is time to FIRST TOKEN of the model's reply, measured client-side; it includes retrieval + prompt assembly, so it is the number a user actually waits.
- `critique` and `entitySweep` have no TTFT (they don't stream) and no token counts — their services discard the usage the server returns, so the numbers exist on the wire but not in the result object.
- `temperature-fixed-by-caller` (`chat`, `characterChat`): those two callers send their own temperature, which overrides the preset's — a leg's temperature does not reach them.
- Accuracy is NOT scored here. Read the per-feature capture files for the actual outputs.
- The **source** column says whether a row was measured in this run or recalled from an earlier one. A recalled row carries its date, and `⚠` when the engine build or the leg's own config has changed since — those comparisons are still useful, they just aren't like-for-like.
