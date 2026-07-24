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
  printf "        quick screen: %s\n" "$(kit_quick_status "$file" "$KIT_BUILD" "$ROOT")"
  case "${KIT_MODEL_OUTS[$i]}" in *A4B*) MOE_FITS=1 ;; esac
  i=$(( i + 1 ))
done
FREE="$(df -k "$ROOT" 2>/dev/null | awk 'NR==2 {printf "%.1f", $4/1048576}')"
echo "Disk    : download needed ~$(gb "$DL_BYTES") GB - free here: ${FREE:-?} GB"
echo "Tests   :"
echo "  1. QUICK SCREEN : one generation/model - you SEE the speed + verdict (minutes)"
if [ "$MOE_FITS" = 1 ]; then
  echo "  2. FULL MATRIX  : offered after the quick screen, on models that cleared the"
  echo "                    bar - same session, no restart. 16-combo sweep + MoE (HOURS)"
else
  echo "  2. FULL MATRIX  : offered after the quick screen, on models that cleared the"
  echo "                    bar - same session, no restart. 16-combo sweep (HOURS)"
fi
echo "Results : results.jsonl + bench-log.txt + quality-probe-*.txt + detect-facts.txt"
echo "          -> copy back into bench/results/<machine>/kit/ in the repo"
echo "======================================"
echo ""
if [ "$PLAN_ONLY" = 1 ]; then echo "(--plan-only: stopping here.)"; exit 0; fi

# ---- confirm: pick MODELS. The full-test decision comes AFTER the quick screen,
# where the recommendations exist (mirror of run.ps1). -----------------------
MODELS_SEL=""
if [ "$YES" != 1 ]; then
  printf "1) Which MODELS? (e.g. 1,3 - blank or 'all' = all) [1-%d] " "$n"
  read -r msel || msel=""
  case "$msel" in n|N) echo "Aborted - nothing downloaded, nothing run."; exit 0 ;; esac
  if [ -n "$msel" ] && ! echo "$msel" | grep -qi '^[[:space:]]*all[[:space:]]*$'; then
    sel_files=""
    for tok in $(echo "$msel" | tr ',' ' '); do
      case "$tok" in [0-9]*) f="${PICK_FILES[$tok]:-}"; [ -n "$f" ] && sel_files="$sel_files${sel_files:+,}$f" ;; esac
    done
    if [ -z "$sel_files" ]; then echo "No valid models picked - aborting."; exit 0; fi
    MODELS_SEL="$sel_files"
  fi
  echo ""
  echo "-------------- ABOUT TO RUN --------------"
  echo "  quick-screen: ${MODELS_SEL:-ALL that fit}"
  echo "  then it OFFERS the full matrix on whatever clears the bar - same session, no restart."
  echo "------------------------------------------"
  printf "Proceed? [Y/n] "
  read -r go || go=""
  case "$go" in n*|N*) echo "Aborted - nothing downloaded, nothing run."; exit 0 ;; esac
  echo ""
fi

# ---- run: download -> detect -> QUICK SCREEN -> (offer) FULL MATRIX on winners ---
bash "$ROOT/download-models.sh" --ram-gb "$RAM_GB" --build "$KIT_BUILD" --models "$MODELS_SEL"
if [ $? -ne 0 ]; then
  kit_log "$ROOT" "download step FAILED - stopping before the bench (see the DOWNLOAD FAILED lines above; rerun run.sh to retry)."
  exit 1
fi
bash "$ROOT/detect-facts.sh"

# STEP 1 - the quick screen (phase 3), ALWAYS, exactly once.
bash "$ROOT/run-bench.sh" --phases "3" --models "$MODELS_SEL" --ram-gb "$RAM_GB" --build "$KIT_BUILD" --force "$FORCE"

# STEP 2 - the models just screened, with fresh verdicts + winners (>= cutoff).
if [ -n "$MODELS_SEL" ]; then
  SCREENED="$(echo "$MODELS_SEL" | tr ',' ' ')"
else
  SCREENED=""
  i=0
  while [ $i -lt ${#KIT_MODEL_OUTS[@]} ]; do
    [ "${FITS[$i]}" = 1 ] && SCREENED="$SCREENED $(basename "${KIT_MODEL_OUTS[$i]}")"
    i=$(( i + 1 ))
  done
fi

pick_rank() {  # $1 = "1,2" -> comma-joined files looked up in RANK (1-indexed)
  local sel="" t f
  for t in $(echo "$1" | tr ',' ' '); do
    case "$t" in [0-9]*) f="${RANK[$t]:-}"; [ -n "$f" ] && sel="$sel${sel:+,}$f" ;; esac
  done
  echo "$sel"
}

echo ""
echo "============ full test? (same session - no restart) ============"
RANK=(); WINNERS=""; WNUMS=""; k=0
for f in $SCREENED; do
  k=$(( k + 1 )); RANK[$k]="$f"
  tg="$(kit_quick_tg "$f" "$KIT_BUILD" "$ROOT")"
  v="$(kit_quick_verdict "$tg")"
  if [ -n "$tg" ]; then tgtxt="$tg tok/s"; else tgtxt="no speed"; fi
  printf "  [%d] %-32s %-11s %s\n" "$k" "$f" "$tgtxt" "$v"
  if [ "$v" = "run full" ]; then WINNERS="$WINNERS${WINNERS:+,}$f"; WNUMS="$WNUMS${WNUMS:+,}$k"; fi
done

# STEP 3 - offer the full matrix: winners by default, your own pick, or skip.
RUN_FULL=""
if [ -n "$WINNERS" ]; then
  echo "Cleared $KIT_QUICK_MIN_TG tok/s (recommended): $WNUMS"
  if [ "$YES" = 1 ]; then RUN_FULL="$WINNERS"
  else
    printf "Run the FULL tuning matrix (HOURS) now?  [Enter]=recommended  |  e.g. 1,2=your pick  |  n=stop  "
    read -r ans || ans=""
    case "$ans" in
      n|N) RUN_FULL="" ;;
      "")  RUN_FULL="$WINNERS" ;;
      *)   RUN_FULL="$(pick_rank "$ans")" ;;
    esac
  fi
else
  echo "Nothing cleared $KIT_QUICK_MIN_TG tok/s - no full test recommended (you can still pick one)."
  if [ "$YES" != 1 ]; then
    printf "Run the full matrix anyway on any?  e.g. 1,2  |  Enter/n = stop  "
    read -r ans || ans=""
    case "$ans" in ""|n|N) RUN_FULL="" ;; *) RUN_FULL="$(pick_rank "$ans")" ;; esac
  fi
fi

if [ -n "$RUN_FULL" ]; then
  echo "FULL MATRIX on: $RUN_FULL"
  bash "$ROOT/run-bench.sh" --phases "1,2" --models "$RUN_FULL" --ram-gb "$RAM_GB" --build "$KIT_BUILD" --force "$FORCE"
else
  echo "No full test - stopping after the quick screen."
fi

echo ""
echo "All done. Send back: results.jsonl + bench-log.txt + quick-summary.txt + quality-probe-*.txt + detect-facts.txt"
