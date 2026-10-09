// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// THE BOOT SMOKE (parity batch slice 11) — the skeleton (stub environment +
// mount assertion + why this gate exists) is the kit's registerBootSmoke; this
// file keeps JustWrite's parts: the start-up, the fetch route map and the
// bench-hook probe.
//
// The start-up is Quasar's (app-structure §Q.4): the root App.vue, Pinia from
// stores/index.js, the router from router/index.js, the boot files awaited in
// quasar.config.js order (i18n.js, jw.js), then the router installed and the app
// mounted — the same steps Quasar's generated client entry takes
// (.quasar/*/app.js + client-entry.js), run here by hand because that entry only
// exists inside a Quasar build. Quasar is installed as in the real app: the
// layout and the kit's controls are Quasar components.
import { expect } from "vitest";
import { registerBootSmoke } from "@delebash/llm-ui/test/bootSmoke.js";
import { createTestApp } from "@delebash/llm-ui/quasar/install.js";

registerBootSmoke({
  boot: async () => {
    const { default: App } = await import("./App.vue");
    const { default: createStore } = await import("./stores/index.js");
    const { default: createRouter } = await import("./router/index.js");
    const { default: i18nBoot } = await import("./boot/i18n.js");
    const { default: jwBoot } = await import("./boot/jw.js");
    const app = createTestApp(App);
    const store = await createStore({});
    app.use(store);
    const router = await createRouter({ store });
    await i18nBoot({ app, router, store });
    await jwBoot({ app, router, store });
    app.use(router);
    app.mount("#app");
  },
  routes: {
    "/v1/health": { status: "ok", product: "justwrite" },
    "/v1/settings": { settings: {} },
    "/v1/projects": { projects: [], registry: [] },
    "/v1/sessions": { sessions: [] },
    "/v1/llm-providers": { providers: [] },
    "/v1/ai/routing": { features: [] },
  },
  // The boot file's DEV tail dynamically imports the bench hook — wait for its
  // marker so the async import can't race the environment teardown
  // (import.meta.env.DEV is true under vitest).
  ready: () => {
    expect(window.__jwBench).toBeTruthy();
  },
});
