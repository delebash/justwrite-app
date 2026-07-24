#!/usr/bin/env bash
# run.sh - THE one click for Mac/Linux (mirror of run.ps1). Detection proposes,
# never dictates: detect the machine, print the full PLAN, ask before a byte is
# downloaded or an hour is burned. Y runs everything; n aborts; s picks tests.
#   --yes         skip the prompt (unattended/overnight)
#   --plan-only   print the plan and exit
#   --ram-gb 16   override detected RAM (wrong detection, or dry-running
#                 another machine's fit)
#   --build bXXX  pin a specific engine (default: LATEST, resolved at run time)
#   --force       re-run combos already done on this build
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
. "$ROOT/kit-common.sh"

YES=0; PLAN_ONLY=0; RAM_GB=0; FORCE=0; KIT_BUILD=""; BUILD_NOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes)       YES=1 ;;
    --plan-only) PLAN_ONLY=1 ;;
    --force)     FORCE=1 ;;
    --ram-gb)    shift; RAM_GB="$1" ;;
    --build)     shift; KIT_BUILD="$1"; BUILD_NOTE=" (PINNED via --build)" ;;
    *) echo "unknown flag: $1 (see header)"; exit 2 ;;
  esac
  shift
done
# Engine: LATEST by default (the user's ruling), resolved and shown before confirm.
if [ -z "$KIT_BUILD" ]; then
  echo "Resolving latest llama.cpp release..."
  KIT_BUILD="$(kit_latest_build "$ROOT")"
  BUILD_NOTE=" (latest, resolved just now)"
fi

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
echo "Engine  : $KIT_BUILD$BUILD_NOTE $(kit_engine_asset) - $ENGINE_STATE"
echo "Fit rule: model file <= $(gb "$FIT_MAX") GB (0.7 x RAM)"
echo "Models  :"
# combos already done on THIS build, per model filename (build-keyed resume)
kit_done_count() {  # $1 = model filename
  [ -f "$ROOT/results.jsonl" ] || { echo 0; return; }
  grep -F "\"kitBuild\":\"$KIT_BUILD\"" "$ROOT/results.jsonl" 2>/dev/null     | grep -F "\"kitModel\":\"$1\"" | grep -vF '"failed":true' | wc -l | tr -d ' '
}
MOE_FITS=0
PICK_FILES=()
n=0
i=0
while [ $i -lt ${#KIT_MODEL_NAMES[@]} ]; do
  sz="size unknown"; [ -n "${SIZES[$i]}" ] && sz="$(gb "${SIZES[$i]}") GB"
  file="$(basename "${KIT_MODEL_OUTS[$i]}")"
  if [ "${FITS[$i]}" = 0 ]; then
    printf "      SKIP      %-24s %9s  (over the %s GB fit)
" "${KIT_MODEL_NAMES[$i]}" "$sz" "$(gb "$FIT_MAX")"
    i=$(( i + 1 )); continue
  fi
  n=$(( n + 1 ))
  PICK_FILES[$n]="$file"
  state="download"; [ "${HAVES[$i]}" = 1 ] && state="have"
  d="$(kit_done_count "$file")"
  if [ "$d" -ge "$KIT_COMBOS_PER_MODEL" ]; then hist="$d/$KIT_COMBOS_PER_MODEL done @$KIT_BUILD -> skip (current)"
  elif [ "$d" -gt 0 ]; then hist="$d/$KIT_COMBOS_PER_MODEL done @$KIT_BUILD -> resume $(( KIT_COMBOS_PER_MODEL - d ))"
  else hist="-- not run on $KIT_BUILD --"; fi
  printf "  [%d] %-9s %-24s %9s   %s
" "$n" "$state" "${KIT_MODEL_NAMES[$i]}" "$sz" "$hist"
  case "${KIT_MODEL_OUTS[$i]}" in *A4B*) MOE_FITS=1 ;; esac
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
PHASES="1,2,3"; MODELS_SEL=""
if [ "$YES" != 1 ]; then
  printf "Proceed? [Y = run everything / n = abort / s = choose models + tests] "
  read -r ans || ans=""
  case "$ans" in
    n*|N*) echo "Aborted - nothing downloaded, nothing run."; exit 0 ;;
    s*|S*|m*|M*|t*|T*)
      # ONE customise path asking BOTH questions in order (mirror of run.ps1)
      printf "Models to run (e.g. 1,3 - blank or 'all' = all) [1-%d] " "$n"
      read -r msel || msel=""
      if [ -n "$msel" ] && ! echo "$msel" | grep -qi '^[[:space:]]*all[[:space:]]*$'; then
        sel_files=""
        for tok in $(echo "$msel" | tr ',' ' '); do
          case "$tok" in [0-9]*) f="${PICK_FILES[$tok]:-}"; [ -n "$f" ] && sel_files="$sel_files${sel_files:+,}$f" ;; esac
        done
        if [ -z "$sel_files" ]; then echo "No valid models picked - aborting."; exit 0; fi
        MODELS_SEL="$sel_files"
      fi
      printf "Tests to run (1=matrix 2=MoE sweep 3=quality probe - blank or 'all' = all) "
      read -r tsel || tsel=""
      if [ -n "$tsel" ] && ! echo "$tsel" | grep -qi '^[[:space:]]*all[[:space:]]*$'; then
        PHASES="$(echo "$tsel" | tr -cs '123' ',' | sed 's/^,//; s/,$//')"
        if [ -z "$PHASES" ]; then echo "No valid tests picked - aborting."; exit 0; fi
      fi
      echo ""
      echo "Will run:  models = ${MODELS_SEL:-all}"
      echo "           tests  = $PHASES"
      echo ""
      ;;
  esac
fi

# ---- run -------------------------------------------------------------------
bash "$ROOT/download-models.sh" --ram-gb "$RAM_GB" --build "$KIT_BUILD" --models "$MODELS_SEL"
if [ $? -ne 0 ]; then
  kit_log "$ROOT" "download step FAILED - stopping before the bench (see the DOWNLOAD FAILED lines above; rerun run.sh to retry)."
  exit 1
fi
bash "$ROOT/detect-facts.sh"
bash "$ROOT/run-bench.sh" --phases "$PHASES" --models "$MODELS_SEL" --ram-gb "$RAM_GB" --build "$KIT_BUILD" --force "$FORCE"
echo ""
echo "All done. Send back: results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
