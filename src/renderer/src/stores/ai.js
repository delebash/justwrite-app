// AI store — manages providers (OpenAI-compatible), default LLM and TTS,
// connection status, and the usage ledger (tokens + estimated cost per
// call). Persists via the IDB-backed storage adapter.

import { defineStore } from "pinia";
import { DEFAULT_PROVIDERS } from "../domain/seed.js";
import { OpenAICompatClient } from "../services/openai-compat.js";
import { getModelTier, TIERS } from "../services/modelMeta.js";
import { getItem, setItem } from "../services/storage.js";

const LS_KEY = "justwrite:ai";

// For each feature, which mode key holds the production-ready presets.
// Speaker analysis production = the inline (Studio) pipeline; lab two-
// stage and legacy studio modes don't have a production target.
// Smart-Assign has a single mode keyed "cast" (no lab UI yet but the
// data shape is ready for one).
export const PRODUCTION_MODE_OF = {
  speakerAnalysis: "inline",
  smartCast: "cast",
};
const LS_USAGE_KEY = "justwrite:ai:usage";

// In-memory cap on the usage log so a long session can't unbounded-bloat
// IDB. The oldest rows are trimmed; aggregate totals are kept separately.
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
  // OpenRouter but the bare model id is what surfaces in usage rows)
  "claude-opus-4-7":    { in: 15.00, out: 75.00 },
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

function loadUsage() {
  try {
    const v = JSON.parse(getItem(LS_USAGE_KEY) || "null");
    if (!v || typeof v !== "object") return null;
    return {
      log: Array.isArray(v.log) ? v.log : [],
      totals: v.totals && typeof v.totals === "object" ? v.totals : null,
    };
  } catch { return null; }
}

function saveUsage(log, totals) {
  try {
    setItem(LS_USAGE_KEY, JSON.stringify({ log, totals }));
  } catch {}
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
    // Migrations into the current shape (labPresets + activeProduction).
    // Walk forward through every prior shape we've shipped so a user
    // doesn't lose work upgrading across versions.
    v.labPresets = v.labPresets || { speakerAnalysis: { inline: [], studio: [], lab: [] }, smartCast: { cast: [] } };
    v.activeProduction = v.activeProduction || { speakerAnalysis: null, smartCast: null };

    // Migration 1: very-old flat shape — `featureConfigs.<feature>` was
    // a single settings object. Lift into the inline preset list.
    if (v.featureConfigs) {
      for (const key of ["speakerAnalysis", "smartCast"]) {
        const legacy = v.featureConfigs[key];
        if (legacy && typeof legacy === "object") {
          const name = legacy.source || "Migrated";
          const modeKey = key === "speakerAnalysis" ? "inline" : "cast";
          v.labPresets[key] = v.labPresets[key] || {};
          v.labPresets[key][modeKey] = v.labPresets[key][modeKey] || [];
          v.labPresets[key][modeKey].push({
            name, savedAt: legacy.savedAt || Date.now(), source: legacy.source,
            settings: legacy,
          });
          v.activeProduction[key] = name;
        }
      }
      delete v.featureConfigs;
    }
    // Migration 2: short-lived `savedConfigs` / `activeConfig` shape.
    if (v.savedConfigs) {
      for (const key of ["speakerAnalysis", "smartCast"]) {
        const list = v.savedConfigs[key] || [];
        const modeKey = key === "speakerAnalysis" ? "inline" : "cast";
        v.labPresets[key] = v.labPresets[key] || {};
        v.labPresets[key][modeKey] = v.labPresets[key][modeKey] || [];
        for (const entry of list) {
          if (entry?.name) v.labPresets[key][modeKey].push(entry);
        }
      }
      if (v.activeConfig) {
        v.activeProduction.speakerAnalysis = v.activeProduction.speakerAnalysis || v.activeConfig.speakerAnalysis || null;
        v.activeProduction.smartCast      = v.activeProduction.smartCast      || v.activeConfig.smartCast      || null;
      }
      delete v.savedConfigs;
      delete v.activeConfig;
    }
    return v;
  } catch { return null; }
}

