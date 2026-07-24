#!/usr/bin/env bash
# kit-common.sh - the sh mirror of kit-common.ps1 (Mac/Linux side of the ONE
# portable kit). Sourced by run.sh / download-models.sh / run-bench.sh.
# THE ENGINE PIN + MODEL LIST + FIT RULE ARE THE SAME FACTS as the ps1 file -
# when one changes, change BOTH (they are the two faces of one kit).
# Mac-safe: bash 3.2 compatible (no associative arrays, no mapfile).
# Asset names verified against the b10083 release API 2026-07-23:
#   linux x64/arm64 -> llama-<b>-bin-ubuntu-vulkan-{x64,arm64}.tar.gz
#   macos arm64/x64 -> llama-<b>-bin-macos-{arm64,x64}.tar.gz   (Metal built in)

# ENGINE POLICY: LATEST, not pinned (the user's ruling 2026-07-23) - a pin hid a
# real fix (b10083 could not read the current ternary files and had no Vulkan
# ternary kernels; b10099 reads them and offloads). Comparability is preserved by
# DATA: every results row self-labels the build, and the resume key includes it,
# so a new engine re-runs rather than silently mixing builds. --build pins.
KIT_FALLBACK_BUILD="b10099"

# fit rule: model file must be <= 0.7 x RAM. Integer math (size*10 <= ram*7).
KIT_FIT_NUM=7
KIT_FIT_DEN=10

# QUICK-SCREEN cutoff (the user's ruling 2026-07-24) - decode tok/s below this is
# flagged "SKIP too slow" (not worth the full matrix), at/above it "run full". ONE
# number, ONE tier; run-bench reads it, never hardcodes it. Advisory - it prints a
# verdict + writes quick-summary.txt, it blocks nothing. Same value as $KitQuickMinTg.
KIT_QUICK_MIN_TG=7

# The matrix - defined HERE so run.sh can size "N/8 done" without duplicating
# run-bench's loop bounds.
KIT_NGLS="99 0"
KIT_UBS="512 2048"
KIT_FAS="1 0"
KIT_COMBOS_PER_MODEL=8

# TERNARY FILE RULE (verified 2026-07-23): use the *g64* variant of each Bonsai
# model. The plain *-Q2_0.gguf files are the FORK's packing - mainline rejects
# them ("failed to read tensor data"). The repos label the same g64 format
# inconsistently: 8B "Q2_0_g64", 27B "Q2_g64". Filenames stay TRUE (never
# renamed) so a results row can't claim one packing while holding another.
KIT_MODEL_NAMES=(
  "gemma-4 E2B QAT"
  "gemma-4 E4B QAT"
  "gemma-4 12B QAT"
  "gemma-4 26B-A4B QAT MoE"
  "Ternary-Bonsai 8B g64"
  "Ternary-Bonsai 27B g64"
)
KIT_MODEL_URLS=(
  "https://huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF/resolve/main/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf"
  "https://huggingface.co/unsloth/gemma-4-E4B-it-qat-GGUF/resolve/main/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"
  "https://huggingface.co/unsloth/gemma-4-12B-it-qat-GGUF/resolve/main/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
  "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF/resolve/main/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf"
  "https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/resolve/main/Ternary-Bonsai-8B-Q2_0_g64.gguf"
  "https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf/resolve/main/Ternary-Bonsai-27B-Q2_g64.gguf"
)
KIT_MODEL_OUTS=(
  "models/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf"
  "models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"
  "models/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
  "models/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf"
  "models/Ternary-Bonsai-8B-Q2_0_g64.gguf"
  "models/Ternary-Bonsai-27B-Q2_g64.gguf"
)

# Resolve the newest mainline release tag; cache so an offline/rate-limited rerun
# still knows what it used. Falls back only with no network AND no cache.
kit_latest_build() {  # $1 = kit root
  local cache tag
  cache="$1/.latest-build"
  tag="$(curl -sL --max-time 30 https://api.github.com/repos/ggml-org/llama.cpp/releases/latest 2>/dev/null \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  if [ -n "$tag" ]; then printf '%s\n' "$tag" > "$cache"; echo "$tag"; return; fi
  if [ -f "$cache" ]; then head -1 "$cache"; return; fi
  echo "$KIT_FALLBACK_BUILD"
}

# THE RESUME KEY - build included, same format as the ps1 side.
kit_combo_key() {  # $1 build, $2 model file, $3 ngl, $4 ub, $5 fa
  echo "$1|$2|$3|$4|$5"
}

# OS/arch detection. KIT_OS / KIT_ARCH env overrides exist for testing the
# logic on a box that isn't the target (e.g. Git Bash on Windows).
kit_os() {
  if [ -n "$KIT_OS" ]; then echo "$KIT_OS"; return; fi
  case "$(uname -s)" in
    Linux)  echo linux ;;
    Darwin) echo macos ;;
    *)      echo unknown ;;
  esac
}
kit_arch() {
  if [ -n "$KIT_ARCH" ]; then echo "$KIT_ARCH"; return; fi
  case "$(uname -m)" in
    x86_64)          echo x64 ;;
    arm64|aarch64)   echo arm64 ;;
    *)               echo unknown ;;
  esac
}

