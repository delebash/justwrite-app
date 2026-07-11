<script setup>
// The projectless "onboarding shell" (Option A, 2026-07-11). While no project is
// loaded — `project.hasActiveProject` is false: a fresh workspace, a post-reset DB,
// or the last project deleted (`_activeId` null) — App.vue renders THIS instead of
// the project Sidebar + data nav. So the zero-project state can never show a phantom
// "Untitled" project's chrome (the old bug: the Sidebar always mounted and bound to
// a blank BLANK_PROJECT_META project).
//
// A slim header (wordmark + always-visible Start / Tutorial) wraps the same
// <router-view> the projectless routes render into (/welcome, /ai, /help). The
// persistent CTAs are the fix for the AI-setup dead end: "Run Quick Setup" → /ai no
// longer strands the user, because Start-a-project / Try-the-tutorial are one click
// away in the header — and creating/opening a project flips `hasActiveProject`, which
// swaps this shell for the real app.
//
// promptNewProject / openTutorialProject are the SAME shared flows the welcome hero
// and the sidebar switcher run (services/projectStart.js — one source), so the three
// entry points can never drift.
import { UiButton } from "@delebash/llm-ui";
import { promptNewProject, openTutorialProject } from "../services/projectStart.js";
</script>

<template>
  <div class="ob-stage">
    <header class="ob-header">
      <div class="ob-brand">
        <div class="brand-mark">J</div>
        <div class="brand-name">{{ $t("welcome.wordmark") }}</div>
      </div>
      <div class="ob-actions">
        <UiButton intent="primary" size="small" @click="promptNewProject">{{ $t("welcome.startNew") }}</UiButton>
        <UiButton intent="secondary" size="small" @click="openTutorialProject">{{ $t("welcome.tutorial") }}</UiButton>
      </div>
    </header>
    <div class="ob-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* Fills the .app-stage grid's 1fr row (the slot the project shell's .app usually
   takes) — a header strip over the ONE scroller the routed view owns. */
.ob-stage {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--app-bg);
}
.ob-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface);
}
.ob-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.ob-actions {
  display: flex;
  gap: 8px;
}
.ob-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
