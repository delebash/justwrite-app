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
import JwButton from "@renderer/components/ui/JwButton.vue";

const props = defineProps({
  progress: { type: Object, required: true },
  label: { type: String, default: "Working…" },
  showPreview: { type: Boolean, default: false },
  canTogglePreview: { type: Boolean, default: false },
  // When false, the strip omits its built-in Cancel button — for call sites
  // that already have their own Cancel (e.g. ChatPanel pairs Cancel with
  // the Ask input, so the bar's button would just be a duplicate).
  showCancel: { type: Boolean, default: true },
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
  <!-- progress.* fields are refs from useAiProgress. Accessing them via the
       prop here does NOT auto-unwrap (template auto-unwrap only applies to
       top-level setup bindings, not props.dot-access), so every truthiness
       check has to read .value explicitly. Without this, `v-if="progress.running"`
       is always true (the Ref object is truthy) and the strip stays mounted
       after finish(), leaving a Cancel button visible next to the Done footer. -->
  <div class="aiprog" v-if="progress.running.value">
    <div class="aiprog-row">
      <Icon name="Sparkle" :size="13" class="aiprog-spin" />
      <span class="aiprog-label">{{ label }}</span>
      <span class="aiprog-stat">
        <Icon name="Clock" v-if="false" :size="11" />
        {{ progress.elapsedSeconds.value }}s
      </span>
      <span class="aiprog-stat" v-if="progress.firstTokenMs.value > 0">
        first token in {{ (progress.firstTokenMs.value / 1000).toFixed(1) }}s
      </span>
      <span class="aiprog-stat" v-if="progress.tokensApprox.value.value > 0">
        <template v-if="progress.tokensApprox.value.exact">
          {{ progress.tokensApprox.value.value }} tokens
        </template>
        <template v-else>
          ~{{ progress.tokensApprox.value.value }} tokens
        </template>
      </span>
      <span class="aiprog-spacer" />
      <JwButton v-if="canTogglePreview && progress.preview.value" intent="ghost" size="small" @click="togglePreview">
        {{ previewOpen ? "Hide preview" : "Show preview" }}
      </JwButton>
      <JwButton v-if="showCancel" intent="danger" size="small" @click="onCancel">
        <template #icon><Icon name="Close" :size="11" /></template>
        Cancel
      </JwButton>
    </div>
    <div v-if="previewOpen && progress.preview.value" class="aiprog-preview">
      <pre>{{ progress.preview.value }}</pre>
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

/* JwButton intent="ghost" uses var(--ink-2) by default, but the strip's
   own text uses var(--accent-ink). Re-tint just inside this component
   so the preview-toggle button reads as part of the strip's label band. */
.aiprog :deep(.jw-btn--ghost) { color: var(--accent-ink); }
.aiprog :deep(.jw-btn--ghost):not(:disabled):not(.is-disabled):hover {
  background: color-mix(in oklab, var(--accent) 18%, transparent);
}

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
