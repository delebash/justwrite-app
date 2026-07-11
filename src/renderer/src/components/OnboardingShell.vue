<script setup>
// The projectless "onboarding shell" (Option A, 2026-07-11). While no project is
// loaded — `project.hasActiveProject` is false: a fresh workspace, a post-reset DB,
// or the last project deleted (`_activeId` null) — App.vue renders THIS instead of
// the project Sidebar + data nav. So the zero-project state can never show a phantom
// "Untitled" project's chrome (the old bug: the Sidebar always mounted and bound to
// a blank BLANK_PROJECT_META project).
//
// A slim header (just the wordmark) wraps the same <router-view> the projectless
// routes render into (/welcome, /ai, /help). The old header carried duplicate
// Start / Tutorial CTAs — removed 2026-07-11: they doubled the welcome hero's own
// CTAs, and starting a project now happens ONLY from the welcome hero. The wordmark
// links back to /welcome so /ai and /help (reachable projectless) are never a dead
// end. Creating/opening a project flips `hasActiveProject`, which swaps this shell
// for the real app.
import { RouterLink } from "vue-router";
</script>

<template>
  <div class="ob-stage">
    <header class="ob-header">
      <RouterLink to="/welcome" class="ob-brand">
        <div class="brand-mark">J</div>
        <div class="brand-name">{{ $t("welcome.wordmark") }}</div>
      </RouterLink>
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
  gap: 16px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface);
}
/* .brand-mark / .brand-name are global (styles.css) — shared with the Sidebar
   brand, so the onboarding header matches the real app chrome. */
.ob-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  border-radius: var(--r-sm, 6px);
}
.ob-brand:hover .brand-name {
  color: var(--accent);
}
.ob-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
