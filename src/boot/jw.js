// SPDX-License-Identifier: MIT
// JustWrite — the renderer's start-up, as a Quasar boot file (app-structure §Q.4). Quasar creates
// the app (root: App.vue), Pinia (stores/index.js) and the router (router/index.js), runs the boot
// files in quasar.config.js order (i18n.js, then this one), then installs the router and mounts.
// The stylesheets (css/fonts.css, tokens.css, app.scss) are quasar.config.js's `css` list, as
// Quasar's CLI wires them — the fonts first, so they land earliest in the emitted stylesheet.
// Until the Quasar move (2026-10-08) this was src/main.js, which created and mounted the app
// itself; the sequence below is unchanged.

// Apply the default appearance synchronously so we don't render with the wrong
// colour scheme during the boot tick below. The real persisted appearance is
// reapplied once bootSettings() resolves.
import { applyAppearance, migrateAppearance, DEFAULT_APPEARANCE } from "../services/appearance.js";
applyAppearance(DEFAULT_APPEARANCE);

import { defineBoot } from "#q-app";
import { phone } from "#phone";
import { watch } from "vue";
import { bootSettings, readSetting } from "../services/settings.js";
import { hydrateProjects, useProjectStore } from "../stores/project.js";
import { watchSync } from "../services/projectApi.js";
import { useSessionsStore } from "../stores/sessions.js";
import { bootProviders } from "../services/providerBackend.js";
import { bootRouting } from "../services/routingBackend.js";

import { tooltipDirective } from "@delebash/llm-ui";
import { i18n, detectLocale, setLocale as setI18nLocale } from "../i18n/index.js";
import { startAutoRebuildWatcher } from "../services/rag/autoIndex.js";
import { bookIndexOn } from "../services/rag/vectorStore.js";
import { startWarmOnBoot } from "@delebash/llm-ui";

// The whole shared LLM front end, in ONE call (the UI twin of the server's
// installLlm; the family shape — docgen is the reference). It resolves ONE
// origin-aware base for the app transport AND the kit's LLM views (they were
// separate configure* calls here, the exact per-step wiring the installer
// exists to make un-forgettable), wires the external opener, and registers
// <LlmUiHosts /> (Toast + AppDialog, mounted once in layouts/MainLayout.vue).
import { installLlmUi, checkServer, configureFamilyLabels, configureFileSave, configureHelp, configureTestData, closeHelp, openExternal, setUiLocale } from "@delebash/llm-ui";
import { hasShell, openPath, openUrl, saveFile } from "../services/native.js";
import { buildFamilyLabels } from "../i18n/familyLabelsFeed.js";
import { loadDoc, hasDoc, titleForSlug, webUrlFor } from "../services/helpDocs.js";
import { LAB_TEST_ACTIONS, LAB_TEST_SOURCES } from "../services/labTestData.js";

// The cross-origin fetch override was DELETED 2026-08-15, after a test rather
// than an argument: driven inside the real webview (origin http://tauri.localhost)
// against a live sidecar, an unpatched XMLHttpRequest AND a same-origin iframe's
// unpatched fetch both reached http://127.0.0.1:17495/v1/health — 200, real body.
// Plain browser networking gets there, so routing every call through Rust bought
// nothing. It came from the Electron-era bridge; JustVoice and i18n-docgen never
// had it. The `http` plugin went with it in both apps.

