// AI store — providers (OpenAI-compatible), the default LLM + embedding routing,
// per-feature pins, and per-model tier overrides. Usage is recorded + priced
// server-side; the AI menu reads it from /v1/ai-usage.

import { defineStore } from "pinia";
import { getModelTier, TIERS } from "../services/modelMeta.js";
import { readSetting, writeSetting } from "../services/settings.js";
import * as providerBackend from "../services/providerBackend.js";
import * as routingBackend from "../services/routingBackend.js";

// The `ai` settings section holds only the non-routing AI prefs (per-model tier
// overrides + the RAG auto-rebuild toggle). The default provider/embedding,
// per-feature pins, and Quick/Accuracy roles live in the routing tables
// (/v1/ai/routing via routingBackend); providers live in /v1/llm-providers.
// None of those round-trip through the settings document.
function loadPrefs() {
  const v = readSetting("ai");
  return v && typeof v === "object" ? v : null;
}

// Providers come from the server's /v1/llm-providers table (read into a sync
// cache by bootProviders() before mount). The server seeds the built-in defaults
// and merges any new ones on every boot (server/justwrite_server/seed.py), so
// the client just reads the list — no client-side defaults, no write-through
// seeding. Empty only when the server is unreachable (the connection gate makes
// that a no-boot anyway).
function initialProviders() {
  return providerBackend.listProviders() ?? [];
}

// Persist the routing fields (default provider/embedding + per-feature pins) to
// the routing tables. The Features tab's Quick/Accuracy roles are preserved by
// the backend's merge (the AI store doesn't track them).
function saveRouting(state) {
  routingBackend.putRoutingPrefs({
    defaultLlmId: state.defaultLlmId,
    defaultEmbeddingId: state.defaultEmbeddingId,
    defaultEmbeddingModel: state.defaultEmbeddingModel,
    featurePins: state.featurePins,
  });
}

// Persist the non-routing AI prefs to the `ai` settings section (its only
// remaining contents). Providers + routing are server-authoritative elsewhere.
function savePrefs(state) {
  writeSetting("ai", {
    modelTiers: state.modelTiers,
    autoRebuildRagIndex: state.autoRebuildRagIndex,
  });
}

