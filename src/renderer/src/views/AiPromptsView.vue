<script setup>
// JustWrite's Feature-prompts page. Host owns the chrome (PaneHeader + .pane-card
// + .scrollarea, like every JW view); the SHARED @delebash/llm-ui PromptLab is the
// naked, token-styled control dropped inside JW's card — same boundary as AiView.
import PaneHeader from "../components/PaneHeader.vue";
import { PromptLab } from "@delebash/llm-ui";
</script>

<template>
  <PaneHeader eyebrow="AI" title="Feature prompts" />
  <div class="pane-card">
    <div class="scrollarea" style="padding: 22px">
      <PromptLab />
    </div>
  </div>
</template>
