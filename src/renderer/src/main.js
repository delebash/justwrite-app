// JustWrite — renderer entry point.
// Loads the Tauri ↔︎ window.justwrite bridge before mounting Vue so the
// stores find the IPC adapter the moment they spin up.

import "./services/tauri-bridge.js";
// Side-effect: reads localStorage and sets <html data-theme> before mount,
// so a dark-preferring user doesn't see a flash of the light theme.
import "./services/theme.js";

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router/index.js";

import "./assets/styles/tokens.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
