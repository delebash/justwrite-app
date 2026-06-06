// Hardware preset store — owns the editable per-tier recipes that the
// Quick Setup wizard reads. Seeds from FACTORY_PRESETS on first run,
// persists user edits to IndexedDB, and exposes Reset actions that copy
// from the factory seed so a user can always recover the defaults.
//
// Why a store rather than a const: model identifiers and quants change
// every few weeks. Hardcoding picks in code means a release to update
// them; storing them with sane factory defaults means the user (or a
// future "model catalogue auto-update" feature) can refresh them
// without a build.

import { defineStore } from "pinia";
import { FACTORY_PRESETS } from "../services/quickSetupPresets.js";
import { getItem, setItem } from "../services/storage.js";

const LS_KEY = "justwrite:hardwarePresets";

function load() {
  try {
    const raw = getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

function save(state) {
  try { setItem(LS_KEY, JSON.stringify({ presets: state.presets, order: state.order })); } catch {}
}

function cloneFactory() {
  const out = {};
  for (const [k, v] of Object.entries(FACTORY_PRESETS)) {
    out[k] = JSON.parse(JSON.stringify(v));
  }
  return out;
}

function factoryOrder() {
  return Object.keys(FACTORY_PRESETS);
}

export const useHardwarePresetsStore = defineStore("hardwarePresets", {
  state: () => {
    const loaded = load();
    const factory = cloneFactory();
    const order = factoryOrder();
    if (loaded?.presets) {
      // Re-merge: factory tiers always exist (so a release can ship a
      // new tier and the user sees it), but the user's saved values
      // for existing tiers win. Custom (non-factory) tiers from the
      // saved set are preserved.
      const merged = { ...factory };
      for (const [k, v] of Object.entries(loaded.presets)) {
        merged[k] = v;
      }
      // Order: respect saved order, append any new factory keys at the
      // bottom (so an added tier shows up without rebuilding the order).
      const savedOrder = Array.isArray(loaded.order) ? loaded.order : order;
      const seen = new Set(savedOrder);
      const finalOrder = [...savedOrder.filter((k) => merged[k]), ...order.filter((k) => !seen.has(k))];
      return { presets: merged, order: finalOrder };
    }
    return { presets: factory, order };
  },

  getters: {
    // All presets in display order, including custom tiers.
    list: (s) => s.order.map((id) => s.presets[id]).filter(Boolean),
    // Lookup by id; falls back to the factory definition if a custom
    // tier was deleted mid-flow.
    get: (s) => (id) => s.presets[id] || FACTORY_PRESETS[id] || null,
    // Used by the editor to know whether the Reset button should show.
    isUserModified: (s) => (id) => {
      const cur = s.presets[id];
      const factory = FACTORY_PRESETS[id];
      if (!cur) return false;
      if (!factory) return true; // custom tier — always "modified" from a factory perspective
      return JSON.stringify(cur) !== JSON.stringify(factory);
    },
    isFactoryTier: () => (id) => !!FACTORY_PRESETS[id],
  },

  actions: {
    // Patch a single preset's editable fields. Recipe + builtIn are
    // preserved unless explicitly overridden.
    updatePreset(id, patch) {
      const existing = this.presets[id];
      if (!existing) return;
      this.presets = { ...this.presets, [id]: { ...existing, ...patch, id } };
      save(this.$state);
    },

    // Add a user-defined tier. id is auto-generated if not supplied.
    // Seeds from the "12" tier as a sensible starting shape.
    addCustomPreset({ id, label, defaultChatModel } = {}) {
      const newId = id || `custom-${Math.random().toString(36).slice(2, 8)}`;
      const seed = FACTORY_PRESETS["12"];
      const entry = {
        ...JSON.parse(JSON.stringify(seed)),
        id: newId,
        label: label || "Custom tier",
        defaultChatModel: defaultChatModel || seed.defaultChatModel,
        builtIn: false,
      };
      this.presets = { ...this.presets, [newId]: entry };
      if (!this.order.includes(newId)) this.order = [...this.order, newId];
      save(this.$state);
      return newId;
    },

    // Remove a custom tier. Built-in tiers can't be deleted — use
    // resetTier() to revert them to factory values instead.
    deletePreset(id) {
      if (FACTORY_PRESETS[id]) return;
      const next = { ...this.presets };
      delete next[id];
      this.presets = next;
      this.order = this.order.filter((k) => k !== id);
      save(this.$state);
    },

    // Revert a single tier to its factory definition. Custom tiers
    // can't be reset (they have no factory) — caller should disable
    // the button via isFactoryTier().
    resetTier(id) {
      const factory = FACTORY_PRESETS[id];
      if (!factory) return;
      this.presets = { ...this.presets, [id]: JSON.parse(JSON.stringify(factory)) };
      save(this.$state);
    },

    // Wipe all customization. Custom tiers are deleted; factory tiers
    // revert to their original values.
    resetAll() {
      this.presets = cloneFactory();
      this.order = factoryOrder();
      save(this.$state);
    },
  },
});
