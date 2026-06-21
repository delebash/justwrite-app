<script setup>
// JustWrite's AI page. The HOST owns the page chrome (PaneHeader + .pane-card,
// like every JW view); the SHARED @delebash/llm-ui control (providers / features
// / usage) is the naked, token-styled component dropped inside JW's card. Same
// control JustVoice mounts in its own page chrome. (Boundary, per the user:
// "jw has its card layout, we just put the control in it.")
import PaneHeader from "../components/PaneHeader.vue";
import { AiModelsArea } from "@delebash/llm-ui";
</script>

<template>
  <PaneHeader eyebrow="AI" title="Providers, routing &amp; usage" />
  <div class="pane-card">
    <AiModelsArea />
  </div>
</template>
