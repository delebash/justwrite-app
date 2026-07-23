# download-models.ps1 - fetch everything the kit needs that is NOT in git:
# the two GGUF models (~21 GB) + the pinned Vulkan engine zip (unzipped ready).
# Resumable-ish: existing files are skipped; delete a partial file to refetch.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
New-Item -ItemType Directory -Force (Join-Path $root "models") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root "engine") | Out-Null

$files = @(
  @{ url = "https://github.com/ggml-org/llama.cpp/releases/download/b10083/llama-b10083-bin-win-vulkan-x64.zip";
     out = "engine\llama-b10083-bin-win-vulkan-x64.zip" },
  @{ url = "https://huggingface.co/unsloth/gemma-4-12B-it-qat-GGUF/resolve/main/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf";
     out = "models\gemma-4-12B-it-qat-UD-Q4_K_XL.gguf" },
  @{ url = "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF/resolve/main/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf";
     out = "models\gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf" }
)
foreach ($f in $files) {
  $dest = Join-Path $root $f.out
  if (Test-Path $dest) { Write-Host "have: $($f.out)"; continue }
  Write-Host "downloading: $($f.out)"
  try {
    Start-BitsTransfer -Source $f.url -Destination $dest   # resumable, preinstalled
  } catch {
    Write-Host "BITS failed ($_) - falling back to Invoke-WebRequest"
    Invoke-WebRequest -Uri $f.url -OutFile $dest
  }
}
$zip = Join-Path $root "engine\llama-b10083-bin-win-vulkan-x64.zip"
$exe = Get-ChildItem -Recurse (Join-Path $root "engine") -Filter "llama-bench.exe" -ErrorAction SilentlyContinue
if (-not $exe) { Write-Host "unzipping engine..."; Expand-Archive $zip (Join-Path $root "engine\unpacked") -Force }
Write-Host "Ready. Next: detect-facts.ps1, then run-bench.ps1."
