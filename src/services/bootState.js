// SPDX-License-Identifier: MIT
// What the start-up decided, for the root component: whether the server answered. The boot file
// (boot/jw.js) sets it; App.vue shows the kit's connection-error screen in the shell's place
// when it didn't — the renderer has no data of its own, so nothing loads without the server.
import { ref } from "vue";

export const serverDown = ref(false);
