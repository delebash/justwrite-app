<script setup>
// The server didn't answer at start-up: the kit's connection-error screen, on its own route outside
// the layout (boot/jw.js sends every route here while the server is down). The renderer has no
// data of its own, so nothing else loads without the server; Retry reloads the window, and the boot
// then returns to the page the user was on (the route's `from`).
import { ConnectionError, serverUrl } from "@delebash/llm-ui";
</script>

<template>
  <ConnectionError
    app-name="JustWrite"
    :server-url="serverUrl('')"
    need="load and save your work"
    dev-hint="Dev: start it with `npm run server` in the project root, then retry."
  />
</template>
