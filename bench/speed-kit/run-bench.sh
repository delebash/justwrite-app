#!/usr/bin/env bash
# run-bench.sh - sh mirror of run-bench.ps1: PHASE 1 the 16-combo matrix,
# PHASE 2 the n_cpu_moe sweep (MoE only), PHASE 3 the quality probe. One JSON
# line per combo appended to results.jsonl (resumable: successful combos are
# skipped on rerun, failures retry). Human log in bench-log.txt.
#   --phases "1,3"  run a subset (default all)
#   --ram-gb 16     override detected RAM for the fit guard
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
. "$ROOT/kit-common.sh"

PHASES="1,2,3"; RAM_GB=0; MODELS_SEL=""; KIT_BUILD=""; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --phases) shift; PHASES="$1" ;;
    --models) shift; MODELS_SEL="$1" ;;
    --ram-gb) shift; RAM_GB="$1" ;;
    --build)  shift; KIT_BUILD="$1" ;;
    --force)  shift; FORCE="$1" ;;
    *) echo "unknown flag: $1"; exit 2 ;;
  esac
  shift
done
[ -n "$KIT_BUILD" ] || KIT_BUILD="$(kit_latest_build "$ROOT")"
RESULTS="$ROOT/results.jsonl"
LOG="$ROOT/bench-log.txt"
phase_on() { case ",$PHASES," in *,"$1",*) return 0 ;; *) return 1 ;; esac; }

# THE ENGINE IS THE RESOLVED-LATEST BUILD ONLY - no silent fallback to an older
# build lying around in engine/ (that once silently ran b10083 and made garbage).
# If this build isn't here, DOWNLOAD it (the user's ruling 2026-07-24: "if missing
# just download"), then look again; only a failed download stops the run.
ENGDIR="$ROOT/engine/$KIT_BUILD"
BENCH="$(find "$ENGDIR" -name llama-bench -type f 2>/dev/null | head -1)"
if [ -z "$BENCH" ]; then
  echo "engine $KIT_BUILD not present - downloading it..."
  bash "$ROOT/download-models.sh" --ram-gb "$RAM_GB" --build "$KIT_BUILD" --models "$MODELS_SEL"
  BENCH="$(find "$ENGDIR" -name llama-bench -type f 2>/dev/null | head -1)"
fi
if [ -z "$BENCH" ]; then echo "llama-bench for $KIT_BUILD still missing after download - see bench-log.txt"; exit 1; fi

