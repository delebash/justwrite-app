# kit-common.ps1 - the ONE source for the kit's shared facts + fit logic.
# Dot-sourced by run.ps1 / download-models.ps1 / run-bench.ps1 - never run directly.
# kit-common.sh is the Mac/Linux FACE OF THE SAME FACTS (build policy, model list,
# fit rule, matrix) - when one changes, change BOTH.
#
# ENGINE POLICY: LATEST, not pinned (the user's ruling 2026-07-23). llama.cpp moves
# fast and ships real fixes - a pin hid one: b10083 could not read the current
# ternary files and had no Vulkan ternary kernels, while b10099 reads them and
# offloads (VRAM 565->4188 MiB, measured). Production uses latest, so the bench
# uses latest. Comparability is preserved by DATA, not by freezing: every
# llama-bench row self-labels build_commit/build_number, and the kit's resume key
# INCLUDES the build - so a new engine re-runs its combos instead of silently
# mixing two builds in one matrix. -Build <tag> pins deliberately when you want
# two machines on one matched build.
# PS 5.1-compatible on purpose (target boxes run stock Windows PowerShell).

# Used only when the releases API can't be reached and no cached tag exists.
$KitFallbackBuild = "b10099"

# RAM-fit rule (shared by download + bench): a model whose file exceeds
# $KitFitFactor x this machine's RAM would page-thrash and measure the pagefile,
# so it is skipped LOUDLY at download AND at bench (same factor, same RAM source).
$KitFitFactor = 0.7

# QUICK-SCREEN cutoff (the user's ruling 2026-07-24, "your rec"): after the quick
# screen generates once per model, a model whose DECODE speed is below this many
# tokens/sec is flagged "SKIP too slow" (not worth the hours-long full matrix);
# at/above it, "run full". ONE number, ONE tier - decode tok/s is the speed a
# reader watches prose stream on screen (~7 keeps pace with reading; below ~5 is
# painful). Edit HERE (one source); run-bench reads it, never hardcodes it.
# ADVISORY: it prints a verdict + writes quick-summary.txt, it does not block a run.
$KitQuickMinTg = 7

# TEXT-FILE ENCODING (fixes the "why is the log in Chinese" bug 2026-07-24). The
# kit's human-readable text files (bench-log.txt, detect-facts.txt, quick-summary.txt)
# were written by TWO mechanisms with DIFFERENT encodings: the `2>>` redirect (which
# captures llama.cpp's own output) and `Add-Content`. On Windows PowerShell 5.1 the
# redirect writes UTF-16 while Add-Content writes ANSI - so half the file was one
# encoding, half the other, and an editor that picks one turns the rest into a wall
# of CJK. The fix: make Add-Content/Set-Content MATCH the redirect's per-version
# encoding, so each file is uniform and always opens readable. (PS 7 uses UTF-8 for
# both; 5.1 uses UTF-16 for the redirect - so we follow suit per version.) Paired
# with [Console]::OutputEncoding=UTF8 at each script's top so llama.cpp's UTF-8
# output DECODES correctly before it is written.
$KitTextEnc = if ($PSVersionTable.PSVersion.Major -ge 6) { 'utf8' } else { 'unicode' }

# The 16-combo matrix - defined HERE so run.ps1 can size "N/8 done" without
# duplicating run-bench's loop bounds.
$KitNgls = @(99, 0)
$KitUbs  = @(512, 2048)
$KitFas  = @(1, 0)
$KitCombosPerModel = $KitNgls.Count * $KitUbs.Count * $KitFas.Count