# Engine asset for this OS (names verified against the release - header note).
kit_engine_asset() {
  local os arch
  os="$(kit_os)"; arch="$(kit_arch)"
  case "$os" in
    linux) echo "llama-${KIT_BUILD}-bin-ubuntu-vulkan-${arch}.tar.gz" ;;
    macos) echo "llama-${KIT_BUILD}-bin-macos-${arch}.tar.gz" ;;
    *)     echo "" ;;
  esac
}
kit_engine_url() {
  echo "https://github.com/ggml-org/llama.cpp/releases/download/${KIT_BUILD}/$(kit_engine_asset)"
}

# RAM in bytes ($1 = optional GB override).
kit_ram_bytes() {
  if [ -n "$1" ] && [ "$1" -gt 0 ] 2>/dev/null; then
    echo $(( $1 * 1024 * 1024 * 1024 )); return
  fi
  case "$(kit_os)" in
    macos) sysctl -n hw.memsize ;;
    *)     awk '/MemTotal/ {print $2*1024}' /proc/meminfo 2>/dev/null || echo 0 ;;
  esac
}

kit_file_size() {  # $1 = path; prints bytes or nothing
  if [ -f "$1" ]; then
    stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null
  fi
}

# Size WITHOUT downloading: local file first, else curl HEAD following
# redirects (HF resolve URLs 302 to a CDN; the final Content-Length is the
# truth - same mechanism the ps1 side verified live). Empty = unknown =
# treated as FITTING (fail-safe: worst case a wasted download).
kit_model_size() {  # $1 = index, $2 = kit root
  local local_path size
  local_path="$2/${KIT_MODEL_OUTS[$1]}"
  size="$(kit_file_size "$local_path")"
  if [ -n "$size" ]; then echo "$size"; return; fi
  curl -sIL --max-time 40 "${KIT_MODEL_URLS[$1]}" 2>/dev/null \
    | tr -d '\r' | awk 'tolower($1)=="content-length:" {v=$2} END {if (v) print v}'
}

kit_fits() {  # $1 = size bytes (may be empty), $2 = ram bytes -> "1"/"0"
  if [ -z "$1" ]; then echo 1; return; fi
  if [ $(( $1 * KIT_FIT_DEN )) -le $(( $2 * KIT_FIT_NUM )) ]; then echo 1; else echo 0; fi
}

# One log for everything (the file the human sends back) - mirror of Add-KitLog.
kit_log() {  # $1 = kit root, $2 = message
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $2"
  echo "$line"
  echo "$line" >> "$1/bench-log.txt"
}

# ONE definition of the quick-screen verdict (run-bench prints it; run.sh's PLAN
# shows the cached one) - mirror of Get-KitQuickVerdict. $1 = decode tok/s, empty
# = no timing line parsed.
kit_quick_verdict() {  # $1 = tg (may be empty)
  if [ -z "$1" ]; then echo "no speed line"; return; fi
  if awk -v a="$1" -v c="$KIT_QUICK_MIN_TG" 'BEGIN{exit !(a+0 >= c+0)}'; then echo "run full"; else echo "SKIP too slow"; fi
}

# Cached quick-screen decode tok/s for a model on this build (empty = none/garbage).
# Used by the winner-detection in run.sh's post-quick continuation.
kit_quick_tg() {  # $1 = model filename leaf, $2 = build, $3 = root
  local base probe speed
  base="${1%.gguf}"
  probe="$3/quality-probe-$base-$2.txt"
  [ -f "$probe" ] || return 0
  speed="$(grep -oE '\[ Prompt:.*Generation:[^]]*\]' "$probe" | head -1)"
  printf '%s' "$speed" | sed -n 's/.*Generation:[[:space:]]*\([0-9.]*\).*/\1/p'
}

# Cached quick-screen status for the PLAN (mirror of Get-KitQuickStatus, per model):
# "not yet run" | "no speed line ..." | "<tg> tok/s -> <verdict>". Read from the
# per-model probe file so the PLAN shows what's cached BEFORE you pick.
kit_quick_status() {  # $1 = model filename leaf (X.gguf), $2 = build, $3 = root
  local base probe tg
  base="${1%.gguf}"
  probe="$3/quality-probe-$base-$2.txt"
  if [ ! -f "$probe" ]; then echo "not yet run"; return; fi
  tg="$(kit_quick_tg "$1" "$2" "$3")"
  if [ -z "$tg" ]; then echo "no speed line (last run left no speed line)"; return; fi
  printf '%s tok/s -> %s\n' "$tg" "$(kit_quick_verdict "$tg")"
}
