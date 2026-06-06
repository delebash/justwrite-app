// Hardware-tier presets for the Quick Setup wizard. Picks a default chat
// model, an optional "fast" chat model (only on tighter cards where the
// default crawls), an embedding model, and a per-feature routing recipe.
//
// Recipe values:
//   "default" — inherit the global default LLM (the heavy local model)
//   "fast"    — pin to the secondary Ollama provider (only valid on tiers
//               that ship a "fast" provider)
//   "cloud"   — pin to the optional cloud provider (skipped when the user
//               hasn't configured one — the wizard then falls back to
//               "default" for that feature)
//
// Keep the data shape narrow on purpose — every preset is a single object
// the wizard reads, the store action consumes, and the user can preview
// before pulling 14 GB of models.

const OLLAMA_DEFAULT_PROVIDER_ID = "ollama-quick-default";
const OLLAMA_FAST_PROVIDER_ID = "ollama-quick-fast";

// Feature keys grouped by intent. The wizard never asks per-feature; it
// applies the whole bundle in one go.
const REASONING_FEATURES = ["writerAI", "speakerAnalysis", "smartCast", "characterChat"];
const CLOUD_PREFERRED_FEATURES = [
  "critique", "plotHoles", "reverseOutline", "multiReader",
  "characterAudit", "foreshadowing", "readerKnowledge", "voiceDrift",
  "beatSheet", "marketingPack", "relationshipArc",
];
const FAST_OK_FEATURES = ["brainstorm", "briefing", "recap", "entitySweep", "sensory", "unstuck"];

const EMBEDDING_DEFAULT = "nomic-embed-text";

export const QUICK_SETUP_PRESETS = {
  cpu: {
    label: "CPU only",
    blurb: "No discrete GPU — fast tasks stay local, prose work routes to cloud.",
    defaultChatModel: "qwen3:8b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:8b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 5.2,
    recipe: {
      ...buildRecipe({ fast: FAST_OK_FEATURES, cloud: [...REASONING_FEATURES, ...CLOUD_PREFERRED_FEATURES] }),
    },
  },

  "8": {
    label: "8 GB card (RTX 2070 / 3060Ti / 3070 / 4060)",
    blurb: "14B is the honest default for prose; 8B handles snappy brainstorm calls; heavy analysis routes to cloud.",
    defaultChatModel: "qwen3:14b",
    fastChatModel: "qwen3:8b",
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:14b", "qwen3:8b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 14.5,
    recipe: buildRecipe({ fast: FAST_OK_FEATURES, cloud: CLOUD_PREFERRED_FEATURES }),
  },

  "12": {
    label: "12 GB card (RTX 3060 12GB / 4070 / 5070)",
    blurb: "14B runs cleanly on GPU. Heavy analysis still better on cloud at this tier.",
    defaultChatModel: "qwen3:14b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:14b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 9.3,
    recipe: buildRecipe({ fast: [], cloud: CLOUD_PREFERRED_FEATURES }),
  },

  "16": {
    label: "16 GB card (RTX 4060Ti 16GB / 5060Ti 16GB / 4080)",
    blurb: "24B is the prose sweet spot. Cloud routing is optional at this tier.",
    defaultChatModel: "mistral-small3:24b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["mistral-small3:24b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 15.0,
    recipe: buildRecipe({ fast: [], cloud: [] }),
  },

  "24": {
    label: "24 GB card (RTX 3090 / 4090 / 7900XTX)",
    blurb: "32B locally — approaching cloud-class quality for prose work.",
    defaultChatModel: "qwen3:32b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:32b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 20.0,
    recipe: buildRecipe({ fast: [], cloud: [] }),
  },

  "32": {
    label: "32 GB card (RTX 5090)",
    blurb: "70B at Q4_K_M with KV-cache headroom — genuinely competitive with cloud.",
    defaultChatModel: "llama3.3:70b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["llama3.3:70b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 43.0,
    recipe: buildRecipe({ fast: [], cloud: [] }),
  },
};

export const QUICK_SETUP_PROVIDER_IDS = {
  default: OLLAMA_DEFAULT_PROVIDER_ID,
  fast: OLLAMA_FAST_PROVIDER_ID,
};

// Map detected VRAM (MB) to a preset tier key. Returns null for unknown.
export function tierForVramMb(vramMb) {
  if (!vramMb || vramMb < 1) return "cpu";
  const gb = vramMb / 1024;
  if (gb < 7) return "cpu";
  if (gb < 11) return "8";
  if (gb < 14) return "12";
  if (gb < 20) return "16";
  if (gb < 28) return "24";
  return "32";
}

// Builds a { [featureKey]: "default" | "fast" | "cloud" } recipe. Any
// feature not listed inherits the default LLM (i.e. omitted = "default").
function buildRecipe({ fast = [], cloud = [] }) {
  const recipe = {};
  for (const k of fast) recipe[k] = "fast";
  for (const k of cloud) recipe[k] = "cloud";
  return recipe;
}
