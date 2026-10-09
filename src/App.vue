<!-- SPDX-License-Identifier: MIT -->
<script setup>
// The root component Quasar mounts (app-structure §Q.1): the app's shell (AppShell.vue), or —
// when the server didn't answer at start-up — the kit's connection-error screen in its place.
// The boot file decides (boot/jw.js sets services/bootState.js). Before the Quasar move,
// main.js mounted one app or the other.
import { onMounted } from "vue";
import { ConnectionError, serverUrl } from "@delebash/llm-ui";
import AppShell from "./AppShell.vue";
import { serverDown } from "./services/bootState.js";

// index.html's static boot plate covers the window until Vue renders; the shell's own boot
// overlay (AppShell's .jw-bootwarm) takes over from here.
onMounted(() => document.getElementById("app-boot")?.remove());
</script>

<template>
  <ConnectionError
    v-if="serverDown"
    app-name="JustWrite"
    :server-url="serverUrl('')"
    need="load and save your work"
    dev-hint="Dev: start it with `npm run server` in the project root, then retry."
  />
  <AppShell v-else />
</template>
