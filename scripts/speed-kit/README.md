# The portable speed kit — raw cross-machine benchmarks

Measures any Windows machine's real LLM speed (iGPU/GPU via Vulkan + CPU) with
raw llama-bench — same build, same models, same script everywhere, so numbers
compare across machines. Results are committed under
`bench-results/<machine>/kit/` (see that README).

## Setup on a new machine (no dev tools needed)

0. PREREQUISITE: Microsoft Visual C++ Redistributable x64
   (aka.ms/vs/17/release/vc_redist.x64.exe) — a missing VCRUNTIME140 dll error
   on launch means this. Vulkan itself ships inside the normal GPU driver.
1. Copy this folder (4 small files) to the machine — or copy an already-stocked
   kit folder with models included.
2. Run `download-models.ps1` — fetches the pinned Vulkan engine (b10083) + the
   two GGUFs (~21 GB, resumable via BITS; skips anything already present).
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
