# run.ps1 - THE one click. Detection proposes, never dictates (the house law):
# it detects the machine, prints the full PLAN (machine - engine - each model with
# size + have/download/skip - disk needed vs free - the tests), then asks before a
# byte is downloaded or an hour is burned. Y runs everything; n aborts; s(elect)
# picks tests. Everything it decides is visible and vetoable.
#   -Yes       skip the prompt (unattended/overnight)
#   -PlanOnly  print the plan and exit (look without committing)
#   -RamGB 16  override detected RAM (wrong detection, or dry-running another
#              machine's fit - e.g. the 16 GB path on a 32 GB box)
#   -Build b10xxx  engine override for a deliberate re-test (default: the pin)
# PS 5.1-compatible on purpose.
param(
  [switch]$Yes,
  [switch]$PlanOnly,
  [double]$RamGB = 0,
  [string]$Build = ""
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
. (Join-Path $root "kit-common.ps1")
if ($Build) { $KitBuild = $Build }

# ---- detect ----------------------------------------------------------------
$ramBytes = Get-KitRamBytes $RamGB
$ramNote = ""
if ($RamGB -gt 0) { $ramNote = " (OVERRIDE -RamGB $RamGB)" }
$gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
if (-not $gpus) { $gpus = @("(no display adapter reported)") }
$cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1).Name

$engineState = "will download (~32 MB)"
$engineExe = Get-ChildItem -Recurse (Join-Path $root "engine") -Filter "llama-bench.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($engineExe) { $engineState = "already present" }
elseif (Test-Path (Join-Path $root ("engine\llama-$KitBuild-bin-win-vulkan-x64.zip"))) { $engineState = "zip here - will unpack" }

Write-Host "Sizing models (local file or HTTP HEAD - nothing is downloaded)..."
$fit = @(Get-KitFit $ramBytes $root)

# ---- the PLAN --------------------------------------------------------------
$fitMax = [int64]($KitFitFactor * $ramBytes)
$dlBytes = [int64]0
Write-Host ""
Write-Host "================ PLAN ================"
Write-Host ("Machine : {0:N0} GB RAM{1} - {2}" -f ($ramBytes/1GB), $ramNote, $cpu)
foreach ($g in $gpus) { Write-Host ("GPU     : {0}" -f $g) }
Write-Host ("Engine  : {0} win-vulkan - {1}" -f $KitBuild, $engineState)
Write-Host ("Fit rule: model file <= {0} GB ({1} x RAM)" -f [math]::Round($fitMax/1GB,1), $KitFitFactor)
Write-Host "Models  :"
foreach ($m in $fit) {
  $szTxt = "size unknown"
  if ($null -ne $m.size) { $szTxt = ("{0} GB" -f [math]::Round($m.size/1GB,2)) }
  $local = Join-Path $root $m.out
  if (-not $m.fits) {
    Write-Host ("  SKIP     {0}  {1}  (over the {2} GB fit)" -f $m.name, $szTxt, [math]::Round($fitMax/1GB,1))
  } elseif (Test-Path $local) {
    Write-Host ("  have     {0}  {1}" -f $m.name, $szTxt)
  } else {
    Write-Host ("  download {0}  {1}" -f $m.name, $szTxt)
    if ($null -ne $m.size) { $dlBytes += $m.size }
  }
}
$free = (Get-PSDrive -Name ($root.Substring(0,1)) -ErrorAction SilentlyContinue).Free
$freeTxt = "?"
if ($null -ne $free) { $freeTxt = [math]::Round($free/1GB,1) }
Write-Host ("Disk    : download needed ~{0} GB - free on {1}: {2} GB" -f [math]::Round($dlBytes/1GB,2), $root.Substring(0,2), $freeTxt)
$moeFits = @($fit | Where-Object { $_.fits -and $_.out -like "*A4B*" }).Count -gt 0
Write-Host "Tests   :"
Write-Host "  [1] 16-combo matrix   pp512/2048/8192 + tg128 per combo (hours on slow boxes)"
if ($moeFits) {
  Write-Host "  [2] MoE ncmoe sweep   experts to CPU, 7 points (tens of minutes)"
} else {
  Write-Host "  [2] MoE ncmoe sweep   auto-skipped - no MoE model fits this machine"
}
Write-Host "  [3] quality probe     one short generation per model (minutes)"
Write-Host "Results : results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
Write-Host "          -> copy back into bench/results/<machine>/kit/ in the repo"
Write-Host "======================================"
Write-Host ""
if ($PlanOnly) { Write-Host "(-PlanOnly: stopping here.)"; exit 0 }

# ---- confirm ---------------------------------------------------------------
$phases = "1,2,3"
if (-not $Yes) {
  $ans = Read-Host "Proceed? [Y/n/s(elect tests)]"
  if ($ans -match '^[nN]') { Write-Host "Aborted - nothing downloaded, nothing run."; exit 0 }
  if ($ans -match '^[sS]') {
    $sel = Read-Host "Tests to run (e.g. 1,3)"
    $tokens = @($sel -split '[,\s]+' | Where-Object { $_ -match '^[123]$' })
    if ($tokens.Count -eq 0) { Write-Host "No valid tests picked - aborting."; exit 0 }
    $phases = ($tokens -join ",")
    Write-Host ("Running tests: {0}" -f $phases)
  }
}

# ---- run -------------------------------------------------------------------
& (Join-Path $root "download-models.ps1") -RamGB $RamGB -Build $KitBuild
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
  Add-KitLog $root "download step FAILED - stopping before the bench (see the DOWNLOAD FAILED lines above; rerun run.ps1 to retry)."
  exit 1
}
& (Join-Path $root "detect-facts.ps1")
& (Join-Path $root "run-bench.ps1") -Phases $phases -RamGB $RamGB
Write-Host ""
Write-Host "All done. Send back: results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
