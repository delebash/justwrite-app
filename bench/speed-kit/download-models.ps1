# download-models.ps1 - fetch everything the kit needs that is NOT in git: the
# model set + the pinned Vulkan engine (unzipped ready). The build, the model
# list, and the RAM-fit rule all live in kit-common.ps1 (ONE source).
# Fit-filtered: a model too big for this machine's RAM is NOT downloaded - same
# rule run-bench.ps1 applies at bench time, so nothing is fetched only to be
# skipped. Loud, never silent. Resumable-ish: existing files are skipped; delete
# a partial file to refetch. Runs standalone or from run.ps1.
#   -RamGB 16      override detected RAM (see run.ps1)
#   -Build b10xxx  engine override (default: the pin in kit-common.ps1)
#   -Models "a.gguf,b.gguf"  only fetch these (run.ps1's m picker passes them);
#                            empty = every model that fits
param(
  [double]$RamGB = 0,
  [string]$Build = "",
  [string]$Models = ""
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
. (Join-Path $root "kit-common.ps1")
# Latest by default (the user's ruling) - run.ps1 passes the tag it resolved and
# showed you in the PLAN, so both steps use exactly the same engine.
$KitBuild = $Build
if (-not $KitBuild) { $KitBuild = Get-KitLatestBuild $root }
New-Item -ItemType Directory -Force (Join-Path $root "models") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root "engine") | Out-Null

# Download to .part, verify size when known, then rename - so a failed/aborted
# download can NEVER masquerade as a complete file (Test-Path on the real name
# only sees finished, size-checked files). Throws on any failure; caller catches.
#
# RETRIES WITH BACKOFF across multiple transports. GitHub's release CDN
# (release-assets.githubusercontent.com) throws transient 504 Gateway Timeouts that
# a single attempt can't ride through - that WAS the "flashes like it's going to and
# doesn't download" bug: one BITS + one IWR attempt, both caught the same blip, the
# script bailed. curl.exe (bundled on Win10 1803+/Win11) is primary: fastest by far,
# follows the signed redirect cleanly, and has its OWN --retry for 5xx/timeouts.
# BITS (resumable) and Invoke-WebRequest are fallbacks for boxes without curl.exe.
function Get-KitFile([string]$Url, [string]$Dest, [int64]$ExpectedSize) {
  $part = "$Dest.part"
  if (Test-Path $part) { Remove-Item $part -Force }
  $curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
  $methods = @()
  if ($curl) { $methods += @{ name = "curl"; tries = 2 } }   # own --retry, so few outer tries
  $methods += @{ name = "bits"; tries = 3 }
  $methods += @{ name = "iwr";  tries = 2 }
  $lastErr = $null
  foreach ($m in $methods) {
    for ($try = 1; $try -le $m.tries; $try++) {
      try {
        switch ($m.name) {
          # --fail: nonzero exit on HTTP 4xx/5xx so a CDN error page is NEVER saved
          # as the file. --retry*: curl rides transient 504s itself before giving up.
          "curl" {
            & $curl -sS -L --fail --retry 5 --retry-delay 2 --retry-all-errors --retry-connrefused -o $part $Url
            if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE" }
          }
          "bits" { Start-BitsTransfer -Source $Url -Destination $part -ErrorAction Stop }   # resumable, preinstalled
          "iwr"  { Invoke-WebRequest -Uri $Url -OutFile $part -UseBasicParsing }
        }
        $got = (Get-Item $part).Length
        if ($ExpectedSize -gt 0 -and $got -ne $ExpectedSize) {
          throw "size mismatch: got $got bytes, expected $ExpectedSize"
        }
        Move-Item $part $Dest -Force
        return
      } catch {
        $lastErr = $_
        Write-Host ("  {0} attempt {1}/{2} failed: {3}" -f $m.name, $try, $m.tries, $_)
        if (Test-Path $part) { Remove-Item $part -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds (2 * $try)
      }
    }
  }
  throw "all download methods failed after retries - last error: $lastErr"
}

$failed = @()

# ---- engine (always fetched; tiny) -----------------------------------------
$zipName = "llama-$KitBuild-bin-win-vulkan-x64.zip"
$zip = Join-Path $root ("engine\" + $zipName)
if (Test-Path $zip) { Write-Host "have: engine\$zipName" }
else {
  Write-Host "downloading: engine\$zipName"
  try { Get-KitFile (Get-KitEngineUrl $KitBuild) $zip 0 }
  catch {
    Add-KitLog $root "DOWNLOAD FAILED (engine $KitBuild): $_"
    $failed += "engine $KitBuild"
  }
}
# Unzip into a PER-BUILD dir so a -Build override never silently runs an older
# exe that happens to be lying around (the old flat "unpacked" layout had that
# hole). run-bench prefers engine\<build>\, falling back to any exe under
# engine\ for kits stocked before this change.
if (Test-Path $zip) {
  $buildDir = Join-Path $root ("engine\" + $KitBuild)
  $exe = Get-ChildItem -Recurse $buildDir -Filter "llama-bench.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $exe) {
    Write-Host "unzipping engine to engine\$KitBuild ..."
    try { Expand-Archive $zip $buildDir -Force }
    catch {
      # a corrupt zip would fail here forever - delete it so the next run refetches
      Add-KitLog $root "ENGINE UNZIP FAILED ($zipName - deleting the zip so a rerun refetches): $_"
      Remove-Item $zip -Force -ErrorAction SilentlyContinue
      $failed += "engine unzip $KitBuild"
    }
  }
}

# ---- models (fit-filtered) -------------------------------------------------
$ramBytes = Get-KitRamBytes $RamGB
Write-Host ("RAM-fit: {0:N0} GB RAM -> keeping models <= {1} GB ({2} x RAM)" -f ($ramBytes/1GB), [math]::Round($KitFitFactor*$ramBytes/1GB,1), $KitFitFactor)
$modelFilter = @($Models -split '[,]+' | Where-Object { $_ } | ForEach-Object { $_.Trim() })
if ($modelFilter.Count -gt 0) { Write-Host ("Only fetching selected: {0}" -f ($modelFilter -join ", ")) }
foreach ($m in (Get-KitFit $ramBytes $root)) {
  # honour the m picker: don't fetch models the user didn't select (same leaf
  # filename the bench filters on, so the two can't disagree)
  if ($modelFilter.Count -gt 0 -and $modelFilter -notcontains (Split-Path $m.out -Leaf)) { continue }
  $dest = Join-Path $root $m.out
  if (-not $m.fits) {
    $szTxt = "?"
    if ($null -ne $m.size) { $szTxt = [math]::Round($m.size/1GB,1) }
    Add-KitLog $root "SKIP (too big for this machine): $($m.name) ($szTxt GB) - not downloaded"
    continue
  }
  if (Test-Path $dest) { Write-Host "have: $($m.out)"; continue }
  Write-Host "downloading: $($m.out)"
  $expected = [int64]0
  if ($null -ne $m.size) { $expected = $m.size }   # size-check against the HEAD answer
  try { Get-KitFile $m.url $dest $expected }
  catch {
    Add-KitLog $root "DOWNLOAD FAILED ($($m.name)): $_"
    $failed += $m.name
  }
}
if ($failed.Count -gt 0) {
  Add-KitLog $root ("download step finished with FAILURES: " + ($failed -join ", ") + " - rerun to retry (finished files are kept)")
  exit 1
}
Write-Host "Ready. Next: run.ps1 (the one click) - or detect-facts.ps1 + run-bench.ps1 by hand."
exit 0
