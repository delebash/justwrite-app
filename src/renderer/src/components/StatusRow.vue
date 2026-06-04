<script setup>
// Per-item progress row. Used by EntitySweepModal and IndexBuildModal
// (and any future per-thing loop UI) so the visual treatment stays
// consistent.
//
// Shape:
//   [icon] [left-tag?] [main label] [right meta?]
//
// Status drives the icon, background tint, and spinner state.

import { computed } from "vue";
import Icon from "./Icon.vue";

const props = defineProps({
  status:  { type: String, default: "pending" }, // pending|working|done|skipped|error
  left:    { type: [String, Number, null], default: null }, // e.g. chapter number
  main:    { type: String, default: "" },                   // primary label
  right:   { type: String, default: "" },                   // trailing meta
  // Optional explicit icon name. Defaults to the status-mapped icon.
  icon:    { type: String, default: "" },
});

const STATUS_ICON = {
  pending:  "Calendar",
  working:  "Refresh",
  done:     "Check",
  skipped:  "Close",
  error:    "Alert",
  removed:  "Close",
};
const iconName = computed(() => props.icon || STATUS_ICON[props.status] || "Calendar");
const isSpinning = computed(() => props.status === "working" || props.status === "scanning");
</script>

<template>
  <div class="status-row" :class="`status-row--${status}`">
    <Icon :name="iconName" :size="11" :class="{ 'status-row-spin': isSpinning }" class="status-row-icon" />
    <span v-if="left !== null && left !== ''" class="status-row-left">{{ left }}</span>
    <span class="status-row-main">{{ main }}</span>
    <span v-if="right" class="status-row-right">{{ right }}</span>
  </div>
</template>

<style scoped>
.status-row {
  display: grid;
  grid-template-columns: 16px auto 1fr auto;
  align-items: center; gap: 10px;
  padding: 6px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-soft);
  color: var(--muted);
}
.status-row:last-child { border-bottom: 0; }
/* When `left` is absent its slot collapses (the column auto-sizes to 0). */
.status-row > :empty:not(.status-row-icon) { display: none; }

.status-row-icon { color: var(--muted); }
.status-row-left {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--muted); min-width: 28px;
}
.status-row-main {
  color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.status-row-right {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
}

.status-row--working,
.status-row--scanning {
  background: var(--accent-soft); color: var(--accent-ink);
}
.status-row--working .status-row-icon,
.status-row--scanning .status-row-icon { color: var(--accent-ink); }
.status-row--working .status-row-right,
.status-row--scanning .status-row-right { color: var(--accent-ink); }

.status-row--done .status-row-icon { color: var(--status-done); }
.status-row--done .status-row-main { color: var(--ink); }
.status-row--done .status-row-right { color: var(--status-done); }

.status-row--skipped { opacity: 0.55; }
.status-row--removed { opacity: 0.55; }

.status-row--error .status-row-icon,
.status-row--error .status-row-right { color: var(--danger-ink); }

.status-row--pending .status-row-main { color: var(--muted); }

.status-row-spin { animation: status-row-spin 1.2s linear infinite; }
@keyframes status-row-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
