// Small helpers for rendering model entries from the shared per-provider
// model-list cache (composables/useModelList.js → `/v1/llm-providers/{id}/models`).
// Consumed by ModelPicker (parseQuant/entryLabel) and the ai store
// (getModelTier/TIERS) so every surface renders the same labels/tiers and
// never drifts apart.
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
// glance which models will need JIT-loading on first call. Optionally
// appends a tier badge — caller passes { tierLabel, tierSource } so
// modelMeta stays decoupled from the ai store (no circular import).
export function entryLabel(entry, opts = {}) {
  if (!entry) return "";
  const quant = entry.quant || parseQuant(entry.id);
  const stateBadge = entry.state === "not-loaded" ? " · not loaded" : "";
  const tierBadge = opts.tierLabel
    ? ` · ${opts.tierLabel}${opts.tierSource ? ` (${opts.tierSource})` : ""}`
    : "";
  return quant
    ? `${entry.id}  ·  ${quant}${stateBadge}${tierBadge}`
    : `${entry.id}${stateBadge}${tierBadge}`;
}

// ─── Tier system ─────────────────────────────────────────────────────────
//
// Three tiers covering the dialogue-attribution capability landscape:
//
//   guided   — sub-12B models. Worked examples scaffold reasoning the
//              smaller model can't do natively (off-cast guard,
//              mid-paragraph continuation). Confidence floor 0.7 to
//              catch the broader confidence band these models produce.
//   direct   — 12B-class non-reasoning (Mistral-Small 24B, Phi-4-14B,
//              Llama 3.x 70B). Strict rules only — these models follow
//              instructions without scaffolding. Floor 0.5.
//   reasoned — 14B+ hybrid models with thinking on (Qwen3:14B,
//              Qwen3:32B). Strict rules + implicit chain-of-thought.
//              Currently the only config that lands 12/12 on the
//              Halvard/Elen ch6 fixture. Floor 0.5.
//
// The registry is the single source of truth. SpeakerLabView consumes
// tier.systemKey to pick the prompt body; the actual prompt strings stay
// in the view file because they're versioned with the inline-tag pipeline.
export const TIERS = {
  guided:   { id: "guided",   label: "Guided",   systemKey: "guided",   think: false, floor: 0.7 },
  direct:   { id: "direct",   label: "Direct",   systemKey: "direct",   think: false, floor: 0.5 },
  reasoned: { id: "reasoned", label: "Reasoned", systemKey: "direct",   think: true,  floor: 0.5 },
};

export const TIER_IDS = ["guided", "direct", "reasoned"];

// Pattern-match a model id to its default tier. Pure function — no store
// access, no provider context, no I/O. Lower-cased once, then checked
// against the patterns in order; first match wins. Add new patterns
// here as new model families ship.
//
// Heuristic philosophy: err on the safe-but-slightly-worse side when
// uncertain. Extra scaffolding examples don't break capable models;
// missing reasoning on a hybrid model badly hurts (see Qwen3:14B
// regression discovery 2026-06-01). So:
//   • Reasoning-first families → reasoned (mandatory, output is broken without it for some)
//   • Known hybrid families at 14B+ → reasoned (capacity for implicit CoT)
//   • Known non-reasoning ≥12B → direct (capable enough for strict rules)
//   • Everything else / unknown → guided (safe fallback)
export function getModelTier(modelId) {
  if (!modelId) return "guided";
  const id = String(modelId).toLowerCase();

  // Reasoning-first families. These models emit <think>/reasoning by
  // default; tier MUST be reasoned (or output goes through reasoning
  // pathways even if think:false is set — see Qwen3.5 dead-end).
  if (/(^|[-:/])(deepseek-r1|qwq|gpt-oss|magistral|phi-4-(mini-)?reasoning|glm-z[0-9]|glm-4(\.[0-9]+)?-air-thinking)([-:.@/]|$)/.test(id)) return "reasoned";
  if (/qwen3\.5/.test(id)) return "reasoned"; // Qwen3.5 family is reasoning-first
  if (/-thinking([-:.@/]|$)/.test(id)) return "reasoned"; // *-thinking variants of hybrid families

  // Hybrid Qwen3 at 14B+ — implicit reasoning measurably helps
  // compositional tasks like dialogue attribution at this capacity.
  if (/(^|[-:/])qwen3[-:]?(14|30|32|72)b/.test(id)) return "reasoned";

  // Non-reasoning capable models — 12B-class and up. Strict rules
  // without scaffolding. Mistral-Small starts at 22B; Phi-4 at 14B;
  // Llama 3.x large variants 70B+.
  if (/(^|[-:/])mistral-small/.test(id)) return "direct";
  if (/(^|[-:/])mistral-large/.test(id)) return "direct";
  if (/(^|[-:/])phi-4([-:].*)?$/.test(id) && !/reasoning/.test(id)) return "direct";
  if (/(^|[-:/])llama3?\.?[123]?[-:]?(70|405)b/.test(id)) return "direct";
  if (/(^|[-:/])gemma3[-:]?(12|27)b/.test(id)) return "direct";

  // Sub-12B explicitly. These benefit from the worked examples.
  if (/(^|[-:/])qwen3[-:]?(0?\.?[1-9]b|[1-9]b)/.test(id)) return "guided";
  if (/(^|[-:/])(llama3?\.?[123]?[-:]?[1-9]b|llama3?[-:]?8b)/.test(id)) return "guided";
  if (/(^|[-:/])(mistral-nemo|phi-3|gemma3?[-:]?[2-9]b|qwen2\.5)/.test(id)) return "guided";

  // Fallback — safe default. Extra examples don't break larger models
  // much; under-scaffolded smaller models silently fail. Bias toward
  // visibly-suboptimal-on-large over silently-bad-on-small.
  return "guided";
}

// Convenience — resolves to the full tier object instead of just the id.
export function getModelTierObject(modelId) {
  return TIERS[getModelTier(modelId)];
}
