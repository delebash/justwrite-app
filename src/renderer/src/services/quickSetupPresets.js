// Factory defaults for the Quick Setup wizard's hardware tiers, plus
// helpers shared by the wizard and the editor.
//
// The actual *live* preset data is owned by `stores/hardwarePresets.js`
// — this file only provides the seed and the constants. The store
// hydrates from FACTORY_PRESETS on first run, persists user edits to
// IndexedDB, and exposes Reset actions that copy from here.
//
// New / better models ship every few weeks; the user can override any
// field through Settings → Hardware presets without a code change.

const OLLAMA_DEFAULT_PROVIDER_ID = "ollama-quick-default";
const OLLAMA_FAST_PROVIDER_ID = "ollama-quick-fast";

// Feature keys grouped by intent. Recipes for each tier are built from
// these — they describe which routing slot a feature falls into, not
// which model. The slot mapping ("default" / "fast" / "cloud") stays
// hardcoded; the actual model assignment is user-editable.
const REASONING_FEATURES = ["writerAI", "speakerAnalysis", "smartCast", "characterChat"];
const CLOUD_PREFERRED_FEATURES = [
  "critique", "plotHoles", "reverseOutline", "multiReader",
  "characterAudit", "foreshadowing", "readerKnowledge", "voiceDrift",
  "beatSheet", "marketingPack", "relationshipArc",
];
const FAST_OK_FEATURES = ["brainstorm", "briefing", "recap", "entitySweep", "sensory", "unstuck"];

const EMBEDDING_DEFAULT = "nomic-embed-text";

// The seed dictionary. Keys are tier ids (kept short and stable — the
// store persists pin recipes keyed by these). User edits and custom
// tiers live in the store, not here.
export const FACTORY_PRESETS = {
  cpu: {
    id: "cpu",
    label: "CPU only",
    blurb: "No discrete GPU — fast tasks stay local, prose work routes to cloud.",
    defaultChatModel: "qwen3:8b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:8b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 5.2,
    builtIn: true,
    recipe: buildRecipe({ fast: FAST_OK_FEATURES, cloud: [...REASONING_FEATURES, ...CLOUD_PREFERRED_FEATURES] }),
  },

  "8": {
    id: "8",
    label: "8 GB card (RTX 2070 / 3060Ti / 3070 / 4060)",
    blurb: "14B is the honest default for prose; 8B handles snappy brainstorm calls; heavy analysis routes to cloud.",
    defaultChatModel: "qwen3:14b",
    fastChatModel: "qwen3:8b",
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:14b", "qwen3:8b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 14.5,
    builtIn: true,
    recipe: buildRecipe({ fast: FAST_OK_FEATURES, cloud: CLOUD_PREFERRED_FEATURES }),
  },

  "12": {
    id: "12",
    label: "12 GB card (RTX 3060 12GB / 4070 / 5070)",
    blurb: "14B runs cleanly on GPU. Heavy analysis still better on cloud at this tier.",
    defaultChatModel: "qwen3:14b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:14b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 9.3,
    builtIn: true,
    recipe: buildRecipe({ fast: [], cloud: CLOUD_PREFERRED_FEATURES }),
  },

  "16": {
    id: "16",
    label: "16 GB card (RTX 4060Ti 16GB / 5060Ti 16GB / 4080)",
    blurb: "qwen3:14b with comfortable KV-cache headroom for long context. Swap to mistral-small3:24b in the editor if you'd rather push capability over context — at ~14 GB weights it leaves less room for long chapters.",
    defaultChatModel: "qwen3:14b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:14b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 9.3,
    builtIn: true,
    recipe: buildRecipe({ fast: [], cloud: CLOUD_PREFERRED_FEATURES }),
  },

  "24": {
    id: "24",
    label: "24 GB card (RTX 3090 / 4090 / 7900XTX)",
    blurb: "32B fits cleanly with full context — approaching cloud-class prose quality. Alternative pick: gpt-oss:20b at Q6_K (NVIDIA's CES SLM target). 70B class doesn't fit without partial CPU offload, so going bigger costs more than it gains.",
    defaultChatModel: "qwen3:32b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["qwen3:32b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 20.0,
    builtIn: true,
    recipe: buildRecipe({ fast: [], cloud: [] }),
  },

  "32": {
    id: "32",
    label: "32 GB card (RTX 5090)",
    blurb: "70B at Q4_K_M with KV-cache headroom — genuinely competitive with cloud for prose work.",
    defaultChatModel: "llama3.3:70b",
    fastChatModel: null,
    embeddingModel: EMBEDDING_DEFAULT,
    pulls: ["llama3.3:70b", EMBEDDING_DEFAULT],
    estimatedDownloadGb: 43.0,
    builtIn: true,
    recipe: buildRecipe({ fast: [], cloud: [] }),
  },
};

export const QUICK_SETUP_PROVIDER_IDS = {
  default: OLLAMA_DEFAULT_PROVIDER_ID,
  fast: OLLAMA_FAST_PROVIDER_ID,
};

// Map detected VRAM (MB) to a factory tier key. Custom tiers don't
// participate in auto-detection — the wizard's tier dropdown still
// surfaces them so users can pick manually.
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

// Produces a recipe template used by every tier. Exported so the
// hardware-presets store can rebuild a tier's recipe when the user
// changes which features fall in each slot (future expansion — not
// editable from the v1 UI but the data path is here).
export function buildRecipe({ fast = [], cloud = [] } = {}) {
  const recipe = {};
  for (const k of fast) recipe[k] = "fast";
  for (const k of cloud) recipe[k] = "cloud";
  return recipe;
}
