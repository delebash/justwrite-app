// SPDX-License-Identifier: MIT
// The phone app (Quasar's Capacitor mode). CommonJS as Quasar generates it — "Capacitor's `.js`
// config loader doesn't yet handle ESM exports" (app-structure §Q.7).
const { defineCapacitorConfig } = require('@quasar/app-vite/capacitor');

module.exports = defineCapacitorConfig({
  appId: 'com.justwrite.app',
  appName: 'JustWrite',
  android: {
    // the page is https://localhost and a paired computer answers on plain http (its address in
    // the pairing code) — the in-app server's sync requests are mixed content
    allowMixedContent: true
  }
});
