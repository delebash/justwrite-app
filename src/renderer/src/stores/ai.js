// AI store — manages providers (OpenAI-compatible), the default LLM,
// connection status, and the usage ledger (tokens + estimated cost per
// call). Persists via the IDB-backed storage adapter.

import { defineStore } from "pinia";
import { OpenAICompatClient } from "../services/openai-compat.js";
import { getModelTier, TIERS } from "../services/modelMeta.js";
import { readSetting, writeSetting } from "../services/settings.js";
import { getUsage, postUsage, clearUsage as clearUsageApi } from "../services/usageApi.js";
import * as providerBackend from "../services/providerBackend.js";

// JustWrite is writing-only — every provider is an LLM/embedding endpoint
// reached through the OpenAI-compat client. (Audio/TTS providers + their
// proprietary clients were removed when audio moved to JustVoice.)
function pingClientFor(provider) {
  return new OpenAICompatClient(provider);
}

// In-memory cap on the displayed usage log so a long session doesn't grow the
// reactive list unbounded. The server keeps every row and computes lifetime
// totals, so trimming the in-memory list never loses cost history.
const USAGE_LOG_LIMIT = 1000;

// Per-1M-token pricing for known cloud models. Local providers (Ollama,
// LM Studio, llama.cpp) cost $0 — they get no entry and pricing resolves
// to zero. Add entries when surfacing a new cloud model in the UI;
// missing entries return zero (so the ledger is still useful, just
// without cost columns).
const MODEL_PRICING = {
  // OpenAI (USD per 1M tokens — input / output)
  "gpt-5":              { in: 1.25,  out: 10.00 },
  "gpt-5-mini":         { in: 0.25,  out: 2.00 },
  "gpt-5-nano":         { in: 0.05,  out: 0.40 },
  "gpt-4o":             { in: 2.50,  out: 10.00 },
  "gpt-4o-mini":        { in: 0.15,  out: 0.60 },
  "gpt-4.1":            { in: 2.00,  out: 8.00 },
  "gpt-4.1-mini":       { in: 0.40,  out: 1.60 },
  // Anthropic Claude (cloud — these run through openai-compat shims like
  // OpenRouter but the bare model id is what surfaces in usage rows).
  // Prices USD per 1M tokens (input / output), verified via the claude-api
  // reference 2026-06-16. (claude-opus-4-7 was previously wrong at 15/75 —
  // that's old Opus-3-era pricing; the 4.x Opus tier is 5/25.)
  "claude-fable-5":     { in: 10.00, out: 50.00 },
  "claude-opus-4-8":    { in: 5.00,  out: 25.00 },
  "claude-opus-4-7":    { in: 5.00,  out: 25.00 },
  "claude-sonnet-4-6":  { in: 3.00,  out: 15.00 },
  "claude-haiku-4-5":   { in: 1.00,  out: 5.00 },
  // Google Gemini
  "gemini-2.5-pro":     { in: 1.25,  out: 5.00 },
  "gemini-2.5-flash":   { in: 0.30,  out: 2.50 },
};

function priceFor(modelId) {
  if (!modelId) return null;
  const id = String(modelId).toLowerCase();
  // Exact match first; otherwise prefix-match (catches `-2026-01-01` etc.).
  if (MODEL_PRICING[id]) return MODEL_PRICING[id];
  for (const [key, p] of Object.entries(MODEL_PRICING)) {
    if (id.startsWith(key)) return p;
  }
  return null;
}

function emptyTotals() {
  return {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cost: 0,
    byFeature: {}, // featureKey -> { calls, promptTokens, completionTokens, cost }
    byProvider: {}, // providerId -> same shape
  };
}

function bumpBucket(bucket, row) {
  bucket.calls += 1;
  bucket.promptTokens += row.promptTokens || 0;
  bucket.completionTokens += row.completionTokens || 0;
  bucket.cost += row.cost || 0;
}

