// SPDX-License-Identifier: MIT
import { defineRouter } from "#q-app";
import { createMemoryHistory, createRouter, createWebHashHistory, createWebHistory } from "vue-router";
import routes from "./routes.js";

// The router as Quasar's CLI creates it — the history from quasar.config.js
// (`build.vueRouterMode`, always 'hash' here: the desktop window and the phone load the app from a
// file-like origin) — as ONE instance: Quasar installs it (the default export, app-structure §Q.1)
// and the modules that navigate imperatively import it (services/projectStart.js, boot/jw.js).
const createHistory = import.meta.env.QUASAR_SERVER
  ? createMemoryHistory
  : import.meta.env.QUASAR_VUE_ROUTER_MODE === "history"
    ? createWebHistory
    : createWebHashHistory;

export const router = createRouter({
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes,
  history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
});

export default defineRouter(() => router);