export const useAiStore = defineStore("ai", {
  state: () => {
    const prefs = loadPrefs();
    // Routing (default provider/embedding + feature pins) comes from the routing
    // tables via the boot cache — one source of truth shared with the Features
    // tab; the `ai` settings doc carries only the non-routing prefs below.
    const routing = routingBackend.getRoutingPrefs();
    return {
      providers: initialProviders(),
      defaultLlmId: routing?.defaultLlmId || "openai-compat-local",
      // Default provider + model used for embeddings (RAG indexing + chat).
      // The model is the routing override set in AI ▸ Features → Default
      // embedding (usually typed in — text-embedding-3-small / nomic-embed-text);
      // empty falls back to the provider's own embeddingModel.
      defaultEmbeddingId: routing?.defaultEmbeddingId || "openai-compat-local",
      defaultEmbeddingModel: routing?.defaultEmbeddingModel || "",
      // Per-model tier overrides (pinned by the user in Settings or the
      // Speaker Lab). Keyed by bare model id, NOT by provider+model — same
      // model on different Ollama instances should share the same tier
      // judgement. Empty by default; the heuristic in modelMeta.js
      // provides the auto-detected tier when nothing is pinned.
      modelTiers: prefs?.modelTiers ?? {},
      // Per-feature LLM pins. Each key is a feature id (chat | critique |
      // entitySweep | writerAI | …); each value is null (= inherit the global
      // defaultLlmId) or { providerId, model?, role? }. Mirrors the routing
      // tables. Since B5-1 (§7.2) NO renderer surface writes pins — the chip
      // is read-only provenance; pins are edited only in the shared Feature
      // Workbench. The store still mirrors them for guards; they persist via
      // /v1/ai/routing.
      featurePins: routing?.featurePins ?? { chat: null, critique: null, entitySweep: null, writerAI: null },
      // When true, services/rag/autoIndex.js silently embeds new/changed
      // scenes a minute after the last edit. Default OFF — auto-firing
      // burns embed tokens on every save against a cloud provider, which
      // the user shouldn't get without opting in.
      autoRebuildRagIndex: prefs?.autoRebuildRagIndex ?? false,
    };
  },

  getters: {
    providerById: (s) => (id) => s.providers.find((p) => p.id === id),
    llmProvider: (s) => s.providers.find((p) => p.id === s.defaultLlmId) || null,
    embeddingProvider: (s) => s.providers.find((p) => p.id === s.defaultEmbeddingId) || null,
    // The embedding model for a given provider: the routing override
    // (defaultEmbeddingModel) when it's the default embedding provider, else that
    // provider's own embeddingModel. One resolution rule for all RAG callers.
    embeddingModelFor: (s) => (provider) => {
      if (!provider) return "";
      if (provider.id === s.defaultEmbeddingId) return s.defaultEmbeddingModel || provider.embeddingModel || "";
      return provider.embeddingModel || "";
    },
    // The resolved embedding model for the default embedding provider.
    embeddingModel() {
      return this.embeddingModelFor(this.embeddingProvider);
    },
    // Every configured provider is an LLM provider now (providerType picks the
    // adapter; embedding capability is just whether embeddingModel is set).
    llmProviders: (s) => s.providers,

    // Subset of llmProviders that's actually usable right now: local
    // endpoints (no key needed) or cloud providers that have an apiKey
    // filled in. The model pickers (chat panel, Settings → AI → Feature
    // defaults) filter on this so we don't surface seed entries like
    // "Claude · claude-haiku-4-5" when the user hasn't configured them.
    readyLlmProviders(s) {
      const isLocal = (url) => /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(String(url || ""));
      return s.providers.filter((p) => !!p.hasApiKey || isLocal(p.baseUrl));
    },
    // Any provider can host embeddings — the embedding model is configured
    // per-provider via the embeddingModel field.
    embeddingProviders: (s) => s.providers,

    // Resolve a feature pin to its provider; falls back to the global
    // default LLM provider when no pin is set or the pinned provider is
    // gone. Use this in feature services instead of `llmProvider`.
    providerForFeature: (s) => (featureKey) => {
      const pin = s.featurePins?.[featureKey];
      if (pin?.providerId) {
        const hit = s.providers.find((p) => p.id === pin.providerId);
        if (hit) return hit;
      }
      return s.providers.find((p) => p.id === s.defaultLlmId) || null;
    },
    // The model id for a feature pin, or null when the pinned provider's
    // own chatModel should be used (the common case — most pins just
    // change provider, not model).
    modelForFeature: (s) => (featureKey) => {
      return s.featurePins?.[featureKey]?.model || null;
    },

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
    // Provider CRUD lives in the shared kit (the AiModelsArea → ProviderForm
    // views write /v1/llm-providers directly); this store only READS the list
    // (boot cache + resync). The old optimistic add/update/remove actions were
    // dead code once the kit took over editing — removed by the 2026-07-06
    // everything-LLM-shared audit (C4).
    setFeaturePin(featureKey, pin) {
      // pin = null to inherit the default; { providerId, model? } to pin.
      this.featurePins = { ...this.featurePins, [featureKey]: pin || null };
      saveRouting(this.$state);
    },
    setDefaultLlm(id) {
      this.defaultLlmId = id;
      saveRouting(this.$state);
    },
    setDefaultEmbedding(id) {
      this.defaultEmbeddingId = id;
      saveRouting(this.$state);
    },
    // Re-pull routing from the server into the store (+ the routingBackend cache).
    // The shared AI ▸ Features tab writes routing directly to the server, so after
    // the user leaves that page this refreshes the default LLM/embedding + model +
    // pins the renderer-side RAG and chat panel rely on — no full reload needed.
    async resyncRouting() {
      await routingBackend.refreshRouting();
      const r = routingBackend.getRoutingPrefs();
      if (!r) return;
      this.defaultLlmId = r.defaultLlmId || this.defaultLlmId;
      this.defaultEmbeddingId = r.defaultEmbeddingId || this.defaultEmbeddingId;
      this.defaultEmbeddingModel = r.defaultEmbeddingModel || "";
      this.featurePins = r.featurePins ?? this.featurePins;
    },
    setAutoRebuildRagIndex(on) {
      this.autoRebuildRagIndex = !!on;
      savePrefs(this.$state);
    },
    // Pin a tier override for a specific model. Pass null/undefined to
    // clear and fall back to the auto-detected tier from modelMeta.
    setModelTier(modelId, tierId) {
      if (!modelId) return;
      const next = { ...this.modelTiers };
      if (tierId && TIERS[tierId]) next[modelId] = tierId;
      else delete next[modelId];
      this.modelTiers = next;
      savePrefs(this.$state);
    },
    clearModelTier(modelId) {
      this.setModelTier(modelId, null);
    },


  },
});
