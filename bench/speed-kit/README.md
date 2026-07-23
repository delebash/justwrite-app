# The portable speed kit — raw cross-machine benchmarks

Measures any Windows machine's real LLM speed (iGPU/GPU via Vulkan + CPU) with
raw llama-bench — same build, same models, same script everywhere, so numbers
compare across machines. Results are committed under
`bench/results/<machine>/kit/` (see that README).

## Run it (no dev tools needed)

**Windows:** copy this folder → **double-click `run.bat`**. (Prerequisite:
Microsoft Visual C++ Redistributable x64 — aka.ms/vs/17/release/vc_redist.x64.exe;
a missing VCRUNTIME140 dll error means this. Vulkan ships inside the GPU driver.)

**Mac / Linux:** copy this folder → `bash run.sh`. Same flow, `--flag` spelling
(`--plan-only` · `--yes` · `--ram-gb 16` · `--build b10xxx`). Engine assets:
ubuntu-vulkan / macos (Metal), names verified against the release. HONEST CAVEAT:
the sh side is logic-tested from this repo but has not yet run on a real Mac/Linux
box — first run there is its real test.

Either entry detects the machine, prints the PLAN — RAM + GPU, the engine build,
every model with its size and have/download/SKIP status, total download vs free
disk, and the three tests — then asks `Proceed? [Y/n/s]` before a byte is
downloaded (detection proposes, never dictates). `s` picks a subset of tests.
Then it downloads what fits, runs detect-facts, and benches. Hours on slow
machines; fully RESUMABLE — rerun skips finished combos, failed combos retry,
existing probes skip. When done, send back `results.jsonl` + `bench-log.txt` +
`quality-probe-*.txt` + `detect-facts.txt` → committed to
`bench/results/<machine>/kit/`.

Windows flags (pass to `run.bat` or `run.ps1`): `-PlanOnly` print the plan and
stop · `-Yes` no prompt (unattended) · `-RamGB 16` override detected RAM (bad
detection, or dry-running another machine's fit) · `-Build b10xxx` deliberate
engine re-test.

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
bench/speed-kit/
  README.md            this file
  run.bat              Windows: DOUBLE-CLICK THIS — launcher for run.ps1
  run.ps1              the one click: detect → PLAN → confirm → download → bench
  kit-common.ps1       ONE source (Windows face): engine pin, model list, fit rule, log
  download-models.ps1  fit-filtered fetch of engine + models (standalone-safe)
  detect-facts.ps1     hardware facts + what Vulkan sees
  run-bench.ps1        the 3-phase benchmark (standalone-safe; -Phases subset)
  run.sh               Mac/Linux: the same one click (bash run.sh)
  kit-common.sh        the SAME facts, sh face — change one, change BOTH
  download-models.sh   } sh mirrors of the ps1 scripts
  detect-facts.sh      }
  run-bench.sh         }
  .gitattributes       forces .sh=LF, .ps1/.bat=CRLF (copies must run anywhere)
  models/              (git-ignored) the .gguf set lands here — SHARED by both faces
  engine/<build>/      (git-ignored) the per-OS engine build, per-build dir
```

If PowerShell blocks scripts run by hand: `powershell -ExecutionPolicy Bypass -File .\<script>`
(`run.bat` already does this for you).