function save(state) {
  try {
    setItem(LS_KEY, JSON.stringify({
      providers: state.providers,
      defaultLlmId: state.defaultLlmId,
      defaultTtsId: state.defaultTtsId,
      defaultEmbeddingId: state.defaultEmbeddingId,
      modelTiers: state.modelTiers,
      featurePins: state.featurePins,
      labPresets: state.labPresets,
      activeProduction: state.activeProduction,
      autoRebuildRagIndex: state.autoRebuildRagIndex,
      useLlmVoiceGender: state.useLlmVoiceGender,
    }));
  } catch {}
}

export const useAiStore = defineStore("ai", {
  state: () => {
    const loaded = load();
    const usage = loadUsage();
    return {
      providers: loaded?.providers ?? [...DEFAULT_PROVIDERS],
      defaultLlmId: loaded?.defaultLlmId ?? "openai-compat-local",
      defaultTtsId: loaded?.defaultTtsId ?? "openai",
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
      // Per-feature, per-mode named presets. Each entry:
      //   { name, savedAt, source?, settings: {...mode-specific keys} }
      // Built-in "Default" is implicit (sentinel meaning "use the lab's
      // built-in defaults for that mode" / "use tier-resolved defaults
      // for production"). The array holds USER-SAVED presets only.
      //
      // Mode keys map to the lab's mode segments:
      //   speakerAnalysis.inline   — Studio (production)
      //   speakerAnalysis.studio   — Legacy Studio (paragraph-level)
      //   speakerAnalysis.lab      — Lab (two-stage)
      //   smartCast.cast           — Smart-Assign (no lab UI yet)
      labPresets: loaded?.labPresets ?? {
        speakerAnalysis: { inline: [], studio: [], lab: [] },
        smartCast: { cast: [] },
      },
      // Per feature: name of the preset that drives production. `null`
      // (or "Default") means "use tier-resolved built-ins." Only presets
      // from the feature's production mode (see PRODUCTION_MODE_OF
      // below) can be production.
      activeProduction: loaded?.activeProduction ?? { speakerAnalysis: null, smartCast: null },
      // When true, services/rag/autoIndex.js silently embeds new/changed
      // scenes a minute after the last edit. Default OFF — auto-firing
      // burns embed tokens on every save against a cloud provider, which
      // the user shouldn't get without opting in.
      autoRebuildRagIndex: loaded?.autoRebuildRagIndex ?? false,
      // When true, after a voice list is fetched and the offline
      // first-name dictionary in services/voiceGender.js has labelled what
      // it can, any voices still missing a gender are sent in one batch
      // to the default LLM for classification. Default OFF — the writer
      // can also just click the ❓ chip in Studio's voice library, which
      // persists and survives re-fetch (mergeVoices only backfills empty
      // fields).
      useLlmVoiceGender: loaded?.useLlmVoiceGender ?? false,
      // Usage ledger — every LLM call routed through writerAI (and any
      // future feature that uses recordUsage) appends a row. Aggregates
      // are maintained alongside so a settings page can render totals
      // without rewalking the log on every open.
      usageLog: usage?.log || [],
      usageTotals: usage?.totals || emptyTotals(),
    };
  },

  getters: {
    providerById: (s) => (id) => s.providers.find((p) => p.id === id),
    llmProvider: (s) => s.providers.find((p) => p.id === s.defaultLlmId) || null,
    ttsProvider: (s) => s.providers.find((p) => p.id === s.defaultTtsId) || null,
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
    ttsProviders: (s) => s.providers.filter((p) => p.kind === "tts" || p.kind === "both"),
    // TTS counterpart to readyLlmProviders above. A built-in TTS entry
    // (OpenAI, Speechmatics) only counts as ready once the writer has
    // pasted a key; local servers (Kokoro, Chatterbox) count when their
    // baseUrl points at localhost — the server may not be running, but
    // we don't poll on every list to find out.
    readyTtsProviders: (s) => {
      const isLocal = (url) => /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(String(url || ""));
      // Edge TTS routes through Rust (msedge-tts crate) — always ready
      // when the desktop app is running. No apiKey, no localhost URL.
      // In browser dev (`vite dev` outside Tauri) the bridge isn't
      // populated and synth throws a "desktop app only" error.
      const isEdgeTts = (p) => p.id === "edgeTts";
      return s.providers
        .filter((p) => p.kind === "tts" || p.kind === "both")
        .filter((p) => !!p.apiKey || isLocal(p.baseUrl) || isEdgeTts(p));
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

    // Look up the active production preset entry for a feature. Returns
    // `null` for the built-in Default (caller falls through to tier-
    // resolved defaults). Returns the full preset entry — { name,
    // savedAt, source, settings } — when a saved preset is active.
    // Production lives in the feature's production mode (see
    // PRODUCTION_MODE_OF below in this file).
    activeProductionEntry: (s) => (featureKey) => {
      const name = s.activeProduction?.[featureKey];
      if (!name) return null;
      const modeKey = PRODUCTION_MODE_OF[featureKey];
      const list = s.labPresets?.[featureKey]?.[modeKey] || [];
      return list.find((c) => c.name === name) || null;
    },
    // Convenience: just the settings object of the active production
    // preset, or null when Default is active. Services use this as
    // the override dictionary on top of their tier-resolved defaults.
    activeSettingsFor() {
      return (featureKey) => this.activeProductionEntry(featureKey)?.settings || null;
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
    // ── Per-feature, per-mode lab presets ──────────────────────────────
    // Save (or replace) a named preset in the given feature+mode list.
    // `settings` shape is mode-specific (caller controls):
    //   speakerAnalysis.inline → full inline-pipeline knob set
    //   speakerAnalysis.studio → legacy studio settings
    //   speakerAnalysis.lab    → { twoStage, stage1, stage2 }
    //   smartCast.cast         → cast-director settings (future Smart-Assign Lab)
    saveLabPreset(featureKey, modeKey, name, settings, source) {
      if (!name) return;
      if (String(name).trim().toLowerCase() === "default") return; // reserved
      const feature = { ...(this.labPresets?.[featureKey] || {}) };
      const list = [...(feature[modeKey] || [])];
      const entry = {
        name: String(name).trim(),
        savedAt: Date.now(),
        source: source || "",
        settings: settings || {},
      };
      const idx = list.findIndex((c) => c.name === entry.name);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      feature[modeKey] = list;
      this.labPresets = { ...this.labPresets, [featureKey]: feature };
      save(this.$state);
    },
    deleteLabPreset(featureKey, modeKey, name) {
      if (!name || String(name).toLowerCase() === "default") return;
      const feature = { ...(this.labPresets?.[featureKey] || {}) };
      feature[modeKey] = (feature[modeKey] || []).filter((c) => c.name !== name);
      this.labPresets = { ...this.labPresets, [featureKey]: feature };
      // If the deleted preset was production, fall back to Default.
      if (this.activeProduction?.[featureKey] === name) {
        this.activeProduction = { ...this.activeProduction, [featureKey]: null };
      }
      save(this.$state);
    },
    setActiveProduction(featureKey, name) {
      // null / "Default" / "" → built-in (tier-resolved). Any other
      // name should match a preset in the feature's production-mode list.
      const resolved = (!name || String(name).toLowerCase() === "default") ? null : name;
      this.activeProduction = { ...this.activeProduction, [featureKey]: resolved };
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
    setDefaultEmbedding(id) {
      this.defaultEmbeddingId = id;
      save(this.$state);
    },
    setAutoRebuildRagIndex(on) {
      this.autoRebuildRagIndex = !!on;
      save(this.$state);
    },
    setUseLlmVoiceGender(on) {
      this.useLlmVoiceGender = !!on;
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
      saveUsage(this.usageLog, this.usageTotals);
      return row;
    },

    clearUsage() {
      this.usageLog = [];
      this.usageTotals = emptyTotals();
      saveUsage(this.usageLog, this.usageTotals);
    },
  },
});

// Exported for tests / settings pages that want to render the same
// pricing table the store uses internally.
export { MODEL_PRICING, priceFor };
