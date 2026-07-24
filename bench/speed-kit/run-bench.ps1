# run-bench.ps1 - THE one full test script (merged 2026-07-23, user's call):
# PHASE 1 the 16-combo matrix, PHASE 2 the n_cpu_moe sweep (MoE model only),
# PHASE 3 the quality probe. Runs llama-bench over models x knobs, appending one
# JSON line per combo to results.jsonl (resumable: combos already present are
# skipped). Also writes a human log to bench-log.txt. Expects the engine
# unzipped under .\engine\ (download-models.ps1 does that).
#   -Phases "1,3"  run a subset (default all; run.ps1's t(ests) passes this)
#   -Models "a,b"  only these model FILENAMES (run.ps1's m(odels) passes this)
#   -RamGB 16      override detected RAM for the fit guard (see run.ps1)
#   -Build bXXXXX  engine build to use + to key the resume on (run.ps1 resolves latest)
#   -Force         re-run combos already done on this build
param(
  [string]$Phases = "1,2,3",
  [string]$Models = "",
  [double]$RamGB = 0,
  [string]$Build = "",
  [switch]$Force
)
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
. (Join-Path $root "kit-common.ps1")
$KitBuild = $Build
if (-not $KitBuild) { $KitBuild = Get-KitLatestBuild $root }
$phaseSet = @($Phases -split '[,\s]+' | Where-Object { $_ })
$modelFilter = @($Models -split '[,]+' | Where-Object { $_ } | ForEach-Object { $_.Trim() })
$results = Join-Path $root "results.jsonl"
$log = Join-Path $root "bench-log.txt"

