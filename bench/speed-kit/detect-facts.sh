#!/usr/bin/env bash
# detect-facts.sh - sh mirror of detect-facts.ps1: dump this machine's hardware
# facts to detect-facts.txt. Read-only; nothing installed, nothing changed.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
. "$ROOT/kit-common.sh"
OUT="$ROOT/detect-facts.txt"

echo "=== detect-facts $(date -u '+%Y-%m-%dT%H:%M:%SZ') ===" > "$OUT"

echo "--- OS / CPU / RAM ---" >> "$OUT"
uname -a >> "$OUT" 2>/dev/null
case "$(kit_os)" in
  macos)
    sysctl -n machdep.cpu.brand_string >> "$OUT" 2>/dev/null
    echo "cores: $(sysctl -n hw.ncpu 2>/dev/null)" >> "$OUT"
    ;;
  *)
    awk -F: '/model name/ {gsub(/^ /,"",$2); print $2; exit}' /proc/cpuinfo >> "$OUT" 2>/dev/null
    echo "cores: $(nproc 2>/dev/null)" >> "$OUT"
    ;;
esac
RAM="$(kit_ram_bytes 0)"
echo "TotalPhysicalMemory: $RAM bytes ($(awk -v b="$RAM" 'BEGIN {printf "%.1f", b/1073741824}') GB)" >> "$OUT"

echo "--- GPUs ---" >> "$OUT"
case "$(kit_os)" in
  macos) system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset Model|VRAM|Vendor" >> "$OUT" || echo "(system_profiler unavailable)" >> "$OUT" ;;
  *)     lspci 2>/dev/null | grep -iE "vga|3d controller" >> "$OUT" || echo "(lspci unavailable)" >> "$OUT" ;;
esac

echo "--- Vulkan/Metal devices (what the engine sees) ---" >> "$OUT"
SRV="$(find "$ROOT/engine" -name "llama-server" -type f 2>/dev/null | head -1)"
if [ -n "$SRV" ]; then
  "$SRV" --list-devices >> "$OUT" 2>&1 || echo "list-devices failed" >> "$OUT"
else
  echo "llama-server not found (run download-models.sh first)" >> "$OUT"
fi

echo "Wrote $OUT - send this file back."
