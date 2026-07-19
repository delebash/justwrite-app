<script setup>
// Collapsible section shell for the v3 character sheet. Header = chevron +
// title + a muted one-line hint + a filled-count chip; body = the default slot.
// Empty sections (count 0) start collapsed so an unfilled character isn't a
// wall of empty boxes — the template's rule that "a field that never affects a
// scene is dead weight", enforced on the page.
//
// RULE #1 precedent: CharacterAuditModal's chevron-expand rows
// (ChevDown/ChevRight) + this page's existing `t-eyebrow` section headers.
// Deliberately a LOCAL layout component, not a kit primitive — it's page
// composition, not a reusable control, so it stays in JustWrite.

import { ref } from "vue";
import { Icon } from "@delebash/llm-ui";

const props = defineProps({
  title: { type: String, required: true },
  hint: { type: String, default: "" },
  // Number of filled fields in this section — drives the count chip AND the
  // initial open state (a section with content opens; an empty one collapses).
  count: { type: Number, default: 0 },
});

// Initialised once at mount. The parent keys each section on the character id,
// so switching characters re-mounts with open-state matching that character's
// fill; within one character, the user's manual toggle is never overridden.
const open = ref(props.count > 0);
</script>

<template>
  <section class="ch-section">
    <button type="button" class="ch-section-head" :aria-expanded="open" @click="open = !open">
      <Icon :name="open ? 'ChevDown' : 'ChevRight'" :size="14" class="ch-section-chev" />
      <span class="t-eyebrow ch-section-title">{{ title }}</span>
      <span v-if="hint" class="ch-section-hint">{{ hint }}</span>
      <span v-if="count" class="ch-section-count">{{ count }}</span>
    </button>
    <div v-show="open" class="ch-section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.ch-section {
  margin-top: 20px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
.ch-section-head {
  display: flex; align-items: center; gap: 10px; width: 100%;
  background: none; border: 0; padding: 2px 0; cursor: pointer; text-align: left;
  color: var(--ink);
}
.ch-section-chev { color: var(--muted); flex: none; }
.ch-section-title { flex: none; color: var(--ink); }
.ch-section-hint {
  font-size: 11.5px; color: var(--muted); font-weight: 400;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
.ch-section-count {
  margin-left: auto; flex: none;
  font-size: 10.5px; font-weight: 600; color: var(--ink-2);
  background: var(--surface-3); border-radius: 999px; padding: 1px 8px;
  font-variant-numeric: tabular-nums;
}
.ch-section-body { padding-top: 14px; }
</style>