# The model set. The fit rule (not a human, not a folder) decides per machine
# what runs.
# TERNARY FILE RULE (verified 2026-07-23, both files HEAD-checked + load-tested):
# use the *g64* variant of each Bonsai model. The plain *-Q2_0.gguf files are the
# FORK's packing - mainline rejects them outright ("failed to read tensor data" on
# both b10083 and b10099). The repos label the same g64 format inconsistently:
# the 8B uses the standardized "Q2_0_g64", the 27B the older "Q2_g64".
# Filenames are kept TRUE (never renamed) so a results row can't claim one
# packing while holding another - the demo launcher's own picker forces a rename,
# which silently destroys that provenance.
$KitModels = @(
  @{ name = "gemma-4 E2B QAT";        url = "https://huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF/resolve/main/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf";
     out  = "models\gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf" },
  @{ name = "gemma-4 E4B QAT";        url = "https://huggingface.co/unsloth/gemma-4-E4B-it-qat-GGUF/resolve/main/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf";
     out  = "models\gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf" },
  @{ name = "gemma-4 12B QAT";        url = "https://huggingface.co/unsloth/gemma-4-12B-it-qat-GGUF/resolve/main/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf";
     out  = "models\gemma-4-12B-it-qat-UD-Q4_K_XL.gguf" },
  @{ name = "gemma-4 26B-A4B QAT MoE"; url = "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF/resolve/main/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf";
     out  = "models\gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf" },
  @{ name = "Ternary-Bonsai 8B g64";  url = "https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/resolve/main/Ternary-Bonsai-8B-Q2_0_g64.gguf";
     out  = "models\Ternary-Bonsai-8B-Q2_0_g64.gguf" },
  @{ name = "Ternary-Bonsai 27B g64"; url = "https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf/resolve/main/Ternary-Bonsai-27B-Q2_g64.gguf";
     out  = "models\Ternary-Bonsai-27B-Q2_g64.gguf" }
)

function Get-KitEngineUrl([string]$Build) {
  "https://github.com/ggml-org/llama.cpp/releases/download/$Build/llama-$Build-bin-win-vulkan-x64.zip"
}

# Resolve the newest mainline release tag. Caches the answer in .latest-build so a
# rate-limited or offline rerun still knows what it used last time; falls back to
# $KitFallbackBuild only when there is no network AND no cache.
function Get-KitLatestBuild([string]$Root) {
  $cache = Join-Path $Root ".latest-build"
  try {
    $r = Invoke-WebRequest -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest" -TimeoutSec 30 -UseBasicParsing
    $tag = ($r.Content | ConvertFrom-Json).tag_name
    if ($tag) { $tag | Set-Content $cache; return $tag }
  } catch { }
  if (Test-Path $cache) {
    $cached = (Get-Content $cache -TotalCount 1).Trim()
    if ($cached) { return $cached }
  }
  $KitFallbackBuild
}

