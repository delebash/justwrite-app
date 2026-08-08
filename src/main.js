// JustWrite — renderer entry point.
// Loads the Tauri ↔︎ window.justwrite bridge before mounting Vue so the
// stores find the IPC adapter the moment they spin up.

// The bundled type system, FIRST so it lands earliest in the emitted stylesheet — every
// font the Appearance picker offers, self-hosted. This replaced the render-blocking
// fonts.googleapis.com <link> in index.html (2026-07-24): a local-first app must not wait
// on a network round trip to paint its first frame. Full reasoning: fonts.css's own header.
import "./fonts.css";
import "./services/tauri-bridge.js";
// Apply the default appearance synchronously so we don't render with the wrong
// colour scheme during the boot tick below. The real persisted appearance is
// reapplied once bootSettings() resolves.
import { applyAppearance, migrateAppearance, DEFAULT_APPEARANCE } from "./services/appearance.js";
applyAppearance(DEFAULT_APPEARANCE);

import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router/index.js";
import { bootSettings, readSetting } from "./services/settings.js";
import { hydrateProjects, useProjectStore } from "./stores/project.js";
import { useSessionsStore } from "./stores/sessions.js";
import { bootProviders } from "./services/providerBackend.js";
import { bootRouting } from "./services/routingBackend.js";

import "./styles/tokens.css";
import "./styles/styles.css";
import { tooltipDirective } from "@delebash/llm-ui";
import { i18n, detectLocale, setLocale as setI18nLocale } from "./i18n/index.js";
import { startAutoRebuildWatcher } from "./services/rag/autoIndex.js";
import { startWarmOnBoot } from "@delebash/llm-ui";

// The whole shared LLM front end, in ONE call (the UI twin of the server's
// install_llm; the family shape — docgen is the reference). It resolves ONE
// origin-aware base for the app transport AND the kit's LLM views (they were
// separate configure* calls here, the exact per-step wiring the installer
// exists to make un-forgettable), wires the external opener, and registers
// <LlmUiHosts /> (Toast + AppDialog, mounted once in App.vue).
import { installLlmUi, checkServer, configureFamilyLabels, configureHelp, configureTestData, closeHelp, openExternal, setUiLocale, ConnectionError } from "@delebash/llm-ui";
import { buildFamilyLabels } from "./i18n/familyLabelsFeed.js";
import { SERVER_BASE, resolveBase } from "./services/serverApi.js";
import { loadDoc, hasDoc, titleForSlug, webUrlFor } from "./services/helpDocs.js";
import { LAB_TEST_ACTIONS, LAB_TEST_SOURCES } from "./services/labTestData.js";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

installLlmUi(app, {
  // JW's own resolver (services/serverApi.js) — one base feeds both transports.
  resolveBase,
  // External links — the Tauri webview swallows target=_blank/window.open, so
  // route through the shell bridge; the browser dev path (no window.justwrite)
  // keeps window.open.
  external: (url) => {
    if (window.justwrite?.shell?.openExternal) window.justwrite.shell.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  },
  // No catalogCopy / quickSetupCopy: the kit defaults ARE JustWrite's words.
});

// The AI Lab's test-input affordances (§7.3 + QC-35): JW's book material
// (chapters / characters, read lazily from the live stores) plus the
// per-action declaration table — pickers, "From this book" composers, and
// the sample labels that fit each action's prompt contract.
configureTestData({ sources: LAB_TEST_SOURCES, actions: LAB_TEST_ACTIONS });

