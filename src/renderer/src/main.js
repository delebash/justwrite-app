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

// Hydrate the storage cache from IndexedDB BEFORE any Pinia store
// initialises — stores read from the cache synchronously.
// Wrapped in an async IIFE to keep the build target compatible with
// engines that don't support top-level await (esbuild's safari13).
(async () => {
  await bootStorage();

  // Now that the cache is populated, re-apply the persisted appearance
  // (migrating any legacy { theme, accentHue } shape).
  try {
    const ui = JSON.parse(getItem("justwrite:ui") || "{}");
    applyAppearance(migrateAppearance(ui));
  } catch {}

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.mount("#app");
})();
