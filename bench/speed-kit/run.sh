#!/usr/bin/env bash
# run.sh - THE one click for Mac/Linux (mirror of run.ps1). Detection proposes,
# never dictates: detect the machine, print the full PLAN, ask before a byte is
# downloaded or an hour is burned. Y runs everything; n aborts; s picks tests.
#   --yes         skip the prompt (unattended/overnight)
#   --plan-only   print the plan and exit
#   --ram-gb 16   override detected RAM (wrong detection, or dry-running
#                 another machine's fit)
#   --build bXXX  engine override for a deliberate re-test (default: the pin)
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
. "$ROOT/kit-common.sh"

YES=0; PLAN_ONLY=0; RAM_GB=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes)       YES=1 ;;
    --plan-only) PLAN_ONLY=1 ;;
    --ram-gb)    shift; RAM_GB="$1" ;;
    --build)     shift; KIT_BUILD="$1" ;;
    *) echo "unknown flag: $1 (see header)"; exit 2 ;;
  esac
  shift
done

# ---- detect ----------------------------------------------------------------
RAM_BYTES="$(kit_ram_bytes "$RAM_GB")"
RAM_NOTE=""
if [ "$RAM_GB" -gt 0 ] 2>/dev/null; then RAM_NOTE=" (OVERRIDE --ram-gb $RAM_GB)"; fi
OS="$(kit_os)"; ARCH="$(kit_arch)"
if [ "$OS" = "unknown" ] || [ "$ARCH" = "unknown" ]; then
  echo "Unsupported OS/arch ($(uname -s) $(uname -m)) - Windows uses run.bat; else set KIT_OS/KIT_ARCH."
  exit 1
fi
CPU="(unknown cpu)"
case "$OS" in
  macos) CPU="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo '(unknown cpu)')" ;;
  linux) CPU="$(awk -F: '/model name/ {gsub(/^ /,"",$2); print $2; exit}' /proc/cpuinfo 2>/dev/null || echo '(unknown cpu)')" ;;
esac
GPU="(none reported)"
case "$OS" in
  linux) GPU="$(lspci 2>/dev/null | grep -iE 'vga|3d controller' | sed 's/^[^:]*: //' | head -3 | paste -sd' | ' - 2>/dev/null || echo '(lspci unavailable)')" ;;
  macos) GPU="$(system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Chipset Model/ {print $2; exit}' || echo '(unknown)')" ;;
esac
[ -n "$GPU" ] || GPU="(none reported)"

ENGINE_STATE="will download (~10-31 MB)"
if find "$ROOT/engine" -name "llama-bench" -type f 2>/dev/null | grep -q .; then
  ENGINE_STATE="already present"
elif [ -f "$ROOT/engine/$(kit_engine_asset)" ]; then
  ENGINE_STATE="tarball here - will unpack"
fi

echo "Sizing models (local file or HTTP HEAD - nothing is downloaded)..."
FIT_MAX=$(( RAM_BYTES * KIT_FIT_NUM / KIT_FIT_DEN ))
gb() { awk -v b="$1" 'BEGIN {printf "%.2f", b/1073741824}'; }

# per-model: size + fits + have (parallel arrays, bash-3.2-safe)
SIZES=(); FITS=(); HAVES=()
DL_BYTES=0
i=0
while [ $i -lt ${#KIT_MODEL_NAMES[@]} ]; do
  s="$(kit_model_size $i "$ROOT")"
  f="$(kit_fits "$s" "$RAM_BYTES")"
  h=0; [ -f "$ROOT/${KIT_MODEL_OUTS[$i]}" ] && h=1
  SIZES[$i]="$s"; FITS[$i]="$f"; HAVES[$i]="$h"
  if [ "$f" = 1 ] && [ "$h" = 0 ] && [ -n "$s" ]; then DL_BYTES=$(( DL_BYTES + s )); fi
  i=$(( i + 1 ))
done

# ---- the PLAN --------------------------------------------------------------
echo ""
echo "================ PLAN ================"
echo "Machine : $(gb "$RAM_BYTES") GB RAM$RAM_NOTE - $CPU"
echo "GPU     : $GPU"
echo "OS      : $OS $ARCH"
echo "Engine  : $KIT_BUILD $(kit_engine_asset) - $ENGINE_STATE"
echo "Fit rule: model file <= $(gb "$FIT_MAX") GB (0.7 x RAM)"
echo "Models  :"
MOE_FITS=0
i=0
while [ $i -lt ${#KIT_MODEL_NAMES[@]} ]; do
  sz="size unknown"; [ -n "${SIZES[$i]}" ] && sz="$(gb "${SIZES[$i]}") GB"
  if [ "${FITS[$i]}" = 0 ]; then
    echo "  SKIP     ${KIT_MODEL_NAMES[$i]}  $sz  (over the $(gb "$FIT_MAX") GB fit)"
  elif [ "${HAVES[$i]}" = 1 ]; then
    echo "  have     ${KIT_MODEL_NAMES[$i]}  $sz"
  else
    echo "  download ${KIT_MODEL_NAMES[$i]}  $sz"
  fi
  if [ "${FITS[$i]}" = 1 ]; then
    case "${KIT_MODEL_OUTS[$i]}" in *A4B*) MOE_FITS=1 ;; esac
  fi
  i=$(( i + 1 ))
done
FREE="$(df -k "$ROOT" 2>/dev/null | awk 'NR==2 {printf "%.1f", $4/1048576}')"
echo "Disk    : download needed ~$(gb "$DL_BYTES") GB - free here: ${FREE:-?} GB"
echo "Tests   :"
echo "  [1] 16-combo matrix   pp512/2048/8192 + tg128 per combo (hours on slow boxes)"
if [ "$MOE_FITS" = 1 ]; then
  echo "  [2] MoE ncmoe sweep   experts to CPU, 7 points (tens of minutes)"
else
  echo "  [2] MoE ncmoe sweep   auto-skipped - no MoE model fits this machine"
fi
echo "  [3] quality probe     one short generation per model (minutes)"
echo "Results : results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
echo "          -> copy back into bench/results/<machine>/kit/ in the repo"
echo "======================================"
echo ""
if [ "$PLAN_ONLY" = 1 ]; then echo "(--plan-only: stopping here.)"; exit 0; fi

# ---- confirm ---------------------------------------------------------------
PHASES="1,2,3"
if [ "$YES" != 1 ]; then
  printf "Proceed? [Y/n/s(elect tests)] "
  read -r ans || ans=""
  case "$ans" in
    n*|N*) echo "Aborted - nothing downloaded, nothing run."; exit 0 ;;
    s*|S*)
      printf "Tests to run (e.g. 1,3) "
      read -r sel || sel=""
      PHASES="$(echo "$sel" | tr -cs '123' ',' | sed 's/^,//; s/,$//')"
      if [ -z "$PHASES" ]; then echo "No valid tests picked - aborting."; exit 0; fi
      echo "Running tests: $PHASES"
      ;;
  esac
fi

# ---- run -------------------------------------------------------------------
bash "$ROOT/download-models.sh" --ram-gb "$RAM_GB" --build "$KIT_BUILD"
if [ $? -ne 0 ]; then
  kit_log "$ROOT" "download step FAILED - stopping before the bench (see the DOWNLOAD FAILED lines above; rerun run.sh to retry)."
  exit 1
fi
bash "$ROOT/detect-facts.sh"
bash "$ROOT/run-bench.sh" --phases "$PHASES" --ram-gb "$RAM_GB"
echo ""
echo "All done. Send back: results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
