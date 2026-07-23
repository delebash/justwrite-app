# Laptop kit run — 2026-07-23 (Core Ultra 7 165U · 32 GB · Arc iGPU, `uma: 1`)

Full 16-combo raw llama-bench matrix (b10083 win-vulkan), ~5.7 h overnight.
**PROVENANCE: this table is parsed from the run's `results.jsonl`; the raw file
was accidentally deleted on the desktop (E:\cpu) after parsing — re-copy it from
the laptop (`Downloads\laptop-speed-kit\laptop-speed-kit\results.jsonl`, plus the
36 KB `bench-log.txt`) into this folder when convenient.**

| model | ngl | ub | fa | pp512 | pp2048 | pp8192 | tg128 | ttft8k(s) |
|---|---|---|---|---|---|---|---|---|
| gemma-4-12B QAT | 99 | 512 | 1 | 67.4 | 51.7 | 37.1 | 4.21 | 220.8 |
| gemma-4-12B QAT | 99 | 512 | 0 | 72.7 | 68.4 | 61.4 | 3.73 | 133.4 |
| gemma-4-12B QAT | 99 | 2048 | 1 | 73.2 | 54.6 | 37.9 | 4.16 | 216.1 |
| gemma-4-12B QAT | 99 | 2048 | 0 | 73.8 | 61.6 | 49.0 | 4.27 | 167.1 |
| gemma-4-12B QAT | 0 | 512 | 1 | 50.8 | 42.2 | 30.6 | 6.00 | 267.3 |
| gemma-4-12B QAT | 0 | 512 | 0 | 49.5 | 47.1 | 43.8 | 5.74 | 186.9 |
| gemma-4-12B QAT | 0 | 2048 | 1 | 51.3 | 43.3 | 31.1 | 5.98 | 263.6 |
| gemma-4-12B QAT | 0 | 2048 | 0 | 49.0 | 47.0 | 38.4 | 5.74 | 213.5 |
| gemma-4-26B-A4B QAT | 99 | 512 | 1 | 137.8 | 96.7 | 65.6 | 10.88 | 124.9 |
| gemma-4-26B-A4B QAT | 99 | 512 | 0 | 139.2 | 131.1 | 117.0 | 11.46 | 70.0 |
| gemma-4-26B-A4B QAT | 99 | 2048 | 1 | 139.4 | 110.6 | 72.0 | 11.13 | 113.8 |
| gemma-4-26B-A4B QAT | 99 | 2048 | 0 | 139.6 | 131.3 | 101.1 | 10.82 | 81.1 |
| gemma-4-26B-A4B QAT | 0 | 512 | 1 | 71.8 | 61.5 | 46.5 | 16.70 | 176.2 |
| gemma-4-26B-A4B QAT | 0 | 512 | 0 | 64.5 | 59.1 | 55.3 | 15.28 | 148.1 |
| gemma-4-26B-A4B QAT | 0 | 2048 | 1 | 73.4 | 79.4 | 55.6 | 16.70 | 147.2 |
| gemma-4-26B-A4B QAT | 0 | 2048 | 0 | 64.2 | 83.8 | 62.9 | 15.49 | 130.3 |

**Verdict (full record: recovery doc §6):** iGPU wins prefill (117 tok/s pp8192 at
ngl99/fa0/ub512 ≈ 70 s cold 8k), CPU wins decode (16.7 vs 11.5 tok/s); flash-attn
HURTS this iGPU's prefill badly; the 26B MoE is the laptop model (12B dense is
marginal); recommended single config ngl99·fa0·ub512. The ncmoe sweep (merged into
run-bench.ps1) hunts a config with both halves.

## The n_cpu_moe sweep (run-bench-2, 2026-07-23) — VERDICT: ncmoe 0 wins, offload closed

26B-A4B MoE · ngl 99 / fa 0 / ub 512 fixed · pp8192 + tg128 · b10083 (846e991ec):

| ncmoe | pp8192 t/s | tg128 t/s |
|------:|-----------:|----------:|
| **0** | **108.9** | **10.98** |
| 8 | 90.8 | 8.45 |
| 16 | 81.9 | 7.39 |
| 24 | 62.6 | 4.83 |
| 32 | 78.1 | 5.32 |
| 40 | 80.7 | 7.95 |
| 48 | 79.5 | 8.15 |

Every expert-offload step loses on BOTH axes. On a UMA one-pool box the experts
"on CPU" still share the iGPU's RAM bandwidth — the offload only swaps iGPU
compute for slower CPU compute plus sync. The dGPU n_cpu_moe technique does not
transfer to integrated graphics. The §-matrix pick stands unchanged:
**ngl 99 / fa 0 / ub 512, ncmoe 0.** Raw: `results-2.jsonl` + `bench-log-2.txt`
(+ the one-off `run-bench-2.ps1` for provenance; its sweep now lives as phase 2
of the kit's run-bench).
