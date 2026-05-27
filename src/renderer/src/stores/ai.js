// AI store — manages providers (OpenAI-compatible), default LLM and TTS,
// connection status. Persists via the IDB-backed storage adapter.

import { defineStore } from "pinia";
import { DEFAULT_PROVIDERS } from "../domain/seed.js";
import { OpenAICompatClient } from "../services/openai-compat.js";
import { getItem, setItem } from "../services/storage.js";

const LS_KEY = "justwrite:ai";

function load() {
  try {
    const v = JSON.parse(getItem(LS_KEY) || "null");
    if (!v || !Array.isArray(v.providers)) return null;
    // Migration: drop the removed Web Speech provider from persisted state
    // and reset defaults that pointed at it.
    const filtered = v.providers.filter((p) => p.id !== "web-speech" && p.engine !== "web-speech");
    if (filtered.length !== v.providers.length) v.providers = filtered;
    if (v.defaultTtsId === "web-speech") v.defaultTtsId = "openai";
    if (v.defaultLlmId === "web-speech") v.defaultLlmId = "ollama-local";
    return v;
  } catch { return null; }
}

function save(state) {
  try {
    setItem(LS_KEY, JSON.stringify({
      providers: state.providers,
      defaultLlmId: state.defaultLlmId,
      defaultTtsId: state.defaultTtsId,
    }));
  } catch {}
}

export const useAiStore = defineStore("ai", {
  state: () => {
    const loaded = load();
    return {
      providers: loaded?.providers ?? [...DEFAULT_PROVIDERS],
      defaultLlmId: loaded?.defaultLlmId ?? "ollama-local",
      defaultTtsId: loaded?.defaultTtsId ?? "openai",
      status: {}, // providerId -> "ok" | "down" | "checking" | undefined
    };
  },

  getters: {
    providerById: (s) => (id) => s.providers.find((p) => p.id === id),
    llmProvider: (s) => s.providers.find((p) => p.id === s.defaultLlmId) || null,
    ttsProvider: (s) => s.providers.find((p) => p.id === s.defaultTtsId) || null,
    llmProviders: (s) => s.providers.filter((p) => p.kind === "llm" || p.kind === "both"),
    ttsProviders: (s) => s.providers.filter((p) => p.kind === "tts" || p.kind === "both"),
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
