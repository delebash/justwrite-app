<script setup>
// JustWrite host chrome for the SHARED @delebash/llm-ui FeatureWorkbench — the
// per-feature config + test surface (model/role · prompts · params · test),
// driven off the app's common feature catalog via the shared /v1/ai/* endpoints.
// Same control JustVoice mounts; host owns the PaneHeader + .pane-card chrome.
import PaneHeader from "../components/PaneHeader.vue";
import { FeatureWorkbench } from "@delebash/llm-ui";
</script>

<template>
  <PaneHeader eyebrow="AI" title="Feature Workbench" />
  <div class="pane-card">
    <div class="scrollarea" style="padding: 22px">
      <FeatureWorkbench />
    </div>
  </div>
</template>
