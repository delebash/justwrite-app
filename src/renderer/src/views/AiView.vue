<script setup>
// JustWrite's AI page. The HOST owns the page chrome (PaneHeader + .pane-card,
// like every JW view); the SHARED @delebash/llm-ui control (providers / features
// / usage) is the naked, token-styled component dropped inside JW's card. Same
// control JustVoice mounts in its own page chrome. (Boundary, per the user:
// "jw has its card layout, we just put the control in it.")
import { onUnmounted } from "vue";
import PaneHeader from "../components/PaneHeader.vue";
import { AiModelsArea } from "@delebash/llm-ui";
import { useAiStore } from "../stores/ai.js";

// The shared AI control writes routing (default LLM/embedding + model + pins)
// straight to the server. Re-sync the renderer's AI store on the way out so the
// chat panel + RAG indexer use the just-saved config without a full reload.
const ai = useAiStore();
onUnmounted(() => { ai.resyncRouting(); });
</script>

<template>
  <PaneHeader eyebrow="AI" title="Providers, routing &amp; usage" />
  <div class="pane-card">
    <div class="scrollarea" style="padding: 22px">
      <AiModelsArea />
    </div>
  </div>
</template>
