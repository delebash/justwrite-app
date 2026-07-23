# run-bench-2.ps1 - the n_cpu_moe sweep (follow-up to the 16-combo matrix).
# ONE model (the 26B MoE), the winning base combo (ngl 99, fa 0, ub 512), stepping
# -ncmoe: experts move to CPU while attention stays on the iGPU - hunting a single
# config with the iGPU's prompt speed AND the CPU's writing speed. pp8192 + tg128
# only (the two numbers that matter), so ~1-2 h not 5.7. Appends results-2.jsonl,
# resumable (finished combos skip, failures retry).
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$results = Join-Path $root "results-2.jsonl"
$log = Join-Path $root "bench-log-2.txt"

$bench = Get-ChildItem -Recurse (Join-Path $root "engine") -Filter "llama-bench.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $bench) { Write-Host "llama-bench.exe not found - unzip engine\llama-*.zip first"; exit 1 }
$model = Get-ChildItem (Join-Path $root "models") -Filter "*26B-A4B*.gguf" | Select-Object -First 1
if (-not $model) { Write-Host "the 26B-A4B gguf not found in models\"; exit 1 }

# 0 = pure iGPU (the matrix already measured it - kept as the in-run baseline);
# 48+ = effectively all experts on CPU.
$ncmoes = @(0, 8, 16, 24, 32, 40, 48)

$done = @{}
if (Test-Path $results) {
  Get-Content $results | ForEach-Object {
    try { $j = $_ | ConvertFrom-Json; if (-not $j.failed) { $done["$($j.kitNcmoe)"] = $true } } catch {}
  }
}

"=== run-bench-2 $(Get-Date -Format o) - engine $($bench.FullName) ===" | Add-Content $log
foreach ($nc in $ncmoes) {
  if ($done["$nc"]) { Write-Host "skip (done): ncmoe=$nc"; continue }
  Write-Host "RUN: $($model.Name) ngl=99 fa=0 ub=512 ncmoe=$nc  (pp8192 + tg128)"
  "--- ncmoe=$nc $(Get-Date -Format o)" | Add-Content $log
  $raw = & $bench.FullName -m $model.FullName -ngl 99 -fa 0 -ub 512 -ncmoe $nc -p 8192 -n 128 -o json 2>>$log
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
Write-Host "Done. Send back: results-2.jsonl + bench-log-2.txt."
