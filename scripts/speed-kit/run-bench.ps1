# run-bench.ps1 - THE one full test script (merged 2026-07-23, user's call):
# PHASE 1 the 16-combo matrix, PHASE 2 the n_cpu_moe sweep (MoE model only).
# Runs llama-bench over models x knobs, appending one JSON line per combo to
# results.jsonl (resumable: combos already present are skipped). Also writes a
# human log to bench-log.txt. Expects the engine unzipped under .\engine\.
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$results = Join-Path $root "results.jsonl"
$log = Join-Path $root "bench-log.txt"

$bench = Get-ChildItem -Recurse (Join-Path $root "engine") -Filter "llama-bench.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $bench) { Write-Host "llama-bench.exe not found - unzip engine\llama-*.zip first (see README)"; exit 1 }

$models = Get-ChildItem (Join-Path $root "models") -Filter "*.gguf" | Sort-Object Length
if (-not $models) { Write-Host "no .gguf files in models\"; exit 1 }

# The section-6 matrix: -ngl 99 vs 0 (iGPU offload vs CPU) x ubatch 512/2048 x flash-attn on/off.
$ngls = @(99, 0)
$ubs  = @(512, 2048)
$fas  = @(1, 0)

$done = @{}
if (Test-Path $results) {
  Get-Content $results | ForEach-Object {
    # Only SUCCESSFUL combos are skipped on rerun - a failed combo retries (the
    # first laptop run failed everything on a missing VC++ runtime; recording
    # failures as done made the rerun a no-op. 2026-07-23 fix.)
    try { $j = $_ | ConvertFrom-Json; if (-not $j.failed) {
      if ($null -ne $j.kitNcmoe) { $done["ncmoe|$($j.kitNcmoe)"] = $true }
      else { $done["$($j.kitModel)|$($j.kitNgl)|$($j.kitUb)|$($j.kitFa)"] = $true }
    } } catch {}
  }
}

"=== run-bench $(Get-Date -Format o) - engine $($bench.FullName) ===" | Add-Content $log
foreach ($m in $models) {
  foreach ($ngl in $ngls) { foreach ($ub in $ubs) { foreach ($fa in $fas) {
    $key = "$($m.Name)|$ngl|$ub|$fa"
    if ($done[$key]) { Write-Host "skip (done): $key"; continue }
    Write-Host "RUN: $($m.Name) ngl=$ngl ub=$ub fa=$fa  (pp512/2048/8192 + tg128)"
    "--- $key $(Get-Date -Format o)" | Add-Content $log
    $raw = & $bench.FullName -m $m.FullName -ngl $ngl -ub $ub -fa $fa -p "512,2048,8192" -n 128 -o json 2>>$log
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
      "FAILED exit=$LASTEXITCODE : $key" | Add-Content $log
      # record the failure for the report; reruns RETRY it (see the skip filter above)
      (@{ kitModel=$m.Name; kitNgl=$ngl; kitUb=$ub; kitFa=$fa; failed=$true } | ConvertTo-Json -Compress) | Add-Content $results
      continue
    }
    try {
      $rows = ($raw -join "`n") | ConvertFrom-Json
      foreach ($r in $rows) {
        $r | Add-Member kitModel $m.Name -Force
        $r | Add-Member kitNgl $ngl -Force
        $r | Add-Member kitUb $ub -Force
        $r | Add-Member kitFa $fa -Force
      }
      # one line per combo: the full row array, tagged
      (@{ kitModel=$m.Name; kitNgl=$ngl; kitUb=$ub; kitFa=$fa; rows=$rows } | ConvertTo-Json -Compress -Depth 6) | Add-Content $results
    } catch {
      "PARSE FAILED: $key : $_" | Add-Content $log
      (@{ kitModel=$m.Name; kitNgl=$ngl; kitUb=$ub; kitFa=$fa; failed=$true; parse=$true } | ConvertTo-Json -Compress) | Add-Content $results
    }
  } } }
}
# ── PHASE 2: the n_cpu_moe sweep (MoE model only) — experts to CPU, attention on
# the GPU, hunting one config with the iGPU's prompt speed AND the CPU's writing
# speed. Base combo fixed at the known-good iGPU shape (ngl 99, fa 0, ub 512);
# pp8192 + tg128 only. ncmoe 0 = the in-run baseline; 48+ = all experts on CPU.
$moe = Get-ChildItem (Join-Path $root "models") -Filter "*A4B*.gguf" | Select-Object -First 1
if ($moe) {
  foreach ($nc in @(0, 8, 16, 24, 32, 40, 48)) {
    if ($done["ncmoe|$nc"]) { Write-Host "skip (done): ncmoe=$nc"; continue }
    Write-Host "RUN sweep: $($moe.Name) ngl=99 fa=0 ub=512 ncmoe=$nc  (pp8192 + tg128)"
    "--- ncmoe=$nc $(Get-Date -Format o)" | Add-Content $log
    $raw = & $bench.FullName -m $moe.FullName -ngl 99 -fa 0 -ub 512 -ncmoe $nc -p 8192 -n 128 -o json 2>>$log
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
      "FAILED exit=$LASTEXITCODE : ncmoe=$nc" | Add-Content $log
      (@{ kitNcmoe=$nc; failed=$true } | ConvertTo-Json -Compress) | Add-Content $results
      continue
    }
    try {
      $rows = ($raw -join "`n") | ConvertFrom-Json
      (@{ kitNcmoe=$nc; rows=$rows } | ConvertTo-Json -Compress -Depth 6) | Add-Content $results
    } catch {
      "PARSE FAILED: ncmoe=$nc : $_" | Add-Content $log
      (@{ kitNcmoe=$nc; failed=$true; parse=$true } | ConvertTo-Json -Compress) | Add-Content $results
    }
  }
} else { Write-Host "no MoE (*A4B*) model in models\ - sweep phase skipped" }
# ── PHASE 3: the quality probe (user "ok", 2026-07-23) — one short generation per
# model on the GPU path (ngl 99), saved for HUMAN eyeballing. Not a score: it only
# makes a numerically-broken backend VISIBLE (a backend with bad kernels writes
# garbage at full speed — the Bonsai lesson; llama-bench discards all text).
$cli = Get-ChildItem -Recurse (Join-Path $root "engine") -Filter "llama-cli.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cli) {
  foreach ($m in $models) {
    $probe = Join-Path $root "quality-probe-$($m.BaseName).txt"
    if (Test-Path $probe) { Write-Host "skip (done): probe $($m.Name)"; continue }
    Write-Host "PROBE: $($m.Name) (ngl 99, ~120 tokens)"
    & $cli.FullName -m $m.FullName -ngl 99 --single-turn --temp 0.2 -n 120 `
      -p "Write a short paragraph describing an old lighthouse at dusk." 1>$probe 2>>$log
    if ($LASTEXITCODE -ne 0) { "PROBE FAILED exit=$LASTEXITCODE : $($m.Name)" | Add-Content $log }
  }
} else { Write-Host "llama-cli.exe not found - quality probe skipped" }
Write-Host "Done. Send back: results.jsonl + bench-log.txt + quality-probe-*.txt (+ detect-facts.txt)."
