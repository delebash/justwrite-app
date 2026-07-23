# The portable speed kit — raw cross-machine benchmarks

Measures any Windows machine's real LLM speed (iGPU/GPU via Vulkan + CPU) with
raw llama-bench — same build, same models, same script everywhere, so numbers
compare across machines. Results are committed under
`bench-results/<machine>/kit/` (see that README).

## Run it (any Windows machine, no dev tools needed)

0. PREREQUISITE: Microsoft Visual C++ Redistributable x64
   (aka.ms/vs/17/release/vc_redist.x64.exe) — a missing VCRUNTIME140 dll error
   on launch means this. Vulkan itself ships inside the normal GPU driver.
1. Copy this folder to the machine.
2. **Double-click `run.bat`.** It detects the machine, prints the PLAN — RAM +
   GPU, the engine build, every model with its size and have/download/SKIP
   status, total download vs free disk, and the three tests — then asks
   `Proceed? [Y/n/s]` before a byte is downloaded (detection proposes, never
   dictates). `s` picks a subset of tests. Then it downloads what fits, runs
   detect-facts, and benches. Hours on slow machines; fully RESUMABLE — rerun
   skips finished combos, failed combos retry, existing probes skip.
3. Send back `results.jsonl` + `bench-log.txt` + `quality-probe-*.txt` +
   `detect-facts.txt` → they get committed to `bench-results/<machine>/kit/`.

Flags (pass to `run.bat` or `run.ps1`): `-PlanOnly` print the plan and stop ·
`-Yes` no prompt (unattended) · `-RamGB 16` override detected RAM (bad detection,
or dry-running another machine's fit) · `-Build b10xxx` deliberate engine re-test.

## The tests

- **[1] 16-combo matrix** — models × ngl 99/0 × ubatch 512/2048 × flash-attn
  on/off; pp512/2048/8192 + tg128 per combo.
- **[2] n_cpu_moe sweep** — MoE model only (auto-skips if none fits): experts to
  CPU, attention on GPU; ncmoe 0..48 at the known-good iGPU shape.
- **[3] quality probe** — one short generation per model on the GPU path, saved
  as `quality-probe-<model>.txt` for human eyeballing (speed numbers can look
  perfect while a broken backend writes garbage; the probe makes that visible).

## Rules the kit enforces (so numbers stay honest)

- **RAM-fit** (`kit-common.ps1` `$KitFitFactor`, one place): a model over
  0.7 × RAM is skipped LOUDLY at download AND at bench — never downloaded just
  to thrash, never silently missing.
- **Pinned engine** (`kit-common.ps1` `$KitBuild`, one place): cross-machine
  comparison needs the build as a controlled variable (llama.cpp lands several
  builds a day and Vulkan perf moves between them). Every results row
  self-labels with `build_commit`/`build_number`, so a deliberate `-Build`
  re-test stays readable in history. Bump the pin = edit one line.
- **No corrupt downloads**: files land as `.part`, are size-checked against the
  server's answer, then renamed — a failed download can never masquerade as a
  complete model on the next run.
- **Everything logged**: downloads, skips, failures, every bench combo → one
  timestamped `bench-log.txt` (the file you send back). Failures are loud and
  the kit stops before benching on a broken download.

## Folder layout

Only the scripts + the empty folder skeleton live in git — the models and engine
are **downloaded per machine** by `download-models.ps1`, never committed (see
`.gitignore`).

```
scripts/speed-kit/
  README.md            this file
  run.bat              DOUBLE-CLICK THIS — launcher for run.ps1
  run.ps1              the one click: detect → PLAN → confirm → download → bench
  kit-common.ps1       ONE source: engine pin, model list, fit rule, log helper
  download-models.ps1  fit-filtered fetch of engine + models (standalone-safe)
  detect-facts.ps1     hardware facts + what Vulkan sees
  run-bench.ps1        the 3-phase benchmark (standalone-safe; -Phases subset)
  models/              (git-ignored) the .gguf set lands here
  engine/<build>/      (git-ignored) the pinned llama.cpp Vulkan build, per-build dir
```

If PowerShell blocks scripts run by hand: `powershell -ExecutionPolicy Bypass -File .\<script>`
(`run.bat` already does this for you). Mac/Linux `.sh` runners are deliberately
NOT here yet — Windows first (the user's sequencing ruling, 2026-07-22); the port
is mechanical when its turn comes (llama.cpp ships ubuntu-vulkan + macos-arm64
assets; every kit fact lives in kit-common.ps1).
