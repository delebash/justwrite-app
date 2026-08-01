// The LLM tier registry + heuristic — the renderer-side DOCUMENTED MIRROR
// (2026-07-06 shared-stack audit) of the CANONICAL shared copy,
// `just-llm-runner/llm_runner/llm/tiers.py` (which was ported FROM this file
// and is what the server dispatch actually classifies with). The renderer
// keeps a synchronous copy for boot-time UI (tier badges before any request);
// if the heuristic changes, change tiers.py FIRST and mirror it here.
// Consumed by the ai store (getModelTier/TIERS). The old label helpers
// (parseQuant/entryLabel) died with their only consumer, the orphaned
// ModelPicker.vue, in the 2026-07-06 C5 cleanup.

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