# One log for everything the kit does (downloads, skips, failures, bench) -
# bench-log.txt, the file the human already sends back. Timestamped, and every
# line also goes to the console so nothing is silent.
function Add-KitLog([string]$Root, [string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  $line | Add-Content (Join-Path $Root "bench-log.txt") -Encoding $KitTextEnc
}

# ONE definition of the quick-screen verdict (run-bench PRINTS it after a run;
# run.ps1's PLAN shows the CACHED one before you pick) - so the two can never
# disagree. $null tg = the run left no parseable timing line.
function Get-KitQuickVerdict($Tg) {
  if ($null -eq $Tg) { return "no speed line" }
  if ($Tg -ge $KitQuickMinTg) { return "run full" }
  "SKIP too slow"
}

# What the quick screen already recorded for each model ON THIS BUILD, read from
# the per-model quality-probe files - so the PLAN can show what's cached BEFORE you
# pick (the user's ruling 2026-07-24: show it; picking always re-runs anyway).
# Keyed by model FILENAME -> @{ tg = <double or $null> }. A model with no probe is
# simply absent from the map (the PLAN shows "not yet run"); a probe that exists but
# has no timing line yields tg=$null (-> "no speed line").
function Get-KitQuickStatus([string]$Root, [string]$CurrentBuild) {
  $status = @{}
  foreach ($m in $KitModels) {
    $file = Split-Path $m.out -Leaf
    $base = [System.IO.Path]::GetFileNameWithoutExtension($file)
    $probe = Join-Path $Root ("quality-probe-{0}-{1}.txt" -f $base, $CurrentBuild)
    if (-not (Test-Path $probe)) { continue }
    $tg = $null
    $speed = (Select-String -Path $probe -Pattern 'Prompt:.*Generation:' -ErrorAction SilentlyContinue | Select-Object -First 1).Line
    if ($speed -match 'Generation:\s*([\d.]+)') { $tg = [double]$matches[1] }
    $status[$file] = @{ tg = $tg }
  }
  $status
}

# Parse a numbered multi-select like "1,3-5" into its mapped values. $Map is a
# hashtable number -> value. ONE parser, shared by run.ps1's model picker AND the
# post-quick "which to full-test" picker, so the two behave identically. Empty when
# nothing valid is picked - callers treat that as "none", never "all".
function Resolve-KitNumbers([string]$Sel, $Map) {
  $chosen = @()
  foreach ($tok in ($Sel -split '[,\s]+' | Where-Object { $_ })) {
    if ($tok -match '^(\d+)-(\d+)$') { $chosen += ([int]$matches[1])..([int]$matches[2]) }
    elseif ($tok -match '^\d+$') { $chosen += [int]$tok }
  }
  $files = @()
  foreach ($i in ($chosen | Sort-Object -Unique)) { if ($Map.ContainsKey($i)) { $files += $Map[$i] } }
  $files
}

function Get-KitRamBytes([double]$OverrideGB) {
  if ($OverrideGB -gt 0) { return [int64]($OverrideGB * 1GB) }
  (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
}

# Model size WITHOUT downloading: the local file if present (authoritative),
# else an HTTP HEAD following redirects (HF resolve URLs 302 to a CDN; the final
# response carries the true Content-Length - verified live 2026-07-23).
# $null = size unknown; the fit rule then treats the model as FITTING (fail-safe:
# worst case is a wasted download, never a wrongly-stranded model).
function Get-KitModelSize($Model, [string]$Root) {
  $local = Join-Path $Root $Model.out
  if (Test-Path $local) { return (Get-Item $local).Length }
  try {
    $r = Invoke-WebRequest -Uri $Model.url -Method Head -MaximumRedirection 5 -TimeoutSec 40 -UseBasicParsing
    $cl = $r.Headers['Content-Length'] | Select-Object -First 1
    if ($cl) { return [int64]$cl }
  } catch { }
  $null
}

# The fit decision for every model: returns the same hashtables decorated with
# .size (bytes or $null) and .fits (bool).
function Get-KitFit([int64]$RamBytes, [string]$Root) {
  $max = [int64]($KitFitFactor * $RamBytes)
  foreach ($m in $KitModels) {
    $size = Get-KitModelSize $m $Root
    $fits = $true
    if ($null -ne $size -and $size -gt $max) { $fits = $false }
    $m2 = @{} + $m   # shallow copy so callers can't mutate the shared list
    $m2.size = $size
    $m2.fits = $fits
    $m2
  }
}

# THE RESUME KEY - one definition, used by run-bench (to skip) and run.ps1 (to
# report "N/8 done"). The BUILD is part of the key: a new engine re-runs its
# combos rather than silently mixing two builds into one matrix.
function Get-KitComboKey([string]$Build, [string]$ModelFile, $Ngl, $Ub, $Fa) {
  "$Build|$ModelFile|$Ngl|$Ub|$Fa"
}

# Read results.jsonl once and summarise per model FILENAME:
#   .done      combos completed on $CurrentBuild
#   .doneAny   combos completed on any build
#   .lastBuild the newest build that produced rows for this model
#   .lastTg    best tg128 tok/s seen (what the human recognises)
# Returns a hashtable keyed by model filename. Missing file -> empty table.
function Get-KitResultsStatus([string]$Root, [string]$CurrentBuild) {
  $status = @{}
  $results = Join-Path $Root "results.jsonl"
  if (-not (Test-Path $results)) { return $status }
  foreach ($line in (Get-Content $results)) {
    $j = $null
    try { $j = $line | ConvertFrom-Json } catch { continue }
    if (-not $j) { continue }
    if ($j.failed) { continue }
    $mf = $j.kitModel
    if (-not $mf) { continue }
    if (-not $status.ContainsKey($mf)) {
      $status[$mf] = @{ done = 0; doneAny = 0; lastBuild = ""; lastTg = $null }
    }
    $s = $status[$mf]
    $s.doneAny = $s.doneAny + 1
    # build that produced this row: kitBuild when present (rows written by this
    # kit version), else the engine's own self-label inside the llama-bench rows
    $b = $j.kitBuild
    $rows = $j.rows
    if ($rows -and $rows.value) { $rows = $rows.value }
    if (-not $b -and $rows -and $rows[0].build_number) { $b = "b" + $rows[0].build_number }
    if ($b -eq $CurrentBuild) { $s.done = $s.done + 1 }
    if ($b) { $s.lastBuild = $b }
    foreach ($r in $rows) {
      if ($r.n_gen -eq 128 -and $null -ne $r.avg_ts) {
        if ($null -eq $s.lastTg -or $r.avg_ts -gt $s.lastTg) { $s.lastTg = $r.avg_ts }
      }
    }
  }
  $status
}