// Shared in-app Help (kit HelpDrawer + HelpTrigger). JustWrite supplies the
// content adapter over its docs/*.md corpus plus both handoffs: "Open full
// docs" → the in-app /help reader, "Open on the web" → the public docs site
// (OS browser via the Tauri shell, window.open in the browser dev path).
configureHelp({
  loadDoc,
  hasDoc,
  titleForSlug,
  onOpenFull: (slug) => { router.push(slug ? `/help/${slug}` : "/help"); closeHelp(); },
  onOpenWeb: (slug) => openExternal(webUrlFor(slug)),
});

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
    createApp(ConnectionError, {
      appName: "JustWrite",
      serverUrl: SERVER_BASE,
      need: "load and save your work",
      devHint: "Dev: start it with `npm run server` in the project root, then retry.",
    }).mount("#app");
    return;
  }

  // Pull the settings document (appearance/ui, AI prefs, hardware presets) off
  // the server (/v1/settings) so the stores' synchronous bootstrap reads it.
  await bootSettings();
  // Pull the registry + active book into projectApi's cache (the /v1/projects
  // domain API) so the project store's synchronous bootstrap can read them.
  await hydrateProjects();
  // The provider list (/v1/llm-providers) and the routing config (/v1/ai/routing),
  // both into their own boot caches so the AI store's synchronous bootstrap can read
  // them. Run CONCURRENTLY: they are independent — each writes only its own
  // module-local cache and neither reads the other's, so the "after bootProviders"
  // in routingBackend's docstring means "before mount", not a data dependency.
  //
  // Measured 2026-07-25, and worth being honest about: on the happy path this saves
  // about 4 ms (each GET is 3-4 ms warm against localhost). The reason to do it is the
  // FAILURE path. Both functions retry 3× with 700 ms backoff to survive a cold boot
  // racing the server's own seeding — so a server that is up but not yet answering
  // these two routes cost 2 × 2.8 s sequentially, and now costs 2.8 s once, overlapped.
  await Promise.all([bootProviders(), bootRouting()]);

  // Now that settings are loaded, re-apply the persisted appearance (migrating
  // any legacy { theme, accentHue } shape) and resolve the active i18n locale
  // (persisted choice → browser preference → English).
  try {
    const ui = readSetting("ui") || {};
    applyAppearance(migrateAppearance(ui));
    const loc = ui.locale || detectLocale();
    setI18nLocale(loc);
    setUiLocale(loc); // kit UiNumber follows the same locale for Intl formatting
  } catch {
    const loc = detectLocale();
    setI18nLocale(loc);
    setUiLocale(loc);
  }

  // Feed the kit's ONE labels store (dialog verbs, AI tabs, download-bar actions,
  // connection-error copy) from JustWrite's catalog — immediately, and again on
  // every locale switch. (The old configureDialog call fed dialog verbs once at
  // boot and went stale the day the runtime language switcher shipped.)
  watch(i18n.global.locale, () => configureFamilyLabels(buildFamilyLabels()), { immediate: true });

  // (app + pinia are created at module scope now, before installLlmUi —
  // the installer needs the app instance to register <LlmUiHosts />.)

  // QC-46 — the welcome screen owns two redirect rules:
  //
  // 1. THE ZERO-PROJECT LAW (user, 2026-07-10 — bootstrap() no longer mints a
  //    blank "Untitled project"): while the registry is EMPTY (fresh install,
  //    workspace reset, last project deleted), /welcome is the app's only
  //    home — every data route needs a project. Checked on EVERY navigation
  //    (deliberately NOT behind the run-once gate below: a mid-session reset
  //    must still redirect). The allowlist is the project-independent surfaces
  //    that stay reachable with no project loaded: the AI setup page
  //    (/ai?quicksetup=1, /ai — deep-links + the post-first-project AI dialog)
  //    and Help. Both render inside the OnboardingShell, whose brand links back
  //    to /welcome so they never dead-end.
  //
  // 2. First-run redirect: on the FIRST navigation of a cold load, if it
  //    targets the root ("", "#", "#/" all normalise to path "/") and the
  //    screen hasn't been dismissed (`welcomeSeen`), show it once. Later
  //    in-app navigations to "/" (e.g. right after creating a project) are
  //    never intercepted; explicit deep-links pass straight through.
  //    Existing users upgrading have no `welcomeSeen` key, so they see it once.
  const PROJECTLESS_ROUTES = ["/welcome", "/ai", "/help"];
  let welcomeChecked = false;
  router.beforeEach((to) => {
    const project = useProjectStore(pinia);
    if (
      !project.projectsList.length &&
      !PROJECTLESS_ROUTES.some((p) => to.path === p || to.path.startsWith(`${p}/`))
    ) {
      return "/welcome";
    }
    if (welcomeChecked) return true;
    welcomeChecked = true;
    if (to.path === "/" && !readSetting("welcomeSeen")) return "/welcome";
    return true;
  });

  app.use(router);
  app.use(i18n);
  app.directive("tooltip", tooltipDirective);

  // The sessions store hydrates from the server (/v1/sessions) before mount, so
  // its synchronous getters have data and the per-chapter word checkpoints are
  // loaded before the first edit can attribute a delta.
  await useSessionsStore(pinia).boot();

  // Ensure the active project has a server row — a freshly created project
  // lives only in memory until its first edit, and the registry is derived
  // from the projects table, so persist it now to survive a reload. No-op in
  // the zero-project state (null active id).
  useProjectStore(pinia).ensureActiveProjectPersisted();

  // Warm the default local chat model into VRAM BEFORE mount, so App.vue comes up with the
  // boot overlay (the kit's <BootModelLoad />) already showing the load — a seamless hand-off
  // from the static index.html splash. Only the DECISION + load kickoff is awaited; the load
  // itself runs in the background. A no-op when the toggle is off / the default isn't a
  // downloaded local model. KIT-OWNED since 2026-08-04; the bench suppression (defect F,
  // 2026-07-22: a warm co-load rode along every leg) rides the skip option now.
  await startWarmOnBoot({
    skip: () => {
      if (typeof window !== "undefined" && window.__JW_BENCH__) {
        console.info("[bench] warm-boot suppressed");
        return true;
      }
      return false;
    },
  });

  app.mount("#app");

  // Dev-only test seams: the project store (deterministic edits for book-smoke)
  // and the bench hook (the LLM bench harness drives real feature runs through
  // it). Both are stripped from production builds by the import.meta.env.DEV
  // guard — esbuild dead-code-eliminates the branch, and benchHook.js is
  // imported DYNAMICALLY so its module graph never enters a prod bundle.
  if (import.meta.env.DEV) {
    window.__jwProject = useProjectStore(pinia);
    const { installBenchHook } = await import("./services/benchHook.js");
    installBenchHook();
  }

  // Subscribe to project mutations and silently re-embed scenes a minute
  // after the last edit when ai.autoRebuildRagIndex is on. Safe to call
  // unconditionally — the watcher itself checks the setting before firing.
  startAutoRebuildWatcher();
})();
