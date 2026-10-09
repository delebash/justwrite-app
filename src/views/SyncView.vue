<script setup>
// SPDX-License-Identifier: MIT
// Sync with no book open — a fresh install, or a new phone, brings its books from another device
// before it has any (the welcome screen's "Your books are on another device?"). The same panel as
// Settings → Sync (composables/useSyncPanel.js), inside the onboarding shell; project-less like
// /ai and /help (boot/jw.js PROJECTLESS_ROUTES). When the first books arrive, the newest opens.
import SyncPanel from "@delebash/llm-ui/components/SyncPanel.vue";
import { watch } from "vue";
import { useRouter } from "vue-router";
import { useSyncPanel } from "../composables/useSyncPanel.js";
import { useProjectStore } from "../stores/project.js";

const syncPanel = useSyncPanel();
const project = useProjectStore();
const router = useRouter();

watch(
  () => project.projectsList.length,
  async (n) => {
    if (!n || project.hasActiveProject) return;
    await project.switchProject(project.projectsList[0].id);
    router.push("/");
  },
);
</script>

<template>
  <div class="sync-page">
    <h1 class="sync-page-title">{{ $t("syncPage.title") }}</h1>
    <p class="t-muted sync-page-lead">{{ $t("syncPage.lead") }}</p>
    <SyncPanel v-bind="syncPanel" />
  </div>
</template>

<style scoped>
.sync-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 28px 16px 48px;
}
.sync-page-title {
  font-family: var(--font-serif);
  font-size: 28px;
  margin: 0 0 6px;
}
.sync-page-lead {
  margin: 0 0 18px;
  max-width: 60ch;
}
</style>
