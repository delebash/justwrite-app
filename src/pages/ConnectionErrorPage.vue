<script setup>
// The server didn't answer at start-up: the kit's connection-error screen, on its own route outside
// the layout (boot/jw.js sends every route here while the server is down). The renderer has no
// data of its own, so nothing else loads without the server; Retry reloads the window, and the boot
// then returns to the page the user was on (the route's `from`) — and asks the desktop shell for the
// server's URL, which starts a server again whose start had failed.
import { ConnectionError, serverUrl } from "@delebash/ui";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { shellServerStatus } from "../services/native.js";

const { t } = useI18n();

// Why the desktop app's server didn't start, when its shell knows: another JustWrite server holds
// the data folder — the shell's words, the kit's platform/data_lock.js (2026-10-15) — or another
// program holds the port (the approved words, 2026-10-15; {retry} is the button's own label).
const detail = ref("");
onMounted(async () => {
  const status = await shellServerStatus();
  if (status?.dataFolderInUse) detail.value = status.dataFolderInUse;
  else if (status?.portTaken) detail.value = t("connectionError.portTaken", { port: status.portTaken, retry: t("kit.common.retry") });
});
</script>

<template>
  <ConnectionError
    app-name="JustWrite"
    :server-url="serverUrl('')"
    :need="t('connectionError.need')"
    :detail="detail"
    :dev-hint="t('connectionError.devHint')"
  />
</template>
