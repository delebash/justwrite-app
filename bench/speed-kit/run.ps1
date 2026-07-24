# run.ps1 - THE one click. Detection proposes, never dictates (the house law):
# it detects the machine, prints the full PLAN (machine - engine - each model with
# size, have/download/skip, AND what has already been benched on this engine -
# disk needed vs free - the tests), then asks before a byte is downloaded or an
# hour is burned. Y runs everything; n aborts; m picks models; t picks tests.
#   -Yes       skip the prompt (unattended/overnight)
#   -PlanOnly  print the plan and exit (look without committing)
#   -RamGB 16  override detected RAM (wrong detection, or dry-running another
#              machine's fit - e.g. the 16 GB path on a 32 GB box)
#   -Build b10xxx  pin a specific engine (default: LATEST, resolved at run time -
#                  use this when you want two machines on one matched build)
#   -Force     re-run combos already done on this build
# PS 5.1-compatible on purpose.
param(
  [switch]$Yes,
  [switch]$PlanOnly,
  [double]$RamGB = 0,
  [string]$Build = "",
  [switch]$Force
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
. (Join-Path $root "kit-common.ps1")

# ---- engine: LATEST by default (the user's ruling), shown before you confirm --
$buildNote = ""
if ($Build) { $KitBuild = $Build; $buildNote = " (PINNED via -Build)" }
else {
  Write-Host "Resolving latest llama.cpp release..."
  $KitBuild = Get-KitLatestBuild $root
  $buildNote = " (latest, resolved just now)"
}

# ---- detect ----------------------------------------------------------------
$ramBytes = Get-KitRamBytes $RamGB
$ramNote = ""
if ($RamGB -gt 0) { $ramNote = " (OVERRIDE -RamGB $RamGB)" }
$gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
if (-not $gpus) { $gpus = @("(no display adapter reported)") }
$cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1).Name

