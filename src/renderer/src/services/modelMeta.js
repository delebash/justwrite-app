// Small helpers for rendering model entries returned by
// `OpenAICompatClient.enrichedModels()`. Shared between the Speaker Lab's
// ModelPicker and Settings → AI providers' Combobox so the two views
// always render the same labels and never drift apart.
//
// An "entry" looks like:
//   { id, quant, state, type, publisher, arch }
// where everything except `id` may be null when the source endpoint
// didn't provide it. Cloud providers and the OpenAI-spec /v1/models
// fallback always come in with null quant/state.

// Common GGUF quant suffixes encoded in model names. Matches Ollama
// tags ("qwen3:14b-q4_K_M"), LM Studio filenames ("...Q4_K_M.gguf"),
// I-quants (IQ3_XS), and a few other vocab quants (BF16, GPTQ, AWQ).
const QUANT_RE = /(?:^|[-.])((?:I?Q\d+(?:_[A-Z0-9]+)*|F\d+|BF16|GPTQ|AWQ))(?:\.gguf)?$/i;

export function parseQuant(name) {
  if (!name) return null;
  const m = String(name).match(QUANT_RE);
  return m ? m[1].toUpperCase() : null;
}

// Render an enriched entry as a single-line label. Prefers the explicit
// `quant` field (LM Studio native API) and falls back to parsing the id
// (Ollama tags, raw GGUF filenames). Appends "· not loaded" for LM
// Studio entries whose state isn't "loaded", so the user can see at a
// glance which models will need JIT-loading on first call.
export function entryLabel(entry) {
  if (!entry) return "";
  const quant = entry.quant || parseQuant(entry.id);
  const stateBadge = entry.state === "not-loaded" ? " · not loaded" : "";
  return quant
    ? `${entry.id}  ·  ${quant}${stateBadge}`
    : `${entry.id}${stateBadge}`;
}
