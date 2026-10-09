// SPDX-License-Identifier: MIT
// The phone app (Quasar's Capacitor mode). CommonJS as Quasar generates it — "Capacitor's `.js`
// config loader doesn't yet handle ESM exports" (app-structure §Q.7).
const { defineCapacitorConfig } = require('@quasar/app-vite/capacitor');

module.exports = defineCapacitorConfig({
  appId: 'com.justwrite.app',
  appName: 'JustWrite'
});
