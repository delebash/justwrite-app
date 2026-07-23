# kit-common.ps1 - the ONE source for the kit's shared facts + fit logic.
# Dot-sourced by run.ps1 / download-models.ps1 / run-bench.ps1 - never run directly.
# THE ENGINE PIN LIVES HERE AND ONLY HERE. Pinned (not "latest") because the kit's
# job is cross-machine comparison: the build is a controlled variable (llama.cpp
# lands several builds a day and Vulkan perf moves between them). Bumping = edit
# $KitBuild (or pass -Build to run.ps1) and re-run; every results.jsonl row
# self-labels with build_commit/build_number, so mixed history stays readable.
# PS 5.1-compatible on purpose (target boxes run stock Windows PowerShell).

$KitBuild = "b10083"

# RAM-fit rule (shared by download + bench): a model whose file exceeds
# $KitFitFactor x this machine's RAM would page-thrash and measure the pagefile,
# so it is skipped LOUDLY at download AND at bench (same factor, same RAM source).
$KitFitFactor = 0.7

# The model set - the kit's controlled variable. Same set offered everywhere;
# the fit rule (not a human, not a folder) decides per machine what runs.
$KitModels = @(
  @{ name = "gemma-4 E2B QAT";        url = "https://huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF/resolve/main/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf";
     out  = "models\gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf" },
  @{ name = "gemma-4 E4B QAT";        url = "https://huggingface.co/unsloth/gemma-4-E4B-it-qat-GGUF/resolve/main/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf";
     out  = "models\gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf" },
  @{ name = "gemma-4 12B QAT";        url = "https://huggingface.co/unsloth/gemma-4-12B-it-qat-GGUF/resolve/main/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf";
     out  = "models\gemma-4-12B-it-qat-UD-Q4_K_XL.gguf" },
  @{ name = "gemma-4 26B-A4B QAT MoE"; url = "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF/resolve/main/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf";
     out  = "models\gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf" }
)

function Get-KitEngineUrl([string]$Build) {
  "https://github.com/ggml-org/llama.cpp/releases/download/$Build/llama-$Build-bin-win-vulkan-x64.zip"
}

# One log for everything the kit does (downloads, skips, failures, bench) -
# bench-log.txt, the file the human already sends back. Timestamped, and every
# line also goes to the console so nothing is silent.
function Add-KitLog([string]$Root, [string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  $line | Add-Content (Join-Path $Root "bench-log.txt")
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
