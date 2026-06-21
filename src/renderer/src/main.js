// JustWrite — renderer entry point.
// Loads the Tauri ↔︎ window.justwrite bridge before mounting Vue so the
// stores find the IPC adapter the moment they spin up.

import "./services/tauri-bridge.js";
// Apply the default appearance synchronously so we don't render with the wrong
// colour scheme during the boot tick below. The real persisted appearance is
// reapplied once bootSettings() resolves.
import { applyAppearance, migrateAppearance, DEFAULT_APPEARANCE } from "./services/appearance.js";
applyAppearance(DEFAULT_APPEARANCE);

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import ConnectionError from "./components/ConnectionError.vue";
import router from "./router/index.js";
import { checkServer } from "./services/connection.js";
import { bootSettings, readSetting } from "./services/settings.js";
import { hydrateProjects, useProjectStore } from "./stores/project.js";
import { useSessionsStore } from "./stores/sessions.js";
import { bootProviders } from "./services/providerBackend.js";

import "./tokens.css";
import "./styles.css";
import { tooltipDirective } from "./services/tooltip.js";
import { i18n, detectLocale, setLocale as setI18nLocale } from "./i18n/index.js";
import { startAutoRebuildWatcher } from "./services/rag/autoIndex.js";

// Shared LLM UI (@delebash/llm-ui) — configure its origin-aware client ONCE with
// the base the app already resolved, so the shared AI views call the same server
// endpoints the rest of the app does (no per-app data adapter).
import { configureLlmUi } from "@delebash/llm-ui";
import { SERVER_BASE } from "./services/serverApi.js";
configureLlmUi({ baseUrl: SERVER_BASE });

// Hydrate the server-backed caches BEFORE any Pinia store initialises — stores
// read from them synchronously in `state: () => ({...})`.
// Wrapped in an async IIFE to keep the build target compatible with
// engines that don't support top-level await (esbuild's safari13).
(async () => {
  // Thin-client guard: the renderer has no data of its own — it all lives in the
  // Python server. If the server is unreachable, mount a connection-error screen
  // instead of booting the app (which would render seed/default data and then
  // silently fail to persist). No defaults are loaded without a live backend.
  if (!(await checkServer())) {
    createApp(ConnectionError).mount("#app");
    return;
  }

  // Pull the settings document (appearance/ui, AI prefs, hardware presets) off
  // the server (/v1/settings) so the stores' synchronous bootstrap reads it.
  await bootSettings();
  // Pull the registry + active book into projectApi's cache (the /v1/projects
  // domain API) so the project store's synchronous bootstrap can read them.
  await hydrateProjects();
  // Pull the configured LLM provider list off the server (/v1/llm-providers)
  // so the AI store's synchronous bootstrap reads it.
  await bootProviders();

  // Now that settings are loaded, re-apply the persisted appearance (migrating
  // any legacy { theme, accentHue } shape) and resolve the active i18n locale
  // (persisted choice → browser preference → English).
  try {
    const ui = readSetting("ui") || {};
    applyAppearance(migrateAppearance(ui));
    setI18nLocale(ui.locale || detectLocale());
  } catch { setI18nLocale(detectLocale()); }

  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  app.use(i18n);
  app.directive("tooltip", tooltipDirective);

  // The sessions store hydrates from the server (/v1/sessions) before mount, so
  // its synchronous getters have data and the per-chapter word checkpoints are
  // loaded before the first edit can attribute a delta.
  await useSessionsStore(pinia).boot();

  // Ensure the active project has a server row — a brand-new install's seeded
  // demo lives only in memory until its first edit, and the registry is derived
  // from the projects table, so persist it now to survive a reload.
  useProjectStore(pinia).ensureActiveProjectPersisted();

  app.mount("#app");

  // Dev-only test seam: expose the project store so the headless harness can
  // drive deterministic edits (stripped from production builds by the
  // import.meta.env.DEV guard — esbuild dead-code-eliminates the branch).
  if (import.meta.env.DEV) {
    window.__jwProject = useProjectStore(pinia);
  }

  // Subscribe to project mutations and silently re-embed scenes a minute
  // after the last edit when ai.autoRebuildRagIndex is on. Safe to call
  // unconditionally — the watcher itself checks the setting before firing.
  startAutoRebuildWatcher();
})();
