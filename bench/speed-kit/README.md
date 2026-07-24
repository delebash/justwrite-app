# The portable speed kit — raw cross-machine benchmarks

Measures any Windows machine's real LLM speed (iGPU/GPU via Vulkan + CPU) with
raw llama-bench — same build, same models, same script everywhere, so numbers
compare across machines. Results are committed under
`bench/results/<machine>/kit/` (see that README).

## Run it (no dev tools needed)

**Updating the kit:** copy the new scripts **over** the existing folder — do NOT
delete it. The scripts overwrite; `models/`, `engine/`, and `results.jsonl` survive,
so you keep ~20 GB of downloads and every prior result. Deleting the folder means
re-downloading everything and losing the resume history.

**Windows:** copy this folder → **double-click `run.bat`**. (Prerequisite:
Microsoft Visual C++ Redistributable x64 — aka.ms/vs/17/release/vc_redist.x64.exe;
a missing VCRUNTIME140 dll error means this. Vulkan ships inside the GPU driver.)

**Mac / Linux:** copy this folder → `bash run.sh`. Same flow, `--flag` spelling
(`--plan-only` · `--yes` · `--ram-gb 16` · `--build b10xxx`). Engine assets:
ubuntu-vulkan / macos (Metal), names verified against the release. HONEST CAVEAT:
the sh side is logic-tested from this repo but has not yet run on a real Mac/Linux
box — first run there is its real test.

Either entry detects the machine, prints the PLAN — RAM + GPU, the engine build,
every model with its size, have/download/SKIP status, **and what has already been
benched on this engine** (`8/8 done @b10099 tg 9.1 -> skip` / `-- not run --`),
total download vs free disk, and the two tests — then asks
**quick screen first, full matrix only if you opt in.** After the PLAN it asks:
`1) Which MODELS?` then `2) Also run the FULL tuning matrix? [y/N]`. By default it
runs a **quick screen** — one generation per model, shown live with the tok/s;
the kit then judges each model against the speed cutoff and prints a verdict
(`run full` / `SKIP too slow`), also written to `quick-summary.txt` — so you (or a
glance at that one file) know which models are worth a full test in minutes,
without eyeballing anything. Nothing is thrown out — every selected model is
screened. The hours-long 16-combo tuning matrix runs **only if you answer y** — for
a model the quick screen (or you) confirmed. `-Yes` runs the full thing unattended.
(detection proposes, never dictates).
Then it downloads what fits, runs detect-facts, and benches. Hours on slow
machines; fully RESUMABLE — rerun skips finished combos, failed combos retry,
existing probes skip. When done, send back `results.jsonl` + `bench-log.txt` +
`quick-summary.txt` + `quality-probe-*.txt` + `detect-facts.txt` → committed to
`bench/results/<machine>/kit/`.

Windows flags (pass to `run.bat` or `run.ps1`): `-PlanOnly` print the plan and
stop · `-Yes` no prompt (unattended) · `-RamGB 16` override detected RAM (bad
detection, or dry-running another machine's fit) · `-Build b10xxx` deliberate
engine re-test.

## The tests

- **QUICK SCREEN (default)** — one short generation per model, shown live with the
  tok/s and saved to `quality-probe-<model>.txt`. The kit reads the decode speed
  and prints a **verdict** per model — `run full` if it clears the cutoff
  (`kit-common` `$KitQuickMinTg`, default 7 tok/s decode), `SKIP too slow` below
  it — and writes them all, fastest first, to `quick-summary.txt` (the one file to
  glance at, or send back). This is the go/no-go: the kit *tells you* which models
  are worth a full test, and the live text still shows whether the output is real
  prose (a broken backend writes garbage at full speed — this makes that visible),
  in minutes. Runs first, on every selected model; the verdict is advice, it never
  blocks a run.
- **FULL MATRIX (opt-in, hours)** — only when you answer y. The 16-combo tuning
  sweep (ngl 99/0 × ubatch 512/2048 × flash-attn on/off; pp512/2048/8192 + tg128)
  plus the MoE ncmoe sweep. Worth it only on a model the quick screen confirmed.

## Rules the kit enforces (so numbers stay honest)

- **RAM-fit** (`kit-common.ps1` `$KitFitFactor`, one place): a model over
  0.7 × RAM is skipped LOUDLY at download AND at bench — never downloaded just
  to thrash, never silently missing.
- **Quick-screen cutoff** (`kit-common.ps1` `$KitQuickMinTg`, one place): the
  decode tok/s below which the quick screen flags a model `SKIP too slow` (the
  user's call, default 7). Advice only — it never blocks a run. Both faces share
  the one value; edit it in one place.
- **LATEST engine, resolved per run** (the user's ruling 2026-07-23): llama.cpp
  ships real fixes fast and a pin hid one — b10083 could not read the current
  ternary files and had no Vulkan ternary kernels; b10099 reads them and offloads.
  Production runs latest, so the bench runs latest. The resolved tag is shown in
  the PLAN before you confirm, and cached so an offline rerun knows what it used.
  `-Build bXXXXX` pins deliberately when you want two machines matched.
- **Comparability by DATA, not by freezing**: every results row self-labels
  `build_commit`/`build_number`, and **the resume key includes the build** — a new
  engine re-runs its combos instead of silently mixing two builds in one matrix.
  `-Force` re-runs even what this build already did.
- **Ternary models use the g64 variant** (`Ternary-Bonsai-8B-Q2_0_g64.gguf`,
  `Ternary-Bonsai-27B-Q2_g64.gguf`). The plain `*-Q2_0.gguf` files are the
  PrismML fork's packing — mainline rejects them outright. Filenames are kept
  TRUE (never renamed) so a result can't claim one packing while holding another.
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
  kit-common.ps1       ONE source (Windows face): engine pin, model list, fit rule, quick-screen cutoff, log
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
