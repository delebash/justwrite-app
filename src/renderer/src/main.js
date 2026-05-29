// JustWrite — renderer entry point.
// Loads the Tauri ↔︎ window.justwrite bridge before mounting Vue so the
// stores find the IPC adapter the moment they spin up.

import "./services/tauri-bridge.js";
// Apply the OS-default theme synchronously so we don't render with the
// wrong colour scheme during the IDB hydration tick below. The real
// persisted theme is reapplied after bootStorage resolves.
import { applyTheme } from "./services/theme.js";
applyTheme("system");

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

  // Now that the cache is populated, re-apply the persisted theme.
  try {
    const ui = JSON.parse(getItem("justwrite:ui") || "{}");
    applyTheme(ui.theme || "system", ui.accentHue);
  } catch {}

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.mount("#app");
})();
