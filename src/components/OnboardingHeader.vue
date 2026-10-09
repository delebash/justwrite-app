<script setup>
// The projectless header (Option A, 2026-07-11). While no project is loaded —
// `project.hasActiveProject` is false: a fresh workspace, a post-reset DB, or the last
// project deleted (`_activeId` null) — the layout (layouts/MainLayout.vue) shows THIS strip
// under the title bar, in its q-header, instead of the project Sidebar + data nav in its
// drawer. So the zero-project state can never show a phantom "Untitled" project's chrome
// (the old bug: the Sidebar always mounted and bound to a blank BLANK_PROJECT_META
// project).
//
// Just the wordmark, over the pages the projectless routes render (/welcome, /ai, /help,
// /sync). The old header carried duplicate Start / Tutorial CTAs — removed 2026-07-11:
// they doubled the welcome hero's own CTAs, and starting a project now happens ONLY from
// the welcome hero. The wordmark links back to /welcome so /ai and /help (reachable
// projectless) are never a dead end. Creating/opening a project flips
// `hasActiveProject`, which swaps this strip for the sidebar. (Until the move to the layout
// Quasar's CLI creates, 2026-10-09, this was OnboardingShell.vue, a frame around the page.)
import { RouterLink } from "vue-router";
</script>

<template>
  <div class="ob-header">
    <RouterLink to="/welcome" class="ob-brand">
      <div class="brand-mark">{{ $t("welcome.brandMark") }}</div>
      <div class="brand-name">{{ $t("welcome.wordmark") }}</div>
    </RouterLink>
  </div>
</template>

<style scoped>
.ob-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface);
}
/* .brand-mark / .brand-name are global (app.scss) — shared with the Sidebar
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
</style>
