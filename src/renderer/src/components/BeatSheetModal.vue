<script setup>
// Beat-sheet overlay modal.
//
// User picks a framework (Save the Cat / Hero's Journey / 7-Point).
// The model maps each chapter to one or more beats and flags any
// beats the book doesn't cover. Each beat row shows: name, definition,
// mapped chapter (clickable jump) or MISSING badge, and a one-line
// justification from the model.
//
// Mappings persist per-template on project.beatSheets, so a writer can
// keep all three frameworks mapped at once and compare.

import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore, Icon, AiTaskStrip, AppModal, UiButton, UiSelect } from "@delebash/llm-ui";
import {
  mapToBeatSheet,
  BEAT_TEMPLATES,
  TEMPLATE_OPTIONS,
} from "../services/analysis/beatSheet.js";
import AiFeatureChip from "./AiFeatureChip.vue";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ai = useAiStore();
const router = useRouter();
const aiTasks = useAiTasksStore();
const error = ref("");

const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "beatSheet"
));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const selectedTemplate = ref(TEMPLATE_OPTIONS[0].value);
const mapping = computed(() => project.beatSheets?.[selectedTemplate.value] || null);
const currentTemplate = computed(() => BEAT_TEMPLATES[selectedTemplate.value]);

async function run() {
  error.value = "";
  if (running.value) return;
  if (!ai.providerForFeature("beatSheet")) {
    error.value = "Configure an AI provider in Settings → AI to map to a beat sheet.";
    return;
  }
  try {
    const result = await mapToBeatSheet({
      project,
      templateKey: selectedTemplate.value,
      task: { label: "Beat sheet mapping", meta: { templateKey: selectedTemplate.value } },
    });
    project.setBeatSheet(selectedTemplate.value, result);
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to map to a beat sheet."
        : msg || "Couldn't map to beat sheet.";
    }
  }
}

function regenerate() {
  project.clearBeatSheet(selectedTemplate.value);
  run();
}

function clearCurrent() {
  project.clearBeatSheet(selectedTemplate.value);
}

function jumpToChapter(num) {
  const ch = project.allChapters.find((c) => c.num === num);
  if (ch) router.push(`/chapters/${ch.id}`);
}

// Switching template kicks a fresh fetch if we don't have a cache for
// that template yet.
watch(selectedTemplate, () => {
  error.value = "";
  if (!mapping.value && !running.value) run();
});

const ago = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// First open should fetch if nothing cached yet.
if (!mapping.value) run();
</script>

