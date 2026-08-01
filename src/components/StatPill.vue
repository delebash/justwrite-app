<script setup>
// Rollup pill — big serif number with a tiny mono uppercase label
// underneath. Appears in clusters across Analysis (style metrics rollup),
// Settings → AI usage, the import wizard preview summary, and likely
// future dashboards. Same DOM shape every time.
//
// Slot `default` lets callers swap the number for arbitrary content
// (e.g. a sparkline, a model name, a multi-line value).

defineProps({
  value: { type: [String, Number, null], default: null },
  label: { type: String, default: "" },
  // Optional CSS color for the value (defaults to ink). Useful when a
  // pill represents a state (red for warning, green for done, …).
  valueColor: { type: String, default: "" },
});
</script>

<template>
  <div class="stat-pill">
    <div class="stat-pill-num" :style="valueColor ? { color: valueColor } : null">
      <slot>{{ value }}</slot>
    </div>
    <div v-if="label" class="stat-pill-lbl">{{ label }}</div>
  </div>
</template>

<style scoped>
.stat-pill {
  padding: 10px 14px; border-radius: 8px;
  background: var(--surface-2); border: 1px solid var(--border-soft);
  min-width: 96px;
}
.stat-pill-num {
  font-family: var(--font-serif); font-size: 19px; font-weight: 500;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.stat-pill-lbl {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--muted); margin-top: 5px;
}
</style>
