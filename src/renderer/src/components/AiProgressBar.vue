<script setup>
// Status strip for an in-flight AI call.
//
// Props:
//   - progress  — a useAiProgress() instance (passed in by parent)
//   - label     — short description of what's running ("Drafting notes…")
//   - showPreview — when true AND preview text is non-empty, render the
//                   accumulated assistant content in a scrollable pane
//                   below the strip (for prose-streaming UX).
//   - canTogglePreview — when true, show a toggle button so the caller
//                   can let the user opt in/out of the preview pane.
//
// Emits: "cancel" (cancel is wired automatically; the emit lets parents
//                  react too, e.g. for state cleanup outside the composable).

import { ref, watch } from "vue";
import Icon from "./Icon.vue";

const props = defineProps({
  progress: { type: Object, required: true },
  label: { type: String, default: "Working…" },
  showPreview: { type: Boolean, default: false },
  canTogglePreview: { type: Boolean, default: false },
});
const emit = defineEmits(["cancel"]);

const previewOpen = ref(props.showPreview);
watch(() => props.showPreview, (v) => { previewOpen.value = v; });

function onCancel() {
  props.progress.cancel();
  emit("cancel");
}

function togglePreview() {
  previewOpen.value = !previewOpen.value;
}
</script>

<template>
  <div class="aiprog" v-if="progress.running">
    <div class="aiprog-row">
      <Icon name="Sparkle" :size="13" class="aiprog-spin" />
      <span class="aiprog-label">{{ label }}</span>
      <span class="aiprog-stat">
        <Icon name="Clock" v-if="false" :size="11" />
        {{ progress.elapsedSeconds }}s
      </span>
      <span class="aiprog-stat" v-if="progress.firstTokenMs > 0">
        first token in {{ (progress.firstTokenMs / 1000).toFixed(1) }}s
      </span>
      <span class="aiprog-stat" v-if="progress.tokensApprox.value > 0">
        <template v-if="progress.tokensApprox.exact">
          {{ progress.tokensApprox.value }} tokens
        </template>
        <template v-else>
          ~{{ progress.tokensApprox.value }} tokens
        </template>
      </span>
      <span class="aiprog-spacer" />
      <button v-if="canTogglePreview && progress.preview" class="aiprog-btn aiprog-btn--ghost" @click="togglePreview">
        {{ previewOpen ? "Hide preview" : "Show preview" }}
      </button>
      <button class="aiprog-btn aiprog-btn--danger" @click="onCancel">
        <Icon name="Close" :size="11" /> Cancel
      </button>
    </div>
    <div v-if="previewOpen && progress.preview" class="aiprog-preview">
      <pre>{{ progress.preview }}</pre>
    </div>
  </div>
</template>

<style scoped>
.aiprog {
  display: flex; flex-direction: column;
  border: 1px solid var(--accent-line); border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 12px;
  overflow: hidden;
}
.aiprog-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 7px 12px;
}
.aiprog-label { font-weight: 600; }
.aiprog-stat {
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--accent-ink);
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.aiprog-spacer { flex: 1; min-width: 4px; }
.aiprog-btn {
  border: 0; background: transparent;
  padding: 3px 8px; border-radius: 5px;
  font: inherit; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
}
.aiprog-btn--ghost { color: var(--accent-ink); opacity: 0.85; }
.aiprog-btn--ghost:hover { background: color-mix(in oklab, var(--accent) 18%, transparent); opacity: 1; }
.aiprog-btn--danger {
  color: var(--danger-ink, #b91c1c);
  background: var(--surface);
  border: 1px solid color-mix(in oklab, var(--danger-ink, #b91c1c) 30%, transparent);
  font-weight: 600;
}
.aiprog-btn--danger:hover { background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent); }

.aiprog-preview {
  border-top: 1px solid color-mix(in oklab, var(--accent) 25%, transparent);
  background: var(--surface);
  color: var(--ink-2);
  max-height: 280px;
  overflow: auto;
  padding: 10px 14px;
}
.aiprog-preview pre {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 13px; line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Reuse the existing ai-spin animation if present; otherwise define it. */
.aiprog-spin { animation: aiprog-spin 1.2s linear infinite; }
@keyframes aiprog-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
