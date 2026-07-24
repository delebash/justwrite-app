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
Write-Host "  1. QUICK SCREEN : one generation per model - you SEE the speed + verdict"
Write-Host "                    (run full / skip) in minutes. Nothing is thrown out."
Write-Host "  2. FULL MATRIX  : offered right after the quick screen, on the models that"
Write-Host "                    cleared the bar - SAME session, no restart. The 16-combo"
Write-Host "                    sweep$(if ($moeFits) { ' + MoE ncmoe sweep' }) (HOURS). Accept the pick, choose your own, or skip."
Write-Host "Results : results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
Write-Host "          -> copy back into bench/results/<machine>/kit/ in the repo"
Write-Host "======================================"
Write-Host ""
if ($PlanOnly) { Write-Host "(-PlanOnly: stopping here.)"; exit 0 }

# ---- confirm: pick MODELS. The full-test decision comes AFTER the quick screen,
# where the recommendations exist - you should never answer "run full?" blind.
# (Numbered multi-select: survives -Yes / piped runs, no TUI to break.) -----------
$pickedModels = ""
if (-not $Yes) {
  $sel = Read-Host ("1) Which MODELS? (e.g. 1,3-5 - blank or 'all' = all) [1-{0}]" -f $n)
  if ($sel -match '^\s*n\s*$') { Write-Host "Aborted - nothing downloaded, nothing run."; exit 0 }
  if ($sel -and $sel -notmatch '^\s*all\s*$') {
    $files = @(Resolve-KitNumbers $sel $pick)
    if ($files.Count -eq 0) { Write-Host "No valid models picked - aborting."; exit 0 }
    $pickedModels = ($files -join ",")
  }
  Write-Host ""
  Write-Host "-------------- ABOUT TO RUN --------------"
  Write-Host ("  quick-screen: {0}" -f $(if ($pickedModels) { $pickedModels -replace ',', ', ' } else { "ALL that fit" }))
  Write-Host "  then it OFFERS the full matrix on whatever clears the bar - same session, no restart."
  Write-Host "------------------------------------------"
  $go = Read-Host "Proceed? [Y/n]"
  if ($go -match '^[nN]') { Write-Host "Aborted - nothing downloaded, nothing run."; exit 0 }
  Write-Host ""
}

# ---- run: download -> detect -> QUICK SCREEN -> (offer) FULL MATRIX on winners ----
& (Join-Path $root "download-models.ps1") -RamGB $RamGB -Build $KitBuild -Models $pickedModels
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
  Add-KitLog $root "download step FAILED - stopping before the bench (see the DOWNLOAD FAILED lines above; rerun run.ps1 to retry)."
  exit 1
}
& (Join-Path $root "detect-facts.ps1")

# STEP 1 - the quick screen (phase 3), ALWAYS, exactly once.
& (Join-Path $root "run-bench.ps1") -Phases "3" -Models $pickedModels -RamGB $RamGB -Build $KitBuild -Force:$Force

# STEP 2 - read the FRESH verdicts for the models just screened, number them, mark
# the winners (cleared the cutoff). This is the "no restart" continuation.
$screened = if ($pickedModels) { @($pickedModels -split ',') } else { @($fit | Where-Object { $_.fits } | ForEach-Object { Split-Path $_.out -Leaf }) }
$qs = Get-KitQuickStatus $root $KitBuild
$rank = @{}; $k = 0; $winners = @(); $winNums = @()
Write-Host ""
Write-Host "============ full test? (same session - no restart) ============"
foreach ($f in $screened) {
  $k++; $rank[$k] = $f
  $tg = $null; if ($qs.ContainsKey($f)) { $tg = $qs[$f].tg }
  $v = Get-KitQuickVerdict $tg
  if ($v -eq 'run full') { $winners += $f; $winNums += $k }
  $tgTxt = if ($null -ne $tg) { "{0:N1} tok/s" -f $tg } else { "no speed" }
  Write-Host ("  [{0}] {1,-32} {2,-11} {3}" -f $k, $f, $tgTxt, $v)
}

# STEP 3 - offer the full matrix: recommended winners by default, your own pick, or skip.
$runFull = @()
if ($winners.Count -gt 0) {
  Write-Host ("Cleared {0} tok/s (recommended): {1}" -f $KitQuickMinTg, ($winNums -join ','))
  if ($Yes) { $runFull = $winners }
  else {
    $ans = Read-Host "Run the FULL tuning matrix (HOURS) now?  [Enter]=recommended  |  e.g. 1,2=your pick  |  n=stop"
    if ($ans -match '^\s*n\s*$') { $runFull = @() }
    elseif ($ans -match '\S') { $runFull = @(Resolve-KitNumbers $ans $rank) }
    else { $runFull = $winners }
  }
} else {
  Write-Host ("Nothing cleared {0} tok/s - no full test recommended (you can still pick one)." -f $KitQuickMinTg)
  if (-not $Yes) {
    $ans = Read-Host "Run the full matrix anyway on any?  e.g. 1,2  |  Enter/n = stop"
    if ($ans -match '\S' -and $ans -notmatch '^\s*n\s*$') { $runFull = @(Resolve-KitNumbers $ans $rank) }
  }
}

if ($runFull.Count -gt 0) {
  Write-Host ("FULL MATRIX on: {0}" -f ($runFull -join ', '))
  & (Join-Path $root "run-bench.ps1") -Phases "1,2" -Models ($runFull -join ',') -RamGB $RamGB -Build $KitBuild -Force:$Force
} else {
  Write-Host "No full test - stopping after the quick screen."
}

Write-Host ""
Write-Host "All done. Send back: results.jsonl + bench-log.txt + quick-summary.txt + quality-probe-*.txt + detect-facts.txt"
