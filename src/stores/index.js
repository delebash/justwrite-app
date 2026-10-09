// SPDX-License-Identifier: MIT
// Pinia for Quasar (app-structure §Q.1): Quasar creates the store with this factory and installs
// it before the boot files run; each store under stores/ is Pinia's own defineStore.
import { defineStore } from "#q-app";
import { createPinia } from "pinia";

export default defineStore(() => createPinia());