<template>
  <AppModal
    eyebrow="Beat sheet"
    title="Map to a narrative framework"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="bs-titleblock">
        <div class="t-eyebrow">Beat sheet</div>
        <h2 class="modal-title">Map to a narrative framework</h2>
      </div>
      <div class="bs-header-actions">
        <AiFeatureChip feature="beatSheet" label="Beat sheet" editable />
      </div>
    </template>

    <p class="bs-blurb">
      Pick a framework. JustWrite maps each of its beats to the chapter that best fulfils it
      — and flags the beats your book doesn't cover. The model's instructed to be honest about
      <strong>MISSING</strong> beats; a clean map of every beat is suspicious. Best after a
      complete draft.
    </p>

    <div class="bs-controls">
      <div class="bs-picker">
        <label class="bs-label">Framework</label>
        <UiSelect
          v-model="selectedTemplate"
          :options="TEMPLATE_OPTIONS"
          option-label="label"
          option-value="value"
        />
      </div>
      <p v-if="currentTemplate?.blurb" class="bs-blurb-template">{{ currentTemplate.blurb }}</p>
    </div>

    <div v-if="error" class="bs-error">
      <Icon name="Alert" :size="13" /> {{ error }}
      <UiButton intent="ghost" size="small" @click="run">
        <Icon name="Refresh" :size="12" /> {{ $t("common.retry") }}
      </UiButton>
    </div>

    <AiTaskStrip v-if="running" :task="myTask" />

    <div v-else-if="!mapping" class="bs-loading">
      <span class="bs-spinner" />
      <span>Mapping chapters to beats…</span>
    </div>

    <template v-else-if="mapping">
      <div class="bs-head">
        <span class="bs-pill bs-pill-coverage">
          {{ mapping.totalBeats - mapping.missingCount }} / {{ mapping.totalBeats }} beats covered
        </span>
        <span v-if="mapping.missingCount" class="bs-pill bs-pill-missing">
          {{ mapping.missingCount }} missing
        </span>
        <span class="bs-meta">
          generated {{ ago(mapping.generatedAt) }}
          <template v-if="mapping.model"> · via {{ mapping.model }}</template>
        </span>
      </div>

      <p v-if="mapping.summary" class="bs-summary">{{ mapping.summary }}</p>

      <ol class="bs-beats">
        <li v-for="b in mapping.mapping" :key="b.beatKey"
            class="bs-beat" :class="{ missing: b.missing }">
          <div class="bs-beat-head">
            <span class="bs-beat-name">{{ b.beatName }}</span>
            <span v-if="b.missing" class="bs-missing-tag">
              <Icon name="Alert" :size="11" /> MISSING
            </span>
            <button v-else-if="b.chapterNum" class="bs-beat-jump"
                    @click="jumpToChapter(b.chapterNum)"
                    v-tooltip.bottom="'Open this chapter'">
              Ch. {{ b.chapterNum }}
            </button>
          </div>
          <p class="bs-beat-desc">{{ b.beatDesc }}</p>
          <p v-if="b.justification" class="bs-beat-just">
            <span class="bs-just-label">{{ b.missing ? 'Why missing:' : 'On the page:' }}</span>
            {{ b.justification }}
          </p>
        </li>
      </ol>
    </template>

    <template #footer>
      <UiButton v-if="mapping && !running" intent="ghost" @click="clearCurrent">
        Clear this mapping
      </UiButton>
      <span class="bs-foot-spacer" />
      <UiButton v-if="mapping && !running" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> {{ $t("common.regenerate") }}
      </UiButton>
      <UiButton intent="primary" @click="emit('close')">Done</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.bs-blurb {
  margin: 0 0 16px; max-width: 80ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.bs-blurb strong { color: var(--ink-2); font-weight: 600; }

.bs-controls {
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 18px;
}
.bs-picker { display: flex; flex-direction: column; gap: 4px; max-width: 280px; }
.bs-label {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
}
.bs-blurb-template {
  margin: 0; max-width: 78ch;
  font-size: 12px; color: var(--muted); font-style: italic;
}

.bs-error {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.bs-loading {
  display: flex; align-items: center; gap: 12px;
  font-size: 13px; color: var(--muted); font-style: italic;
  min-height: 100px;
}
.bs-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: bs-spin 0.9s linear infinite;
}
@keyframes bs-spin { to { transform: rotate(360deg); } }

.bs-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.bs-pill {
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 4px 12px; border-radius: 999px;
}
.bs-pill-coverage { background: color-mix(in oklab, var(--status-done) 16%, transparent); color: var(--ink); }
.bs-pill-missing  { background: color-mix(in oklab, var(--danger) 16%, transparent); color: var(--ink); }
.bs-meta { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }

.bs-summary {
  margin: 0 0 22px; max-width: 78ch;
  font-family: var(--font-serif); font-size: 14px; line-height: 1.65;
  color: var(--ink-2); font-style: italic;
  padding-left: 14px; border-left: 2px solid var(--accent-line);
}

.bs-beats { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.bs-beat {
  padding: 12px 14px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent);
}
.bs-beat.missing { border-left-color: var(--danger); opacity: 0.95; }

.bs-beat-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.bs-beat-name {
  font-family: var(--font-serif); font-size: 14.5px; font-weight: 600;
  color: var(--ink);
}
.bs-beat-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--accent-ink);
  padding: 0; margin-left: auto;
}
.bs-beat-jump:hover { color: var(--accent); text-decoration: underline; }
.bs-missing-tag {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--danger);
  padding: 2px 8px; border-radius: 999px;
  background: color-mix(in oklab, var(--danger) 14%, transparent);
}
.bs-beat-desc {
  margin: 0 0 6px; max-width: 70ch;
  font-size: 12px; color: var(--muted); line-height: 1.5;
  font-style: italic;
}
.bs-beat-just {
  margin: 6px 0 0; max-width: 70ch;
  font-size: 13px; color: var(--ink-2); line-height: 1.55;
}
.bs-just-label {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--muted); margin-right: 6px;
}

.bs-foot-spacer { flex: 1; }

.bs-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.bs-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.bs-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
</style>
