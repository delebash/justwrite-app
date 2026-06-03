<script setup>
// Toast host — mounts once in App.vue. Renders vue-sonner's <Toaster />
// which positions toasts in a portal and handles stacking, timing, and
// hover-pause. Bridge calls `toast(...)` directly from anywhere — no
// setup-context binding required (unlike PrimeVue's ToastService).

import { Toaster } from "vue-sonner";
</script>

<template>
  <Toaster
    position="bottom-center"
    :duration="6000"
    :gap="10"
    :visible-toasts="3"
    :offset="40"
    close-button
    rich-colors
    class="jw-toast-host"
  />
</template>
