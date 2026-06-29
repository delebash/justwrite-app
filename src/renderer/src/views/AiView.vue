<script setup>
// JustWrite's AI page. The HOST owns the page chrome (PaneHeader + .pane-card,
// like every JW view); the SHARED @delebash/llm-ui control (providers / features
// / usage) is the naked, token-styled component dropped inside JW's card. Same
// control JustVoice mounts in its own page chrome. (Boundary, per the user:
// "jw has its card layout, we just put the control in it.")
import { onUnmounted } from "vue";
import PaneHeader from "../components/PaneHeader.vue";
import { AiModelsArea } from "@delebash/llm-ui";
import WritingAiSettings from "../components/WritingAiSettings.vue";
import { useAiStore } from "../stores/ai.js";
import { runAiFeatureStream } from "../services/aiFeature.js";

// The shared AI control writes routing (default LLM/embedding + model + pins)
// straight to the server. Re-sync the renderer's AI store on the way out so the
// chat panel + RAG indexer use the just-saved config without a full reload.
const ai = useAiStore();
onUnmounted(() => { ai.resyncRouting(); });

// Host runner for the Feature Workbench test panel: streams the action through
// JW's task system so a test shows live progress + Cancel in the AI tasks strip
// (the batch list) and reports token usage. Returns { content, usage }.
function runStream(opts) {
  return runAiFeatureStream({ ...opts, feature: opts.action, task: { label: `Test · ${opts.action}` } });
}
</script>

<template>
  <PaneHeader eyebrow="AI" title="Providers, routing &amp; usage" />
  <div class="pane-card">
    <!-- Flex-fill (NOT the scrolling .scrollarea): the AI area scrolls its own
         nav + content panes internally; the page itself doesn't scroll. -->
    <div class="ai-fill">
      <AiModelsArea app-tab-label="Writing AI" :run-stream="runStream">
        <template #app-tab><WritingAiSettings /></template>
      </AiModelsArea>
    </div>
  </div>
</template>

<style scoped>
.ai-fill { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 22px; }
</style>
