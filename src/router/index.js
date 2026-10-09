// SPDX-License-Identifier: MIT
import { defineRouter } from "#q-app";
import { createRouter, createWebHashHistory } from "vue-router";
import routes from "./routes.js";

// ONE router instance: Quasar installs it (the default export, app-structure §Q.1) and the
// modules that navigate imperatively import it (services/projectStart.js, boot/jw.js). Hash
// history always — the desktop window and the phone load the app from a file-like origin.
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default defineRouter(() => router);