$engineState = "will download (~32 MB)"
$engineExe = Get-ChildItem -Recurse (Join-Path $root ("engine\" + $KitBuild)) -Filter "llama-bench.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($engineExe) { $engineState = "already present" }
elseif (Test-Path (Join-Path $root ("engine\llama-$KitBuild-bin-win-vulkan-x64.zip"))) { $engineState = "zip here - will unpack" }

Write-Host "Sizing models (local file or HTTP HEAD - nothing is downloaded)..."
$fit = @(Get-KitFit $ramBytes $root)
$status = Get-KitResultsStatus $root $KitBuild
$quick = Get-KitQuickStatus $root $KitBuild   # what the quick screen already recorded, per model, on this build

# ---- the PLAN --------------------------------------------------------------
$fitMax = [int64]($KitFitFactor * $ramBytes)
$dlBytes = [int64]0
Write-Host ""
Write-Host "================ PLAN ================"
Write-Host ("Machine : {0:N0} GB RAM{1} - {2}" -f ($ramBytes/1GB), $ramNote, $cpu)
foreach ($g in $gpus) { Write-Host ("GPU     : {0}" -f $g) }
Write-Host ("Engine  : {0} win-vulkan{1} - {2}" -f $KitBuild, $buildNote, $engineState)
Write-Host ("Fit rule: model file <= {0} GB ({1} x RAM)" -f [math]::Round($fitMax/1GB,1), $KitFitFactor)
Write-Host "Models  :"
# $pick maps the number the human types -> the model's FILENAME (what run-bench
# filters on). Only fitting models get a number; skipped ones can't be selected.
$pick = @{}
$n = 0
foreach ($m in $fit) {
  $szTxt = "size unknown"
  if ($null -ne $m.size) { $szTxt = ("{0} GB" -f [math]::Round($m.size/1GB,2)) }
  $local = Join-Path $root $m.out
  $file = Split-Path $m.out -Leaf
  if (-not $m.fits) {
    Write-Host ("      SKIP      {0,-24} {1,9}  (over the {2} GB fit)" -f $m.name, $szTxt, [math]::Round($fitMax/1GB,1))
    continue
  }
  $n++
  $pick[$n] = $file
  $state = "download"
  if (Test-Path $local) { $state = "have" } elseif ($null -ne $m.size) { $dlBytes += $m.size }
  # prior-results column: what this engine has already benched, and what a
  # different engine benched before it (which will RE-RUN under the build-keyed
  # resume rather than silently standing in for the current build).
  $hist = "-- not run --"
  $s = $status[$file]
  if ($s) {
    $tg = ""
    if ($null -ne $s.lastTg) { $tg = ("  tg {0:N1}" -f $s.lastTg) }
    if ($s.done -ge $KitCombosPerModel) {
      $hist = ("{0}/{1} done @{2}{3}  -> skip (current)" -f $s.done, $KitCombosPerModel, $KitBuild, $tg)
    } elseif ($s.done -gt 0) {
      $hist = ("{0}/{1} done @{2}{3}  -> resume {4}" -f $s.done, $KitCombosPerModel, $KitBuild, $tg, ($KitCombosPerModel - $s.done))
    } else {
      $hist = ("{0}/{1} done @{2}{3}  -> RE-RUN (build changed)" -f $s.doneAny, $KitCombosPerModel, $s.lastBuild, $tg)
    }
  }
  Write-Host ("  [{0}] {1,-9} {2,-24} {3,9}   {4}" -f $n, $state, $m.name, $szTxt, $hist)
  # quick-screen status cached on THIS build - shown so you decide WITH the info in
  # front of you; picking a model ALWAYS re-runs it (no skip). "not yet run" = never
  # quick-screened on this engine.
  $q = $quick[$file]
  if ($null -eq $q) { Write-Host "        quick screen: not yet run" }
  else {
    $qv = Get-KitQuickVerdict $q.tg
    if ($null -ne $q.tg) { Write-Host ("        quick screen: {0:N1} tok/s -> {1}" -f $q.tg, $qv) }
    else { Write-Host ("        quick screen: {0} (last run left no speed line)" -f $qv) }
  }
}
$free = (Get-PSDrive -Name ($root.Substring(0,1)) -ErrorAction SilentlyContinue).Free
$freeTxt = "?"
if ($null -ne $free) { $freeTxt = [math]::Round($free/1GB,1) }
Write-Host ("Disk    : download needed ~{0} GB - free on {1}: {2} GB" -f [math]::Round($dlBytes/1GB,2), $root.Substring(0,2), $freeTxt)
$moeFits = @($fit | Where-Object { $_.fits -and $_.out -like "*A4B*" }).Count -gt 0
Write-Host "Tests   :"
Write-Host "  QUICK SCREEN (default) : one generation per model - you SEE speed + sample"
Write-Host "                           text and decide (minutes). Nothing is thrown out."
Write-Host "  FULL MATRIX  (opt-in)  : the 16-combo tuning sweep$(if ($moeFits) { ' + MoE ncmoe sweep' })"
Write-Host "                           (HOURS) - only worth it on a model you've confirmed."
Write-Host "Results : results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
Write-Host "          -> copy back into bench/results/<machine>/kit/ in the repo"
Write-Host "======================================"
Write-Host ""
if ($PlanOnly) { Write-Host "(-PlanOnly: stopping here.)"; exit 0 }

# ---- confirm ---------------------------------------------------------------
# Numbered multi-select rather than a toggle-UI: same idiom as the tests picker,
# survives -Yes and piped/non-interactive runs, no TUI to break.
$phases = "1,2,3"
$pickedModels = ""
if (-not $Yes) {
  # ALWAYS ask BOTH choices before anything happens - no letter to guess, no
  # either-or. The user's requirement (2026-07-23): "i can choose m and then t or
  # choose all models and all tests ... i just want to make the choices before it
  # actually tries to do anything". Blank = all at either question; -Yes bypasses
  # all three prompts for unattended runs.
  $sel = Read-Host ("1) Which MODELS? (e.g. 1,3-5 - blank or 'all' = all) [1-{0}]" -f $n)
  if ($sel -match '^\s*n\s*$') { Write-Host "Aborted - nothing downloaded, nothing run."; exit 0 }
  if ($sel -and $sel -notmatch '^\s*all\s*$') {
    $nums = @()
    foreach ($tok in ($sel -split '[,\s]+' | Where-Object { $_ })) {
      if ($tok -match '^(\d+)-(\d+)$') { $nums += ([int]$matches[1])..([int]$matches[2]) }
      elseif ($tok -match '^\d+$') { $nums += [int]$tok }
    }
    $files = @()
    foreach ($i in ($nums | Sort-Object -Unique)) { if ($pick.ContainsKey($i)) { $files += $pick[$i] } }
    if ($files.Count -eq 0) { Write-Host "No valid models picked - aborting."; exit 0 }
    $pickedModels = ($files -join ",")
  }

  # Quick screen is ALWAYS run (phase 3). The hours-long matrix is opt-in only -
  # the user's flow: "the only time we run full tests for hours is after we
  # determine the model will actually run at decent speed" (quick screen first).
  $full = Read-Host "2) Also run the FULL tuning matrix? (HOURS - only for a model you've confirmed) [y/N]"
  if ($full -match '^[yY]') { $phases = "1,2,3" } else { $phases = "3" }

  $mTxt = "ALL that fit"; if ($pickedModels) { $mTxt = ($pickedModels -replace ',', "`n                ") }
  $tTxt = "QUICK SCREEN only (speed + sample per model)"
  if ($phases -match '1') { $tTxt = "QUICK SCREEN first, THEN the full matrix (hours)" }
  Write-Host ""
  Write-Host "-------------- ABOUT TO RUN --------------"
  Write-Host ("  models =  {0}" -f $mTxt)
  Write-Host ("  run    =  {0}" -f $tTxt)
  Write-Host "  (downloads only those models)"
  Write-Host "------------------------------------------"
  $go = Read-Host "Proceed? [Y/n]"
  if ($go -match '^[nN]') { Write-Host "Aborted - nothing downloaded, nothing run."; exit 0 }
  Write-Host ""
}

# ---- run -------------------------------------------------------------------
& (Join-Path $root "download-models.ps1") -RamGB $RamGB -Build $KitBuild -Models $pickedModels
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
  Add-KitLog $root "download step FAILED - stopping before the bench (see the DOWNLOAD FAILED lines above; rerun run.ps1 to retry)."
  exit 1
}
& (Join-Path $root "detect-facts.ps1")
& (Join-Path $root "run-bench.ps1") -Phases $phases -Models $pickedModels -RamGB $RamGB -Build $KitBuild -Force:$Force
Write-Host ""
Write-Host "All done. Send back: results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
