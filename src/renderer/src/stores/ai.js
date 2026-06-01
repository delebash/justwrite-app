// AI store — manages providers (OpenAI-compatible), default LLM and TTS,
// connection status. Persists via the IDB-backed storage adapter.

import { defineStore } from "pinia";
import { DEFAULT_PROVIDERS } from "../domain/seed.js";
import { OpenAICompatClient } from "../services/openai-compat.js";
import { getModelTier, TIERS } from "../services/modelMeta.js";
import { getItem, setItem } from "../services/storage.js";

const LS_KEY = "justwrite:ai";

function load() {
  try {
    const v = JSON.parse(getItem(LS_KEY) || "null");
    if (!v || !Array.isArray(v.providers)) return null;
    // Merge in any new built-in providers that have been added to the
    // seed since this snapshot was saved. User edits to existing
    // providers (or providers they've added by hand) are untouched —
    // we only append by id, never overwrite.
    const have = new Set(v.providers.map((p) => p.id));
    const missing = DEFAULT_PROVIDERS.filter((p) => p.builtIn && !have.has(p.id));
    if (missing.length) v.providers = [...v.providers, ...missing];
    return v;
  } catch { return null; }
}

function save(state) {
  try {
    setItem(LS_KEY, JSON.stringify({
      providers: state.providers,
      defaultLlmId: state.defaultLlmId,
      defaultTtsId: state.defaultTtsId,
      modelTiers: state.modelTiers,
    }));
  } catch {}
}

export const useAiStore = defineStore("ai", {
  state: () => {
    const loaded = load();
    return {
      providers: loaded?.providers ?? [...DEFAULT_PROVIDERS],
      defaultLlmId: loaded?.defaultLlmId ?? "openai-compat-local",
      defaultTtsId: loaded?.defaultTtsId ?? "openai",
      status: {}, // providerId -> "ok" | "down" | "checking" | undefined
      // Per-model tier overrides (pinned by the user in Settings or the
      // Speaker Lab). Keyed by bare model id, NOT by provider+model — same
      // model on different Ollama instances should share the same tier
      // judgement. Empty by default; the heuristic in modelMeta.js
      // provides the auto-detected tier when nothing is pinned.
      modelTiers: loaded?.modelTiers ?? {},
    };
  },

  getters: {
    providerById: (s) => (id) => s.providers.find((p) => p.id === id),
    llmProvider: (s) => s.providers.find((p) => p.id === s.defaultLlmId) || null,
    ttsProvider: (s) => s.providers.find((p) => p.id === s.defaultTtsId) || null,
    llmProviders: (s) => s.providers.filter((p) => p.kind === "llm" || p.kind === "both"),
    ttsProviders: (s) => s.providers.filter((p) => p.kind === "tts" || p.kind === "both"),

    // Resolve a model id to its tier — user override wins, else the
    // name-pattern heuristic. Returns the tier object (not just the id)
    // so callers get prompt-key + think + floor in one read.
    resolveTier: (s) => (modelId) => {
      const tierId = s.modelTiers[modelId] || getModelTier(modelId);
      return TIERS[tierId] || TIERS.guided;
    },

    // Whether the resolved tier came from a user pin or the heuristic —
    // drives the "(auto)" vs "(pinned)" badge in the Settings model picker.
    tierSource: (s) => (modelId) => (s.modelTiers[modelId] ? "pinned" : "auto"),
  },

  actions: {
    addProvider(provider) {
      this.providers = [...this.providers, { ...provider, id: provider.id || crypto.randomUUID() }];
      save(this.$state);
    },
    updateProvider(id, patch) {
      this.providers = this.providers.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      );
      save(this.$state);
    },
    removeProvider(id) {
      this.providers = this.providers.filter((p) => p.id !== id || p.builtIn);
      save(this.$state);
    },
    setDefaultLlm(id) {
      this.defaultLlmId = id;
      save(this.$state);
    },
    setDefaultTts(id) {
      this.defaultTtsId = id;
      save(this.$state);
    },
    // Pin a tier override for a specific model. Pass null/undefined to
    // clear and fall back to the auto-detected tier from modelMeta.
    setModelTier(modelId, tierId) {
      if (!modelId) return;
      const next = { ...this.modelTiers };
      if (tierId && TIERS[tierId]) next[modelId] = tierId;
      else delete next[modelId];
      this.modelTiers = next;
      save(this.$state);
    },
    clearModelTier(modelId) {
      this.setModelTier(modelId, null);
    },
    async ping(id) {
      const p = this.providerById(id);
      if (!p) return false;
      this.status = { ...this.status, [id]: "checking" };
      const ok = await new OpenAICompatClient(p).ping();
      this.status = { ...this.status, [id]: ok ? "ok" : "down" };
      return ok;
    },
  },
});