# Prefer this build's own dir (engine\<build>\ - see download-models.ps1);
# fall back to any exe under engine\ for kits stocked before the per-build layout.
$bench = Get-ChildItem -Recurse (Join-Path $root ("engine\" + $KitBuild)) -Filter "llama-bench.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $bench) { $bench = Get-ChildItem -Recurse (Join-Path $root "engine") -Filter "llama-bench.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 }
if (-not $bench) { Write-Host "llama-bench.exe not found - run download-models.ps1 first (see README)"; exit 1 }

$models = Get-ChildItem (Join-Path $root "models") -Filter "*.gguf" | Sort-Object Length
if (-not $models) { Write-Host "no .gguf files in models\"; exit 1 }
# RAM-FIT GUARD (2026-07-23, the 16 GB-laptop case): a model whose weights exceed
# $KitFitFactor x this machine's RAM would page-thrash for hours on a one-pool box
# and produce garbage numbers - skip it loudly rather than measure the pagefile.
# (Same rule download-models.ps1 applies, both from kit-common.ps1 - this one stays
# as the backstop for hand-copied models.)
$ramBytes = Get-KitRamBytes $RamGB
$fit = @($models | Where-Object { $_.Length -le $KitFitFactor * $ramBytes })
foreach ($m in $models) { if ($fit -notcontains $m) {
  Write-Host "SKIP (too big for this machine's $([math]::Round($ramBytes/1GB)) GB RAM): $($m.Name) ($([math]::Round($m.Length/1GB,1)) GB)"
  "SKIPPED (ram-fit): $($m.Name)" | Add-Content $log
} }
$models = $fit
if (-not $models) { Write-Host "nothing fits this machine's RAM"; exit 1 }

# Model selection (run.ps1's m(odels) picker passes filenames). Empty = all.
if ($modelFilter.Count -gt 0) {
  $models = @($models | Where-Object { $modelFilter -contains $_.Name })
  if (-not $models) { Write-Host "none of the selected models are present/fitting"; exit 1 }
  Write-Host ("Selected models: {0}" -f (($models | ForEach-Object { $_.Name }) -join ", "))
}

# The matrix comes from kit-common (ONE definition; run.ps1 sizes "N/8 done" from it).
$ngls = $KitNgls
$ubs  = $KitUbs
$fas  = $KitFas

# RESUME KEY INCLUDES THE BUILD (2026-07-23). Under the latest-per-run policy a
# build-free key would skip combos measured on an OLDER engine, silently mixing
# two builds into one matrix. Keyed on the build, a new engine re-runs its combos
# and old rows stay in the file, each labelled with the build that produced it.
$done = @{}
if ((Test-Path $results) -and (-not $Force)) {
  Get-Content $results | ForEach-Object {
    # Only SUCCESSFUL combos are skipped on rerun - a failed combo retries (the
    # first laptop run failed everything on a missing VC++ runtime; recording
    # failures as done made the rerun a no-op. 2026-07-23 fix.)
    try { $j = $_ | ConvertFrom-Json; if (-not $j.failed) {
      # rows written before the build was stamped fall back to the engine's own
      # self-label inside the llama-bench output
      $b = $j.kitBuild
      $rr = $j.rows
      if ($rr -and $rr.value) { $rr = $rr.value }
      if (-not $b -and $rr -and $rr[0].build_number) { $b = "b" + $rr[0].build_number }
      if ($null -ne $j.kitNcmoe) { $done["$b|ncmoe|$($j.kitNcmoe)"] = $true }
      else { $done[(Get-KitComboKey $b $j.kitModel $j.kitNgl $j.kitUb $j.kitFa)] = $true }
    } } catch {}
  }
}
if ($Force) { Write-Host "-Force: ignoring prior results, re-running everything selected" }

"=== run-bench $(Get-Date -Format o) - engine $($bench.FullName) - build $KitBuild - phases $Phases ===" | Add-Content $log
if ($phaseSet -contains '1') {
foreach ($m in $models) {
  foreach ($ngl in $ngls) { foreach ($ub in $ubs) { foreach ($fa in $fas) {
    $key = Get-KitComboKey $KitBuild $m.Name $ngl $ub $fa
    if ($done[$key]) { Write-Host "skip (done on $KitBuild): $($m.Name)|$ngl|$ub|$fa"; continue }
    Write-Host "RUN: $($m.Name) ngl=$ngl ub=$ub fa=$fa  (pp512/2048/8192 + tg128)"
    "--- $key $(Get-Date -Format o)" | Add-Content $log
    $raw = & $bench.FullName -m $m.FullName -ngl $ngl -ub $ub -fa $fa -p "512,2048,8192" -n 128 -o json 2>>$log
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
      "FAILED exit=$LASTEXITCODE : $key" | Add-Content $log
      # record the failure for the report; reruns RETRY it (see the skip filter above)
      (@{ kitBuild=$KitBuild; kitModel=$m.Name; kitNgl=$ngl; kitUb=$ub; kitFa=$fa; failed=$true } | ConvertTo-Json -Compress) | Add-Content $results
      continue
    }
    try {
      $rows = ($raw -join "`n") | ConvertFrom-Json
      foreach ($r in $rows) {
        $r | Add-Member kitBuild $KitBuild -Force
        $r | Add-Member kitModel $m.Name -Force
        $r | Add-Member kitNgl $ngl -Force
        $r | Add-Member kitUb $ub -Force
        $r | Add-Member kitFa $fa -Force
      }
      # one line per combo: the full row array, tagged. kitBuild is what the
      # build-keyed resume and run.ps1's status column read.
      (@{ kitBuild=$KitBuild; kitModel=$m.Name; kitNgl=$ngl; kitUb=$ub; kitFa=$fa; rows=$rows } | ConvertTo-Json -Compress -Depth 6) | Add-Content $results
    } catch {
      "PARSE FAILED: $key : $_" | Add-Content $log
      (@{ kitBuild=$KitBuild; kitModel=$m.Name; kitNgl=$ngl; kitUb=$ub; kitFa=$fa; failed=$true; parse=$true } | ConvertTo-Json -Compress) | Add-Content $results
    }
  } } }
}
} else { Write-Host "phase 1 (matrix): not selected - skipped" }
# ── PHASE 2: the n_cpu_moe sweep (MoE model only) — experts to CPU, attention on
# the GPU, hunting one config with the iGPU's prompt speed AND the CPU's writing
# speed. Base combo fixed at the known-good iGPU shape (ngl 99, fa 0, ub 512);
# pp8192 + tg128 only. ncmoe 0 = the in-run baseline; 48+ = all experts on CPU.
if ($phaseSet -contains '2') {
$moe = @($models | Where-Object { $_.Name -like "*A4B*" }) | Select-Object -First 1
if ($moe) {
  foreach ($nc in @(0, 8, 16, 24, 32, 40, 48)) {
    if ($done["$KitBuild|ncmoe|$nc"]) { Write-Host "skip (done on $KitBuild): ncmoe=$nc"; continue }
    Write-Host "RUN sweep: $($moe.Name) ngl=99 fa=0 ub=512 ncmoe=$nc  (pp8192 + tg128)"
    "--- ncmoe=$nc $(Get-Date -Format o)" | Add-Content $log
    $raw = & $bench.FullName -m $moe.FullName -ngl 99 -fa 0 -ub 512 -ncmoe $nc -p 8192 -n 128 -o json 2>>$log
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
      "FAILED exit=$LASTEXITCODE : ncmoe=$nc" | Add-Content $log
      (@{ kitBuild=$KitBuild; kitNcmoe=$nc; failed=$true } | ConvertTo-Json -Compress) | Add-Content $results
      continue
    }
    try {
      $rows = ($raw -join "`n") | ConvertFrom-Json
      (@{ kitBuild=$KitBuild; kitNcmoe=$nc; rows=$rows } | ConvertTo-Json -Compress -Depth 6) | Add-Content $results
    } catch {
      "PARSE FAILED: ncmoe=$nc : $_" | Add-Content $log
      (@{ kitBuild=$KitBuild; kitNcmoe=$nc; failed=$true; parse=$true } | ConvertTo-Json -Compress) | Add-Content $results
    }
  }
} else { Write-Host "no MoE (*A4B*) model in models\ - sweep phase skipped" }
} else { Write-Host "phase 2 (ncmoe sweep): not selected - skipped" }
# ── PHASE 3: the quality probe (user "ok", 2026-07-23) — one short generation per
# model on the GPU path (ngl 99), saved for HUMAN eyeballing. Not a score: it only
# makes a numerically-broken backend VISIBLE (a backend with bad kernels writes
# garbage at full speed — the Bonsai lesson; llama-bench discards all text).
if ($phaseSet -contains '3') {
$cli = Get-ChildItem -Recurse (Join-Path $root ("engine\" + $KitBuild)) -Filter "llama-cli.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $cli) { $cli = Get-ChildItem -Recurse (Join-Path $root "engine") -Filter "llama-cli.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 }
if ($cli) {
  foreach ($m in $models) {
    # build in the filename for the same reason it is in the resume key: a new
    # engine can change what the model writes (fixed kernels -> different output),
    # so an old probe must not stand in for the current build's.
    $probe = Join-Path $root "quality-probe-$($m.BaseName)-$KitBuild.txt"
    if ((Test-Path $probe) -and -not $Force) { Write-Host "skip (done on $KitBuild): probe $($m.Name)"; continue }
    Write-Host "PROBE: $($m.Name) (ngl 99, ~120 tokens)"
    & $cli.FullName -m $m.FullName -ngl 99 --single-turn --temp 0.2 -n 120 `
      -p "Write a short paragraph describing an old lighthouse at dusk." 1>$probe 2>>$log
    if ($LASTEXITCODE -ne 0) { "PROBE FAILED exit=$LASTEXITCODE : $($m.Name)" | Add-Content $log }
  }
} else { Write-Host "llama-cli.exe not found - quality probe skipped" }
} else { Write-Host "phase 3 (quality probe): not selected - skipped" }
Write-Host "Done. Send back: results.jsonl + bench-log.txt + quality-probe-*.txt (+ detect-facts.txt)."
