<script setup>
// Slim inline progress strip for a single in-flight AI task. Reads from
// the global aiTasks store and renders elapsed, first-token latency,
// tokens, tokens/s, stall freshness, plus Cancel and Details (opens the
// header panel).
//
// Every AI surface in the app (Studio cast/script, critique modal,
// brainstorm, plot-hole scan, RAG chat, …) uses this same component for
// in-modal/in-view progress so bug fixes apply everywhere at once.
// Pass `task` = the task object from `aiTasks.runningTasks`. The strip
// renders nothing when `task` is null (the typical "not running" case).

import { computed } from "vue";
import { useAiTasksStore } from "../stores/aiTasks.js";
import Icon from "./Icon.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const props = defineProps({
  // The task object (from aiTasks.runningTasks) to display, or null when
  // nothing is running on this surface. Null hides the strip.
  task: { type: Object, default: null },
});

const tasks = useAiTasksStore();

const elapsedSeconds = computed(() => {
  if (!props.task) return "0.0";
  return Math.max(0, (tasks.now - props.task.startedAt) / 1000).toFixed(1);
});
const firstTokenSeconds = computed(() => {
  if (!props.task?.firstDeltaAt) return null;
  return ((props.task.firstDeltaAt - props.task.startedAt) / 1000).toFixed(1);
});
const tokensLabel = computed(() => {
  if (!props.task) return null;
  if (props.task.tokensOut) return `${props.task.tokensOut} tokens`;
  if (props.task.chars)     return `~${Math.round(props.task.chars / 4)} tokens`;
  return null;
});
const tokensPerSecond = computed(() => {
  if (!props.task?.firstDeltaAt) return null;
  const tokens = props.task.tokensOut || Math.max(0, Math.round(props.task.chars / 4));
  if (!tokens) return null;
  const span = Math.max(1, tasks.now - props.task.firstDeltaAt);
  return (tokens / (span / 1000)).toFixed(1);
});
const lastDeltaAgo = computed(() => {
  if (!props.task?.lastDeltaAt) return null;
  return Math.max(0, tasks.now - props.task.lastDeltaAt);
});
const freshness = computed(() => {
  if (!props.task || props.task.status !== "streaming") return null;
  const ago = lastDeltaAgo.value;
  if (ago == null) return null;
  if (ago < 3000) return "fresh";
  if (ago < 10000) return "stalling";
  return "stuck";
});

function onCancel() {
  if (props.task) tasks.cancel(props.task.id);
}
function openPanel() { tasks.openPanel(); }
</script>

<template>
  <div v-if="task" class="sts">
    <Icon name="Sparkle" :size="13" class="sts-spin" />
    <span class="sts-label">{{ task.label }}</span>

    <span class="sts-stat">{{ elapsedSeconds }}s</span>
    <span v-if="firstTokenSeconds" class="sts-stat">first token in {{ firstTokenSeconds }}s</span>
    <span v-if="tokensLabel" class="sts-stat">{{ tokensLabel }}</span>
    <span v-if="tokensPerSecond" class="sts-stat">{{ tokensPerSecond }} tok/s</span>
    <span v-if="freshness" class="sts-stat" :data-fresh="freshness">
      <span class="sts-dot" />
      <template v-if="freshness === 'fresh'">live</template>
      <template v-else-if="freshness === 'stalling'">stalling</template>
      <template v-else>stuck</template>
    </span>

    <span class="sts-spacer" />
    <JwButton intent="ghost" size="small" data-ai-status-toggle @click="openPanel" v-tooltip.bottom="'Open full status panel'">
      Details
    </JwButton>
    <JwButton intent="danger" size="small" @click="onCancel">
      <template #icon><Icon name="Close" :size="11" /></template>
      Cancel
    </JwButton>
  </div>
</template>

<style scoped>
.sts {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 7px 12px;
  border: 1px solid var(--accent-line);
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 12px;
  margin: 4px 0 12px;
}
.sts-label { font-weight: 600; }
.sts-stat {
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--accent-ink);
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  display: inline-flex; align-items: center; gap: 4px;
}
.sts-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--success-ink, #15803d);
}
.sts-stat[data-fresh="stalling"] .sts-dot { background: var(--gold, #d97706); animation: sts-blink 1.2s ease-in-out infinite; }
.sts-stat[data-fresh="stuck"]    .sts-dot { background: var(--danger-ink, #b91c1c); animation: sts-blink 1.2s ease-in-out infinite; }
.sts-stat[data-fresh="stalling"] { color: var(--gold, #d97706); opacity: 1; }
.sts-stat[data-fresh="stuck"]    { color: var(--danger-ink, #b91c1c); opacity: 1; }
@keyframes sts-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
.sts-spacer { flex: 1; min-width: 4px; }
.sts-spin { animation: sts-spin 1.2s linear infinite; }
@keyframes sts-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Tint the inline ghost "Details" button so it sits in the accent strip. */
.sts :deep(.jw-btn--ghost) { color: var(--accent-ink); }
.sts :deep(.jw-btn--ghost):not(:disabled):not(.is-disabled):hover {
  background: color-mix(in oklab, var(--accent) 18%, transparent);
}
</style>
