# The portable speed kit — raw cross-machine benchmarks

Measures any Windows machine's real LLM speed (iGPU/GPU via Vulkan + CPU) with
raw llama-bench — same build, same models, same script everywhere, so numbers
compare across machines. Results are committed under
`bench-results/<machine>/kit/` (see that README).

## Folder layout

Only the scripts + the empty folder skeleton live in git — the models and engine
are **downloaded per machine** by `download-models.ps1`, never committed (see
`.gitignore`).

```
scripts/speed-kit/
  README.md            this file
  detect-facts.ps1     hardware facts + what Vulkan sees
  download-models.ps1  fetches the pinned engine + model set into engine/ + models/
  run-bench.ps1        the 3-phase benchmark (RAM-fit guard skips models too big for the box)
  models/              (git-ignored) the .gguf set lands here
  engine/              (git-ignored) the pinned llama.cpp Vulkan build is unzipped here
```

Outputs go to `bench-results/<machine>/kit/` in the repo (results ARE committed).

## Setup on a new machine (no dev tools needed)

0. PREREQUISITE: Microsoft Visual C++ Redistributable x64
   (aka.ms/vs/17/release/vc_redist.x64.exe) — a missing VCRUNTIME140 dll error
   on launch means this. Vulkan itself ships inside the normal GPU driver.
1. Copy this folder (4 small files) to the machine — or copy an already-stocked
   kit folder with models included.
2. Run `download-models.ps1` — fetches the pinned Vulkan engine (b10083) + the
   model set (resumable via BITS; skips anything already present):
   gemma-4 E2B QAT (~2 GB) · E4B QAT (4.2 GB) · 12B QAT (6.7 GB) ·
   26B-A4B QAT MoE (14.2 GB). run-bench auto-SKIPS any model too big for the
   machine's RAM (>70%), so one kit serves 16 GB and 32 GB boxes alike —
   the skip is printed and logged, never silent.
3. Run `detect-facts.ps1` (seconds) — hardware facts + what Vulkan sees.
4. Run `run-bench.ps1` — PHASE 1: the 16-combo matrix (models x ngl 99/0 x
   ubatch 512/2048 x flash-attn on/off; pp512/2048/8192 + tg128). PHASE 2: the
   n_cpu_moe sweep on the MoE (ngl 99 / fa 0 / ub 512; ncmoe 0..48). PHASE 3:
   a quality probe — one short generation per model on the GPU path, saved as
   `quality-probe-<model>.txt` for human eyeballing (speed numbers can look
   perfect while a broken backend writes garbage; the probe makes that visible).
   Hours on slow machines; RESUMABLE — rerun skips finished combos, failed
   combos retry, existing probes skip.
   If PowerShell blocks scripts: `powershell -ExecutionPolicy Bypass -File .\<script>`
5. Copy back `results.jsonl` + `bench-log.txt` + `quality-probe-*.txt` +
   `detect-facts.txt` into `bench-results/<machine>/kit/` and commit.