# Model set = files on disk, smallest first, RAM-fit guarded (mirror of the ps1
# guard - the backstop for hand-copied models; download-models filters too).
RAM_BYTES="$(kit_ram_bytes "$RAM_GB")"
MODELS=""
for f in $(ls -Sr "$ROOT"/models/*.gguf 2>/dev/null); do
  SIZE="$(kit_file_size "$f")"
  if [ "$(kit_fits "$SIZE" "$RAM_BYTES")" = 0 ]; then
    kit_log "$ROOT" "SKIPPED (ram-fit): $(basename "$f")"
  else
    MODELS="$MODELS $f"
  fi
done
if [ -z "$MODELS" ]; then echo "no fitting .gguf files in models/"; exit 1; fi
# model selection (run.sh's m picker passes filenames); empty = all
if [ -n "$MODELS_SEL" ]; then
  SEL=""
  for f in $MODELS; do
    case ",$MODELS_SEL," in *",$(basename "$f"),"*) SEL="$SEL $f" ;; esac
  done
  MODELS="$SEL"
  [ -n "$MODELS" ] || { echo "none of the selected models are present/fitting"; exit 1; }
fi

echo "=== run-bench $(date -u '+%Y-%m-%dT%H:%M:%SZ') - engine $BENCH - phases $PHASES ===" >> "$LOG"

run_combo() {  # $1 file, $2 ngl, $3 ub, $4 fa
  local base key raw
  base="$(basename "$1")"
  key="\"kitBuild\":\"$KIT_BUILD\",\"kitModel\":\"$base\",\"kitNgl\":$2,\"kitUb\":$3,\"kitFa\":$4"
  if [ "$FORCE" != 1 ] && grep -Fq "{$key," "$RESULTS" 2>/dev/null; then
    echo "skip (done): $base ngl=$2 ub=$3 fa=$4"; return
  fi
  echo "RUN: $base ngl=$2 ub=$3 fa=$4  (pp512/2048/8192 + tg128)"
  echo "--- $base|$2|$3|$4 $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$LOG"
  raw="$("$BENCH" -m "$1" -ngl "$2" -ub "$3" -fa "$4" -p "512,2048,8192" -n 128 -o json 2>>"$LOG")"
  if [ $? -ne 0 ] || [ -z "$raw" ]; then
    echo "FAILED: $base|$2|$3|$4" >> "$LOG"
    printf '{%s,"failed":true}\n' "$key" >> "$RESULTS"
    return
  fi
  printf '{%s,"rows":%s}\n' "$key" "$(echo "$raw" | tr -d '\n')" >> "$RESULTS"
}

# QUICK SCREEN (runs FIRST): one generation per model, shown LIVE + the tok/s -
# a hand test. The go/no-go; the hours-long matrix only runs if opted in.
if phase_on 3; then
  CLI="$(find "$ENGDIR" -name llama-cli -type f 2>/dev/null | head -1)"
  if [ -n "$CLI" ]; then
    echo ""
    echo "============ QUICK SCREEN (speed + verdict per model) ============"
    echo "cutoff: decode >= $KIT_QUICK_MIN_TG tok/s -> worth a full test; below -> skip"
    SUMMARY="$ROOT/quick-summary.txt"
    : > "$SUMMARY.tmp"
    TAB="$(printf '\t')"
    for f in $MODELS; do
      base="$(basename "$f" .gguf)"
      PROBE="$ROOT/quality-probe-$base-$KIT_BUILD.txt"
      # PICKED = RUNS, always (the user's ruling 2026-07-24: cached NEVER means
      # skipped - you saw what's cached in the PLAN and chose; tee overwrites the probe).
      echo ""
      echo ">>> $base  (generating ~120 tokens; verdict prints at the end)"
      "$CLI" -m "$f" -ngl 99 --single-turn --temp 0.2 -n 120 \
        -p "Write a short paragraph describing an old lighthouse at dusk." 2>>"$LOG" | tee "$PROBE"
      # decode tok/s from the timing line; empty -> explicit "no speed line", not a false skip
      speed=""
      [ -f "$PROBE" ] && speed="$(grep -oE '\[ Prompt:.*Generation:[^]]*\]' "$PROBE" | head -1)"
      tg="$(printf '%s' "$speed" | sed -n 's/.*Generation:[[:space:]]*\([0-9.]*\).*/\1/p')"
      verdict="$(kit_quick_verdict "$tg")"
      if [ -n "$tg" ]; then
        printf "  >>> %s   %s tok/s decode   -> %s\n" "$base" "$tg" "$verdict"
        printf "%s${TAB}%s${TAB}%s\n" "$tg" "$verdict" "$base" >> "$SUMMARY.tmp"
      else
        printf "  >>> %s   (no speed line - see bench-log.txt)\n" "$base"
        printf "%s${TAB}%s${TAB}%s\n" "-1" "$verdict" "$base" >> "$SUMMARY.tmp"
      fi
    done
    # ONE file the human can send back: fastest decode first
    {
      echo "QUICK SCREEN SUMMARY  -  engine $KIT_BUILD  -  cutoff $KIT_QUICK_MIN_TG tok/s decode"
      echo "(which models are worth the hours-long full test; decode = streaming speed)"
      echo ""
      sort -t"$TAB" -k1 -nr "$SUMMARY.tmp" | while IFS="$TAB" read -r tg verdict name; do
        if [ "$tg" = "-1" ]; then tgtxt="   n/a"; else tgtxt="$(awk -v t="$tg" 'BEGIN{printf "%6.1f", t}')"; fi
        printf "  %-14s%s tok/s   %s\n" "$verdict" "$tgtxt" "$name"
      done
    } > "$SUMMARY"
    rm -f "$SUMMARY.tmp"
    echo ""
    cat "$SUMMARY"
    echo "  -> saved to $(basename "$SUMMARY")"
    echo "=================================================================="
    echo ""
  else echo "llama-cli not found - quick screen skipped"; fi
else echo "quick screen: not selected"; fi

if phase_on 1; then
  for f in $MODELS; do
    for ngl in 99 0; do for ub in 512 2048; do for fa in 1 0; do
      run_combo "$f" "$ngl" "$ub" "$fa"
    done; done; done
  done
else echo "phase 1 (matrix): not selected - skipped"; fi

# PHASE 2: ncmoe sweep - experts to CPU at the known-good shape (ngl 99, fa 0, ub 512).
if phase_on 2; then
  MOE=""
  for f in $MODELS; do case "$f" in *A4B*) MOE="$f"; break ;; esac; done
  if [ -n "$MOE" ]; then
    for nc in 0 8 16 24 32 40 48; do
      if [ "$FORCE" != 1 ] && grep -Fq "{\"kitBuild\":\"$KIT_BUILD\",\"kitNcmoe\":$nc," "$RESULTS" 2>/dev/null; then
        echo "skip (done): ncmoe=$nc"; continue
      fi
      echo "RUN sweep: $(basename "$MOE") ngl=99 fa=0 ub=512 ncmoe=$nc  (pp8192 + tg128)"
      echo "--- ncmoe=$nc $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$LOG"
      raw="$("$BENCH" -m "$MOE" -ngl 99 -fa 0 -ub 512 -ncmoe "$nc" -p 8192 -n 128 -o json 2>>"$LOG")"
      if [ $? -ne 0 ] || [ -z "$raw" ]; then
        echo "FAILED: ncmoe=$nc" >> "$LOG"
        printf '{"kitBuild":"%s","kitNcmoe":%s,"failed":true}\n' "$KIT_BUILD" "$nc" >> "$RESULTS"
        continue
      fi
      printf '{"kitBuild":"%s","kitNcmoe":%s,"rows":%s}\n' "$KIT_BUILD" "$nc" "$(echo "$raw" | tr -d '\n')" >> "$RESULTS"
    done
  else echo "no MoE (*A4B*) model fits - sweep phase skipped"; fi
else echo "phase 2 (ncmoe sweep): not selected - skipped"; fi

# (the quality probe now runs FIRST as the QUICK SCREEN above)

echo "Done. Send back: results.jsonl + bench-log.txt + quality-probe-*.txt (+ detect-facts.txt)."
