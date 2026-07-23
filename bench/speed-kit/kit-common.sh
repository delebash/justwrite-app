#!/usr/bin/env bash
# kit-common.sh - the sh mirror of kit-common.ps1 (Mac/Linux side of the ONE
# portable kit). Sourced by run.sh / download-models.sh / run-bench.sh.
# THE ENGINE PIN + MODEL LIST + FIT RULE ARE THE SAME FACTS as the ps1 file -
# when one changes, change BOTH (they are the two faces of one kit).
# Mac-safe: bash 3.2 compatible (no associative arrays, no mapfile).
# Asset names verified against the b10083 release API 2026-07-23:
#   linux x64/arm64 -> llama-<b>-bin-ubuntu-vulkan-{x64,arm64}.tar.gz
#   macos arm64/x64 -> llama-<b>-bin-macos-{arm64,x64}.tar.gz   (Metal built in)

KIT_BUILD="${KIT_BUILD:-b10083}"

# fit rule: model file must be <= 0.7 x RAM. Integer math (size*10 <= ram*7).
KIT_FIT_NUM=7
KIT_FIT_DEN=10

KIT_MODEL_NAMES=(
  "gemma-4 E2B QAT"
  "gemma-4 E4B QAT"
  "gemma-4 12B QAT"
  "gemma-4 26B-A4B QAT MoE"
)
KIT_MODEL_URLS=(
  "https://huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF/resolve/main/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf"
  "https://huggingface.co/unsloth/gemma-4-E4B-it-qat-GGUF/resolve/main/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"
  "https://huggingface.co/unsloth/gemma-4-12B-it-qat-GGUF/resolve/main/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
  "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF/resolve/main/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf"
)
KIT_MODEL_OUTS=(
  "models/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf"
  "models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"
  "models/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
  "models/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf"
)

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
