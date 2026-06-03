// JustWrite — renderer entry point.
// Loads the Tauri ↔︎ window.justwrite bridge before mounting Vue so the
// stores find the IPC adapter the moment they spin up.

import "./services/tauri-bridge.js";
// Apply the default appearance synchronously so we don't render with the
// wrong colour scheme during the IDB hydration tick below. The real
// persisted appearance is reapplied after bootStorage resolves.
import { applyAppearance, migrateAppearance, DEFAULT_APPEARANCE } from "./services/appearance.js";
applyAppearance(DEFAULT_APPEARANCE);

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router/index.js";
import { bootStorage, getItem } from "./services/storage.js";

import "./assets/styles/tokens.css";
import { tooltipDirective } from "./services/tooltip.js";
import { i18n, detectLocale, setLocale as setI18nLocale } from "./i18n/index.js";
import { startAutoRebuildWatcher } from "./services/rag/autoIndex.js";

// Hydrate the storage cache from IndexedDB BEFORE any Pinia store
// initialises — stores read from the cache synchronously.
// Wrapped in an async IIFE to keep the build target compatible with
// engines that don't support top-level await (esbuild's safari13).
(async () => {
  await bootStorage();

  // Now that the cache is populated, re-apply the persisted appearance
  // (migrating any legacy { theme, accentHue } shape) and resolve the
  // active i18n locale (persisted choice → browser preference → English).
  try {
    const ui = JSON.parse(getItem("justwrite:ui") || "{}");
    applyAppearance(migrateAppearance(ui));
    setI18nLocale(ui.locale || detectLocale());
  } catch { setI18nLocale(detectLocale()); }

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.use(i18n);
  app.directive("tooltip", tooltipDirective);
  app.mount("#app");

  // Subscribe to project mutations and silently re-embed scenes a minute
  // after the last edit when ai.autoRebuildRagIndex is on. Safe to call
  // unconditionally — the watcher itself checks the setting before firing.
  startAutoRebuildWatcher();
})();
