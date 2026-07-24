#!/usr/bin/env bash
# download-models.sh - sh mirror of download-models.ps1: fetch the engine +
# the fit-filtered model set. .part + size-check + rename so a failed download
# can never masquerade as a complete file. Everything logged to bench-log.txt.
#   --ram-gb 16   override detected RAM
#   --build bXXX  engine override (default: the pin in kit-common.sh)
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
. "$ROOT/kit-common.sh"

RAM_GB=0; MODELS_SEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ram-gb) shift; RAM_GB="$1" ;;
    --models) shift; MODELS_SEL="$1" ;;
    --build)  shift; KIT_BUILD="$1" ;;
    *) echo "unknown flag: $1"; exit 2 ;;
  esac
  shift
done
mkdir -p "$ROOT/models" "$ROOT/engine"
FAILED=""

# curl download to .part, size-check when expected>0, rename on success.
kit_fetch() {  # $1 url, $2 dest, $3 expected size (0 = skip check) -> 0/1
  local part got
  part="$2.part"
  rm -f "$part"
  if ! curl -L --fail --max-redirs 5 -o "$part" "$1"; then rm -f "$part"; return 1; fi
  got="$(kit_file_size "$part")"
  if [ "$3" -gt 0 ] 2>/dev/null && [ "$got" != "$3" ]; then
    kit_log "$ROOT" "size mismatch: got $got bytes, expected $3"
    rm -f "$part"; return 1
  fi
  mv -f "$part" "$2"
}

# ---- engine (always fetched; tiny) -----------------------------------------
ASSET="$(kit_engine_asset)"
if [ -z "$ASSET" ]; then echo "unsupported OS/arch - see run.sh"; exit 1; fi
TARBALL="$ROOT/engine/$ASSET"
if [ -f "$TARBALL" ]; then echo "have: engine/$ASSET"
else
  echo "downloading: engine/$ASSET"
  if ! kit_fetch "$(kit_engine_url)" "$TARBALL" 0; then
    kit_log "$ROOT" "DOWNLOAD FAILED (engine $KIT_BUILD)"
    FAILED="$FAILED engine"
  fi
fi
# Per-build dir, same reason as the ps1 side: a --build override must never
# silently run an older binary lying around.
BUILD_DIR="$ROOT/engine/$KIT_BUILD"
if [ -f "$TARBALL" ] && ! find "$BUILD_DIR" -name "llama-bench" -type f 2>/dev/null | grep -q .; then
  echo "unpacking engine to engine/$KIT_BUILD ..."
  mkdir -p "$BUILD_DIR"
  if ! tar -xzf "$TARBALL" -C "$BUILD_DIR"; then
    kit_log "$ROOT" "ENGINE UNPACK FAILED ($ASSET - deleting so a rerun refetches)"
    rm -f "$TARBALL"
    FAILED="$FAILED engine-unpack"
  fi
fi

# ---- models (fit-filtered) -------------------------------------------------
RAM_BYTES="$(kit_ram_bytes "$RAM_GB")"
gb() { awk -v b="$1" 'BEGIN {printf "%.1f", b/1073741824}'; }
echo "RAM-fit: $(gb "$RAM_BYTES") GB RAM -> keeping models <= $(gb $(( RAM_BYTES * KIT_FIT_NUM / KIT_FIT_DEN ))) GB (0.7 x RAM)"
i=0
while [ $i -lt ${#KIT_MODEL_NAMES[@]} ]; do
  DEST="$ROOT/${KIT_MODEL_OUTS[$i]}"
  # honour the m picker: skip models the user didn't select (same leaf filename
  # the bench filters on, so the two can't disagree)
  if [ -n "$MODELS_SEL" ]; then
    case ",$MODELS_SEL," in *",$(basename "${KIT_MODEL_OUTS[$i]}"),"*) : ;; *) i=$(( i + 1 )); continue ;; esac
  fi
  SIZE="$(kit_model_size $i "$ROOT")"
  if [ "$(kit_fits "$SIZE" "$RAM_BYTES")" = 0 ]; then
    kit_log "$ROOT" "SKIP (too big for this machine): ${KIT_MODEL_NAMES[$i]} ($(gb "${SIZE:-0}") GB) - not downloaded"
  elif [ -f "$DEST" ]; then
    echo "have: ${KIT_MODEL_OUTS[$i]}"
  else
    echo "downloading: ${KIT_MODEL_OUTS[$i]}"
    if ! kit_fetch "${KIT_MODEL_URLS[$i]}" "$DEST" "${SIZE:-0}"; then
      kit_log "$ROOT" "DOWNLOAD FAILED (${KIT_MODEL_NAMES[$i]})"
      FAILED="$FAILED ${KIT_MODEL_OUTS[$i]}"
    fi
  fi
  i=$(( i + 1 ))
done

if [ -n "$FAILED" ]; then
  kit_log "$ROOT" "download step finished with FAILURES:$FAILED - rerun to retry (finished files are kept)"
  exit 1
fi
echo "Ready. Next: run.sh (the one click) - or detect-facts.sh + run-bench.sh by hand."
exit 0
