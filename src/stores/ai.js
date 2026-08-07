// AI store — providers (OpenAI-compatible) + the default LLM + embedding
// routing. Usage is recorded + priced server-side; the AI menu reads it from
// /v1/ai-usage. (Per-feature pins died in the 2026-07-15 one-source rewrite —
// each action routes via its preset ref, server-side. The per-model tier
// overrides + the modelMeta.js classifier mirror died with the tier system,
// 2026-08-07 — dead code with zero UI consumers, verified.)

import { defineStore } from "pinia";
import { readSetting, writeSetting } from "../services/settings.js";
import * as providerBackend from "../services/providerBackend.js";
import * as routingBackend from "../services/routingBackend.js";

// The `ai` settings section holds only the non-routing AI prefs (the RAG
// auto-rebuild toggle). The default provider/embedding lives in the routing
// tables (/v1/ai/routing via routingBackend); providers live in
// /v1/llm-providers. None of those round-trip through the settings document.
function loadPrefs() {
  const v = readSetting("ai");
  return v && typeof v === "object" ? v : null;
}

// Providers come from the server's /v1/llm-providers table (read into a sync
// cache by bootProviders() before mount). The server seeds the built-in defaults
// and merges any new ones on every boot (server/justwrite_server/database/seed.py), so
// the client just reads the list — no client-side defaults, no write-through
// seeding. Empty only when the server is unreachable (the connection gate makes
// that a no-boot anyway).
function initialProviders() {
  return providerBackend.listProviders() ?? [];
}

// Persist the routing default (provider/embedding) to the routing tables.
function saveRouting(state) {
  routingBackend.putRoutingPrefs({
    defaultLlmId: state.defaultLlmId,
    defaultEmbeddingId: state.defaultEmbeddingId,
    defaultEmbeddingModel: state.defaultEmbeddingModel,
  });
}

// Persist the non-routing AI prefs to the `ai` settings section (its only
// remaining contents — a stored modelTiers key from the retired tier system
// simply stops being written and drops off on the next save). Providers +
// routing are server-authoritative elsewhere.
function savePrefs(state) {
  writeSetting("ai", {
    autoRebuildRagIndex: state.autoRebuildRagIndex,
  });
}

export const useAiStore = defineStore("ai", {
  state: () => {
    const prefs = loadPrefs();
    // Routing (the default provider/embedding) comes from the routing
    // tables via the boot cache — one source of truth shared with the Features
    // tab; the `ai` settings doc carries only the non-routing prefs below.
    const routing = routingBackend.getRoutingPrefs();
    return {
      providers: initialProviders(),
      // Fallback = the BUILT-IN provider (2026-07-11; was the legacy Ollama-port
      // "openai-compat-local", which pointed a routing-less boot at a provider with
      // no models and broke Build index with "has no embedding model set").
      defaultLlmId: routing?.defaultLlmId || "local-llamacpp",
      // Default provider + model used for embeddings (RAG indexing + chat).
      // The model is the routing override set in AI ▸ Features → Default
      // embedding (usually typed in — text-embedding-3-small / nomic-embed-text);
      // empty falls back to the provider's own embeddingModel.
      defaultEmbeddingId: routing?.defaultEmbeddingId || "local-llamacpp",
      defaultEmbeddingModel: routing?.defaultEmbeddingModel || "",
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

    // The configured-guard the analysis modals use ("is AI set up at all?").
    // Since the 2026-07-15 one-source rewrite routing is server-side (each
    // action's preset ref) — this returns the default LLM provider, which is
    // exactly the "something is configured" signal the guards need. The
    // featureKey parameter is kept so ten call sites stay honest about WHICH
    // feature they're guarding.
    providerForFeature: (s) => (_featureKey) => {
      return s.providers.find((p) => p.id === s.defaultLlmId) || null;
    },
  },

  actions: {
    // Provider CRUD lives in the shared kit (the AiModelsArea → ProviderForm
    // views write /v1/llm-providers directly); this store only READS the list
    // (boot cache + resync). The old optimistic add/update/remove actions were
    // dead code once the kit took over editing — removed by the 2026-07-06
    // everything-LLM-shared audit (C4).
    setDefaultLlm(id) {
      this.defaultLlmId = id;
      saveRouting(this.$state);
    },
    setDefaultEmbedding(id) {
      this.defaultEmbeddingId = id;
      saveRouting(this.$state);
    },
    // Re-pull routing from the server into the store (+ the routingBackend cache).
    // The shared AI views write routing directly to the server, so after the user
    // leaves that page this refreshes the default LLM/embedding + model the
    // renderer-side RAG and chat panel rely on — no full reload needed.
    async resyncRouting() {
      await routingBackend.refreshRouting();
      const r = routingBackend.getRoutingPrefs();
      if (!r) return;
      this.defaultLlmId = r.defaultLlmId || this.defaultLlmId;
      this.defaultEmbeddingId = r.defaultEmbeddingId || this.defaultEmbeddingId;
      this.defaultEmbeddingModel = r.defaultEmbeddingModel || "";
    },
    // Point-of-use freshness + self-heal (2026-07-11, two rounds): every RAG entry
    // point resolves its embedding provider through THIS. It ALWAYS re-pulls routing
    // first — the shared kit UI writes the embedding default server-side
    // (setAsEmbedding), which this store never hears about, and the earlier
    // only-when-unusable resync left a USABLE-but-stale default: "rebuild with the 4B"
    // silently re-embedded with the 0.6B. One local GET per RAG action is noise next
    // to the embedding work itself, and a FAILED resync keeps the current values
    // (resyncRouting no-ops on a bad fetch) — so this also still heals the original
    // cold-boot race where the boot cache came up empty. The provider list is
    // re-pulled only when the resolved record is missing entirely.
    async ensureEmbeddingDefaults() {
      try {
        await this.resyncRouting();
        if (!this.embeddingProvider) {
          await providerBackend.refreshProviders();
          this.providers = providerBackend.listProviders() ?? this.providers;
        }
      } catch (err) {
        console.error("ensureEmbeddingDefaults resync failed:", err);
      }
      return this.embeddingProvider;
    },
    setAutoRebuildRagIndex(on) {
      this.autoRebuildRagIndex = !!on;
      savePrefs(this.$state);
    },
  },
});