export default defineBoot(async ({ app, router, store: pinia }) => {
  // On the phone the server runs inside the app (src/phone/): started first, so every request
  // below — the server check included — goes to it.
  if (phone) await phone.startInAppServer();

  installLlmUi(app, {
    // The KIT resolves the base now (2026-08-15) — services/serverApi.js is
    // deleted. It was one of three shapes for one job: JustWrite had this file,
    // JustVoice had src/config.js, docgen had nothing and let the installer do it.
    // docgen was right.
    devPorts: ["1420"],
    fallbackBase: import.meta.env?.VITE_SERVER_URL || "http://127.0.0.1:17495",
    // The openers, through services/native.js (the shell's one bridge) — the SAME
    // line in all three apps. The kit decides when they can be used (browser vs
    // desktop window); no app repeats that reasoning. `openPath` is what the model
    // catalog's "Open folder" rides.
    external: { open: openUrl, openPath },
    // No catalogCopy / quickSetupCopy: the kit defaults ARE JustWrite's words.
    // The phone runs online providers only, and has no search index (the kit's phone plan §1):
    // the kit's AI surfaces leave out the local engine's and the embeddings' parts.
    ...(phone ? { capabilities: { localEngine: false, embeddings: false } } : {}),
  });

  // The native "save as", wired ONCE (2026-08-15) — every export in the app and in
  // the kit's shared panels now goes through the same door, instead of each
  // surface remembering to pass a prop. The dialog and the write are the shell's
  // `saveFile`; the folder MEMORY stays in services/download.js, which is the part
  // that is actually JustWrite's.
  configureFileSave({
    save: (blob, { filename, title, filterName, filterExt, defaultDir }) =>
      saveFile({ blob, suggestedName: filename, title, filterName, filterExt, defaultDir }),
    // the desktop shell's dialog, or the phone's share sheet (native.js decides which)
    available: () => hasShell() || !!phone,
  });

  // The AI Lab's test-input affordances (§7.3 + QC-35): JW's book material
  // (chapters / characters, read lazily from the live stores) plus the
  // per-action declaration table — pickers, "From this book" composers, and
  // the sample labels that fit each action's prompt contract.
  configureTestData({ sources: LAB_TEST_SOURCES, actions: LAB_TEST_ACTIONS });

  // Shared in-app Help (kit HelpDrawer + HelpTrigger). JustWrite supplies the
  // content adapter over its docs/*.md corpus plus both handoffs: "Open full
  // docs" → the in-app /help reader, "Open on the web" → the public docs site
  // (OS browser via the desktop shell, window.open in the browser dev path).
  configureHelp({
    loadDoc,
    hasDoc,
    titleForSlug,
    onOpenFull: (slug) => { router.push(slug ? `/help/${slug}` : "/help"); closeHelp(); },
    onOpenWeb: (slug) => openExternal(webUrlFor(slug)),
  });

  // Hydrate the server-backed caches BEFORE any Pinia store initialises — stores
  // read from them synchronously in `state: () => ({...})`.
  //
  // Thin-client guard: the renderer has no data of its own — it all lives in the
  // server. If the server is unreachable, every route goes to the connection-error
  // page (pages/ConnectionErrorPage.vue, outside the layout) instead of the app (which
  // would render seed/default data and then silently fail to persist). No defaults are
  // loaded without a live backend. The kit's transport is already configured by
  // installLlmUi above, so the screen names the SAME base the app talks to — no second
  // resolver to disagree with. Its Retry reloads the window; once the server answers,
  // /offline goes back to the page the user was on.
  if (!(await checkServer())) {
    router.beforeEach((to) => (to.path === "/offline" ? true : { path: "/offline", query: { from: to.fullPath } }));
    return;
  }
  router.beforeEach((to) => (to.path === "/offline" ? to.query.from || "/" : true));

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
  //    and Help, and Sync (a fresh install bringing its books from another device). They render
  //    under the projectless header (components/OnboardingHeader.vue), whose brand links back
  //    to /welcome so they never dead-end.
  //
  // 2. First-run redirect: on the FIRST navigation of a cold load, if it
  //    targets the root ("", "#", "#/" all normalise to path "/") and the
  //    screen hasn't been dismissed (`welcomeSeen`), show it once. Later
  //    in-app navigations to "/" (e.g. right after creating a project) are
  //    never intercepted; explicit deep-links pass straight through.
  //    Existing users upgrading have no `welcomeSeen` key, so they see it once.
  const PROJECTLESS_ROUTES = ["/welcome", "/ai", "/help", "/sync"];
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

  // (Quasar installs the router after the boot files; vue-i18n is boot/i18n.js.)
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

  // Warm the default local chat model into VRAM BEFORE mount, so the shell comes up with the
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

  // Quasar mounts the app when this returns. The rest only subscribes, so it runs here.

  // Sync: when another device's changes land on the server, reload the open book
  // (services/projectApi.js watchSync; server/src/sync.js).
  watchSync(async () => {
    const store = useProjectStore(pinia);
    await store.refreshProjectsList(); // books another device made
    await store.reloadFromServer(); // the open book's changes
  });

  // Dev-only test seams: the project store (deterministic edits for book-smoke)
  // and the bench hook (the LLM bench harness drives real feature runs through
  // it). Both are stripped from production builds by the import.meta.env.DEV
  // guard — the bundler dead-code-eliminates the branch, and benchHook.js is
  // imported DYNAMICALLY so its module graph never enters a prod bundle.
  if (import.meta.env.DEV) {
    window.__jwProject = useProjectStore(pinia);
    const { installBenchHook } = await import("../services/benchHook.js");
    installBenchHook();
  }

  // Subscribe to project mutations and silently re-embed scenes a minute
  // after the last edit when ai.autoRebuildRagIndex is on. Safe to call
  // wherever the search index exists — the watcher itself checks the setting before firing.
  if (bookIndexOn) startAutoRebuildWatcher();
});