function bumpKey(map, key, row) {
  if (!key) return;
  const existing = map[key] || { calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
  bumpBucket(existing, row);
  map[key] = existing;
}

// The `ai` settings section holds only the AI *preferences* (defaults, feature
// pins, per-model tier overrides, auto-rebuild). Providers live in their own
// server table (/v1/llm-providers) and never round-trip through settings.
function load() {
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

function save(state) {
  writeSetting("ai", {
    defaultLlmId: state.defaultLlmId,
    defaultEmbeddingId: state.defaultEmbeddingId,
    modelTiers: state.modelTiers,
    featurePins: state.featurePins,
    autoRebuildRagIndex: state.autoRebuildRagIndex,
  });
  // Providers are server-authoritative — write the list through to its table.
  try { providerBackend.saveProviders(state.providers); } catch {}
}

export const useAiStore = defineStore("ai", {
  state: () => {
    const loaded = load();
    return {
      providers: initialProviders(),
      defaultLlmId: loaded?.defaultLlmId ?? "openai-compat-local",
      // Default provider used for embeddings (RAG indexing + chat).
      // Same provider can host LLM + embeddings; the model field on the
      // provider determines which embedding model to call.
      defaultEmbeddingId: loaded?.defaultEmbeddingId ?? "openai-compat-local",
      status: {}, // providerId -> "ok" | "down" | "checking" | undefined
      // Per-model tier overrides (pinned by the user in Settings or the
      // Speaker Lab). Keyed by bare model id, NOT by provider+model — same
      // model on different Ollama instances should share the same tier
      // judgement. Empty by default; the heuristic in modelMeta.js
      // provides the auto-detected tier when nothing is pinned.
      modelTiers: loaded?.modelTiers ?? {},
      // Per-feature LLM pins. Each key is a feature id (chat | critique |
      // entitySweep | writerAI); each value is null (= inherit the global
      // defaultLlmId) or { providerId, model? }. `model` is optional —
      // when null the provider's own `chatModel` is used. Surfaced in
      // Settings → AI → Feature defaults, plus the chat panel writes to
      // featurePins.chat directly for in-thread model switching.
      featurePins: loaded?.featurePins ?? { chat: null, critique: null, entitySweep: null, writerAI: null },
      // When true, services/rag/autoIndex.js silently embeds new/changed
      // scenes a minute after the last edit. Default OFF — auto-firing
      // burns embed tokens on every save against a cloud provider, which
      // the user shouldn't get without opting in.
      autoRebuildRagIndex: loaded?.autoRebuildRagIndex ?? false,
      // Usage ledger — hydrated on demand from /v1/llm-usage (Settings → Usage).
      // recordUsage appends locally for live display and POSTs to the server,
      // which owns the full history and computes lifetime totals.
      usageLog: [],
      usageTotals: emptyTotals(),
      _usageHydrated: false,
    };
  },

  getters: {
    providerById: (s) => (id) => s.providers.find((p) => p.id === id),
    llmProvider: (s) => s.providers.find((p) => p.id === s.defaultLlmId) || null,
    embeddingProvider: (s) => s.providers.find((p) => p.id === s.defaultEmbeddingId) || null,
    llmProviders: (s) => s.providers.filter((p) => p.kind === "llm" || p.kind === "both"),

    // Subset of llmProviders that's actually usable right now: local
    // endpoints (no key needed) or cloud providers that have an apiKey
    // filled in. The model pickers (chat panel, Settings → AI → Feature
    // defaults) filter on this so we don't surface seed entries like
    // "Claude · claude-haiku-4-5" when the user hasn't configured them.
    readyLlmProviders(s) {
      const isLocal = (url) => /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(String(url || ""));
      return s.providers
        .filter((p) => p.kind === "llm" || p.kind === "both")
        .filter((p) => !!p.apiKey || isLocal(p.baseUrl));
    },
    // Any LLM-capable provider can host embeddings — the embedding
    // model is configured per-provider via the embeddingModel field.
    embeddingProviders: (s) => s.providers.filter((p) => p.kind === "llm" || p.kind === "both"),

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

    // Recent usage entries newest-first (for a "recent activity" list).
    recentUsage: (s) => (limit = 20) => [...s.usageLog].reverse().slice(0, limit),
    // Sum of cost across the entire ledger.
    totalCost: (s) => s.usageTotals.cost || 0,
    totalTokens: (s) => (s.usageTotals.promptTokens || 0) + (s.usageTotals.completionTokens || 0),
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
    setFeaturePin(featureKey, pin) {
      // pin = null to inherit the default; { providerId, model? } to pin.
      this.featurePins = { ...this.featurePins, [featureKey]: pin || null };
      save(this.$state);
    },
    setDefaultLlm(id) {
      this.defaultLlmId = id;
      save(this.$state);
    },
    setDefaultEmbedding(id) {
      this.defaultEmbeddingId = id;
      save(this.$state);
    },
    setAutoRebuildRagIndex(on) {
      this.autoRebuildRagIndex = !!on;
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

    // ── Quick setup wizard ─────────────────────────────────────
    // Applies a hardware preset in one shot: creates (or updates)
    // up to two Ollama providers, sets defaults, and rewrites the
    // feature pins per the recipe. Idempotent — re-running with
    // a different tier overwrites the same provider ids cleanly.
    //
    // preset shape: { defaultChatModel, fastChatModel?, embeddingModel, recipe }
    //   recipe = { [featureKey]: "default" | "fast" | "cloud" }
    //   (omitted keys inherit the default LLM)
    applyQuickSetupPreset({ preset, ollamaBaseUrl, cloudProviderId = null, providerIds }) {
      if (!preset || !ollamaBaseUrl || !providerIds?.default) return;
      const baseUrl = ollamaBaseUrl;
      const defaultId = providerIds.default;
      const fastId = providerIds.fast;

      // quickSetupTier on each provider lets the wizard later compare
      // the user's current setup against a freshly-detected VRAM tier
      // and nudge them when the two have drifted (e.g. upgraded GPU).
      const tierTag = preset.id || null;
      const defaultEntry = {
        id: defaultId,
        name: `Ollama · ${preset.defaultChatModel}`,
        kind: "llm",
        baseUrl,
        apiKey: "",
        chatModel: preset.defaultChatModel,
        embeddingModel: preset.embeddingModel || "",
        quickSetupTier: tierTag,
      };
      const fastEntry = preset.fastChatModel ? {
        id: fastId,
        name: `Ollama · ${preset.fastChatModel} (fast)`,
        kind: "llm",
        baseUrl,
        apiKey: "",
        chatModel: preset.fastChatModel,
        quickSetupTier: tierTag,
      } : null;

      // Upsert providers — preserve any unrelated fields if the entry
      // already exists (e.g. user renamed it).
      const upsert = (list, entry) => {
        const idx = list.findIndex((p) => p.id === entry.id);
        if (idx < 0) return [...list, entry];
        const next = [...list];
        next[idx] = { ...list[idx], ...entry };
        return next;
      };
      let providers = upsert(this.providers, defaultEntry);
      if (fastEntry) providers = upsert(providers, fastEntry);
      else providers = providers.filter((p) => p.id !== fastId); // drop stale fast if tier no longer wants one

      this.providers = providers;
      this.defaultLlmId = defaultId;
      this.defaultEmbeddingId = defaultId;

      // Rewrite feature pins per the recipe. Unmentioned keys reset
      // to null (= inherit default) so a re-run is fully idempotent.
      const nextPins = {};
      for (const [key, target] of Object.entries(preset.recipe || {})) {
        if (target === "fast" && fastEntry) {
          nextPins[key] = { providerId: fastId };
        } else if (target === "cloud" && cloudProviderId) {
          nextPins[key] = { providerId: cloudProviderId };
        } else {
          nextPins[key] = null;
        }
      }
      this.featurePins = { ...this.featurePins, ...nextPins };

      save(this.$state);
    },

    async ping(id) {
      const p = this.providerById(id);
      if (!p) return false;
      this.status = { ...this.status, [id]: "checking" };
      const ok = await pingClientFor(p).ping();
      this.status = { ...this.status, [id]: ok ? "ok" : "down" };
      return ok;
    },

    // ── Usage ───────────────────────────────────────────────
    // Append a usage row. Called by writerAI (and any other AI feature
    // routed through this ledger) on the final chunk of a chat call.
    //   feature    — short key like "rewrite", "expand", "critique", …
    //   providerId — id from the AI store; used for grouping + display
    //   model      — bare model id (e.g. "gpt-4o-mini"); priced via
    //                MODEL_PRICING above
    //   promptTokens / completionTokens — from the server response
    //   meta       — optional { chapterId, sceneId, label } for the
    //                future "view recent calls" panel
    recordUsage({ feature, providerId, model, promptTokens = 0, completionTokens = 0, meta = {} } = {}) {
      const p = priceFor(model);
      const cost = p
        ? (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out
        : 0;
      const row = {
        id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        at: Date.now(),
        feature: feature || "unknown",
        providerId: providerId || null,
        model: model || null,
        promptTokens: Math.max(0, promptTokens | 0),
        completionTokens: Math.max(0, completionTokens | 0),
        cost,
        meta,
      };
      const nextLog = [...this.usageLog, row];
      while (nextLog.length > USAGE_LOG_LIMIT) nextLog.shift();
      this.usageLog = nextLog;
      // Update aggregates in place — the totals object isn't rebuilt
      // from the log so trimmed rows still count toward lifetime totals.
      const totals = { ...this.usageTotals, byFeature: { ...this.usageTotals.byFeature }, byProvider: { ...this.usageTotals.byProvider } };
      bumpBucket(totals, row);
      bumpKey(totals.byFeature, row.feature, row);
      bumpKey(totals.byProvider, row.providerId, row);
      this.usageTotals = totals;
      // Persist to the server (the authoritative store); local state above is
      // the live-display copy. The row shape matches the /v1/llm-usage body.
      postUsage(row);
      return row;
    },

    // Pull the recent ledger + lifetime totals from the server. Called on demand
    // (Settings → Usage) so the cost page reflects the full history, not just
    // this session's recorded calls. Idempotent within a session.
    async hydrateUsage() {
      if (this._usageHydrated) return;
      this._usageHydrated = true;
      try {
        const { log, totals } = await getUsage();
        this.usageLog = Array.isArray(log) ? log : [];
        this.usageTotals = totals && typeof totals === "object" ? totals : emptyTotals();
      } catch (err) {
        this._usageHydrated = false;  // allow a retry on next open
        console.error("ai.hydrateUsage failed:", err);
      }
    },

    clearUsage() {
      this.usageLog = [];
      this.usageTotals = emptyTotals();
      clearUsageApi();
    },
  },
});

// Exported for tests / settings pages that want to render the same
// pricing table the store uses internally.
export { MODEL_PRICING, priceFor };
