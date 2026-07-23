# detect-facts.ps1 - dump this machine's hardware facts to detect-facts.txt.
# Read-only: registry display adapters (name + reported memory), RAM, CPU, OS,
# plus what the Vulkan engine itself sees. No installs, nothing changed.
$ErrorActionPreference = "Continue"
$out = Join-Path $PSScriptRoot "detect-facts.txt"
"=== detect-facts $(Get-Date -Format o) ===" | Set-Content $out

"--- OS / CPU / RAM ---" | Add-Content $out
(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture | Format-List | Out-String) | Add-Content $out
(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors | Format-List | Out-String) | Add-Content $out
$ram = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
"TotalPhysicalMemory: $ram bytes ($([math]::Round($ram/1GB,1)) GB)" | Add-Content $out

"--- Display-class registry (what JustWrite's detection reads) ---" | Add-Content $out
$cls = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
Get-ChildItem $cls -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
  if ($p.DriverDesc) {
    "[$($_.PSChildName)] DriverDesc: $($p.DriverDesc)" | Add-Content $out
    $qw = $p.'HardwareInformation.qwMemorySize'
    if ($qw -is [byte[]]) { $qw = [BitConverter]::ToUInt64($qw, 0) }
    if ($qw) { "         qwMemorySize: $qw bytes ($([math]::Round($qw/1GB,2)) GB)" | Add-Content $out }
    else { "         qwMemorySize: (absent)" | Add-Content $out }
  }
}

"--- Vulkan devices (what the engine sees) ---" | Add-Content $out
$exe = Get-ChildItem -Recurse (Join-Path $PSScriptRoot "engine") -Filter "llama-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($exe) {
  try { & $exe.FullName --list-devices 2>&1 | Add-Content $out } catch { "list-devices failed: $_" | Add-Content $out }
} else { "llama-server.exe not found (unzip the engine first - see README)" | Add-Content $out }

Write-Host "Wrote $out - send this file back."
